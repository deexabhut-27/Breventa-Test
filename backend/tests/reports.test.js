import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Result } from '../src/models/index.js';
import { api, clearDb, correctDisplayedOption, createAdmin, createExam, seedQuestions, setupDb, startExam, teardownDb } from './helpers.js';

beforeAll(setupDb);
afterAll(teardownDb);

const binary = (req) =>
  req.buffer(true).parse((res, cb) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

let admin;
let exam;
beforeEach(async () => {
  await clearDb();
  admin = await createAdmin();
  await seedQuestions({ EASY: 10, MEDIUM: 5, HARD: 5 });
  exam = await createExam({ distribution: { easy: 4, medium: 0, hard: 0 } });

  // Alpha (Uni A): all correct, Beta (Uni A): none answered, Gamma (Uni B): terminated
  const alpha = await startExam(exam, { fullName: 'Alpha Student', universityName: 'Uni A' });
  for (let i = 0; i < 4; i += 1) {
    const c = await correctDisplayedOption(alpha.payload.attemptId, i);
    await api().put(`/api/student/attempt/responses/${i}`).set(alpha.headers).send({ selectedOption: c, seq: i + 1 });
  }
  await api().post('/api/student/attempt/submit').set(alpha.headers).send({});
  const beta = await startExam(exam, { fullName: 'Beta Student', universityName: 'Uni A' });
  await api().post('/api/student/attempt/submit').set(beta.headers).send({});
  const gamma = await startExam(exam, { fullName: 'Gamma Student', universityName: 'Uni B' });
  await api().post('/api/student/attempt/violations').set(gamma.headers).send({ type: 'SCREENSHOT_ATTEMPT' });
});

describe('results management', () => {
  it('lists results with filters, sorting, pagination and summary', async () => {
    const all = await api().get('/api/admin/results?sortBy=totalScore&sortOrder=desc').set(admin.auth);
    expect(all.body.meta.total).toBe(3);
    expect(all.body.data[0].studentName).toBe('Alpha Student');
    expect(all.body.summary.highestScore).toBe(4);

    const passed = await api().get('/api/admin/results?passed=true').set(admin.auth);
    expect(passed.body.data.map((r) => r.studentName)).toEqual(['Alpha Student']);
    const terminated = await api().get('/api/admin/results?status=TERMINATED').set(admin.auth);
    expect(terminated.body.data[0].terminationReason).toBeTruthy();
    const uni = await api().get('/api/admin/results?university=uni a').set(admin.auth);
    expect(uni.body.meta.total).toBe(2);
    const range = await api().get('/api/admin/results?difficulty=easy&minScore=1').set(admin.auth);
    expect(range.body.meta.total).toBe(1);
    const page = await api().get('/api/admin/results?limit=2&page=2').set(admin.auth);
    expect(page.body.data).toHaveLength(1);
    const search = await api().get('/api/admin/results?search=gamma').set(admin.auth);
    expect(search.body.meta.total).toBe(1);
  });

  it('shows the admin full review including the answer key', async () => {
    const r = await Result.findOne({ studentName: 'Alpha Student' });
    const detail = await api().get(`/api/admin/attempts/${r.attempt}`).set(admin.auth);
    expect(detail.status).toBe(200);
    expect(detail.body.data.review).toHaveLength(4);
    expect(detail.body.data.review.every((q) => q.outcome === 'CORRECT')).toBe(true);
  });

  it('reports dashboard statistics', async () => {
    const res = await api().get('/api/admin/dashboard').set(admin.auth);
    expect(res.body.data.stats).toMatchObject({ totalStudents: 3, completed: 2, terminated: 1, ongoing: 0, highestScore: 4 });
    expect(res.body.data.stats.passPercentage).toBeCloseTo(33.33, 1);
  });
});

describe('PDF reports', () => {
  it('generates an individual student PDF', async () => {
    const r = await Result.findOne({ studentName: 'Gamma Student' });
    const res = await binary(api().get(`/api/admin/results/${r._id}/pdf`).set(admin.auth));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(res.body.length).toBeGreaterThan(2000);
  });

  it('generates complete, filtered and university-wise PDFs', async () => {
    for (const qs of ['mode=all', 'mode=filtered&passed=false', 'mode=university', `mode=filtered&exam=${exam._id}`]) {
      const res = await binary(api().get(`/api/admin/results/export/pdf?${qs}`).set(admin.auth));
      expect(res.status).toBe(200);
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    }
  });

  it('requires authentication for reports', async () => {
    expect((await api().get('/api/admin/results/export/pdf')).status).toBe(401);
    expect((await api().get('/api/admin/results/export/excel')).status).toBe(401);
  });
});

describe('Excel and CSV exports', () => {
  it('exports exactly the filtered rows', async () => {
    const res = await binary(api().get('/api/admin/results/export/excel?university=Uni A&sortBy=studentName&sortOrder=asc').set(admin.auth));
    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const sheet = wb.getWorksheet('Results');
    expect(sheet.rowCount).toBe(3); // header + 2
    expect(sheet.getRow(2).getCell(1).value).toBe('Alpha Student');
    expect(sheet.getRow(3).getCell(1).value).toBe('Beta Student');
  });

  it('exports university-wise workbooks with per-university sheets', async () => {
    const res = await binary(api().get('/api/admin/results/export/excel?mode=university').set(admin.auth));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toEqual(expect.arrayContaining(['Results', 'Summary', 'University Summary', 'Uni A', 'Uni B']));
  });

  it('exports CSV', async () => {
    const res = await api().get('/api/admin/results/export/excel?format=csv&status=TERMINATED').set(admin.auth);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const lines = res.text.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('Gamma Student');
  });
});

describe('live monitoring', () => {
  it('lists in-progress attempts and lets admins terminate or force-submit', async () => {
    const live = await startExam(exam, { fullName: 'Delta Student' });
    await api().put('/api/student/attempt/responses/0').set(live.headers).send({ selectedOption: 1, seq: 1 });
    const mon = await api().get('/api/admin/monitoring').set(admin.auth);
    expect(mon.body.data.stats.inProgress).toBe(1);
    expect(mon.body.data.attempts[0]).toMatchObject({ answered: 1, questionCount: 4 });
    expect(mon.body.data.recentEvents.length).toBeGreaterThan(0);

    const term = await api().post(`/api/admin/attempts/${live.payload.attemptId}/terminate`).set(admin.auth).send({ reason: 'Impersonation suspected' });
    expect(term.status).toBe(200);
    const again = await api().post(`/api/admin/attempts/${live.payload.attemptId}/force-submit`).set(admin.auth);
    expect(again.status).toBe(409);
    const r = await Result.findOne({ attempt: live.payload.attemptId });
    expect(r.terminationReason).toMatch(/Impersonation/);
  });
});
