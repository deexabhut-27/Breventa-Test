import mongoose from 'mongoose';
import { z } from 'zod';
import { escapeRegex } from '../utils/helpers.js';

const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid id');
const optionalNumber = z.preprocess((v) => (v === '' || v === undefined ? undefined : v), z.coerce.number().optional());
const optionalDate = z.preprocess((v) => (v === '' || v === undefined ? undefined : v), z.coerce.date().optional());
const optionalString = z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(200).optional());

export const SORT_FIELDS = {
  studentName: 'studentName',
  universityName: 'universityName',
  examTitle: 'examTitle',
  startedAt: 'startedAt',
  endedAt: 'endedAt',
  totalScore: 'totalScore',
  percentage: 'percentage',
  correct: 'correct',
  easy: 'scores.easy.score',
  medium: 'scores.medium.score',
  hard: 'scores.hard.score',
  aptitude: 'scores.aptitude.score',
  reasoning: 'scores.reasoning.score',
  durationUsedSeconds: 'durationUsedSeconds',
};

const SCORE_FIELDS = { total: 'totalScore', easy: 'scores.easy.score', medium: 'scores.medium.score', hard: 'scores.hard.score' };

export const resultFilterSchema = z.object({
  search: optionalString,
  name: optionalString,
  university: optionalString,
  email: optionalString,
  phone: optionalString,
  exam: z.preprocess((v) => (v === '' ? undefined : v), objectId.optional()),
  from: optionalDate,
  to: optionalDate,
  difficulty: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['total', 'easy', 'medium', 'hard']).optional()),
  minScore: optionalNumber,
  maxScore: optionalNumber,
  status: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['COMPLETED', 'TERMINATED']).optional()),
  passed: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['true', 'false']).optional()),
  sortBy: z.enum(Object.keys(SORT_FIELDS)).default('endedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const contains = (v) => ({ $regex: escapeRegex(v), $options: 'i' });

export function buildResultFilter(q) {
  const filter = {};
  if (q.exam) filter.examination = new mongoose.Types.ObjectId(q.exam);
  if (q.name) filter.studentName = contains(q.name);
  if (q.university) filter.universityName = contains(q.university);
  if (q.email) filter.email = contains(q.email);
  if (q.phone) filter.phone = contains(q.phone);
  if (q.status) filter.status = q.status;
  if (q.passed) filter.passed = q.passed === 'true';
  if (q.from || q.to) {
    filter.startedAt = {};
    if (q.from) filter.startedAt.$gte = q.from;
    if (q.to) {
      const to = new Date(q.to);
      // A bare date ("2026-10-31") means "through the end of that day".
      if (to.getUTCHours() === 0 && to.getUTCMinutes() === 0) to.setUTCHours(23, 59, 59, 999);
      filter.startedAt.$lte = to;
    }
  }
  if (q.minScore !== undefined || q.maxScore !== undefined) {
    const field = SCORE_FIELDS[q.difficulty || 'total'];
    filter[field] = {};
    if (q.minScore !== undefined) filter[field].$gte = q.minScore;
    if (q.maxScore !== undefined) filter[field].$lte = q.maxScore;
  }
  if (q.search) {
    const rx = contains(q.search);
    filter.$or = [{ studentName: rx }, { universityName: rx }, { email: rx }, { phone: rx }, { enrollmentNumber: rx }, { examTitle: rx }];
  }
  return filter;
}

export function buildSort(q) {
  return { [SORT_FIELDS[q.sortBy] || 'endedAt']: q.sortOrder === 'asc' ? 1 : -1, _id: 1 };
}

export function describeFilters(q) {
  const parts = [];
  if (q.search) parts.push(`Search "${q.search}"`);
  if (q.name) parts.push(`Name contains "${q.name}"`);
  if (q.university) parts.push(`University contains "${q.university}"`);
  if (q.email) parts.push(`Email contains "${q.email}"`);
  if (q.phone) parts.push(`Phone contains "${q.phone}"`);
  if (q.status) parts.push(`Status ${q.status}`);
  if (q.passed) parts.push(q.passed === 'true' ? 'Passed only' : 'Failed only');
  if (q.from) parts.push(`From ${q.from.toISOString().slice(0, 10)}`);
  if (q.to) parts.push(`To ${q.to.toISOString().slice(0, 10)}`);
  if (q.minScore !== undefined) parts.push(`${q.difficulty || 'total'} score >= ${q.minScore}`);
  if (q.maxScore !== undefined) parts.push(`${q.difficulty || 'total'} score <= ${q.maxScore}`);
  return parts.length ? parts.join(' | ') : 'No filters applied';
}

export function summarize(rows) {
  const n = rows.length;
  if (!n) return { count: 0, average: 0, highest: 0, lowest: 0, passed: 0, passRate: 0, terminated: 0 };
  const scores = rows.map((r) => r.totalScore || 0);
  const passed = rows.filter((r) => r.passed).length;
  return {
    count: n,
    average: Math.round((scores.reduce((a, b) => a + b, 0) / n) * 100) / 100,
    highest: Math.max(...scores),
    lowest: Math.min(...scores),
    averagePercentage: Math.round((rows.reduce((a, r) => a + (r.percentage || 0), 0) / n) * 100) / 100,
    passed,
    passRate: Math.round((passed / n) * 10000) / 100,
    terminated: rows.filter((r) => r.status === 'TERMINATED').length,
  };
}

export function groupByUniversity(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = r.universityName || 'Unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
