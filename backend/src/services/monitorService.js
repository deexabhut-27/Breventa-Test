import { Attempt } from '../models/index.js';
import { ATTEMPT_STATUS } from '../config/constants.js';
import { env } from '../config/env.js';
import { isDbReady } from '../config/db.js';
import { logger } from '../utils/logger.js';
import { finalizeAttempt } from './attemptService.js';
import { evaluateAttempt } from './evaluationService.js';

/**
 * Server-side safety net for everything the browser cannot be trusted to report:
 *  1. Auto-submits attempts whose server-side timer has expired (browser closed, device off).
 *  2. Flags attempts whose heartbeat stopped; optionally terminates after a long, configurable gap.
 *     Short network blips only mark the attempt DISCONNECTED and are never treated as cheating.
 *  3. Re-runs evaluation for finalized attempts whose evaluation previously failed.
 * Every transition is a conditional atomic update, so running several API instances is safe.
 */
export async function runMonitorTick(now = new Date()) {
  const summary = { expired: 0, disconnected: 0, terminated: 0, reevaluated: 0 };
  const graceMs = env.SUBMISSION_GRACE_SECONDS * 1000;

  const expired = await Attempt.find({
    status: ATTEMPT_STATUS.IN_PROGRESS,
    expiresAt: { $lt: new Date(now.getTime() - graceMs) },
  })
    .select('_id')
    .limit(500)
    .lean();
  for (const a of expired) {
    const { finalized } = await finalizeAttempt(a._id, { status: ATTEMPT_STATUS.COMPLETED, submissionType: 'AUTO_TIMEOUT' });
    if (finalized) summary.expired += 1;
  }

  const running = await Attempt.find({ status: ATTEMPT_STATUS.IN_PROGRESS })
    .select('lastHeartbeatAt connectionState policy')
    .lean();
  for (const a of running) {
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
  }

  const unevaluated = await Attempt.find({
    status: { $in: [ATTEMPT_STATUS.COMPLETED, ATTEMPT_STATUS.TERMINATED] },
    evaluated: false,
    updatedAt: { $lt: new Date(now.getTime() - 10000) },
  })
    .select('_id')
    .limit(200)
    .lean();
  for (const a of unevaluated) {
    try {
      await evaluateAttempt(a._id);
      summary.reevaluated += 1;
    } catch (err) {
      logger.error({ err, attemptId: String(a._id) }, 'Re-evaluation failed');
    }
  }
  return summary;
}

let lastOpportunisticRun = 0;

/**
 * Serverless deployments have no background timer, so admin requests run the monitor
 * at most once every 20 s per instance (plus a daily Vercel cron as a backstop).
 * Student APIs already enforce expiry on every request, so students never depend on this.
 */
export async function maybeRunMonitorTick() {
  if (Date.now() - lastOpportunisticRun < 20000) return;
  lastOpportunisticRun = Date.now();
  try {
    await runMonitorTick();
  } catch (err) {
    logger.error({ err }, 'Opportunistic monitor tick failed');
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
