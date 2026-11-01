import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Attempt, Examination, Question, Result, Student, StudentResponse } from '../src/models/index.js';
import { api, clearDb, createAdmin, createExam, registerStudent, seedQuestions, setupDb, startExam, teardownDb } from './helpers.js';

beforeAll(setupDb);
afterAll(teardownDb);

let sa;
beforeEach(async () => {
  await clearDb();
  sa = await createAdmin();
  await seedQuestions();
});

/** Two exams with completed, terminated, running and registered-only students. */
async function populate() {
  const exam = await createExam({ slug: 'target-exam' });
  const other = await createExam({ slug: 'other-exam' });
  const done = await startExam(exam);
  await api().put('/api/student/attempt/responses/0').set(done.headers).send({ selectedOption: 1, seq: 1 });
  await api().post('/api/student/attempt/submit').set(done.headers).send({});
  const term = await startExam(exam);
  await api().post('/api/student/attempt/violations').set(term.headers).send({ type: 'TAB_SWITCH' });
  const live = await startExam(exam);
  await api().put('/api/student/attempt/responses/0').set(live.headers).send({ selectedOption: 2, seq: 1 });
  await registerStudent(exam);
  const keep = await startExam(other);
  await api().post('/api/student/attempt/submit').set(keep.headers).send({});
  return { exam, other, live, keep };
}

const counts = async (filter) => ({
  students: await Student.countDocuments(filter),
  attempts: await Attempt.countDocuments(filter),
  results: await Result.countDocuments(filter),
});

describe('deleting an examination', () => {
  it('removes the exam and every related record, leaving other exams untouched', async () => {
    const { exam, other, live } = await populate();
    const attemptIds = (await Attempt.find({ examination: exam._id }).select('_id')).map((a) => a._id);
    const studentIds = (await Student.find({ examination: exam._id }).select('_id')).map((s) => s._id);
    const otherBefore = await counts({ examination: other._id });

    const res = await api().delete(`/api/admin/exams/${exam._id}`).set(sa.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.removed).toMatchObject({ students: 4, attempts: 3, results: 2 });

    expect(await Examination.exists({ _id: exam._id })).toBeNull();
    expect(await counts({ examination: exam._id })).toEqual({ students: 0, attempts: 0, results: 0 });
    expect(await StudentResponse.countDocuments({ attempt: { $in: attemptIds } })).toBe(0);

    expect(await counts({ examination: other._id })).toEqual(otherBefore);
    expect(await Question.countDocuments()).toBe(60); // the question bank is shared and kept

    // A student who was mid-exam is signed out cleanly
    expect((await api().get('/api/student/attempt').set(live.headers)).status).toBe(401);
    expect((await api().get('/api/public/exams/target-exam')).status).toBe(404);
  });
});

describe('deleting a student', () => {
  it('removes the student, attempts, answers and results, even mid-exam', async () => {
    const { live } = await populate();
    const attempt = await Attempt.findOne({ student: live.student.id });
    const res = await api().delete(`/api/admin/students/${live.student.id}`).set(sa.auth);
    expect(res.status).toBe(200);
    expect(await Student.exists({ _id: live.student.id })).toBeNull();
    expect(await Attempt.countDocuments({ student: live.student.id })).toBe(0);
    expect(await StudentResponse.countDocuments({ attempt: attempt._id })).toBe(0);
  });
});

describe('deleting a result', () => {
  it('removes the attempt and answers so the student can attempt again', async () => {
    const exam = await createExam();
    const s = await startExam(exam);
    await api().put('/api/student/attempt/responses/0').set(s.headers).send({ selectedOption: 1, seq: 1 });
    await api().post('/api/student/attempt/submit').set(s.headers).send({});
    const result = await Result.findOne();
    const res = await api().delete(`/api/admin/results/${result._id}`).set(sa.auth);
    expect(res.status).toBe(200);
    expect(await Result.countDocuments()).toBe(0);
    expect(await Attempt.countDocuments()).toBe(0);
    expect(await StudentResponse.countDocuments()).toBe(0);
    expect(await Student.countDocuments()).toBe(1);
    const again = await api().post('/api/student/attempt/start').set(s.auth).send({ acceptInstructions: true });
    expect(again.status).toBe(201);
  });
});

describe('deleting a question used in attempts', () => {
  it('asks for confirmation first, then deletes permanently while keeping existing scores', async () => {
    const exam = await createExam({ distribution: { easy: 2, medium: 0, hard: 0 } });
    const s = await startExam(exam);
    await api().post('/api/student/attempt/submit').set(s.headers).send({});
    const used = (await Attempt.findOne()).questions[0].question;

    const first = await api().delete(`/api/admin/questions/${used}`).set(sa.auth);
    expect(first.status).toBe(409);
    expect(first.body.error.code).toBe('QUESTION_IN_USE');
    const forced = await api().delete(`/api/admin/questions/${used}?force=true`).set(sa.auth);
    expect(forced.status).toBe(200);
    expect(await Question.exists({ _id: used })).toBeNull();
    expect(await Result.countDocuments()).toBe(1);
  });
});
