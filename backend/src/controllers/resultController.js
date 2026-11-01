import { Attempt, Examination, Result } from '../models/index.js';
import { deleteAttempts } from '../services/deletionService.js';
import { evaluateAttempt } from '../services/evaluationService.js';
import { refreshLatestResults } from '../services/latestResultService.js';
import { buildResultsWorkbook, sendWorkbook } from '../services/excelService.js';
import { writeResultsReport, writeStudentReport } from '../services/pdfService.js';
import { buildResultFilter, buildSort, describeFilters, summarize } from '../services/resultQuery.js';
import { AppError } from '../utils/AppError.js';
import { pageMeta } from '../utils/helpers.js';

const EXPORT_LIMIT = 50000;

export async function listResults(req, res) {
  const q = req.valid.query;
  const filter = buildResultFilter(q);
  const [items, total, agg] = await Promise.all([
    Result.find(filter).sort(buildSort(q)).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Result.countDocuments(filter),
    Result.aggregate([
      { $match: filter },
      { $group: { _id: null, avg: { $avg: '$totalScore' }, max: { $max: '$totalScore' }, avgPct: { $avg: '$percentage' }, passed: { $sum: { $cond: ['$passed', 1, 0] } }, n: { $sum: 1 } } },
    ]),
  ]);
  const a = agg[0];
  res.json({
    success: true,
    data: items,
    meta: pageMeta(total, q.page, q.limit),
    summary: a
      ? { count: a.n, averageScore: Math.round(a.avg * 100) / 100, highestScore: a.max, averagePercentage: Math.round(a.avgPct * 100) / 100, passRate: Math.round((a.passed / a.n) * 10000) / 100 }
      : { count: 0, averageScore: 0, highestScore: 0, averagePercentage: 0, passRate: 0 },
  });
}

export async function getResult(req, res) {
  const result = await Result.findById(req.params.id).lean();
  if (!result) throw AppError.notFound('Result not found');
  res.json({ success: true, data: result });
}

export async function reevaluate(req, res) {
  const result = await Result.findById(req.params.id);
  if (!result) throw AppError.notFound('Result not found');
  res.json({ success: true, data: await evaluateAttempt(result.attempt) });
}

/** Deletes the attempt, its answers and the result. The student stays registered and may attempt again. */
export async function deleteResult(req, res) {
  const result = await Result.findById(req.params.id);
  if (!result) throw AppError.notFound('Result not found');
  const removed = await deleteAttempts([result.attempt]);
  await Result.deleteOne({ _id: result._id });
  await refreshLatestResults({ studentIds: [result.student] });
  res.json({ success: true, data: { id: result._id, removed } });
}

export async function studentPdf(req, res) {
  const result = await Result.findById(req.params.id).lean();
  if (!result) throw AppError.notFound('Result not found');
  const attempt = await Attempt.findById(result.attempt).select('violations').lean();
  writeStudentReport(res, result, attempt);
}

async function exportRows(q) {
  return Result.find(buildResultFilter(q)).sort(buildSort(q)).limit(EXPORT_LIMIT).lean();
}

async function exportTitle(q, mode) {
  const exam = q.exam ? await Examination.findById(q.exam).select('title').lean() : null;
  const base = mode === 'university' ? 'University-wise Results' : q.exam ? 'Examination Results' : 'Student Results';
  return exam ? `${base} - ${exam.title}` : base;
}

export async function exportPdf(req, res) {
  const q = req.valid.query;
  const mode = ['university', 'all', 'filtered'].includes(req.query.mode) ? req.query.mode : 'filtered';
  const rows = await exportRows(q);
  writeResultsReport(res, rows, { title: await exportTitle(q, mode), filterText: describeFilters(q), byUniversity: mode === 'university' });
}

export async function exportExcel(req, res) {
  const q = req.valid.query;
  const mode = req.query.mode === 'university' ? 'university' : 'filtered';
  const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
  const rows = await exportRows(q);
  const wb = buildResultsWorkbook(rows, { byUniversity: mode === 'university' && format === 'xlsx', filterText: describeFilters(q) });
  const filename = `${(await exportTitle(q, mode)).replace(/\W+/g, '_').toLowerCase()}_${new Date().toISOString().slice(0, 10)}`;
  await sendWorkbook(res, wb, { filename, format, sheetName: 'Results' });
}

export async function resultSummary(req, res) {
  res.json({ success: true, data: summarize(await exportRows(req.valid.query)) });
}
