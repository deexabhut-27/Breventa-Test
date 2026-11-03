import mongoose from 'mongoose';
import { PERMISSIONS } from '../config/constants.js';
import { Admin, CandidateNote, Examination, Student } from '../models/index.js';
import { escapeHtml, notePlain } from '../utils/richText.js';
import { refreshLatestResults } from './latestResultService.js';
import { clearAllCaches } from './cache.js';
import { syncAutoQualification } from './pipelineService.js';
import { logger } from '../utils/logger.js';

/**
 * Idempotent fix-ups for records created before a feature existed. Safe to run on every start.
 * - Students registered before the selection pipeline have no `stage`: they start in ONLINE_TEST.
 * - When the app gains a new admin section, every existing ADMIN is granted it once. The list of
 *   sections already handed out is stored, so a section an admin later loses on purpose is not re-added.
 */
// Bump when a fix-up is added or changed so it runs once more on every database.
const MIGRATIONS_VERSION = 'v1';

/**
 * Serverless instances start often (every cold start), so once a database is up to date the
 * whole set is skipped with a single read instead of ~10 sequential queries.
 */
export async function runDataMigrations({ force = false } = {}) {
  const meta = mongoose.connection.db.collection('app_meta');
  if (!force && (await meta.findOne({ _id: 'migrations', version: MIGRATIONS_VERSION }, { projection: { _id: 1 } }))) return { skipped: true };
  const summary = await runAllMigrations();
  await meta.updateOne({ _id: 'migrations' }, { $set: { version: MIGRATIONS_VERSION, doneAt: new Date() } }, { upsert: true });
  return summary;
}

async function runAllMigrations() {
  const res = await Student.updateMany({ stage: { $exists: false } }, { $set: { stage: 'ONLINE_TEST', noteCount: 0 } });
  const latestBackfilled = await latestResultsOnce();
  if (res.modifiedCount) logger.info({ students: res.modifiedCount }, 'Backfilled selection stage for existing students');
  const adminsGranted = await grantNewSections();
  // Every administrator has full access: there is one role.
  const promoted = await Admin.updateMany({ role: { $ne: 'SUPER_ADMIN' } }, { $set: { role: 'SUPER_ADMIN', permissions: PERMISSIONS } });
  if (promoted.modifiedCount) logger.info({ admins: promoted.modifiedCount }, 'Gave existing administrators full access');
  const autoQualified = await autoQualifyExistingOnce();
  const notesConverted = await richNotesOnce();
  const notesMerged = await mergeNotesOnce();
  await dropAuditLogOnce();
  clearAllCaches(); // records may have been changed directly above
  return { studentsBackfilled: res.modifiedCount, latestBackfilled, adminsGranted, adminsPromoted: promoted.modifiedCount, autoQualified, notesConverted, notesMerged };
}

/** One-time: the audit log was removed from the app; drop its stored entries. */
async function dropAuditLogOnce() {
  const db = mongoose.connection.db;
  const meta = db.collection('app_meta');
  if (await meta.findOne({ _id: 'audit-log-removed-v1' })) return;
  if ((await db.listCollections({ name: 'auditlogs' }).toArray()).length) await db.collection('auditlogs').drop();
  await meta.updateOne({ _id: 'audit-log-removed-v1' }, { $set: { doneAt: new Date() } }, { upsert: true });
}

/** One-time: copy each student's latest result onto the student (used by fast candidate lists). */
async function latestResultsOnce() {
  const meta = mongoose.connection.db.collection('app_meta');
  if (await meta.findOne({ _id: 'latest-result-v1' })) return 0;
  const n = await refreshLatestResults();
  await meta.updateOne({ _id: 'latest-result-v1' }, { $set: { doneAt: new Date(), students: n } }, { upsert: true });
  return n;
}

