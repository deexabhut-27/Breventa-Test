import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Student } from '../src/models/index.js';
import { api, clearDb, createExam, seedQuestions, setupDb, studentData, teardownDb } from './helpers.js';

beforeAll(setupDb);
afterAll(teardownDb);
let exam;
beforeEach(async () => {
  await clearDb();
  await seedQuestions();
  exam = await createExam();
});

const register = (data, slug = exam.slug) => api().post(`/api/public/exams/${slug}/register`).send(data);

describe('student registration', () => {
  it('shows public exam details without answer keys', async () => {
    const res = await api().get(`/api/public/exams/${exam.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalQuestions).toBe(60);
    expect(JSON.stringify(res.body)).not.toMatch(/correctOptionIndex/);
  });

  it('registers a student and normalises the phone number', async () => {
    const res = await register(studentData({ phone: '+91 98765-43210', email: 'Mixed@Case.EDU' }));
    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeTruthy();
    const s = await Student.findOne();
    expect(s.phone).toBe('+919876543210');
    expect(s.email).toBe('mixed@case.edu');
  });

  it('validates required fields', async () => {
    expect((await register(studentData({ email: 'not-an-email' }))).status).toBe(400);
    expect((await register(studentData({ phone: '123' }))).status).toBe(400);
    expect((await register(studentData({ fullName: '' }))).status).toBe(400);
    expect((await register(studentData({ universityName: '' }))).status).toBe(400);
    expect((await register(studentData({ enrollmentNumber: '' }))).status).toBe(201); // optional
  });

  it('prevents duplicate registrations by email, phone or enrollment number', async () => {
    const first = studentData();
    expect((await register(first)).status).toBe(201);
    const byEmail = await register(studentData({ email: first.email }));
    expect(byEmail.status).toBe(409);
    expect(byEmail.body.error.code).toBe('ALREADY_REGISTERED');
    expect((await register(studentData({ phone: first.phone }))).status).toBe(409);
    expect((await register(studentData({ enrollmentNumber: first.enrollmentNumber }))).status).toBe(409);
    expect(await Student.countDocuments()).toBe(1);
  });

  it('allows the same student on a different examination', async () => {
    const data = studentData();
    await register(data);
    const other = await createExam({ title: 'Other', slug: 'other-exam-1234' });
    expect((await register(data, other.slug)).status).toBe(201);
  });

  it('handles concurrent duplicate registrations safely', async () => {
    const data = studentData();
    const results = await Promise.all(Array.from({ length: 5 }, () => register(data)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await Student.countDocuments()).toBe(1);
  });

  it('lets a registered student continue with email + phone', async () => {
    const data = studentData();
    await register(data);
    const ok = await api().post(`/api/public/exams/${exam.slug}/continue`).send({ email: data.email, phone: data.phone });
    expect(ok.status).toBe(200);
    const bad = await api().post(`/api/public/exams/${exam.slug}/continue`).send({ email: data.email, phone: '9999999999' });
    expect(bad.status).toBe(404);
  });

  it('rejects registration for draft or closed examinations', async () => {
    const draft = await createExam({ slug: 'draft-exam-1111', status: 'DRAFT' });
    expect((await register(studentData(), draft.slug)).status).toBe(404);
    const closed = await createExam({ slug: 'closed-exam-1111', status: 'CLOSED' });
    expect((await register(studentData(), closed.slug)).status).toBe(403);
  });
});
