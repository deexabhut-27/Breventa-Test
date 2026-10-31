import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Question } from '../src/models/index.js';
import { api, clearDb, createAdmin, createExam, registerStudent, seedQuestions, setupDb, teardownDb } from './helpers.js';

beforeAll(setupDb);
afterAll(teardownDb);
beforeEach(clearDb);

describe('admin authentication', () => {
  it('logs in with valid credentials and rejects invalid ones', async () => {
    await createAdmin();
    const ok = await api().post('/api/admin/auth/login').send({ email: 'admin@test.edu', password: 'Password123' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.token).toBeTruthy();
    expect(ok.body.data.admin.passwordHash).toBeUndefined();

    const bad = await api().post('/api/admin/auth/login').send({ email: 'admin@test.edu', password: 'wrong-pass1' });
    expect(bad.status).toBe(401);
    const unknown = await api().post('/api/admin/auth/login').send({ email: 'nobody@test.edu', password: 'Password123' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe(bad.body.error.message);
  });

  it('rejects unauthorized and student tokens on admin APIs', async () => {
    expect((await api().get('/api/admin/dashboard')).status).toBe(401);
    expect((await api().get('/api/admin/dashboard').set('Authorization', 'Bearer garbage')).status).toBe(401);
    await seedQuestions();
    const exam = await createExam();
    const student = await registerStudent(exam);
    expect((await api().get('/api/admin/results').set(student.auth)).status).toBe(401);
    expect((await api().get('/api/student/me').set((await createAdmin({ email: 'b@test.edu' })).auth)).status).toBe(401);
  });

  it('revokes old tokens after a password change', async () => {
    const { auth } = await createAdmin();
    await new Promise((r) => setTimeout(r, 2100)); // token iat has 1s resolution
    const res = await api().put('/api/admin/auth/password').set(auth).send({ currentPassword: 'Password123', newPassword: 'NewPassword456' });
    expect(res.status).toBe(200);
    const old = await api().get('/api/admin/auth/me').set(auth);
    expect(old.status).toBe(401);
    expect(old.body.error.code).toBe('TOKEN_REVOKED');
    const fresh = await api().get('/api/admin/auth/me').set('Authorization', `Bearer ${res.body.data.token}`);
    expect(fresh.status).toBe(200);
  });

  it('restricts admin management to SUPER_ADMIN', async () => {
    const { auth } = await createAdmin({ role: 'ADMIN' });
    expect((await api().get('/api/admin/admins').set(auth)).status).toBe(403);
  });
});

describe('question management', () => {
  const valid = {
    text: 'What is 2 + 2?',
    options: ['3', '4', '5', '6'],
    correctOptionIndex: 1,
    category: 'Quantitative Aptitude',
    difficulty: 'EASY',
    marks: 1,
    negativeMarks: 0.25,
    explanation: 'Basic addition',
  };

  it('creates, updates, filters, deactivates and deletes questions', async () => {
    const { auth } = await createAdmin();
    const created = await api().post('/api/admin/questions').set(auth).send(valid);
    expect(created.status).toBe(201);
    expect(created.body.data.correctOptionIndex).toBe(1);
    const id = created.body.data._id;

    const updated = await api().put(`/api/admin/questions/${id}`).set(auth).send({ ...valid, difficulty: 'HARD', correctOptionIndex: 2 });
    expect(updated.body.data.difficulty).toBe('HARD');

    const list = await api().get('/api/admin/questions?difficulty=HARD').set(auth);
    expect(list.body.meta.total).toBe(1);
    expect((await api().get('/api/admin/questions?difficulty=EASY').set(auth)).body.meta.total).toBe(0);

    const off = await api().patch(`/api/admin/questions/${id}/status`).set(auth).send({ isActive: false });
    expect(off.body.data.isActive).toBe(false);

    expect((await api().delete(`/api/admin/questions/${id}`).set(auth)).status).toBe(200);
    expect(await Question.countDocuments()).toBe(0);
  });

  it('validates question input', async () => {
    const { auth } = await createAdmin();
    const three = await api().post('/api/admin/questions').set(auth).send({ ...valid, options: ['1', '2', '3'] });
    expect(three.status).toBe(400);
    const dup = await api().post('/api/admin/questions').set(auth).send({ ...valid, options: ['1', '1', '2', '3'] });
    expect(dup.status).toBe(400);
    const badCat = await api().post('/api/admin/questions').set(auth).send({ ...valid, category: 'Astrology' });
    expect(badCat.status).toBe(400);
  });

  it('strips MongoDB operators from input', async () => {
    const { auth } = await createAdmin();
    const res = await api().post('/api/admin/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(res.status).toBe(400);
    const q = await api().post('/api/admin/questions').set(auth).send({ ...valid, $where: 'sleep(1000)' });
    expect(q.status).toBe(201);
  });

  it('imports questions from CSV and reports invalid rows', async () => {
    const { auth } = await createAdmin();
    const csv = [
      'Question,Option A,Option B,Option C,Option D,Correct Option,Category,Difficulty,Marks,Negative Marks,Explanation',
      'What is 3 x 3?,6,9,12,15,B,Quantitative Aptitude,Easy,1,0.25,Multiply',
      'Odd one out?,Cat,Dog,Car,Cow,C,Logical Reasoning,Hard/Tricky,2,0,Car is not an animal',
      'Broken row,a,b,c,d,Z,Verbal Ability,Easy,1,0,',
    ].join('\n');
    const res = await api().post('/api/admin/questions/import').set(auth).attach('file', Buffer.from(csv), 'questions.csv');
    expect(res.status).toBe(201);
    expect(res.body.data.inserted).toBe(2);
    expect(res.body.data.failed).toBe(1);
    expect(res.body.data.errors[0].row).toBe(4);
    const hard = await Question.findOne({ difficulty: 'HARD' }).select('+correctOptionIndex');
    expect(hard.correctOptionIndex).toBe(2);
  });

  it('exports the question bank as Excel and CSV', async () => {
    const { auth } = await createAdmin();
    await seedQuestions({ EASY: 3, MEDIUM: 2, HARD: 1 });
    const xlsx = await api().get('/api/admin/questions/export?format=xlsx').set(auth).buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(xlsx.status).toBe(200);
    expect(xlsx.body.subarray(0, 2).toString()).toBe('PK');
    const csv = await api().get('/api/admin/questions/export?format=csv&difficulty=EASY').set(auth);
    expect(csv.status).toBe(200);
    expect(csv.text.trim().split('\n')).toHaveLength(4); // header + 3 easy
  });
});

describe('examination configuration', () => {
  const body = (overrides = {}) => ({
    title: 'Aptitude Round 1',
    durationMinutes: 45,
    distribution: { easy: 10, medium: 10, hard: 10 },
    categories: ['Quantitative Aptitude', 'Logical Reasoning', 'Verbal Ability', 'Analytical Reasoning', 'General Aptitude'],
    markingScheme: 'EXAM',
    marksPerQuestion: 2,
    negativeMarking: { enabled: true, marks: 0.5 },
    passPercentage: 50,
    violationPolicy: { mode: 'WARNING', warningsAllowed: 1 },
    maxAttempts: 1,
    ...overrides,
  });

  it('supports any distribution and computes the total', async () => {
    const { auth } = await createAdmin();
    for (const d of [{ easy: 10, medium: 10, hard: 10 }, { easy: 50, medium: 30, hard: 20 }, { easy: 0, medium: 5, hard: 0 }]) {
      const res = await api().post('/api/admin/exams').set(auth).send(body({ distribution: d }));
      expect(res.status).toBe(201);
      expect(res.body.data.totalQuestions).toBe(d.easy + d.medium + d.hard);
    }
    const empty = await api().post('/api/admin/exams').set(auth).send(body({ distribution: { easy: 0, medium: 0, hard: 0 } }));
    expect(empty.status).toBe(400);
  });

  it('refuses to publish when the question bank is too small, with a useful message', async () => {
    const { auth } = await createAdmin();
    await seedQuestions({ EASY: 10, MEDIUM: 10, HARD: 5 });
    const created = await api().post('/api/admin/exams').set(auth).send(body());
    expect(created.body.data.availability.ok).toBe(false);
    const pub = await api().post(`/api/admin/exams/${created.body.data._id}/publish`).set(auth);
    expect(pub.status).toBe(409);
    expect(pub.body.error.code).toBe('INSUFFICIENT_QUESTIONS');
    expect(pub.body.error.message).toMatch(/Hard\/Tricky requires 10 but only 5 available/);

    await seedQuestions({ EASY: 0, MEDIUM: 0, HARD: 5 });
    const ok = await api().post(`/api/admin/exams/${created.body.data._id}/publish`).set(auth);
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('PUBLISHED');
  });

  it('only counts active questions in selected categories', async () => {
    const { auth } = await createAdmin();
    await seedQuestions({ EASY: 10, MEDIUM: 0, HARD: 0 });
    await Question.updateMany({}, { isActive: false });
    const created = await api().post('/api/admin/exams').set(auth).send(body({ distribution: { easy: 1, medium: 0, hard: 0 } }));
    expect(created.body.data.availability.ok).toBe(false);
  });
});
