import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CandidateNote, Student } from '../src/models/index.js';
import { api, clearDb, correctDisplayedOption, createAdmin, createExam, registerStudent, seedQuestions, setupDb, startExam, teardownDb } from './helpers.js';

beforeAll(setupDb);
afterAll(teardownDb);

let sa;
let exam;
/** Finishes the test answering `correct` of 4 questions correctly -> 0/25/50/75/100 %. */
async function candidate(correct, overrides = {}) {
  const s = await startExam(exam, overrides);
  for (let i = 0; i < correct; i += 1) {
    const c = await correctDisplayedOption(s.payload.attemptId, i);
    await api().put(`/api/student/attempt/responses/${i}`).set(s.headers).send({ selectedOption: c, seq: i + 1 });
  }
  await api().post('/api/student/attempt/submit').set(s.headers).send({});
  return s.student.id;
}
const decide = (id, body, auth = sa.auth) => api().post(`/api/admin/candidates/${id}/decision`).set(auth).send(body);
const saveNotes = (id, html, baseVersion, auth = sa.auth, force = false) => api().put(`/api/admin/candidates/${id}/notes`).set(auth).send({ html, baseVersion, force });

beforeEach(async () => {
  await clearDb();
  sa = await createAdmin();
  await seedQuestions();
  // Pass mark 100% and scores ≤ 75%: nobody auto-qualifies, so these tests drive every move by hand.
  exam = await createExam({ distribution: { easy: 4, medium: 0, hard: 0 }, passPercentage: 100 });
});

