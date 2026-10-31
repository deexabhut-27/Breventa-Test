import { describe, expect, it } from 'vitest';
import { computeScore } from '../src/services/evaluationService.js';
import { secureShuffle, securePick } from '../src/utils/random.js';

const q = (id, difficulty, category, marks = 1, negativeMarks = 0) => ({ question: id, difficulty, category, marks, negativeMarks, optionOrder: [0, 1, 2, 3] });

describe('computeScore', () => {
  const questions = [
    q('a', 'EASY', 'Quantitative Aptitude', 1, 0.25),
    q('b', 'EASY', 'Logical Reasoning', 1, 0.25),
    q('c', 'MEDIUM', 'Verbal Ability', 2, 0.5),
    q('d', 'HARD', 'Analytical Reasoning', 3, 1),
    q('e', 'HARD', 'General Aptitude', 3, 1),
  ];
  const key = new Map([['a', 0], ['b', 1], ['c', 2], ['d', 3], ['e', 0]]);

  it('counts correct, incorrect and unanswered with negative marking', () => {
    const responses = new Map([['a', 0], ['b', 2], ['c', 2], ['d', null]]); // e missing
    const r = computeScore(questions, key, responses);
    expect(r.totals.correct).toBe(2);
    expect(r.totals.incorrect).toBe(1);
    expect(r.totals.unanswered).toBe(2);
    expect(r.totals.maxScore).toBe(10);
    expect(r.totals.score).toBe(1 - 0.25 + 2); // 2.75
    expect(r.percentage).toBe(27.5);
  });

  it('splits scores by difficulty and aptitude/reasoning', () => {
    const responses = new Map([['a', 0], ['b', 1], ['c', 0], ['d', 3], ['e', 0]]);
    const r = computeScore(questions, key, responses);
    expect(r.scores.easy.score).toBe(2);
    expect(r.scores.medium.score).toBe(-0.5);
    expect(r.scores.hard.score).toBe(6);
    // Reasoning = Logical + Analytical
    expect(r.scores.reasoning).toMatchObject({ total: 2, correct: 2, score: 4 });
    expect(r.scores.aptitude).toMatchObject({ total: 3, correct: 2, incorrect: 1, score: 3.5 });
    expect(r.categoryScores).toHaveLength(5);
  });

  it('applies no penalty when negative marking is zero and allows negative totals otherwise', () => {
    const noNeg = computeScore([q('x', 'EASY', 'Verbal Ability')], new Map([['x', 1]]), new Map([['x', 0]]));
    expect(noNeg.totals.score).toBe(0);
    const neg = computeScore([q('x', 'EASY', 'Verbal Ability', 1, 0.5)], new Map([['x', 1]]), new Map([['x', 0]]));
    expect(neg.totals.score).toBe(-0.5);
  });
});

describe('secure randomization', () => {
  it('shuffle is a permutation and does not mutate input', () => {
    const input = Array.from({ length: 50 }, (_, i) => i);
    const out = secureShuffle(input);
    expect(out).toHaveLength(50);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
    expect(input[0]).toBe(0);
  });

  it('produces varied orderings', () => {
    const seen = new Set(Array.from({ length: 30 }, () => secureShuffle([0, 1, 2, 3]).join('')));
    expect(seen.size).toBeGreaterThan(5);
  });

  it('pick returns distinct items', () => {
    const picked = securePick(Array.from({ length: 20 }, (_, i) => i), 10);
    expect(new Set(picked).size).toBe(10);
  });
});