/** One-time: separate notes become one shared note per candidate (oldest first, each signed). */
async function mergeNotesOnce() {
  const meta = mongoose.connection.db.collection('app_meta');
  if (await meta.findOne({ _id: 'shared-notes-v1' })) return 0;
  const groups = await CandidateNote.aggregate([{ $match: { type: 'NOTE' } }, { $sort: { createdAt: 1 } }, { $group: { _id: '$student', notes: { $push: '$$ROOT' } } }]);
  let merged = 0;
  for (const g of groups) {
    const student = await Student.findById(g._id).select('notes').lean();
    if (!student || student.notes?.html) continue; // already has a shared note
    const html = g.notes
      .map((n) => `<p><strong>${escapeHtml(n.author?.name || 'Admin')} · ${new Date(n.createdAt).toISOString().slice(0, 16).replace('T', ' ')} UTC</strong></p>${n.text}`)
      .join('');
    const last = g.notes[g.notes.length - 1];
    await Student.updateOne({ _id: g._id }, { $set: { notes: { html, plain: notePlain(html), version: 1, updatedAt: last.createdAt, updatedBy: last.author } } });
    merged += 1;
  }
  await meta.updateOne({ _id: 'shared-notes-v1' }, { $set: { doneAt: new Date(), merged } }, { upsert: true });
  return merged;
}

/** One-time: older plain-text notes become rich-text paragraphs, and note counts include only written notes. */
async function richNotesOnce() {
  const meta = mongoose.connection.db.collection('app_meta');
  if (await meta.findOne({ _id: 'rich-notes-v1' })) return 0;
  let converted = 0;
  for (const n of await CandidateNote.find({ $or: [{ plain: { $exists: false } }, { plain: '' }] }).lean()) {
    const isNote = n.type === 'NOTE';
    const html = isNote && !/^\s*</.test(n.text) ? n.text.split(/\n+/).map((line) => `<p>${escapeHtml(line)}</p>`).join('') : n.text;
    await CandidateNote.updateOne({ _id: n._id }, { $set: { text: html, plain: isNote ? notePlain(html) : n.text } });
    converted += 1;
  }
  const counts = await CandidateNote.aggregate([{ $match: { type: 'NOTE' } }, { $group: { _id: '$student', n: { $sum: 1 } } }]);
  await Student.updateMany({}, { $set: { noteCount: 0 } });
  for (const c of counts) await Student.updateOne({ _id: c._id }, { $set: { noteCount: c.n } });
  await meta.updateOne({ _id: 'rich-notes-v1' }, { $set: { doneAt: new Date(), converted } }, { upsert: true });
  return converted;
}

/** One-time catch-up: students who passed before automatic Round 2 qualification existed. */
async function autoQualifyExistingOnce() {
  const meta = mongoose.connection.db.collection('app_meta');
  if (await meta.findOne({ _id: 'auto-qualify-v1' })) return 0;
  let total = 0;
  for (const exam of await Examination.find().select('_id').lean()) total += (await syncAutoQualification(exam._id)).qualified;
  await meta.updateOne({ _id: 'auto-qualify-v1' }, { $set: { doneAt: new Date(), qualified: total } }, { upsert: true });
  if (total) logger.info({ qualified: total }, 'Auto-qualified students who had already passed');
  return total;
}

// Sections that existed before this tracking was introduced.
const ORIGINAL_SECTIONS = ['exams', 'questions', 'students', 'monitoring', 'results'];

async function grantNewSections() {
  const meta = mongoose.connection.db.collection('app_meta');
  const doc = await meta.findOne({ _id: 'permissions' });
  const known = doc?.known || ORIGINAL_SECTIONS;
  const added = PERMISSIONS.filter((p) => !known.includes(p));
  let granted = 0;
  if (added.length) {
    const res = await Admin.updateMany({ role: 'ADMIN' }, { $addToSet: { permissions: { $each: added } } });
    granted = res.modifiedCount;
    if (granted) logger.info({ sections: added, admins: granted }, 'Granted new admin sections to existing administrators');
  }
  await meta.updateOne({ _id: 'permissions' }, { $set: { known: PERMISSIONS, updatedAt: new Date() } }, { upsert: true });
  return granted;
}
