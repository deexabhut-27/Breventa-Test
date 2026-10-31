import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Admin, Examination, Result, Student } from '../src/models/index.js';
import { api, clearDb, createAdmin, createExam, registerStudent, seedQuestions, setupDb, startExam, studentData, teardownDb } from './helpers.js';

beforeAll(setupDb);
afterAll(teardownDb);
beforeEach(clearDb);

describe('role and access management', () => {
  it('lets a super admin create an admin with limited module access, which is enforced', async () => {
    const sa = await createAdmin();
    const created = await api()
      .post('/api/admin/admins')
      .set(sa.auth)
      .send({ name: 'Results Officer', email: 'results@test.edu', password: 'Results123', role: 'ADMIN', permissions: ['results'] });
    expect(created.status).toBe(201);
    expect(created.body.data.permissions).toEqual(['results']);

    const login = await api().post('/api/admin/auth/login').send({ email: 'results@test.edu', password: 'Results123' });
    const auth = { Authorization: `Bearer ${login.body.data.token}` };
    expect((await api().get('/api/admin/results').set(auth)).status).toBe(200);
    expect((await api().get('/api/admin/dashboard').set(auth)).status).toBe(200);
    expect((await api().get('/api/admin/exams').set(auth)).status).toBe(200); // read-only list for filters
    const denied = await api().get('/api/admin/questions').set(auth);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('NO_PERMISSION');
    expect((await api().post('/api/admin/exams').set(auth).send({})).status).toBe(403);
    expect((await api().get('/api/admin/students').set(auth)).status).toBe(403);
    expect((await api().get('/api/admin/monitoring').set(auth)).status).toBe(403);
    expect((await api().get('/api/admin/admins').set(auth)).status).toBe(403);
    expect((await api().get('/api/admin/audit-logs').set(auth)).status).toBe(403);
  });

  it('updates role and permissions, and the change applies immediately', async () => {
    const sa = await createAdmin();
    const other = await createAdmin({ email: 'b@test.edu', role: 'ADMIN' });
    const res = await api()
      .put(`/api/admin/admins/${other.admin._id}`)
      .set(sa.auth)
      .send({ name: 'Admin B', email: 'b@test.edu', role: 'ADMIN', permissions: ['students'], isActive: true });
    expect(res.status).toBe(200);
    expect((await api().get('/api/admin/questions').set(other.auth)).status).toBe(403);
    expect((await api().get('/api/admin/students').set(other.auth)).status).toBe(200);

    const promoted = await api()
      .put(`/api/admin/admins/${other.admin._id}`)
      .set(sa.auth)
      .send({ name: 'Admin B', email: 'b@test.edu', role: 'SUPER_ADMIN', permissions: [], isActive: true });
    expect(promoted.body.data.permissions).toHaveLength(5); // super admin always has everything
    expect((await api().get('/api/admin/questions').set(other.auth)).status).toBe(200);
  });

  it('never leaves the system without an active super admin and blocks self-changes', async () => {
    const sa = await createAdmin();
    const self = await api()
      .put(`/api/admin/admins/${sa.admin._id}`)
      .set(sa.auth)
      .send({ name: 'x', email: 'admin@test.edu', role: 'ADMIN', permissions: [], isActive: true });
    expect(self.status).toBe(400);
    expect((await api().delete(`/api/admin/admins/${sa.admin._id}`).set(sa.auth)).status).toBe(400);

    const sa2 = await createAdmin({ email: 'sa2@test.edu' });
    // sa2 can demote sa because sa2 remains an active super admin
    const demote = await api()
      .put(`/api/admin/admins/${sa.admin._id}`)
      .set(sa2.auth)
      .send({ name: 'Admin A', email: 'admin@test.edu', role: 'ADMIN', permissions: ['results'], isActive: true });
    expect(demote.status).toBe(200);
    expect(await Admin.countDocuments({ role: 'SUPER_ADMIN' })).toBe(1);
  });

  it('resets another admin password and removes admins', async () => {
    const sa = await createAdmin();
    const other = await createAdmin({ email: 'c@test.edu', role: 'ADMIN' });
    expect((await api().post(`/api/admin/admins/${other.admin._id}/reset-password`).set(sa.auth).send({ password: 'short' })).status).toBe(400);
    expect((await api().post(`/api/admin/admins/${other.admin._id}/reset-password`).set(sa.auth).send({ password: 'BrandNew123' })).status).toBe(200);
    const login = await api().post('/api/admin/auth/login').send({ email: 'c@test.edu', password: 'BrandNew123' });
    expect(login.status).toBe(200);
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
    expect(login.body.data.admin).toMatchObject({ email: 'manual@test.edu', role: 'ADMIN', isActive: true });
    expect(login.body.data.admin.permissions).toHaveLength(5);
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
