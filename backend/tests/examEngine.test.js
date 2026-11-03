import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Attempt, Question, Result, StudentResponse } from '../src/models/index.js';
import { runMonitorTick } from '../src/services/monitorService.js';
import { api, clearDb, correctDisplayedOption, createAdmin, createExam, registerStudent, seedQuestions, setupDb, startExam, teardownDb } from './helpers.js';

beforeAll(setupDb);
afterAll(teardownDb);

let exam;
beforeEach(async () => {
  await clearDb();
  await seedQuestions({ EASY: 40, MEDIUM: 25, HARD: 15 });
  exam = await createExam();
});

const answer = (headers, index, selectedOption, seq, markedForReview = false) =>
  api().put(`/api/student/attempt/responses/${index}`).set(headers).send({ selectedOption, markedForReview, seq });

describe('starting an examination', () => {
  it('requires accepting the instructions', async () => {
    const reg = await registerStudent(exam);
    const res = await api().post('/api/student/attempt/start').set(reg.auth).send({});
    expect(res.status).toBe(400);
  });

  it('creates an IN_PROGRESS attempt with server-side timestamps and the configured distribution', async () => {
    const before = Date.now();
    const { payload } = await startExam(exam);
    const attempt = await Attempt.findById(payload.attemptId).lean();
    expect(attempt.status).toBe('IN_PROGRESS');
    expect(attempt.questions).toHaveLength(60);
    const counts = attempt.questions.reduce((a, q) => ({ ...a, [q.difficulty]: (a[q.difficulty] || 0) + 1 }), {});
    expect(counts).toEqual({ EASY: 30, MEDIUM: 20, HARD: 10 });
    expect(new Set(attempt.questions.map((q) => String(q.question))).size).toBe(60);
    expect(attempt.expiresAt - attempt.startedAt).toBe(60 * 60 * 1000);
    expect(attempt.startedAt.getTime()).toBeGreaterThanOrEqual(before - 5);
    expect(payload.timer.remainingMs).toBeGreaterThan(59 * 60 * 1000);
  });

  it('honours a custom distribution such as 10/10/10', async () => {
    const custom = await createExam({ slug: 'custom-1010', distribution: { easy: 10, medium: 10, hard: 10 } });
    const { payload } = await startExam(custom);
    expect(payload.questions).toHaveLength(30);
  });

  it('never exposes correct answers or question ids to the student', async () => {
    const { payload, headers } = await startExam(exam);
    const refreshed = await api().get('/api/student/attempt').set(headers);
    for (const body of [payload, refreshed.body.data]) {
      const json = JSON.stringify(body);
      expect(json).not.toMatch(/correctOptionIndex|explanation|optionOrder/);
      const ids = (await Question.find().select('_id').lean()).map((q) => String(q._id));
      ids.forEach((id) => expect(json).not.toContain(id));
    }
  });

  it('fails gracefully when the question bank shrank after publishing', async () => {
    await Question.updateMany({ difficulty: 'HARD' }, { isActive: false });
    const reg = await registerStudent(exam);
    const res = await api().post('/api/student/attempt/start').set(reg.auth).send({ acceptInstructions: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_QUESTIONS');
  });

  it('caps expiry at the examination end time', async () => {
    const endAt = new Date(Date.now() + 10 * 60 * 1000);
    const short = await createExam({ slug: 'ends-soon-1', endAt });
    const { payload } = await startExam(short);
    expect(new Date(payload.timer.expiresAt).getTime()).toBe(endAt.getTime());
  });

  it('rejects start before the start time', async () => {
    const future = await createExam({ slug: 'future-1', startAt: new Date(Date.now() + 3600e3) });
    const reg = await registerStudent(future);
    const res = await api().post('/api/student/attempt/start').set(reg.auth).send({ acceptInstructions: true });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EXAM_NOT_STARTED');
  });
});

describe('randomization', () => {
  it('gives different students different question and option orders', async () => {
    const a = await startExam(exam);
    const b = await startExam(exam);
    const qa = await Attempt.findById(a.payload.attemptId).lean();
    const qb = await Attempt.findById(b.payload.attemptId).lean();
    const orderA = qa.questions.map((q) => String(q.question)).join();
    const orderB = qb.questions.map((q) => String(q.question)).join();
    expect(orderA).not.toBe(orderB);
    const optionSets = new Set(qa.questions.map((q) => q.optionOrder.join('')));
    expect(optionSets.size).toBeGreaterThan(3);
    qa.questions.forEach((q) => expect([...q.optionOrder].sort()).toEqual([0, 1, 2, 3]));
  });

  it('shows options in the shuffled order stored for the attempt', async () => {
    const { payload } = await startExam(exam);
    const attempt = await Attempt.findById(payload.attemptId).lean();
    for (const [i, aq] of attempt.questions.entries()) {
      const q = await Question.findById(aq.question).lean();
      expect(payload.questions[i].options).toEqual(aq.optionOrder.map((o) => q.options[o]));
    }
  });

  it('keeps the same order after a page refresh', async () => {
    const { payload, headers } = await startExam(exam);
    const refreshed = await api().get('/api/student/attempt').set(headers);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.questions).toEqual(payload.questions);
  });
});

describe('answers, timer and refresh', () => {
  it('maps the displayed choice back to the correct original option', async () => {
    const { payload, headers } = await startExam(exam);
    const correct = await correctDisplayedOption(payload.attemptId, 0);
    expect((await answer(headers, 0, correct, 1)).status).toBe(200);
    const saved = await StudentResponse.findOne({ attempt: payload.attemptId }).lean();
    const attempt = await Attempt.findById(payload.attemptId).lean();
    const q = await Question.findById(attempt.questions[0].question).select('+correctOptionIndex').lean();
    expect(saved.selectedOption).toBe(q.correctOptionIndex);
    expect(saved.displayedOption).toBe(correct);
  });

  it('restores saved answers after refresh and ignores stale out-of-order writes', async () => {
    const { headers } = await startExam(exam);
    await answer(headers, 3, 2, 5, true);
    const stale = await answer(headers, 3, 1, 4);
    expect(stale.body.data.stale).toBe(true);
    const refreshed = await api().get('/api/student/attempt').set(headers);
    expect(refreshed.body.data.responses).toEqual([{ index: 3, selectedOption: 2, markedForReview: true, visited: true }]);
    expect(refreshed.body.data.maxSeq).toBe(5);
    await answer(headers, 3, null, 6);
    const cleared = await api().get('/api/student/attempt').set(headers);
    expect(cleared.body.data.responses[0].selectedOption).toBeNull();
  });

  it('rejects answers to questions outside the attempt', async () => {
    const { headers } = await startExam(exam);
    expect((await answer(headers, 60, 0, 1)).status).toBe(400);
    expect((await answer(headers, 0, 4, 1)).status).toBe(400);
  });

  it('does not reset the timer or create a new attempt when START is called again', async () => {
    const reg = await registerStudent(exam);
    const first = await api().post('/api/student/attempt/start').set(reg.auth).send({ acceptInstructions: true });
    await Attempt.updateOne({ _id: first.body.data.attemptId }, { $set: { expiresAt: new Date(Date.now() + 5 * 60 * 1000) } });
    const again = await api().post('/api/student/attempt/start').set(reg.auth).send({ acceptInstructions: true });
    expect(again.status).toBe(200);
    expect(again.body.data.resumed).toBe(true);
    expect(again.body.data.attemptId).toBe(first.body.data.attemptId);
    expect(again.body.data.timer.remainingMs).toBeLessThanOrEqual(5 * 60 * 1000);
    expect(await Attempt.countDocuments()).toBe(1);
  });

  it('computes remaining time from the server clock, ignoring client time', async () => {
    const { payload, headers } = await startExam(exam);
    await Attempt.updateOne({ _id: payload.attemptId }, { $set: { expiresAt: new Date(Date.now() + 90 * 1000) } });
    const hb = await api().post('/api/student/attempt/heartbeat').set(headers).send({ clientTime: '2099-01-01T00:00:00Z' });
    expect(hb.body.data.remainingMs).toBeLessThanOrEqual(90 * 1000);
    expect(hb.body.data.remainingMs).toBeGreaterThan(80 * 1000);
  });

  it('only one browser session can drive the attempt', async () => {
    const { auth, headers } = await startExam(exam);
    const takeover = await api().post('/api/student/attempt/start').set(auth).send({ acceptInstructions: true });
    const old = await api().get('/api/student/attempt').set(headers);
    expect(old.status).toBe(409);
    expect(old.body.error.code).toBe('SESSION_REPLACED');
    const fresh = await api().get('/api/student/attempt').set({ ...auth, 'X-Exam-Session': takeover.body.data.sessionId });
    expect(fresh.status).toBe(200);
    expect((await api().get('/api/student/attempt').set(auth)).status).toBe(409); // no session header
  });

  it('auto-submits when the timer expires and evaluates saved answers', async () => {
    const { payload, headers } = await startExam(exam);
    const correct = await correctDisplayedOption(payload.attemptId, 0);
    await answer(headers, 0, correct, 1);
    await Attempt.updateOne({ _id: payload.attemptId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await answer(headers, 1, 0, 2);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TIME_UP');
    const attempt = await Attempt.findById(payload.attemptId);
    expect(attempt.status).toBe('COMPLETED');
    expect(attempt.submissionType).toBe('AUTO_TIMEOUT');
    const result = await Result.findOne({ attempt: payload.attemptId });
    expect(result.correct).toBe(1);
    expect(result.unanswered).toBe(59);
  });

  it('monitor auto-submits expired attempts even if the browser never returns', async () => {
    const { payload } = await startExam(exam);
    await Attempt.updateOne({ _id: payload.attemptId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const summary = await runMonitorTick();
    expect(summary.expired).toBe(1);
    expect((await Attempt.findById(payload.attemptId)).status).toBe('COMPLETED');
    expect(await Result.countDocuments()).toBe(1);
  });
});

describe('submission and evaluation', () => {
  it('scores the attempt on the server with negative marking', async () => {
    const negExam = await createExam({ slug: 'neg-1', distribution: { easy: 4, medium: 0, hard: 0 }, negativeMarking: { enabled: true, marks: 0.25 }, marksPerQuestion: 2, passPercentage: 30 });
    const { payload, headers } = await startExam(negExam);
    const c0 = await correctDisplayedOption(payload.attemptId, 0);
    const c1 = await correctDisplayedOption(payload.attemptId, 1);
    const c2 = await correctDisplayedOption(payload.attemptId, 2);
    await answer(headers, 0, c0, 1);
    await answer(headers, 1, c1, 2);
    await answer(headers, 2, (c2 + 1) % 4, 3); // wrong
    const sub = await api().post('/api/student/attempt/submit').set(headers).send({ score: 9999 });
    expect(sub.status).toBe(200);
    const r = await Result.findOne({ attempt: payload.attemptId }).lean();
    expect(r).toMatchObject({ correct: 2, incorrect: 1, unanswered: 1, totalScore: 3.75, maxScore: 8, percentage: 46.88, passed: true, status: 'COMPLETED' });
    expect(r.scores.easy.score).toBe(3.75);
  });

  it('saves pending answers sent with the submit request', async () => {
    const { payload, headers } = await startExam(exam);
    const c = await correctDisplayedOption(payload.attemptId, 5);
    await api().post('/api/student/attempt/submit').set(headers).send({ pendingResponses: [{ index: 5, selectedOption: c, seq: 10 }] });
    expect((await Result.findOne({ attempt: payload.attemptId })).correct).toBe(1);
  });

  it('prevents duplicate submissions and double evaluation', async () => {
    const { headers, payload } = await startExam(exam);
    const results = await Promise.all(Array.from({ length: 5 }, () => api().post('/api/student/attempt/submit').set(headers).send({})));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    results.filter((r) => r.status !== 200).forEach((r) => expect(r.status).toBe(409));
    expect(await Result.countDocuments({ attempt: payload.attemptId })).toBe(1);
    const again = await api().post('/api/student/attempt/submit').set(headers).send({});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_SUBMITTED');
  });

  it('does not allow a new attempt after completion when maxAttempts is 1', async () => {
    const { headers, auth } = await startExam(exam);
    await api().post('/api/student/attempt/submit').set(headers).send({});
    const res = await api().post('/api/student/attempt/start').set(auth).send({ acceptInstructions: true });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ATTEMPTS_EXHAUSTED');
  });

  it('creates only one attempt under concurrent START requests', async () => {
    const reg = await registerStudent(exam);
    const results = await Promise.all(Array.from({ length: 6 }, () => api().post('/api/student/attempt/start').set(reg.auth).send({ acceptInstructions: true })));
    results.forEach((r) => expect([200, 201]).toContain(r.status));
    expect(await Attempt.countDocuments()).toBe(1);
  });
});

describe('anti-cheating', () => {
  const violation = (headers, body) => api().post('/api/student/attempt/violations').set(headers).send(body);

  const leave = (headers, eventId, extra = {}) => violation(headers, { type: 'TAB_SWITCH', eventId, ...extra });
  const comeBack = (headers, eventId, extra = {}) => violation(headers, { type: 'TAB_SWITCH', eventId, returned: true, ...extra });

  it('terminates immediately when the student leaves the window, and saves pending answers', async () => {
    const { payload, headers, auth } = await startExam(exam);
    const c = await correctDisplayedOption(payload.attemptId, 0);
    const hide = await leave(headers, 'e1', { pendingResponses: [{ index: 0, selectedOption: c, seq: 1 }] });
    expect(hide.body.data.terminated).toBe(true);
    const attempt = await Attempt.findById(payload.attemptId);
    expect(attempt.status).toBe('TERMINATED');
    expect(attempt.terminationReason).toMatch(/left the examination window/i);
    expect(await StudentResponse.countDocuments({ attempt: payload.attemptId })).toBe(1);
    expect((await Result.findOne({ attempt: payload.attemptId })).passed).toBe(false);

    // The later "returned" report for the same event is a harmless duplicate.
    expect((await comeBack(headers, 'e1')).status).toBeLessThan(500);

    // Terminated attempts cannot be resumed or restarted
    expect((await api().get('/api/student/attempt').set(headers)).body.error.code).toBe('ATTEMPT_CLOSED');
    expect((await answer(headers, 1, 0, 2)).status).toBe(409);
    const restart = await api().post('/api/student/attempt/start').set(auth).send({ acceptInstructions: true });
    expect(restart.status).toBe(403);
    expect(restart.body.error.code).toBe('ATTEMPT_TERMINATED');
  });

  it('terminates on window focus loss (another browser or app) even in WARNING mode', async () => {
    const warnExam = await createExam({ slug: 'warn-0', violationPolicy: { mode: 'WARNING', warningsAllowed: 2, heartbeatTimeoutSeconds: 45, disconnectAction: 'FLAG', maxDisconnectSeconds: 300 } });
    const { payload, headers } = await startExam(warnExam);
    const res = await violation(headers, { type: 'WINDOW_HIDDEN', eventId: 'f1', reason: 'Switched to another window, browser or application' });
    expect(res.body.data.terminated).toBe(true);
    expect((await Attempt.findById(payload.attemptId)).terminationReason).toMatch(/another window, browser/i);
  });

  it('does not terminate on window focus-loss logs (WINDOW_BLUR)', async () => {
    const { payload, headers } = await startExam(exam);
    await violation(headers, { type: 'WINDOW_BLUR' });
    expect((await Attempt.findById(payload.attemptId)).status).toBe('IN_PROGRESS');
  });

  it('terminates immediately on a screenshot attempt, even in WARNING mode', async () => {
    const warnExam = await createExam({ slug: 'shot-1', violationPolicy: { mode: 'WARNING', warningsAllowed: 3, heartbeatTimeoutSeconds: 45, disconnectAction: 'FLAG', maxDisconnectSeconds: 300 } });
    const { payload, headers } = await startExam(warnExam);
    const res = await violation(headers, { type: 'SCREENSHOT_ATTEMPT', eventId: 's1', reason: 'PrintScreen key pressed' });
    expect(res.body.data.terminated).toBe(true);
    const attempt = await Attempt.findById(payload.attemptId);
    expect(attempt.status).toBe('TERMINATED');
    expect(attempt.terminationReason).toMatch(/screenshot/i);
  });

  it('warns on the first copy and terminates on the second', async () => {
    const warnExam = await createExam({ slug: 'copy-1', violationPolicy: { mode: 'WARNING', warningsAllowed: 3, heartbeatTimeoutSeconds: 45, disconnectAction: 'FLAG', maxDisconnectSeconds: 300 } });
    const { payload, headers } = await startExam(warnExam);
    const first = await violation(headers, { type: 'COPY_ATTEMPT', eventId: 'c1' });
    expect(first.body.data).toMatchObject({ terminated: false, copyCount: 1, violationCount: 0 });
    // Same event delivered twice is not a second copy.
    expect((await violation(headers, { type: 'COPY_ATTEMPT', eventId: 'c1' })).body.data.terminated).toBe(false);
    const second = await violation(headers, { type: 'COPY_ATTEMPT', eventId: 'c2' });
    expect(second.body.data.terminated).toBe(true);
    const attempt = await Attempt.findById(payload.attemptId);
    expect(attempt.status).toBe('TERMINATED');
    expect(attempt.terminationReason).toMatch(/copied/i);
  });

  it('ignores duplicate events (XHR + beacon for the same switch)', async () => {
    const { payload, headers, token } = await startExam(exam);
    await leave(headers, 'same');
    await api().post('/api/student/beacon').set('Content-Type', 'text/plain').send(JSON.stringify({ token, sessionId: headers['X-Exam-Session'], kind: 'violation', type: 'TAB_SWITCH', eventId: 'same' }));
    const attempt = await Attempt.findById(payload.attemptId);
    expect(attempt.violations.filter((v) => v.type === 'TAB_SWITCH')).toHaveLength(1);
    expect(attempt.violationCount).toBe(1);
    expect(attempt.status).toBe('TERMINATED');
  });

  it('terminates from a sendBeacon report and saves pending answers', async () => {
    const { payload, headers, token } = await startExam(exam);
    const res = await api()
      .post('/api/student/beacon')
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify({ token, sessionId: headers['X-Exam-Session'], kind: 'violation', type: 'WINDOW_HIDDEN', eventId: 'b1', pendingResponses: [{ index: 2, selectedOption: 1, seq: 3 }] }));
    expect(res.status).toBe(204);
    const attempt = await Attempt.findById(payload.attemptId);
    expect(attempt.status).toBe('TERMINATED');
    expect(await StudentResponse.countDocuments({ attempt: payload.attemptId })).toBe(1);
  });

  it('does not count page unload / reload events as violations', async () => {
    const { payload, headers, token } = await startExam(exam);
    await api().post('/api/student/beacon').set('Content-Type', 'text/plain').send(JSON.stringify({ token, sessionId: headers['X-Exam-Session'], kind: 'unload', eventId: 'u1' }));
    await violation(headers, { type: 'PAGE_RELOAD' });
    const attempt = await Attempt.findById(payload.attemptId);
    expect(attempt.status).toBe('IN_PROGRESS');
    expect(attempt.violationCount).toBe(0);
    expect(attempt.violations.map((v) => v.type)).toEqual(expect.arrayContaining(['PAGE_UNLOAD', 'PAGE_RELOAD']));
  });

  it('ignores beacons with invalid tokens or sessions', async () => {
    const { payload, token } = await startExam(exam);
    await api().post('/api/student/beacon').set('Content-Type', 'text/plain').send(JSON.stringify({ token, sessionId: 'wrong-session-id-123', kind: 'violation', type: 'TAB_SWITCH' }));
    await api().post('/api/student/beacon').set('Content-Type', 'text/plain').send('not json');
    expect((await Attempt.findById(payload.attemptId)).status).toBe('IN_PROGRESS');
  });
});

describe('heartbeat monitoring', () => {
  it('flags a lost heartbeat without terminating (FLAG policy) and recovers on reconnect', async () => {
    const { payload, headers } = await startExam(exam);
    await Attempt.updateOne({ _id: payload.attemptId }, { $set: { lastHeartbeatAt: new Date(Date.now() - 60 * 1000) } });
    const summary = await runMonitorTick();
    expect(summary.disconnected).toBe(1);
    let attempt = await Attempt.findById(payload.attemptId);
    expect(attempt).toMatchObject({ status: 'IN_PROGRESS', connectionState: 'DISCONNECTED', violationCount: 0 });

    await api().post('/api/student/attempt/heartbeat').set(headers).send({});
    attempt = await Attempt.findById(payload.attemptId);
    expect(attempt.connectionState).toBe('ONLINE');
    expect(attempt.violations.map((v) => v.type)).toEqual(expect.arrayContaining(['HEARTBEAT_LOST', 'RECONNECTED']));
  });

  it('short network blips are not treated as cheating', async () => {
    const { payload } = await startExam(exam);
    await Attempt.updateOne({ _id: payload.attemptId }, { $set: { lastHeartbeatAt: new Date(Date.now() - 20 * 1000) } });
    await runMonitorTick();
    expect((await Attempt.findById(payload.attemptId)).connectionState).toBe('ONLINE');
  });

  it('terminates after the configured disconnect limit (TERMINATE policy)', async () => {
    const strictExam = await createExam({ slug: 'hb-1', violationPolicy: { mode: 'STRICT', warningsAllowed: 1, heartbeatTimeoutSeconds: 30, disconnectAction: 'TERMINATE', maxDisconnectSeconds: 120 } });
    const { payload } = await startExam(strictExam);
    await Attempt.updateOne({ _id: payload.attemptId }, { $set: { lastHeartbeatAt: new Date(Date.now() - 60 * 1000) } });
    await runMonitorTick();
    expect((await Attempt.findById(payload.attemptId)).status).toBe('IN_PROGRESS');
    await Attempt.updateOne({ _id: payload.attemptId }, { $set: { lastHeartbeatAt: new Date(Date.now() - 200 * 1000) } });
    const summary = await runMonitorTick();
    expect(summary.terminated).toBe(1);
    const attempt = await Attempt.findById(payload.attemptId);
    expect(attempt.status).toBe('TERMINATED');
    expect(attempt.terminationReason).toMatch(/No heartbeat/);
  });

  it('re-evaluates finalized attempts whose evaluation was missed', async () => {
    const { payload, headers } = await startExam(exam);
    await api().post('/api/student/attempt/submit').set(headers).send({});
    await Result.deleteMany({});
    await Attempt.updateOne({ _id: payload.attemptId }, { $set: { evaluated: false, updatedAt: new Date(Date.now() - 60000) } }, { timestamps: false });
    const summary = await runMonitorTick();
    expect(summary.reevaluated).toBe(1);
    expect(await Result.countDocuments()).toBe(1);
  });
});
