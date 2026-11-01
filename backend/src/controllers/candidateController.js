import mongoose from 'mongoose';
import { CandidateNote, Result, Student } from '../models/index.js';
import { ACTIVE_STAGES, NEXT_STAGE, STAGE_LABELS, STAGES } from '../config/constants.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegex, pageMeta } from '../utils/helpers.js';
import { escapeHtml, notePlain, sanitizeNote } from '../utils/richText.js';

const oid = (v) => new mongoose.Types.ObjectId(v);
const author = (admin) => ({ id: admin._id, name: admin.name });

/**
 * Only students who have finished the online test enter the pipeline. Each student carries a copy
 * of their latest result (`latestResult`), so these queries use indexes on the students collection
 * alone instead of searching results for every student.
 */
const candidateBase = (match) => [{ $match: { ...match, latestResult: { $exists: true } } }];
const RESULT_FIELD = { result: '$latestResult' };

async function queryCandidates(q) {
  const match = {};
  if (q.exam) match.examination = oid(q.exam);
  if (q.stage) match.stage = q.stage === 'ONLINE_TEST' ? { $in: ['ONLINE_TEST', null] } : q.stage; // null also matches records saved before stages existed
  if (q.search) {
    const rx = { $regex: escapeRegex(q.search), $options: 'i' };
    match.$or = [{ fullName: rx }, { email: rx }, { phone: rx }, { universityName: rx }, { enrollmentNumber: rx }];
  }
  const after = [];
  if (q.minPercentage !== undefined) after.push({ $match: { 'latestResult.percentage': { $gte: q.minPercentage } } });
  const sort = q.sort === 'name' ? { fullName: 1 } : q.sort === 'recent' ? { stageUpdatedAt: -1, _id: -1 } : { 'latestResult.percentage': -1, _id: 1 };

  const [rows] = await Student.aggregate([
    ...candidateBase(match),
    ...after,
    {
      $facet: {
        items: [
          { $sort: sort },
          { $skip: (q.page - 1) * q.limit },
          { $limit: q.limit },
          { $lookup: { from: 'examinations', localField: 'examination', foreignField: '_id', as: 'exam', pipeline: [{ $project: { title: 1 } }] } },
          { $addFields: { exam: { $first: '$exam' }, ...RESULT_FIELD } },
          { $project: { ipAddress: 0, userAgent: 0, 'notes.html': 0, latestResult: 0 } },
        ],
        total: [{ $count: 'n' }],
      },
    },
  ]);
  const total = rows.total[0]?.n || 0;
  return { items: rows.items, meta: pageMeta(total, q.page, q.limit) };
}

export async function listCandidates(req, res) {
  const { items, meta } = await queryCandidates(req.valid.query);
  res.json({ success: true, data: items, meta, serverNow: new Date().toISOString() });
}

async function stageCounts(exam) {
  const match = exam && mongoose.isValidObjectId(exam) ? { examination: oid(exam) } : {};
  const rows = await Student.aggregate([...candidateBase(match), { $group: { _id: '$stage', n: { $sum: 1 } } }]);
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0]));
  rows.forEach((r) => {
    counts[r._id || 'ONLINE_TEST'] += r.n;
  });
  return counts;
}

export async function candidateSummary(req, res) {
  res.json({ success: true, data: await stageCounts(req.query.exam) });
}

async function shortlistCandidates({ exam, minPercentage, topN, includeTerminated }) {
  const pipeline = [...candidateBase({ examination: oid(exam), stage: { $in: ['ONLINE_TEST', null] } }), { $match: { 'latestResult.percentage': { $gte: minPercentage } } }];
  if (!includeTerminated) pipeline.push({ $match: { 'latestResult.status': 'COMPLETED' } });
  pipeline.push({ $sort: { 'latestResult.percentage': -1, _id: 1 } });
  if (topN) pipeline.push({ $limit: topN });
  pipeline.push({ $project: { fullName: 1, universityName: 1, email: 1, result: '$latestResult' } });
  return Student.aggregate(pipeline);
}

export async function previewShortlist(req, res) {
  const list = await shortlistCandidates(req.body);
  res.json({ success: true, data: { count: list.length, candidates: list.slice(0, 500) } });
}

