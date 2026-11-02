import { Examination } from '../models/index.js';
import { ATTEMPT_STATUS } from '../config/constants.js';
import { studentFromRawToken } from '../middleware/auth.js';
import {
  attemptPayload,
  attemptSummary,
  finalizeAttempt,
  loadActiveAttempt,
  recordHeartbeat,
  recordViolation,
  savePendingResponses,
  saveResponse,
  startAttempt,
} from '../services/attemptService.js';
import { publicExamView } from '../services/examService.js';
import { examCache } from '../services/cache.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { beaconSchema } from '../validators/index.js';
import { studentView } from './publicController.js';

export const SESSION_HEADER = 'x-exam-session';

async function loadExam(student) {
  const raw = await examCache.getOrLoad(student.examination, () => Examination.findById(student.examination).lean());
  if (!raw) throw AppError.notFound('Examination not found');
  return Examination.hydrate(raw);
}

const active = (req) => loadActiveAttempt(req.student, req.get(SESSION_HEADER));

export async function me(req, res) {
  const exam = await loadExam(req.student);
  res.json({
    success: true,
    data: { student: studentView(req.student), exam: publicExamView(exam), attempts: await attemptSummary(req.student, exam), serverNow: new Date().toISOString() },
  });
}

export async function start(req, res) {
  const exam = await loadExam(req.student);
  const { attempt, sessionId, resumed } = await startAttempt({
    student: req.student,
    exam,
    ip: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 300),
  });
  const payload = await attemptPayload(attempt, { student: req.student, exam });
  res.status(resumed ? 200 : 201).json({ success: true, data: { ...payload, sessionId, resumed } });
}

export async function current(req, res) {
  const attempt = await active(req);
  const exam = await loadExam(req.student);
  res.json({ success: true, data: await attemptPayload(attempt, { student: req.student, exam }) });
}

export async function answer(req, res) {
  const attempt = await active(req);
  const result = await saveResponse(attempt, { index: req.valid.params.index, ...req.body });
  res.json({ success: true, data: result });
}

export async function heartbeat(req, res) {
  const attempt = await active(req);
  res.json({ success: true, data: await recordHeartbeat(attempt, { visible: req.body?.visible }) });
}

export async function violation(req, res) {
  const attempt = await active(req);
  const { pendingResponses, ...event } = req.body;
  await savePendingResponses(attempt, pendingResponses);
  res.json({ success: true, data: await recordViolation(attempt._id, { ...event, source: 'CLIENT' }) });
}

export async function submit(req, res) {
  let attempt;
  try {
    attempt = await active(req);
  } catch (err) {
    if (err.code === 'ATTEMPT_CLOSED' && err.details?.status === ATTEMPT_STATUS.COMPLETED) {
      throw AppError.conflict('Your examination has already been submitted', 'ALREADY_SUBMITTED');
    }
    throw err;
  }
  await savePendingResponses(attempt, req.body.pendingResponses);
  const { finalized } = await finalizeAttempt(attempt._id, {
    status: ATTEMPT_STATUS.COMPLETED,
    submissionType: 'MANUAL',
  });
  if (!finalized) throw AppError.conflict('Your examination has already been submitted', 'ALREADY_SUBMITTED');
  res.json({ success: true, data: { status: ATTEMPT_STATUS.COMPLETED, submittedAt: new Date().toISOString() } });
}

/**
 * navigator.sendBeacon target: used while the page is being hidden or unloaded, when normal
 * XHRs may be cancelled. Beacons cannot carry headers, so the token travels in the body.
 * Always answers 204: the browser discards the response anyway.
 */
export async function beacon(req, res) {
  try {
    const raw = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
    const parsed = beaconSchema.safeParse(raw);
    if (!parsed.success) return res.status(204).end();
    const { token, sessionId, kind, type, reason, eventId, pendingResponses } = parsed.data;
    const student = await studentFromRawToken(token);
    const attempt = await loadActiveAttempt(student, sessionId);
    await savePendingResponses(attempt, pendingResponses);
    if (kind === 'violation' && type) {
      await recordViolation(attempt._id, { type, reason, eventId, source: 'BEACON' });
    } else if (kind === 'unload') {
      await recordViolation(attempt._id, { type: 'PAGE_UNLOAD', reason: reason || 'Page closed, reloaded or navigated away', eventId, source: 'BEACON' });
    }
  } catch (err) {
    logger.debug({ err: err.message }, 'Beacon ignored');
  }
  return res.status(204).end();
}