describe('selection pipeline', () => {
  it('only lists students who finished the online test, ranked by score', async () => {
    const low = await candidate(1);
    const high = await candidate(3);
    await registerStudent(exam); // registered but never took the test
    const res = await api().get(`/api/admin/candidates?exam=${exam._id}&stage=ONLINE_TEST`).set(sa.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.map((c) => c._id)).toEqual([high, low]);
    expect(res.body.data[0].result.percentage).toBe(75);
    const summary = await api().get(`/api/admin/candidates/summary?exam=${exam._id}`).set(sa.auth);
    expect(summary.body.data).toMatchObject({ ONLINE_TEST: 2, ROUND_2: 0 });
  });

  it('previews and applies a cut-off shortlist, excluding terminated attempts by default', async () => {
    const a = await candidate(3);
    const b = await candidate(2);
    await candidate(1);
    const term = await startExam(exam);
    for (let i = 0; i < 4; i += 1) {
      const c = await correctDisplayedOption(term.payload.attemptId, i);
      await api().put(`/api/student/attempt/responses/${i}`).set(term.headers).send({ selectedOption: c, seq: i + 1 });
    }
    await api().post('/api/student/attempt/violations').set(term.headers).send({ type: 'TAB_SWITCH' });

    const preview = await api().post('/api/admin/candidates/shortlist/preview').set(sa.auth).send({ exam: String(exam._id), minPercentage: 40 });
    expect(preview.body.data.count).toBe(2);
    expect((await api().post('/api/admin/candidates/shortlist/preview').set(sa.auth).send({ exam: String(exam._id), minPercentage: 40, includeTerminated: true })).body.data.count).toBe(3);
    expect((await api().post('/api/admin/candidates/shortlist/preview').set(sa.auth).send({ exam: String(exam._id), minPercentage: 0, topN: 1 })).body.data.candidates[0]._id).toBe(a);

    const applied = await api().post('/api/admin/candidates/shortlist').set(sa.auth).send({ exam: String(exam._id), minPercentage: 40 });
    expect(applied.body.data).toEqual({ moved: 2, skipped: 0 });
    expect((await Student.findById(a)).stage).toBe('ROUND_2');
    expect((await Student.findById(b)).stage).toBe('ROUND_2');
    const note = await CandidateNote.findOne({ student: a, type: 'DECISION' });
    expect(note).toMatchObject({ fromStage: 'ONLINE_TEST', toStage: 'ROUND_2' });
    expect(note.author.name).toBe('Test Admin');
    // Running it again moves nobody twice
    expect((await api().post('/api/admin/candidates/shortlist').set(sa.auth).send({ exam: String(exam._id), minPercentage: 40 })).body.data.moved).toBe(0);
  });

  it('walks a candidate through Round 2 → Final round → Selected with notes', async () => {
    const id = await candidate(3);
    expect((await decide(id, { decision: 'ADVANCE', expectedStage: 'ONLINE_TEST' })).body.data.stage).toBe('ROUND_2');
    const note = await saveNotes(id, '<p>Strong communication in the interview</p>', 0);
    expect(note.status).toBe(200);
    expect(note.body.data.notes).toMatchObject({ version: 1, updatedBy: { name: 'Test Admin' } });
    expect((await decide(id, { decision: 'ADVANCE', expectedStage: 'ROUND_2', note: 'Qualified' })).body.data.stage).toBe('FINAL_ROUND');
    expect((await decide(id, { decision: 'ADVANCE', expectedStage: 'FINAL_ROUND' })).body.data.stage).toBe('SELECTED');
    expect((await decide(id, { decision: 'ADVANCE', expectedStage: 'SELECTED' })).status).toBe(400);

    const detail = await api().get(`/api/admin/candidates/${id}`).set(sa.auth);
    // One shared note: what admins wrote, plus any comment given with a decision. Plain moves add nothing.
    expect(detail.body.data.notes.html).toBe('<p>Strong communication in the interview</p><p><strong>Round 2 → Final round:</strong> Qualified</p>');
    expect(detail.body.data.notes.version).toBe(2);
  });

  it('rejects at any round and can undo the rejection', async () => {
    const id = await candidate(3);
    await decide(id, { decision: 'ADVANCE', expectedStage: 'ONLINE_TEST' });
    const rej = await decide(id, { decision: 'REJECT', expectedStage: 'ROUND_2', note: 'Weak problem solving' });
    expect(rej.body.data).toMatchObject({ stage: 'REJECTED', rejectedAtStage: 'ROUND_2' });
    const undo = await decide(id, { decision: 'REVERT', expectedStage: 'REJECTED' });
    expect(undo.body.data.stage).toBe('ROUND_2');
    expect((await decide(id, { decision: 'REVERT', expectedStage: 'ROUND_2' })).body.data.stage).toBe('ONLINE_TEST');
  });

  it('never lets two admins overwrite each other', async () => {
    const id = await candidate(3);
    const other = await createAdmin({ email: 'b@test.edu', name: 'Second Admin' });
    await decide(id, { decision: 'ADVANCE', expectedStage: 'ONLINE_TEST' }, other.auth);
    const stale = await decide(id, { decision: 'REJECT', expectedStage: 'ONLINE_TEST' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('STAGE_CHANGED');
    expect(stale.body.error.message).toMatch(/Round 2 by Second Admin/);

    // Simultaneous decisions on the same stage: exactly one wins
    const both = await Promise.all([decide(id, { decision: 'ADVANCE', expectedStage: 'ROUND_2' }), decide(id, { decision: 'REJECT', expectedStage: 'ROUND_2' }, other.auth)]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('reports recent activity for live updates', async () => {
    const id = await candidate(3);
    const since = new Date(Date.now() - 1000).toISOString();
    await decide(id, { decision: 'ADVANCE', expectedStage: 'ONLINE_TEST' });
    await saveNotes(id, '<p>Called for interview</p>', 0);
    const feed = await api().get(`/api/admin/candidates/activity?since=${encodeURIComponent(since)}`).set(sa.auth);
    expect(feed.body.data).toHaveLength(2);
    expect(feed.body.data[0]).toMatchObject({ type: 'NOTE', student: { fullName: expect.any(String) } });
    const dash = await api().get('/api/admin/dashboard').set(sa.auth);
    expect(dash.body.data.pipeline).toMatchObject({ ROUND_2: 1 });
  });

  it('requires the candidates permission and removes notes when the student is deleted', async () => {
    const id = await candidate(3);
    const limited = await createAdmin({ email: 'r@test.edu', role: 'ADMIN', permissions: ['results'] });
    expect((await api().get('/api/admin/candidates').set(limited.auth)).status).toBe(403);
    await saveNotes(id, '<p>note</p>', 0);
    await api().delete(`/api/admin/students/${id}`).set(sa.auth);
    expect(await CandidateNote.countDocuments({ student: id })).toBe(0);
  });

  it('validates notes and decisions', async () => {
    const id = await candidate(2);
    expect((await api().put(`/api/admin/candidates/${id}/notes`).set(sa.auth).send({ html: '<p>x</p>' })).status).toBe(400); // baseVersion required
    expect((await decide(id, { decision: 'PROMOTE', expectedStage: 'ONLINE_TEST' })).status).toBe(400);
    const notTaken = await registerStudent(exam);
    expect((await decide(notTaken.student.id, { decision: 'ADVANCE', expectedStage: 'ONLINE_TEST' })).body.error.code).toBe('NO_RESULT');
  });

  it('handles students registered before stages existed (no stage saved)', async () => {
    const id = await candidate(3);
    await Student.collection.updateOne({ _id: new Student.base.Types.ObjectId(id) }, { $unset: { stage: '', noteCount: '' } });
    // Visible and actionable even before the backfill runs
    const list = await api().get(`/api/admin/candidates?exam=${exam._id}&stage=ONLINE_TEST`).set(sa.auth);
    expect(list.body.data.map((c) => c._id)).toContain(id);
    expect((await api().get(`/api/admin/candidates/summary?exam=${exam._id}`).set(sa.auth)).body.data.ONLINE_TEST).toBe(1);
    expect((await decide(id, { decision: 'ADVANCE', expectedStage: 'ONLINE_TEST' })).body.data.stage).toBe('ROUND_2');

    // And the startup backfill sets the field on legacy records
    const other = await candidate(2);
    await Student.collection.updateOne({ _id: new Student.base.Types.ObjectId(other) }, { $unset: { stage: '' } });
    const { runDataMigrations } = await import('../src/services/dataMigrations.js');
    expect((await runDataMigrations()).studentsBackfilled).toBe(1);
    expect((await Student.collection.findOne({ _id: new Student.base.Types.ObjectId(other) })).stage).toBe('ONLINE_TEST');
  });
});

describe('administrator access', () => {
  it('gives existing regular admins full access on start-up', async () => {
    const { Admin } = await import('../src/models/index.js');
    const { runDataMigrations } = await import('../src/services/dataMigrations.js');
    const old = await createAdmin({ email: 'old@test.edu', role: 'ADMIN', permissions: ['results'] });
    expect((await api().get('/api/admin/questions').set(old.auth)).status).toBe(403);
    expect((await runDataMigrations()).adminsPromoted).toBe(1);
    expect((await Admin.findById(old.admin._id)).role).toBe('SUPER_ADMIN');
    expect((await api().get('/api/admin/questions').set(old.auth)).status).toBe(200);
  });

  it('gives new administrators every section by default', async () => {
    const res = await api().post('/api/admin/admins').set(sa.auth).send({ name: 'New Person', email: 'new@test.edu', password: 'NewPerson123' });
    expect(res.status).toBe(201);
    expect(res.body.data.permissions).toEqual(['exams', 'questions', 'students', 'monitoring', 'results', 'candidates', 'admins']);
  });
});

describe('pass mark and automatic Round 2', () => {
  let passExam;
  const take = async (correct) => {
    const s = await startExam(passExam);
    for (let i = 0; i < correct; i += 1) {
      const c = await correctDisplayedOption(s.payload.attemptId, i);
      await api().put(`/api/student/attempt/responses/${i}`).set(s.headers).send({ selectedOption: c, seq: i + 1 });
    }
    await api().post('/api/student/attempt/submit').set(s.headers).send({});
    return s.student.id;
  };
  const examBody = (pass) => ({
    title: 'Pass Mark Exam',
    durationMinutes: 30,
    distribution: { easy: 4, medium: 0, hard: 0 },
    categories: ['Quantitative Aptitude', 'Logical Reasoning', 'Verbal Ability', 'Analytical Reasoning', 'General Aptitude'],
    negativeMarking: { enabled: false, marks: 0 },
    passPercentage: pass,
    violationPolicy: { mode: 'STRICT' },
  });
  beforeEach(async () => {
    passExam = await createExam({ slug: 'pass-mark-exam', distribution: { easy: 4, medium: 0, hard: 0 }, passPercentage: 60 });
  });

  it('moves students who pass straight to Round 2, with a system note', async () => {
    const pass = await take(3); // 75%
    const fail = await take(1); // 25%
    expect((await Student.findById(pass)).toObject()).toMatchObject({ stage: 'ROUND_2', autoQualified: true });
    expect((await Student.findById(fail)).stage).toBe('ONLINE_TEST');
    const note = await CandidateNote.findOne({ student: pass });
    expect(note.author.name).toBe('System (pass mark)');
    expect(note.text).toMatch(/passed the online test with 75% \(pass mark 60%\)/);
  });

  it('re-marks pass/fail and Round 2 when the pass mark changes after the test', async () => {
    const top = await take(4); // 100%
    const mid = await take(3); // 75%
    const low = await take(1); // 25%
    const manual = await take(2); // 50% (fails at 60) - moved to Round 2 by hand
    await decide(manual, { decision: 'ADVANCE', expectedStage: 'ONLINE_TEST' });

    // Raise to 80%: 75% no longer passes and moves back; the manual move is untouched.
    let res = await api().put(`/api/admin/exams/${passExam._id}`).set(sa.auth).send(examBody(80));
    expect(res.status).toBe(200);
    expect(res.body.data.passMarkUpdate).toMatchObject({ qualified: 0, movedBack: 1 });
    expect((await Student.findById(mid)).stage).toBe('ONLINE_TEST');
    expect((await Student.findById(top)).stage).toBe('ROUND_2');
    expect((await Student.findById(manual)).stage).toBe('ROUND_2');
    const results = await api().get(`/api/admin/results?exam=${passExam._id}&sortBy=percentage&sortOrder=desc`).set(sa.auth);
    expect(results.body.data.map((r) => [r.percentage, r.passed, r.passPercentage])).toEqual([
      [100, true, 80],
      [75, false, 80],
      [50, false, 80],
      [25, false, 80],
    ]);

    // Lower to 20%: everyone passes; those still in Online test qualify automatically.
    res = await api().put(`/api/admin/exams/${passExam._id}`).set(sa.auth).send(examBody(20));
    expect(res.body.data.passMarkUpdate).toMatchObject({ qualified: 2, movedBack: 0 });
    expect((await Student.findById(low)).stage).toBe('ROUND_2');
    expect((await Student.findById(mid)).stage).toBe('ROUND_2');
  });

  it('never auto-moves candidates a person has decided on', async () => {
    const rejected = await take(3);
    await decide(rejected, { decision: 'REJECT', expectedStage: 'ROUND_2' });
    const heldBack = await take(3);
    await decide(heldBack, { decision: 'REVERT', expectedStage: 'ROUND_2' }); // a person moved them back
    await api().put(`/api/admin/exams/${passExam._id}`).set(sa.auth).send(examBody(10));
    expect((await Student.findById(rejected)).stage).toBe('REJECTED');
    expect((await Student.findById(heldBack)).stage).toBe('ONLINE_TEST');
  });

  it('keeps terminated attempts as not passed whatever the pass mark', async () => {
    const s = await startExam(passExam);
    await api().post('/api/student/attempt/violations').set(s.headers).send({ type: 'TAB_SWITCH' });
    await api().put(`/api/admin/exams/${passExam._id}`).set(sa.auth).send(examBody(0));
    const r = await api().get(`/api/admin/results?exam=${passExam._id}`).set(sa.auth);
    expect(r.body.data[0]).toMatchObject({ status: 'TERMINATED', passed: false });
    expect((await Student.findById(s.student.id)).stage).toBe('ONLINE_TEST');
  });
});

describe('shared auto-saved notes', () => {
  beforeEach(async () => {
    exam = await createExam({ slug: 'rich-notes', distribution: { easy: 4, medium: 0, hard: 0 }, passPercentage: 100 });
  });

  it('saves rich text, keeps formatting and strips anything unsafe', async () => {
    const id = await candidate(1);
    const html = '<p><strong>Strengths</strong></p><ul><li>Clear <em>logic</em></li><li><u>Fast</u></li></ul><p><a href="https://example.com" onclick="steal()">ref</a></p><script>alert(1)</script><img src=x onerror=alert(1)><p style="color:red">plain</p><p></p>';
    const res = await saveNotes(id, html, 0);
    expect(res.status).toBe(200);
    const saved = res.body.data.notes.html;
    expect(saved).toContain('<strong>Strengths</strong>');
    expect(saved).toContain('<ul><li>Clear <em>logic</em></li><li><u>Fast</u></li></ul>');
    expect(saved).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">ref</a>');
    expect(saved).not.toMatch(/script|onerror|onclick|<img|style=/);
    expect(saved.endsWith('<p>plain</p>')).toBe(true);
    expect(res.body.data.notes.plain).toBe('Strengths Clear logic Fast ref plain');
    const list = await api().get(`/api/admin/candidates?exam=${exam._id}`).set(sa.auth);
    expect(list.body.data[0].notes.plain).toBe('Strengths Clear logic Fast ref plain');
    expect(list.body.data[0].notes.html).toBeUndefined(); // lists only carry the preview
  });

  it('auto-saves repeatedly and lets the note be cleared', async () => {
    const id = await candidate(1);
    let v = 0;
    for (const text of ['<p>I</p>', '<p>In</p>', '<p>Interview on Monday</p>']) v = (await saveNotes(id, text, v)).body.data.notes.version;
    expect(v).toBe(3);
    const cleared = await saveNotes(id, '<p></p>', v);
    expect(cleared.body.data.notes).toMatchObject({ html: '', plain: '', version: 4 });
    // Live activity gets one entry per admin per candidate per 10 minutes, not one per keystroke.
    expect(await CandidateNote.countDocuments({ student: id, type: 'NOTE' })).toBe(1);
  });

  it("never silently overwrites another admin's edits", async () => {
    const id = await candidate(1);
    const other = await createAdmin({ email: 'other@test.edu', role: 'ADMIN', name: 'Other Admin' });
    await saveNotes(id, '<p>Mine</p>', 0); // version 1
    await saveNotes(id, '<p>Theirs</p>', 1, other.auth); // version 2
    const stale = await saveNotes(id, '<p>Mine again</p>', 1);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('NOTES_CHANGED');
    expect(stale.body.error.message).toMatch(/Other Admin/);
    expect(stale.body.data.notes).toMatchObject({ html: '<p>Theirs</p>', version: 2 });
    const forced = await saveNotes(id, '<p>Mine again</p>', 1, sa.auth, true); // "Keep mine"
    expect(forced.body.data.notes).toMatchObject({ html: '<p>Mine again</p>', version: 3 });
  });

  it('appends a rejection reason to the note', async () => {
    const id = await candidate(1);
    await saveNotes(id, '<p>Interviewed by panel.</p>', 0);
    await decide(id, { decision: 'ADVANCE', expectedStage: 'ONLINE_TEST' });
    await decide(id, { decision: 'REJECT', expectedStage: 'ROUND_2', note: 'Weak <b>problem</b> solving' });
    const detail = await api().get(`/api/admin/candidates/${id}`).set(sa.auth);
    expect(detail.body.data.notes.html).toBe('<p>Interviewed by panel.</p><p><strong>Rejected at Round 2:</strong> Weak &lt;b&gt;problem&lt;/b&gt; solving</p>');
    expect(detail.body.data.notes.version).toBe(2);
  });

  it('merges older separate notes into the shared note once', async () => {
    const mongoose = (await import('mongoose')).default;
    const { runDataMigrations } = await import('../src/services/dataMigrations.js');
    const id = await candidate(1);
    const student = await Student.findById(id);
    for (const [name, text, at] of [['Ann', '<p>first</p>', '2026-01-01T10:00:00Z'], ['Ben', '<p>second</p>', '2026-01-02T11:30:00Z']]) {
      await CandidateNote.create({ student: id, examination: student.examination, type: 'NOTE', stage: 'ONLINE_TEST', text, plain: text.replace(/<[^>]+>/g, ''), author: { name }, createdAt: new Date(at) });
    }
    await mongoose.connection.db.collection('app_meta').deleteMany({});
    expect((await runDataMigrations()).notesMerged).toBe(1);
    const merged = (await Student.findById(id)).notes;
    expect(merged.html).toBe('<p><strong>Ann · 2026-01-01 10:00 UTC</strong></p><p>first</p><p><strong>Ben · 2026-01-02 11:30 UTC</strong></p><p>second</p>');
    expect(merged.updatedBy.name).toBe('Ben');
  });
});

describe('fast candidate data', () => {
  beforeEach(async () => {
    exam = await createExam({ slug: 'fast-data', distribution: { easy: 4, medium: 0, hard: 0 }, passPercentage: 60 });
  });

  it('serves the list and round counts in one live request', async () => {
    const id = await candidate(3); // 75% -> auto Round 2
    await candidate(1);
    const res = await api().get(`/api/admin/candidates/live?exam=${exam._id}&stage=ROUND_2`).set(sa.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.candidates.map((c) => c._id)).toEqual([id]);
    expect(res.body.data.candidates[0].result.percentage).toBe(75);
    expect(res.body.data.summary).toMatchObject({ ONLINE_TEST: 1, ROUND_2: 1 });
    expect(res.body.data.activity).toBeUndefined();
    expect(res.body.serverNow).toBeTruthy();
  });

  it('keeps each student’s latest result in step with evaluation, pass-mark changes and deletions', async () => {
    const id = await candidate(2); // 50% fails at 60%
    expect((await Student.findById(id)).latestResult).toMatchObject({ percentage: 50, passed: false, status: 'COMPLETED' });
    await api()
      .put(`/api/admin/exams/${exam._id}`)
      .set(sa.auth)
      .send({ title: 'Fast', durationMinutes: 30, distribution: { easy: 4, medium: 0, hard: 0 }, categories: exam.categories, negativeMarking: { enabled: false, marks: 0 }, passPercentage: 40, violationPolicy: { mode: 'STRICT' } });
    expect((await Student.findById(id)).latestResult.passed).toBe(true);
    const { Result } = await import('../src/models/index.js');
    const r = await Result.findOne({ student: id });
    await api().delete(`/api/admin/results/${r._id}`).set(sa.auth);
    expect((await Student.findById(id)).latestResult).toBeUndefined();
    expect((await api().get(`/api/admin/candidates/live?exam=${exam._id}`).set(sa.auth)).body.data.summary.ONLINE_TEST).toBe(0);
  });
});