export async function applyShortlist(req, res) {
  const list = await shortlistCandidates(req.body);
  const ids = list.map((c) => c._id);
  const now = new Date();
  // Conditional update: anyone moved by another admin meanwhile is skipped, never overwritten.
  await Student.updateMany(
    { _id: { $in: ids }, stage: { $in: ['ONLINE_TEST', null] } },
    { $set: { stage: 'ROUND_2', autoQualified: false, stageUpdatedAt: now, stageUpdatedBy: author(req.admin) } },
  );
  const moved = await Student.find({ _id: { $in: ids }, stage: 'ROUND_2', stageUpdatedAt: now }).select('_id examination').lean();
  const reason = `Shortlisted for Round 2 (online test ≥ ${req.body.minPercentage}%${req.body.topN ? `, top ${req.body.topN}` : ''})`;
  if (moved.length) {
    await CandidateNote.insertMany(
      moved.map((s) => ({
        student: s._id,
        examination: s.examination,
        type: 'DECISION',
        stage: 'ONLINE_TEST',
        fromStage: 'ONLINE_TEST',
        toStage: 'ROUND_2',
        text: req.body.note ? `${reason}. ${req.body.note}` : reason,
        plain: notePlain(req.body.note ? `${reason}. ${req.body.note}` : reason),
        author: author(req.admin),
      })),
    );
  }
  res.json({ success: true, data: { moved: moved.length, skipped: ids.length - moved.length } });
}

export async function getCandidate(req, res) {
  const student = await Student.findById(req.params.id).populate('examination', 'title').select('-ipAddress -userAgent').lean();
  if (!student) throw AppError.notFound('Candidate not found');
  const results = await Result.find({ student: student._id }).sort({ endedAt: -1 }).select('percentage totalScore maxScore passed status correct incorrect unanswered scores endedAt durationUsedSeconds terminationReason').lean();
  const notes = { html: '', plain: '', version: 0, ...(student.notes || {}) };
  res.json({ success: true, data: { student, results, notes }, serverNow: new Date().toISOString() });
}

/**
 * Auto-save target for the shared candidate note. The write only succeeds if nobody saved since the
 * client's `baseVersion`; otherwise the latest note is returned with 409 so the editor can offer
 * "load theirs" or "keep mine" (force) instead of silently overwriting a colleague's text.
 */
export async function saveNotes(req, res) {
  const { html: raw, baseVersion, force } = req.body;
  const html = sanitizeNote(raw);
  const plain = notePlain(html);
  const now = new Date();
  const who = author(req.admin);
  const filter = { _id: req.params.id };
  if (!force) filter.$or = baseVersion === 0 ? [{ 'notes.version': 0 }, { 'notes.version': { $exists: false } }] : [{ 'notes.version': baseVersion }];

  const updated = await Student.findOneAndUpdate(
    filter,
    { $set: { 'notes.html': html, 'notes.plain': plain, 'notes.updatedAt': now, 'notes.updatedBy': who }, $inc: { 'notes.version': 1 } },
    { new: true, projection: { notes: 1, examination: 1, stage: 1 } },
  );
  if (!updated) {
    const current = await Student.findById(req.params.id).select('notes').lean();
    if (!current) throw AppError.notFound('Candidate not found');
    return res.status(409).json({
      success: false,
      error: { code: 'NOTES_CHANGED', message: `${current.notes?.updatedBy?.name || 'Another admin'} changed these notes while you were typing.` },
      data: { notes: { html: '', plain: '', version: 0, ...(current.notes || {}) } },
    });
  }

  // Live-activity entry, at most one per admin per candidate every 10 minutes (auto-save fires often).
  const recent = await CandidateNote.findOne({ student: updated._id, type: 'NOTE', 'author.id': req.admin._id, createdAt: { $gte: new Date(now - 10 * 60 * 1000) } });
  if (recent) await CandidateNote.updateOne({ _id: recent._id }, { $set: { text: html, plain } });
  else if (plain) await CandidateNote.create({ student: updated._id, examination: updated.examination, type: 'NOTE', stage: updated.stage, text: html, plain, author: who });

  return res.json({ success: true, data: { notes: updated.notes } });
}

/**
 * ADVANCE: Online test → Round 2 → Final round → Selected.
 * REJECT: any active stage → Rejected (remembers where).
 * REVERT: undo the last move (Rejected → stage it was rejected at, or one stage back).
 * `expectedStage` makes the change conditional, so two admins can never silently overwrite each other.
 */
