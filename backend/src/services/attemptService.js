import { randomUUID } from 'node:crypto';
import { Attempt, Question, StudentResponse } from '../models/index.js';
import { ATTEMPT_STATUS, COUNTED_VIOLATIONS } from '../config/constants.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { isDuplicateKeyError } from '../utils/helpers.js';
import { logger } from '../utils/logger.js';
import { secureShuffle, securePick } from '../utils/random.js';
import { assertExamOpen, DISTRIBUTION_KEYS, maxViolationsFor } from './examService.js';
import { evaluateAttempt } from './evaluationService.js';
import { audit } from './auditService.js';

const graceMs = () => env.SUBMISSION_GRACE_SECONDS * 1000;

export const VIOLATION_LABELS = {
  TAB_SWITCH: 'Browser tab switched',
  WINDOW_HIDDEN: 'Examination window hidden',
  NAVIGATION: 'Navigated away from the examination',
  WINDOW_BLUR: 'Examination window lost focus',
  PAGE_UNLOAD: 'Page closed or reloaded',
  PAGE_RELOAD: 'Page reloaded',
  NAVIGATION_BLOCKED: 'Back navigation blocked',
  HEARTBEAT_LOST: 'Connection heartbeat lost',
  RECONNECTED: 'Connection restored',
  SESSION_REPLACED: 'Examination opened in a new session',
  FULLSCREEN_EXIT: 'Exited full screen',
  COPY_ATTEMPT: 'Copy attempt',
  CONTEXT_MENU: 'Context menu opened',
};

export const remainingMs = (attempt, now = Date.now()) => Math.max(0, attempt.expiresAt.getTime() - now);
const isExpired = (attempt, now = Date.now()) => now > attempt.expiresAt.getTime() + graceMs();

/** Randomly selects questions per difficulty and shuffles both question and option order. */
export async function buildAttemptQuestions(exam) {
  const picked = [];
  for (const [key, difficulty] of DISTRIBUTION_KEYS) {
    const needed = exam.distribution?.[key] || 0;
    if (!needed) continue;
    const pool = await Question.find({ isActive: true, difficulty, category: { $in: exam.categories } })
      .select('_id difficulty category marks negativeMarks')
      .lean();
    if (pool.length < needed) {
      throw AppError.conflict(
        `This examination cannot start: it needs ${needed} ${difficulty.toLowerCase()} questions but only ${pool.length} are available. Please contact the examination administrator.`,
        'INSUFFICIENT_QUESTIONS',
      );
    }
    picked.push(...securePick(pool, needed));
  }

  const negativeEnabled = !!exam.negativeMarking?.enabled;
  return secureShuffle(picked).map((q) => ({
    question: q._id,
    difficulty: q.difficulty,
    category: q.category,
    marks: exam.markingScheme === 'QUESTION' ? q.marks : exam.marksPerQuestion,
    negativeMarks: !negativeEnabled ? 0 : exam.markingScheme === 'QUESTION' ? q.negativeMarks : exam.negativeMarking.marks,
    optionOrder: secureShuffle([0, 1, 2, 3]),
  }));
}

async function resumeAttempt(attemptId, { ip, userAgent }) {
  const now = new Date();
  const sessionId = randomUUID();
  const attempt = await Attempt.findOneAndUpdate(
    { _id: attemptId, status: ATTEMPT_STATUS.IN_PROGRESS },
    {
      $set: { sessionId, sessionStartedAt: now, lastHeartbeatAt: now, connectionState: 'ONLINE', ipAddress: ip, userAgent },
      $push: {
        violations: { type: 'SESSION_REPLACED', reason: 'Examination resumed in a new browser session', source: 'SERVER', at: now },
      },
    },
    { new: true },
  );
  if (!attempt) throw AppError.conflict('This attempt is no longer active', 'ATTEMPT_CLOSED');
  return { attempt, sessionId, resumed: true };
}

