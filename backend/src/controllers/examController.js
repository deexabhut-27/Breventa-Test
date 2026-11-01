import { Attempt, Examination, Student } from '../models/index.js';
import { EXAM_STATUS } from '../config/constants.js';
import { deleteExamination } from '../services/deletionService.js';
import { applyPassMark } from '../services/pipelineService.js';
import { examCache } from '../services/cache.js';
import { checkQuestionAvailability, makeSlug } from '../services/examService.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegex, pageMeta } from '../utils/helpers.js';

async function findExam(id) {
  const exam = await Examination.findById(id);
  if (!exam) throw AppError.notFound('Examination not found');
  return exam;
}

async function withCounts(exams) {
  const ids = exams.map((e) => e._id);
  const [students, attempts] = await Promise.all([
    Student.aggregate([{ $match: { examination: { $in: ids } } }, { $group: { _id: '$examination', n: { $sum: 1 } } }]),
    Attempt.aggregate([{ $match: { examination: { $in: ids } } }, { $group: { _id: { e: '$examination', s: '$status' }, n: { $sum: 1 } } }]),
  ]);
  const s = new Map(students.map((r) => [String(r._id), r.n]));
  const a = {};
  attempts.forEach((r) => {
    a[String(r._id.e)] ??= {};
    a[String(r._id.e)][r._id.s] = r.n;
  });
  return exams.map((e) => ({ ...e.toObject(), registrations: s.get(String(e._id)) || 0, attemptCounts: a[String(e._id)] || {} }));
}

export async function listExams(req, res) {
  const q = req.valid.query;
  const filter = {};
  if (q.status) filter.status = q.status;
  if (q.search) filter.title = { $regex: escapeRegex(q.search), $options: 'i' };
  const [exams, total] = await Promise.all([
    Examination.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit),
    Examination.countDocuments(filter),
  ]);
  res.json({ success: true, data: await withCounts(exams), meta: pageMeta(total, q.page, q.limit) });
}

export async function getExam(req, res) {
  const exam = await findExam(req.params.id);
  const [withStats] = await withCounts([exam]);
  res.json({ success: true, data: { ...withStats, availability: await checkQuestionAvailability(exam) } });
}

export async function createExam(req, res) {
  const exam = await Examination.create({ ...req.body, slug: makeSlug(req.body.title), createdBy: req.admin._id, status: EXAM_STATUS.DRAFT });
  res.status(201).json({ success: true, data: { ...exam.toObject(), availability: await checkQuestionAvailability(exam) } });
}

export async function updateExam(req, res) {
  const exam = await findExam(req.params.id);
  const passMarkChanged = req.body.passPercentage !== undefined && req.body.passPercentage !== exam.passPercentage;
  exam.set({ ...req.body, startAt: req.body.startAt ?? null, endAt: req.body.endAt ?? null });
  if (exam.status === EXAM_STATUS.PUBLISHED) {
    const availability = await checkQuestionAvailability(exam);
    if (!availability.ok) throw AppError.conflict(availability.message, 'INSUFFICIENT_QUESTIONS', availability.items);
  }
  await exam.save();
  examCache.delete(exam._id);
  // A new pass mark applies retroactively: results are re-marked and Round 2 re-synced.
  const passMarkUpdate = passMarkChanged ? await applyPassMark(exam) : null;
  res.json({ success: true, data: { ...exam.toObject(), availability: await checkQuestionAvailability(exam), passMarkUpdate } });
}

export async function availability(req, res) {
  res.json({ success: true, data: await checkQuestionAvailability(await findExam(req.params.id)) });
}

export async function publishExam(req, res) {
  const exam = await findExam(req.params.id);
  const report = await checkQuestionAvailability(exam);
  if (!report.ok) throw AppError.conflict(report.message, 'INSUFFICIENT_QUESTIONS', report.items);
  if (exam.endAt && exam.endAt < new Date()) throw AppError.badRequest('The examination end date is in the past. Update the schedule first.', 'EXAM_ENDED');
  exam.status = EXAM_STATUS.PUBLISHED;
  exam.publishedAt = new Date();
  await exam.save();
  examCache.delete(exam._id);
  res.json({ success: true, data: exam });
}

function setExamStatus(status) {
  return async (req, res) => {
    const exam = await findExam(req.params.id);
    exam.status = status;
    await exam.save();
    examCache.delete(exam._id);
    res.json({ success: true, data: exam });
  };
}

export const unpublishExam = setExamStatus(EXAM_STATUS.DRAFT);
export const closeExam = setExamStatus(EXAM_STATUS.CLOSED);

export async function duplicateExam(req, res) {
  const src = await findExam(req.params.id);
  const data = src.toObject();
  ['_id', 'slug', 'createdAt', 'updatedAt', 'publishedAt', '__v'].forEach((k) => delete data[k]);
  const title = `${src.title} (Copy)`.slice(0, 200);
  const exam = await Examination.create({ ...data, title, slug: makeSlug(title), status: EXAM_STATUS.DRAFT, createdBy: req.admin._id });
  res.status(201).json({ success: true, data: exam });
}

export async function deleteExam(req, res) {
  const exam = await findExam(req.params.id);
  const removed = await deleteExamination(exam._id);
  res.json({ success: true, data: { id: exam._id, removed } });
}