export async function decide(req, res) {
  const { decision, expectedStage, note } = req.body;
  const student = await Student.findById(req.params.id).select('stage rejectedAtStage examination fullName stageUpdatedBy latestResult');
  if (!student) throw AppError.notFound('Candidate not found');
  if (!student.latestResult) throw AppError.badRequest('This student has not completed the online test yet', 'NO_RESULT');
  if (student.stage !== expectedStage) {
    throw AppError.conflict(
      `${student.fullName} was already moved to ${STAGE_LABELS[student.stage]}${student.stageUpdatedBy?.name ? ` by ${student.stageUpdatedBy.name}` : ''}. The list has been refreshed.`,
      'STAGE_CHANGED',
      { stage: student.stage },
    );
  }

  const from = student.stage;
  let to;
  const set = {};
  const unset = {};
  if (decision === 'ADVANCE') {
    to = NEXT_STAGE[from];
    if (!to) throw AppError.badRequest(`A candidate in ${STAGE_LABELS[from]} cannot be advanced`, 'INVALID_TRANSITION');
  } else if (decision === 'REJECT') {
    if (!ACTIVE_STAGES.includes(from)) throw AppError.badRequest(`A candidate in ${STAGE_LABELS[from]} cannot be rejected`, 'INVALID_TRANSITION');
    to = 'REJECTED';
    set.rejectedAtStage = from;
  } else {
    const back = { ROUND_2: 'ONLINE_TEST', FINAL_ROUND: 'ROUND_2', SELECTED: 'FINAL_ROUND' };
    to = from === 'REJECTED' ? student.rejectedAtStage || 'ONLINE_TEST' : back[from];
    if (!to) throw AppError.badRequest('Nothing to undo for this candidate', 'INVALID_TRANSITION');
    unset.rejectedAtStage = '';
  }

  const updated = await Student.findOneAndUpdate(
    { _id: student._id, stage: from === 'ONLINE_TEST' ? { $in: ['ONLINE_TEST', null] } : from },
    {
      $set: { ...set, stage: to, autoQualified: false, autoHold: to === 'ONLINE_TEST', stageUpdatedAt: new Date(), stageUpdatedBy: author(req.admin) },
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    },
    { new: true },
  );
  if (!updated) throw AppError.conflict('Another administrator changed this candidate at the same moment. Please review and try again.', 'STAGE_CHANGED');

  const label = decision === 'REVERT' ? `Moved back from ${STAGE_LABELS[from]} to ${STAGE_LABELS[to]}` : `${STAGE_LABELS[from]} → ${STAGE_LABELS[to]}`;
  const entry = await CandidateNote.create({
    student: student._id,
    examination: student.examination,
    type: 'DECISION',
    stage: from,
    fromStage: from,
    toStage: to,
    text: label,
    plain: label,
    author: author(req.admin),
  });
  if (note?.trim()) {
    // A reason typed with the decision is appended to the candidate's notes.
    const heading = decision === 'REJECT' ? `Rejected at ${STAGE_LABELS[from]}` : label;
    const line = `<p><strong>${escapeHtml(heading)}:</strong> ${escapeHtml(note.trim())}</p>`;
    const html = sanitizeNote(`${updated.notes?.html || ''}${line}`);
    await Student.updateOne(
      { _id: student._id },
      { $set: { 'notes.html': html, 'notes.plain': notePlain(html), 'notes.updatedAt': new Date(), 'notes.updatedBy': author(req.admin) }, $inc: { 'notes.version': 1 } },
    );
    await CandidateNote.create({ student: student._id, examination: student.examination, type: 'NOTE', stage: from, text: line, plain: notePlain(line), author: author(req.admin) });
  }
  res.json({ success: true, data: { stage: updated.stage, rejectedAtStage: updated.rejectedAtStage, note: entry } });
}

/** Recent notes and decisions, used by the live activity feed and change toasts. */
async function recentActivity(q) {
  const match = {};
  if (q.exam) match.examination = oid(q.exam);
  if (q.since) match.createdAt = { $gt: q.since };
  const items = await CandidateNote.aggregate([
    { $match: match },
    { $sort: { createdAt: -1 } },
    { $limit: q.limit },
    { $lookup: { from: 'students', localField: 'student', foreignField: '_id', as: 'student', pipeline: [{ $project: { fullName: 1, universityName: 1 } }] } },
    { $addFields: { student: { $first: '$student' } } },
  ]);
  return items;
}

export async function activity(req, res) {
  res.json({ success: true, data: await recentActivity(req.valid.query), serverNow: new Date().toISOString() });
}

/** Everything the Selection page shows (candidates + round counts), in one round trip. */
export async function live(req, res) {
  const q = req.valid.query;
  const serverNow = new Date().toISOString();
  const [list, summary] = await Promise.all([queryCandidates(q), stageCounts(q.exam)]);
  res.json({ success: true, data: { candidates: list.items, meta: list.meta, summary }, serverNow });
}