/** Summary of a student's attempts for the instructions page. */
export async function attemptSummary(student, exam) {
  const attempts = await Attempt.find({ student: student._id, examination: exam._id })
    .select('status attemptNumber expiresAt terminationReason')
    .lean();
  const active = attempts.find((a) => a.status === ATTEMPT_STATUS.IN_PROGRESS && !isExpired(a));
  const terminated = attempts.find((a) => a.status === ATTEMPT_STATUS.TERMINATED);

  let canStart = true;
  let blockedReason = null;
  if (terminated) {
    canStart = false;
    blockedReason = `Your examination was terminated: ${terminated.terminationReason || 'policy violation'}`;
  } else if (!active && attempts.length >= exam.maxAttempts) {
    canStart = false;
    blockedReason = 'You have already completed this examination.';
  }
  return {
    hasActiveAttempt: !!active,
    attemptsUsed: attempts.length,
    maxAttempts: exam.maxAttempts,
    terminated: !!terminated,
    completedCount: attempts.filter((a) => a.status === ATTEMPT_STATUS.COMPLETED).length,
    canStart,
    blockedReason,
  };
}

export async function startAttempt({ student, exam, ip, userAgent }) {
  const now = new Date();
  assertExamOpen(exam, now);

  let attempts = await Attempt.find({ student: student._id, examination: exam._id }).select('status expiresAt attemptNumber');
  const active = attempts.find((a) => a.status === ATTEMPT_STATUS.IN_PROGRESS);
  if (active) {
    if (!isExpired(active)) return resumeAttempt(active._id, { ip, userAgent });
    await finalizeAttempt(active._id, { status: ATTEMPT_STATUS.COMPLETED, submissionType: 'AUTO_TIMEOUT' });
    attempts = await Attempt.find({ student: student._id, examination: exam._id }).select('status attemptNumber');
  }
  if (attempts.some((a) => a.status === ATTEMPT_STATUS.TERMINATED)) {
    throw AppError.forbidden('Your examination attempt was terminated and cannot be restarted', 'ATTEMPT_TERMINATED');
  }
  if (attempts.length >= exam.maxAttempts) {
    throw AppError.forbidden('You have already used all permitted attempts for this examination', 'ATTEMPTS_EXHAUSTED');
  }

  const questions = await buildAttemptQuestions(exam);
  let expiresAt = new Date(now.getTime() + exam.durationMinutes * 60 * 1000);
  if (exam.endAt && exam.endAt < expiresAt) expiresAt = new Date(exam.endAt);
  const sessionId = randomUUID();

  try {
    const attempt = await Attempt.create({
      student: student._id,
      examination: exam._id,
      attemptNumber: attempts.length + 1,
      status: ATTEMPT_STATUS.IN_PROGRESS,
      startedAt: now,
      expiresAt,
      questions,
      policy: {
        mode: exam.violationPolicy.mode,
        maxViolations: maxViolationsFor(exam.violationPolicy),
        heartbeatTimeoutSeconds: exam.violationPolicy.heartbeatTimeoutSeconds,
        disconnectAction: exam.violationPolicy.disconnectAction,
        maxDisconnectSeconds: exam.violationPolicy.maxDisconnectSeconds,
        passPercentage: exam.passPercentage,
      },
      sessionId,
      sessionStartedAt: now,
      lastHeartbeatAt: now,
      ipAddress: ip,
      userAgent,
    });
    await audit({ actorType: 'STUDENT', actorId: student._id, action: 'ATTEMPT_STARTED', entityType: 'Attempt', entityId: attempt._id, ip });
    return { attempt, sessionId, resumed: false };
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    // A concurrent START won the race; join that attempt instead of creating a second one.
    const existing = await Attempt.findOne({ student: student._id, examination: exam._id, status: ATTEMPT_STATUS.IN_PROGRESS });
    if (existing) return resumeAttempt(existing._id, { ip, userAgent });
    throw AppError.conflict('Your examination is being started in another request, please retry', 'ATTEMPT_CONFLICT');
  }
}

/** Server-side status validation used by every examination API. */
export async function loadActiveAttempt(student, sessionId) {
  const attempt = await Attempt.findOne({ student: student._id, examination: student.examination })
    .sort({ attemptNumber: -1 })
    .select('+sessionId');
  if (!attempt) throw AppError.notFound('No examination attempt found. Please start the examination first.', 'NO_ATTEMPT');
  if (attempt.status !== ATTEMPT_STATUS.IN_PROGRESS) {
    const msg = attempt.status === ATTEMPT_STATUS.TERMINATED ? 'Your examination has been terminated' : 'Your examination has already been submitted';
    throw AppError.conflict(msg, 'ATTEMPT_CLOSED', { status: attempt.status, terminationReason: attempt.terminationReason });
  }
  if (!sessionId || attempt.sessionId !== sessionId) {
    throw AppError.conflict('This examination is open in another browser window or device', 'SESSION_REPLACED');
  }
  if (isExpired(attempt)) {
    await finalizeAttempt(attempt._id, { status: ATTEMPT_STATUS.COMPLETED, submissionType: 'AUTO_TIMEOUT' });
    throw AppError.conflict('Time is up. Your examination was submitted automatically.', 'TIME_UP', { status: ATTEMPT_STATUS.COMPLETED });
  }
  return attempt;
}

