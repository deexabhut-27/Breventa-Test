import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Admin, Examination, Result, Student } from '../src/models/index.js';
import { PERMISSIONS } from '../src/config/constants.js';
import { api, clearDb, createAdmin, createExam, registerStudent, seedQuestions, setupDb, startExam, studentData, teardownDb } from './helpers.js';

beforeAll(setupDb);
afterAll(teardownDb);
beforeEach(clearDb);

describe('administrators (one role, full access)', () => {
  it('creates every administrator with full access, whatever role or sections are sent', async () => {
    const sa = await createAdmin();
    const created = await api()
      .post('/api/admin/admins')
      .set(sa.auth)
      .send({ name: 'New Person', email: 'new@test.edu', password: 'NewPerson123', role: 'ADMIN', permissions: ['results'] });
    expect(created.status).toBe(201);
    expect(created.body.data.role).toBe('SUPER_ADMIN');
    expect(created.body.data.permissions).toHaveLength(PERMISSIONS.length);

    const login = await api().post('/api/admin/auth/login').send({ email: 'new@test.edu', password: 'NewPerson123' });
    const auth = { Authorization: `Bearer ${login.body.data.token}` };
    for (const path of ['questions', 'students', 'monitoring', 'results', 'candidates', 'admins']) {
      expect((await api().get(`/api/admin/${path}`).set(auth)).status).toBe(200);
    }
  });

  it('lets any administrator manage any other, including the one who created them', async () => {
    const first = await createAdmin();
    await api().post('/api/admin/admins').set(first.auth).send({ name: 'Second Admin', email: 'second@test.edu', password: 'Second1234' });
    const login = await api().post('/api/admin/auth/login').send({ email: 'second@test.edu', password: 'Second1234' });
    const second = { Authorization: `Bearer ${login.body.data.token}` };
    const edit = await api().put(`/api/admin/admins/${first.admin._id}`).set(second).send({ name: 'First Renamed', email: 'admin@test.edu', isActive: true });
    expect(edit.status).toBe(200);
    expect(edit.body.data).toMatchObject({ name: 'First Renamed', role: 'SUPER_ADMIN' });
    expect((await api().post(`/api/admin/admins/${first.admin._id}/reset-password`).set(second).send({ password: 'Changed1234' })).status).toBe(200);
  });

  it('never lets an administrator lock themselves or everyone out', async () => {
    const sa = await createAdmin();
    expect((await api().put(`/api/admin/admins/${sa.admin._id}`).set(sa.auth).send({ name: 'x x', email: 'admin@test.edu', isActive: false })).status).toBe(400);
    expect((await api().delete(`/api/admin/admins/${sa.admin._id}`).set(sa.auth)).status).toBe(400);
    const other = await createAdmin({ email: 'o@test.edu' });
    expect((await api().put(`/api/admin/admins/${other.admin._id}`).set(sa.auth).send({ name: 'Other One', email: 'o@test.edu', isActive: false })).status).toBe(200);
    // `other` is now disabled and `sa` is the only active admin: `other` cannot remove `sa`, and sa cannot remove itself.
    const res = await api().delete(`/api/admin/admins/${other.admin._id}`).set(sa.auth); // removing a disabled admin is fine
    expect(res.status).toBe(200);
    expect(await Admin.countDocuments({ isActive: true })).toBe(1);
  });

  it('resets another admin password and removes admins', async () => {
    const sa = await createAdmin();
    const other = await createAdmin({ email: 'c@test.edu' });
    expect((await api().post(`/api/admin/admins/${other.admin._id}/reset-password`).set(sa.auth).send({ password: 'short' })).status).toBe(400);
    expect((await api().post(`/api/admin/admins/${other.admin._id}/reset-password`).set(sa.auth).send({ password: 'BrandNew123' })).status).toBe(200);
    expect((await api().post('/api/admin/auth/login').send({ email: 'c@test.edu', password: 'BrandNew123' })).status).toBe(200);
    expect((await api().delete(`/api/admin/admins/${other.admin._id}`).set(sa.auth)).status).toBe(200);
    expect(await Admin.countDocuments()).toBe(1);
  });
});

