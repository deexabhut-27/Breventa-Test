import { TtlCache } from '../utils/ttlCache.js';

export const adminCache = new TtlCache({ ttlMs: 15_000, max: 500 });
export const studentCache = new TtlCache({ ttlMs: 60_000, max: 20_000 });
export const examCache = new TtlCache({ ttlMs: 30_000, max: 200 });
export const questionTextCache = new TtlCache({ ttlMs: 5 * 60_000, max: 20_000 });
// An attempt's question list and option order never change after it starts.
export const attemptQuestionsCache = new TtlCache({ ttlMs: 15 * 60_000, max: 20_000 });
// Eligible questions per difficulty + categories. When 100 students press START together, they
// share one read of the question bank instead of each reading it.
export const questionPoolCache = new TtlCache({ ttlMs: 30_000, max: 200 });
// Correct answers per question, used when marking (never sent to students).
export const answerKeyCache = new TtlCache({ ttlMs: 5 * 60_000, max: 20_000 });

export function clearAllCaches() {
  [adminCache, studentCache, examCache, questionTextCache, attemptQuestionsCache, questionPoolCache, answerKeyCache].forEach((c) => c.clear());
}
