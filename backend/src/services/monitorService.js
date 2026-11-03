import { Attempt } from '../models/index.js';
import { ATTEMPT_STATUS, AWAY_COUNT_SECONDS } from '../config/constants.js';
import { env } from '../config/env.js';
import { isDbReady } from '../config/db.js';
import { logger } from '../utils/logger.js';
import { countAway, finalizeAttempt } from './attemptService.js';
import { evaluateAttempt } from './evaluationService.js';

/**
 * Server-side safety net for everything the browser cannot be trusted to report:
 *  1. Auto-submits attempts whose server-side timer has expired (browser closed, device off).
 *  2. Flags attempts whose heartbeat stopped; optionally terminates after a long, configurable gap.
 *     Short network blips only mark the attempt DISCONNECTED and are never treated as cheating.
 *  3. Counts a violation for students who have been away from the page for AWAY_COUNT_SECONDS.
 *  4. Re-runs evaluation for finalized attempts whose evaluation previously failed.
 * Every transition is a conditional atomic update, so running several API instances is safe.
 */
// Attempts handled side by side per tick. Over a remote database, one-at-a-time processing of a
// large exam (e.g. 100 timers ending together) would take many seconds.
const CONCURRENCY = 8;

async function forEachLimit(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export async function runMonitorTick(now = new Date()) {
  const summary = { expired: 0, disconnected: 0, terminated: 0, away: 0, reevaluated: 0 };
  const graceMs = env.SUBMISSION_GRACE_SECONDS * 1000;

  const expired = await Attempt.find({
    status: ATTEMPT_STATUS.IN_PROGRESS,
    expiresAt: { $lt: new Date(now.getTime() - graceMs) },
  })
    .select('_id')
    .limit(500)
    .lean();
  await forEachLimit(expired, CONCURRENCY, async (a) => {
    const { finalized } = await finalizeAttempt(a._id, { status: ATTEMPT_STATUS.COMPLETED, submissionType: 'AUTO_TIMEOUT' });
    if (finalized) summary.expired += 1;
  });

  const running = await Attempt.find({ status: ATTEMPT_STATUS.IN_PROGRESS })
    .select('lastHeartbeatAt connectionState policy awaySince awayEventId')
    .lean();
  await forEachLimit(running, CONCURRENCY, async (a) => {
    const awayFor = a.awaySince ? (now - a.awaySince) / 1000 : 0;
    if (awayFor >= AWAY_COUNT_SECONDS) {
      // Deduplicated by eventId, so later ticks and the student's return do not count it again.
      const res = await countAway(a._id, { key: a.awayEventId, seconds: awayFor });
      if (!res.duplicate) summary.away += 1;
      if (res.terminated) return;
    }
    const silentFor = (now - (a.lastHeartbeatAt || now)) / 1000;
    if (a.policy.disconnectAction === 'TERMINATE' && silentFor > a.policy.maxDisconnectSeconds) {
      const { finalized } = await finalizeAttempt(a._id, {
        status: ATTEMPT_STATUS.TERMINATED,
        submissionType: 'TERMINATED',
        reason: `No heartbeat received for ${Math.round(silentFor)} seconds (browser closed, device offline, or monitoring disabled)`,
      });
      if (finalized) summary.terminated += 1;
    } else if (a.connectionState === 'ONLINE' && silentFor > a.policy.heartbeatTimeoutSeconds) {
      const res = await Attempt.updateOne(
        { _id: a._id, status: ATTEMPT_STATUS.IN_PROGRESS, connectionState: 'ONLINE', lastHeartbeatAt: a.lastHeartbeatAt },
        {
          $set: { connectionState: 'DISCONNECTED' },
          $push: {
            violations: {
              type: 'HEARTBEAT_LOST',
              reason: `No heartbeat for ${Math.round(silentFor)} seconds`,
              source: 'SERVER',
              at: now,
            },
          },
        },
      );
      if (res.modifiedCount) summary.disconnected += 1;
    }
  });

  const unevaluated = await Attempt.find({
    status: { $in: [ATTEMPT_STATUS.COMPLETED, ATTEMPT_STATUS.TERMINATED] },
    evaluated: false,
    updatedAt: { $lt: new Date(now.getTime() - 10000) },
  })
    .select('_id')
    .limit(200)
    .lean();
  await forEachLimit(unevaluated, CONCURRENCY, async (a) => {
    try {
      await evaluateAttempt(a._id);
      summary.reevaluated += 1;
    } catch (err) {
      logger.error({ err, attemptId: String(a._id) }, 'Re-evaluation failed');
    }
  });
  return summary;
}

let lastOpportunisticRun = 0;
let opportunisticRunning = false;

/**
 * Serverless deployments have no background timer, so admin requests start the monitor (without
 * waiting for it) at most once every 20 s per instance (plus a daily Vercel cron as a backstop).
 * Student APIs already enforce expiry on every request, so students never depend on this.
 */
export async function maybeRunMonitorTick() {
  if (opportunisticRunning || !isDbReady() || Date.now() - lastOpportunisticRun < 20000) return;
  lastOpportunisticRun = Date.now();
  opportunisticRunning = true;
  try {
    await runMonitorTick();
  } catch (err) {
    logger.error({ err }, 'Opportunistic monitor tick failed');
  } finally {
    opportunisticRunning = false;
  }
}

let timer = null;
let running = false;

export function startMonitor() {
  if (timer) return;
  timer = setInterval(async () => {
    if (running || !isDbReady()) return;
    running = true;
    try {
      const summary = await runMonitorTick();
      if (Object.values(summary).some(Boolean)) logger.info({ summary }, 'Monitor tick');
    } catch (err) {
      logger.error({ err }, 'Monitor tick failed');
    } finally {
      running = false;
    }
  }, env.MONITOR_INTERVAL_SECONDS * 1000);
  timer.unref();
  logger.info({ intervalSeconds: env.MONITOR_INTERVAL_SECONDS }, 'Attempt monitor started');
}

export function stopMonitor() {
  if (timer) clearInterval(timer);
  timer = null;
}