describe('editing students', () => {
  it('updates a registration and keeps results in sync', async () => {
    const sa = await createAdmin();
    await seedQuestions();
    const exam = await createExam();
    const s = await startExam(exam);
    await api().post('/api/student/attempt/submit').set(s.headers).send({});
    const res = await api()
      .put(`/api/admin/students/${s.student.id}`)
      .set(sa.auth)
      .send({ fullName: 'Corrected Name', universityName: 'New University', phone: '+91 99999 11111', email: 'Fixed@Test.edu', enrollmentNumber: '' });
    expect(res.status).toBe(200);
    const student = await Student.findById(s.student.id);
    expect(student).toMatchObject({ fullName: 'Corrected Name', phone: '+919999911111', email: 'fixed@test.edu' });
    expect(student.enrollmentNumber).toBeUndefined();
    const result = await Result.findOne({ student: s.student.id });
    expect(result).toMatchObject({ studentName: 'Corrected Name', universityName: 'New University', email: 'fixed@test.edu' });
  });

  it('rejects edits that collide with another student in the same exam', async () => {
    const sa = await createAdmin();
    await seedQuestions();
    const exam = await createExam();
    const a = await registerStudent(exam);
    const bData = studentData();
    await registerStudent(exam, bData);
    const res = await api()
      .put(`/api/admin/students/${a.student.id}`)
      .set(sa.auth)
      .send({ ...studentData(), email: bData.email });
    expect(res.status).toBe(409);
  });
});

describe('editing a running examination', () => {
  it('allows editing a published exam with active attempts without changing running attempts', async () => {
    const sa = await createAdmin();
    await seedQuestions();
    const exam = await createExam();
    const { payload } = await startExam(exam);
    const body = {
      title: 'Renamed Test',
      durationMinutes: 90,
      distribution: { easy: 10, medium: 10, hard: 10 },
      categories: exam.categories,
      markingScheme: 'EXAM',
      marksPerQuestion: 2,
      negativeMarking: { enabled: false, marks: 0 },
      passPercentage: 50,
      violationPolicy: { mode: 'WARNING', warningsAllowed: 2 },
      maxAttempts: 1,
    };
    const res = await api().put(`/api/admin/exams/${exam._id}`).set(sa.auth).send(body);
    expect(res.status).toBe(200);
    expect((await Examination.findById(exam._id)).durationMinutes).toBe(90);
    const running = await api().get('/api/admin/monitoring').set(sa.auth);
    expect(running.body.data.attempts[0].questionCount).toBe(payload.questions.length); // still 60
  });
});

describe('public home page', () => {
  it('lists only open, published examinations', async () => {
    await createExam({ title: 'Open', slug: 'open-1' });
    await createExam({ title: 'Draft', slug: 'draft-1', status: 'DRAFT' });
    await createExam({ title: 'Ended', slug: 'ended-1', startAt: new Date(Date.now() - 7200e3), endAt: new Date(Date.now() - 3600e3) });
    const res = await api().get('/api/public/exams');
    expect(res.status).toBe(200);
    expect(res.body.data.map((e) => e.slug)).toEqual(['open-1']);
    expect(JSON.stringify(res.body)).not.toMatch(/_id|createdBy|distribution/);
  });
});

describe('admins added manually in the database', () => {
  it('activates a hand-inserted admin on first login and removes the plain password', async () => {
    await Admin.collection.insertOne({ name: 'Manual Admin', email: 'Manual@Test.edu', password: 'Manual123' });
    const login = await api().post('/api/admin/auth/login').send({ email: 'manual@test.edu', password: 'Manual123' });
    expect(login.status).toBe(200);
    expect(login.body.data.admin).toMatchObject({ email: 'manual@test.edu', role: 'SUPER_ADMIN', isActive: true });
    expect(login.body.data.admin.permissions).toHaveLength(PERMISSIONS.length);
    const raw = await Admin.collection.findOne({ email: 'manual@test.edu' });
    expect(raw.password).toBeUndefined();
    expect(raw.passwordHash).toMatch(/^\$2/);
    const wrong = await api().post('/api/admin/auth/login').send({ email: 'manual@test.edu', password: 'Wrong1234' });
    expect(wrong.status).toBe(401);
  });

  it('respects role SUPER_ADMIN and converts at server start', async () => {
    const { hashManuallyAddedAdmins } = await import('../src/services/adminProvisioning.js');
    await Admin.collection.insertOne({ email: 'boss@test.edu', password: 'BossPass99', role: 'SUPER_ADMIN' });
    await Admin.collection.insertOne({ email: 'weak@test.edu', password: 'short' });
    expect(await hashManuallyAddedAdmins()).toBe(1);
    const login = await api().post('/api/admin/auth/login').send({ email: 'boss@test.edu', password: 'BossPass99' });
    expect(login.body.data.admin.role).toBe('SUPER_ADMIN');
    expect((await api().post('/api/admin/auth/login').send({ email: 'weak@test.edu', password: 'short' })).status).toBe(401);
  });
});

describe('audit log removed', () => {
  it('no longer exposes an audit-log API', async () => {
    const sa = await createAdmin();
    expect((await api().get('/api/admin/audit-logs').set(sa.auth)).status).toBe(404);
  });
});
