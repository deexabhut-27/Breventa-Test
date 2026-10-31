import { randomBytes } from 'node:crypto';
import { Question } from '../models/index.js';
import { DIFFICULTY_LABELS, EXAM_STATUS } from '../config/constants.js';
import { AppError } from '../utils/AppError.js';

export const DISTRIBUTION_KEYS = [
  ['easy', 'EASY'],
  ['medium', 'MEDIUM'],
  ['hard', 'HARD'],
];

export function makeSlug(title) {
  const base = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return `${base || 'exam'}-${randomBytes(4).toString('hex')}`;
}

/** Checks the question bank holds enough ACTIVE questions for the exam's distribution and categories. */
export async function checkQuestionAvailability(exam) {
  const rows = await Question.aggregate([
    { $match: { isActive: true, category: { $in: exam.categories } } },
    { $group: { _id: '$difficulty', count: { $sum: 1 } } },
  ]);
  const available = { EASY: 0, MEDIUM: 0, HARD: 0 };
  rows.forEach((r) => {
    available[r._id] = r.count;
  });

  const items = DISTRIBUTION_KEYS.map(([key, difficulty]) => {
    const required = exam.distribution?.[key] || 0;
    return {
      difficulty,
      label: DIFFICULTY_LABELS[difficulty],
      required,
      available: available[difficulty],
      shortfall: Math.max(0, required - available[difficulty]),
    };
  });
  const problems = items.filter((i) => i.shortfall > 0);
  return {
    ok: problems.length === 0,
    items,
    message: problems.length
      ? `Not enough active questions in the selected categories: ${problems
          .map((p) => `${p.label} requires ${p.required} but only ${p.available} available`)
          .join('; ')}.`
      : 'The question bank has enough eligible questions for this examination.',
  };
}

export function assertExamOpen(exam, now = new Date()) {
  if (!exam || exam.status !== EXAM_STATUS.PUBLISHED) {
    throw AppError.forbidden('This examination is not currently available', 'EXAM_NOT_AVAILABLE');
  }
  if (exam.startAt && now < exam.startAt) {
    throw AppError.forbidden('The examination has not started yet', 'EXAM_NOT_STARTED');
  }
  if (exam.endAt && now > exam.endAt) {
    throw AppError.forbidden('The examination window has closed', 'EXAM_CLOSED');
  }
}

export function maxViolationsFor(policy) {
  return policy.mode === 'WARNING' ? (policy.warningsAllowed || 1) + 1 : 1;
}

/** Public, answer-free view of an exam shown on registration and instruction pages. */
export function publicExamView(exam) {
  const negative = exam.negativeMarking?.enabled;
  const totalMarks = exam.markingScheme === 'EXAM' ? exam.totalQuestions * exam.marksPerQuestion : null;
  return {
    id: exam._id,
    slug: exam.slug,
    title: exam.title,
    description: exam.description,
    instructions: exam.instructions,
    durationMinutes: exam.durationMinutes,
    totalQuestions: exam.totalQuestions,
    distribution: exam.distribution,
    categories: exam.categories,
    markingScheme: exam.markingScheme,
    marksPerQuestion: exam.markingScheme === 'EXAM' ? exam.marksPerQuestion : null,
    totalMarks,
    negativeMarking: { enabled: !!negative, marks: negative && exam.markingScheme === 'EXAM' ? exam.negativeMarking.marks : null },
    passPercentage: exam.passPercentage,
    startAt: exam.startAt,
    endAt: exam.endAt,
    maxAttempts: exam.maxAttempts,
    status: exam.status,
    violationPolicy: {
      mode: exam.violationPolicy.mode,
      maxViolations: maxViolationsFor(exam.violationPolicy),
      disconnectAction: exam.violationPolicy.disconnectAction,
      maxDisconnectSeconds: exam.violationPolicy.maxDisconnectSeconds,
    },
  };
}