/** Student-safe attempt view: shuffled questions and options, saved responses, and server timer. Never includes answers. */
export async function attemptPayload(attempt, { student, exam }) {
  const ids = attempt.questions.map((q) => q.question);
  const docs = await Question.find({ _id: { $in: ids } }).select('text options').lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const responses = await StudentResponse.find({ attempt: attempt._id }).lean();
  const respById = new Map(responses.map((r) => [String(r.question), r]));
  const now = Date.now();

  return {
    attemptId: attempt._id,
    status: attempt.status,
    student: { fullName: student.fullName, universityName: student.universityName },
    exam: { title: exam.title, slug: exam.slug },
    timer: {
      serverNow: new Date(now).toISOString(),
      startedAt: attempt.startedAt,
      expiresAt: attempt.expiresAt,
      remainingMs: remainingMs(attempt, now),
    },
    policy: {
      mode: attempt.policy.mode,
      maxViolations: attempt.policy.maxViolations,
      violationCount: attempt.violationCount,
    },
    heartbeatIntervalSeconds: env.HEARTBEAT_INTERVAL_SECONDS,
    maxSeq: responses.reduce((m, r) => Math.max(m, r.seq || 0), 0),
    questions: attempt.questions.map((aq, index) => {
      const q = byId.get(String(aq.question));
      return {
        index,
        text: q ? q.text : '[This question is no longer available]',
        options: aq.optionOrder.map((orig) => (q ? q.options[orig] : '-')),
        category: aq.category,
        marks: aq.marks,
        negativeMarks: aq.negativeMarks,
      };
    }),
    responses: attempt.questions
      .map((aq, index) => {
        const r = respById.get(String(aq.question));
        if (!r) return null;
        return {
          index,
          selectedOption: r.selectedOption === null || r.selectedOption === undefined ? null : aq.optionOrder.indexOf(r.selectedOption),
          markedForReview: !!r.markedForReview,
          visited: true,
        };
      })
      .filter(Boolean),
  };
}

export async function saveResponse(attempt, { index, selectedOption = null, markedForReview = false, seq }) {
  if (!Number.isInteger(index) || index < 0 || index >= attempt.questions.length) {
    throw AppError.badRequest('This question is not part of your examination', 'INVALID_QUESTION');
  }
  const aq = attempt.questions[index];
  const original = selectedOption === null || selectedOption === undefined ? null : aq.optionOrder[selectedOption];
  if (original === undefined) throw AppError.badRequest('Invalid option selected', 'INVALID_OPTION');

  try {
    await StudentResponse.updateOne(
      { attempt: attempt._id, question: aq.question, seq: { $lt: seq } },
      {
        $set: {
          questionIndex: index,
          selectedOption: original,
          displayedOption: original === null ? null : selectedOption,
          markedForReview: !!markedForReview,
          visited: true,
          seq,
          answeredAt: original === null ? null : new Date(),
        },
      },
      { upsert: true },
    );
    return { index, saved: true, stale: false };
  } catch (err) {
    // The filter missed because a newer write already exists; the upsert then collides on the unique index.
    if (isDuplicateKeyError(err)) return { index, saved: false, stale: true };
    throw err;
  }
}

export async function savePendingResponses(attempt, pending = []) {
  const results = [];
  for (const p of pending.slice(0, attempt.questions.length)) {
    try {
      results.push(await saveResponse(attempt, p));
    } catch (err) {
      logger.warn({ err: err.message, attempt: String(attempt._id) }, 'Skipping invalid pending response');
    }
  }
  return results;
}

