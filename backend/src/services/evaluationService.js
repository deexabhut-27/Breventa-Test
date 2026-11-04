import { Attempt, Question, Result, StudentResponse } from '../models/index.js';
import { ATTEMPT_STATUS, REASONING_CATEGORIES } from '../config/constants.js';
import { AppError } from '../utils/AppError.js';
import { round2 } from '../utils/helpers.js';
import { logger } from '../utils/logger.js';
import { refreshLatestResults } from './latestResultService.js';
import { syncAutoQualification } from './pipelineService.js';
import { answerKeyCache, examCache, studentCache } from './cache.js';
import { Examination, Student } from '../models/index.js';

const emptyBucket = () => ({ score: 0, maxScore: 0, total: 0, correct: 0, incorrect: 0, unanswered: 0 });

/**
 * Pure scoring function.
 * @param attemptQuestions snapshot from the attempt (marks/negativeMarks already resolved)
 * @param answerKey Map<questionId, correctOptionIndex>
 * @param responses Map<questionId, selectedOption (original index) | null>
 */
export function computeScore(attemptQuestions, answerKey, responses) {
  const totals = { ...emptyBucket() };
  const scores = { easy: emptyBucket(), medium: emptyBucket(), hard: emptyBucket(), aptitude: emptyBucket(), reasoning: emptyBucket() };
  const categories = new Map();

  for (const aq of attemptQuestions) {
    const id = String(aq.question);
    const selected = responses.get(id);
    const correctIndex = answerKey.get(id);
    let outcome = 'unanswered';
    let delta = 0;
    if (selected !== null && selected !== undefined && correctIndex !== undefined) {
      if (selected === correctIndex) {
        outcome = 'correct';
        delta = aq.marks;
      } else {
        outcome = 'incorrect';
        delta = -aq.negativeMarks;
      }
    }

    if (!categories.has(aq.category)) categories.set(aq.category, emptyBucket());
    const group = REASONING_CATEGORIES.includes(aq.category) ? 'reasoning' : 'aptitude';
    for (const bucket of [totals, scores[aq.difficulty.toLowerCase()], scores[group], categories.get(aq.category)]) {
      bucket.total += 1;
      bucket.maxScore += aq.marks;
      bucket.score += delta;
      bucket[outcome] += 1;
    }
  }

  const fix = (b) => Object.assign(b, { score: round2(b.score), maxScore: round2(b.maxScore) });
  fix(totals);
  Object.values(scores).forEach(fix);
  const categoryScores = [...categories.entries()].map(([category, b]) => ({ category, ...fix(b) }));
  const percentage = totals.maxScore > 0 ? round2((totals.score / totals.maxScore) * 100) : 0;
  return { totals, scores, categoryScores, percentage };
}

/** Idempotent: re-running produces the same Result document (upsert keyed by attempt). */
export async function evaluateAttempt(attemptId) {
  const attempt = await Attempt.findById(attemptId);
  if (!attempt) throw AppError.notFound('Attempt not found');
  // Student and exam come from cache when possible (a burst of submissions shares them).
  const [studentDoc, examDoc] = await Promise.all([
    studentCache.getOrLoad(attempt.student, () => Student.findById(attempt.student).select('-notes').lean()),
    examCache.getOrLoad(attempt.examination, () => Examination.findById(attempt.examination).lean()),
  ]);
  const student = studentDoc;
  const examInfo = examDoc ? { _id: examDoc._id, title: examDoc.title } : { _id: attempt.examination };
  if (attempt.status === ATTEMPT_STATUS.IN_PROGRESS) {
    throw AppError.conflict('Cannot evaluate an attempt that is still in progress', 'ATTEMPT_IN_PROGRESS');
  }

  const ids = attempt.questions.map((q) => q.question);
  // Answer keys rarely change: read only the ones not cached (a burst of submissions shares them).
  const answerKey = new Map();
  const missing = [];
  ids.forEach((qid) => {
    const k = answerKeyCache.get(qid);
    if (k !== undefined) answerKey.set(String(qid), k);
    else missing.push(qid);
  });
  const [keys, responses] = await Promise.all([
    missing.length ? Question.find({ _id: { $in: missing } }).select('+correctOptionIndex').lean() : [],
    StudentResponse.find({ attempt: attempt._id }).select('question selectedOption').lean(),
  ]);
  keys.forEach((k) => answerKey.set(String(k._id), answerKeyCache.set(k._id, k.correctOptionIndex)));
  const responseMap = new Map(responses.map((r) => [String(r.question), r.selectedOption]));

  const { totals, scores, categoryScores, percentage } = computeScore(attempt.questions, answerKey, responseMap);
  // Terminated attempts are judged on the answers saved before termination, like completed ones.
  const passed = [ATTEMPT_STATUS.COMPLETED, ATTEMPT_STATUS.TERMINATED].includes(attempt.status) && percentage >= attempt.policy.passPercentage;
  const endedAt = attempt.endedAt || new Date();

  const result = await Result.findOneAndUpdate(
    { attempt: attempt._id },
    {
      $set: {
        student: student?._id || attempt.student,
        examination: examInfo._id,
        studentName: student?.fullName,
        universityName: student?.universityName,
        email: student?.email,
        phone: student?.phone,
        enrollmentNumber: student?.enrollmentNumber,
        examTitle: examInfo.title,
        status: attempt.status,
        submissionType: attempt.submissionType,
        terminationReason: attempt.terminationReason,
        startedAt: attempt.startedAt,
        endedAt,
        durationUsedSeconds: Math.max(0, Math.round((endedAt - attempt.startedAt) / 1000)),
        totalQuestions: totals.total,
        attempted: totals.correct + totals.incorrect,
        correct: totals.correct,
        incorrect: totals.incorrect,
        unanswered: totals.unanswered,
        maxScore: totals.maxScore,
        totalScore: totals.score,
        percentage,
        passPercentage: attempt.policy.passPercentage,
        passed,
        violationCount: attempt.violationCount,
        scores,
        categoryScores,
        evaluatedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await Attempt.updateOne({ _id: attempt._id }, { $set: { evaluated: true } });
  if (student?._id) {
    // This result is the student's newest: store it directly (no recomputation needed).
    await refreshLatestResults({ studentIds: [student._id], known: result });
    // Passing students move to Round 2 automatically; a failure here must not undo the evaluation.
    await syncAutoQualification(examInfo._id, { studentIds: [student._id], known: result }).catch((err) =>
      logger.error({ err, attemptId: String(attempt._id) }, 'Auto-qualification failed'),
    );
  }
  return result;
}