export async function recordHeartbeat(attempt) {
  const now = new Date();
  const update = { $set: { lastHeartbeatAt: now, connectionState: 'ONLINE' } };
  if (attempt.connectionState === 'DISCONNECTED') {
    const gap = attempt.lastHeartbeatAt ? Math.round((now - attempt.lastHeartbeatAt) / 1000) : null;
    update.$push = { violations: { type: 'RECONNECTED', reason: `Heartbeat resumed after ${gap ?? '?'}s`, source: 'SERVER', at: now } };
  }
  await Attempt.updateOne({ _id: attempt._id, status: ATTEMPT_STATUS.IN_PROGRESS }, update);
  return { status: ATTEMPT_STATUS.IN_PROGRESS, serverNow: now.toISOString(), remainingMs: remainingMs(attempt, now.getTime()) };
}

function violationSummary(attempt, extra = {}) {
  const max = attempt.policy.maxViolations;
  return {
    status: attempt.status,
    terminated: attempt.status === ATTEMPT_STATUS.TERMINATED,
    violationCount: attempt.violationCount,
    maxViolations: max,
    remainingBeforeTermination: Math.max(0, max - attempt.violationCount),
    terminationReason: attempt.terminationReason,
    ...extra,
  };
}

/**
 * Records a monitoring event. Counted violations (tab switch, hidden window, navigation)
 * terminate the attempt once policy.maxViolations is reached. Duplicate eventIds are ignored.
 */
export async function recordViolation(attemptId, { type, reason, eventId, clientAt, source = 'CLIENT' }) {
  const counted = COUNTED_VIOLATIONS.includes(type);
  const entry = { type, counted, reason: reason || VIOLATION_LABELS[type], eventId, clientAt, source, at: new Date() };
  const filter = { _id: attemptId, status: ATTEMPT_STATUS.IN_PROGRESS };
  if (eventId) filter['violations.eventId'] = { $ne: eventId };

  const updated = await Attempt.findOneAndUpdate(
    filter,
    { $push: { violations: entry }, ...(counted ? { $inc: { violationCount: 1 } } : {}) },
    { new: true, projection: { violationCount: 1, policy: 1, status: 1, terminationReason: 1 } },
  );
  if (!updated) {
    const current = await Attempt.findById(attemptId).select('violationCount policy status terminationReason');
    if (!current) throw AppError.notFound('Attempt not found');
    return violationSummary(current, { duplicate: true });
  }

  if (counted && updated.violationCount >= updated.policy.maxViolations) {
    const reasonText = `${VIOLATION_LABELS[type]} (violation ${updated.violationCount} of ${updated.policy.maxViolations} allowed)`;
    const { attempt } = await finalizeAttempt(updated._id, {
      status: ATTEMPT_STATUS.TERMINATED,
      submissionType: 'TERMINATED',
      reason: reasonText,
    });
    return violationSummary(attempt);
  }
  return violationSummary(updated, { counted });
}

/**
 * Atomically moves an attempt out of IN_PROGRESS exactly once, then evaluates it.
 * Concurrent callers (manual submit, timer expiry, termination, monitor) cannot double-finalize.
 */
export async function finalizeAttempt(attemptId, { status, submissionType, reason, actor }) {
  const now = new Date();
  const current = await Attempt.findById(attemptId).select('status expiresAt terminationReason violationCount policy student');
  if (!current) throw AppError.notFound('Attempt not found');
  if (current.status !== ATTEMPT_STATUS.IN_PROGRESS) return { finalized: false, attempt: current };

  const endedAt = submissionType === 'AUTO_TIMEOUT' || now > current.expiresAt ? current.expiresAt : now;
  const set = { status, submissionType, endedAt };
  if (status === ATTEMPT_STATUS.TERMINATED) set.terminationReason = reason || 'Terminated';

  const updated = await Attempt.findOneAndUpdate({ _id: attemptId, status: ATTEMPT_STATUS.IN_PROGRESS }, { $set: set }, { new: true });
  if (!updated) {
    return { finalized: false, attempt: await Attempt.findById(attemptId).select('status terminationReason violationCount policy') };
  }

  await audit({
    actorType: actor?.type || 'SYSTEM',
    actorId: actor?.id || updated.student,
    action: status === ATTEMPT_STATUS.TERMINATED ? 'ATTEMPT_TERMINATED' : 'ATTEMPT_SUBMITTED',
    entityType: 'Attempt',
    entityId: updated._id,
    details: { submissionType, reason },
  });

  try {
    await evaluateAttempt(updated._id);
  } catch (err) {
    // The background monitor re-evaluates attempts with evaluated=false.
    logger.error({ err, attemptId: String(updated._id) }, 'Evaluation failed; will retry from monitor');
  }
  return { finalized: true, attempt: updated };
}
