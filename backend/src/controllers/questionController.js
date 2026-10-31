import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { Attempt, Question } from '../models/index.js';
import { CATEGORIES, DIFFICULTIES } from '../config/constants.js';
import { audit } from '../services/auditService.js';
import { buildQuestionsWorkbook, QUESTION_COLUMNS, sendWorkbook } from '../services/excelService.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegex, pageMeta } from '../utils/helpers.js';
import { questionSchema } from '../validators/index.js';

const ADMIN_FIELDS = '+correctOptionIndex +explanation';

function listFilter(q) {
  const filter = {};
  if (q.category) filter.category = q.category;
  if (q.difficulty) filter.difficulty = q.difficulty;
  if (q.status) filter.isActive = q.status === 'active';
  if (q.search) filter.text = { $regex: escapeRegex(q.search), $options: 'i' };
  return filter;
}

export async function listQuestions(req, res) {
  const q = req.valid.query;
  const filter = listFilter(q);
  const [items, total] = await Promise.all([
    Question.find(filter)
      .select(ADMIN_FIELDS)
      .sort({ [q.sortBy]: q.sortOrder === 'asc' ? 1 : -1, _id: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    Question.countDocuments(filter),
  ]);
  res.json({ success: true, data: items, meta: pageMeta(total, q.page, q.limit) });
}

export async function questionStats(_req, res) {
  const rows = await Question.aggregate([
    { $group: { _id: { difficulty: '$difficulty', category: '$category', active: '$isActive' }, count: { $sum: 1 } } },
  ]);
  const matrix = {};
  let total = 0;
  let active = 0;
  for (const r of rows) {
    const { difficulty, category, active: isActive } = r._id;
    matrix[category] ??= { EASY: 0, MEDIUM: 0, HARD: 0 };
    total += r.count;
    if (isActive) {
      matrix[category][difficulty] += r.count;
      active += r.count;
    }
  }
  const byDifficulty = Object.fromEntries(DIFFICULTIES.map((d) => [d, Object.values(matrix).reduce((a, m) => a + m[d], 0)]));
  res.json({ success: true, data: { total, active, inactive: total - active, byDifficulty, matrix } });
}

export async function getQuestion(req, res) {
  const question = await Question.findById(req.params.id).select(ADMIN_FIELDS);
  if (!question) throw AppError.notFound('Question not found');
  res.json({ success: true, data: question });
}

export async function createQuestion(req, res) {
  const question = await Question.create({ ...req.body, createdBy: req.admin._id });
  await audit({ actorType: 'ADMIN', actorId: req.admin._id, action: 'QUESTION_CREATED', entityType: 'Question', entityId: question._id, ip: req.ip });
  res.status(201).json({ success: true, data: await Question.findById(question._id).select(ADMIN_FIELDS) });
}

export async function updateQuestion(req, res) {
  const question = await Question.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).select(ADMIN_FIELDS);
  if (!question) throw AppError.notFound('Question not found');
  await audit({ actorType: 'ADMIN', actorId: req.admin._id, action: 'QUESTION_UPDATED', entityType: 'Question', entityId: question._id, ip: req.ip });
  res.json({ success: true, data: question });
}

export async function setQuestionStatus(req, res) {
  const question = await Question.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive }, { new: true }).select(ADMIN_FIELDS);
  if (!question) throw AppError.notFound('Question not found');
  res.json({ success: true, data: question });
}

export async function deleteQuestion(req, res) {
  const question = await Question.findById(req.params.id);
  if (!question) throw AppError.notFound('Question not found');
  const usedIn = await Attempt.countDocuments({ 'questions.question': question._id });
  if (usedIn && req.query.force !== 'true') {
    throw AppError.conflict(
      `This question appears in ${usedIn} student attempt(s). Existing scores are kept, but answer reviews will no longer show it and re-evaluation will count it as unanswered. Deactivating it is usually better.`,
      'QUESTION_IN_USE',
      { usedIn },
    );
  }
  await question.deleteOne();
  await audit({ actorType: 'ADMIN', actorId: req.admin._id, action: 'QUESTION_DELETED', entityType: 'Question', details: { text: question.text.slice(0, 120), usedIn }, ip: req.ip });
  res.json({ success: true, data: { id: question._id } });
}

export async function exportQuestions(req, res) {
  const q = req.valid.query;
  const questions = await Question.find(listFilter(q)).select(ADMIN_FIELDS).sort({ difficulty: 1, category: 1, createdAt: 1 }).lean();
  const wb = buildQuestionsWorkbook(questions);
  await sendWorkbook(res, wb, { filename: `question-bank-${new Date().toISOString().slice(0, 10)}`, format: q.format, sheetName: 'Questions' });
}

export async function importTemplate(req, res) {
  const wb = buildQuestionsWorkbook([
    {
      text: 'If 5 pens cost Rs 60, what do 8 pens cost?',
      options: ['Rs 84', 'Rs 96', 'Rs 100', 'Rs 108'],
      correctOptionIndex: 1,
      category: 'Quantitative Aptitude',
      difficulty: 'EASY',
      marks: 1,
      negativeMarks: 0.25,
      explanation: 'One pen costs 12, so 8 pens cost 96.',
      isActive: true,
    },
  ]);
  await sendWorkbook(res, wb, { filename: 'question-import-template', format: req.query.format === 'csv' ? 'csv' : 'xlsx', sheetName: 'Questions' });
}

// ---------- Import ----------
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');
const HEADER_ALIASES = Object.fromEntries(QUESTION_COLUMNS.map((c) => [norm(c.header), c.key]));
Object.assign(HEADER_ALIASES, { questiontext: 'text', text: 'text', answer: 'correct', correctanswer: 'correct', optiona: 'a', optionb: 'b', optionc: 'c', optiond: 'd', negative: 'negativeMarks', isactive: 'active' });

function cellText(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return String(v.result);
    return '';
  }
  return String(v).trim();
}

function parseDifficulty(v) {
  const n = norm(v);
  if (n === 'easy') return 'EASY';
  if (n === 'medium' || n === 'moderate') return 'MEDIUM';
  if (['hard', 'tricky', 'hardtricky', 'difficult'].includes(n)) return 'HARD';
  return null;
}

function parseCorrect(v, options) {
  const s = String(v).trim();
  if (/^[A-Da-d]$/.test(s)) return s.toUpperCase().charCodeAt(0) - 65;
  if (/^[1-4]$/.test(s)) return Number(s) - 1;
  const idx = options.findIndex((o) => o.toLowerCase() === s.toLowerCase());
  return idx >= 0 ? idx : null;
}

export async function importQuestions(req, res) {
  if (!req.file) throw AppError.badRequest('Upload an .xlsx or .csv file', 'FILE_REQUIRED');
  const name = req.file.originalname.toLowerCase();
  const wb = new ExcelJS.Workbook();
  try {
    if (name.endsWith('.csv')) await wb.csv.read(Readable.from(req.file.buffer));
    else if (name.endsWith('.xlsx')) await wb.xlsx.load(req.file.buffer);
    else throw AppError.badRequest('Unsupported file type. Use .xlsx or .csv', 'UNSUPPORTED_FILE');
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.badRequest('The file could not be read. Check that it is a valid Excel or CSV file.', 'UNREADABLE_FILE');
  }
  const sheet = wb.worksheets[0];
  if (!sheet || sheet.rowCount < 2) throw AppError.badRequest('The file contains no question rows', 'EMPTY_FILE');

  const headerMap = {};
  sheet.getRow(1).eachCell((cell, col) => {
    const key = HEADER_ALIASES[norm(cellText(cell.value))];
    if (key) headerMap[col] = key;
  });
  const missing = ['text', 'a', 'b', 'c', 'd', 'correct', 'category', 'difficulty'].filter((k) => !Object.values(headerMap).includes(k));
  if (missing.length) {
    throw AppError.badRequest(`Missing required columns: ${missing.join(', ')}. Download the template for the expected format.`, 'INVALID_COLUMNS');
  }

  const valid = [];
  const errors = [];
  const maxRows = 5000;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1 || valid.length + errors.length >= maxRows) return;
    const raw = {};
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (headerMap[col]) raw[headerMap[col]] = cellText(cell.value);
    });
    if (!Object.values(raw).some((v) => v)) return;
    const options = [raw.a, raw.b, raw.c, raw.d].map((o) => String(o ?? '').trim());
    const category = CATEGORIES.find((c) => norm(c) === norm(raw.category));
    const candidate = {
      text: raw.text,
      options,
      // undefined (not null) so validation fails instead of coercing to option A
      correctOptionIndex: parseCorrect(raw.correct ?? '', options) ?? undefined,
      category,
      difficulty: parseDifficulty(raw.difficulty),
      marks: raw.marks === '' || raw.marks === undefined ? 1 : raw.marks,
      negativeMarks: raw.negativeMarks === '' || raw.negativeMarks === undefined ? 0 : raw.negativeMarks,
      explanation: raw.explanation || '',
      isActive: !['no', 'false', '0', 'inactive'].includes(String(raw.active ?? '').trim().toLowerCase()),
    };
    const parsed = questionSchema.safeParse(candidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue.path.join('.');
      const hint = field === 'category' ? `Category must be one of: ${CATEGORIES.join(', ')}` : field === 'difficulty' ? 'Difficulty must be Easy, Medium or Hard' : field === 'correctOptionIndex' ? 'Correct option must be A, B, C or D' : issue.message;
      errors.push({ row: rowNumber, message: hint });
    } else {
      valid.push({ ...parsed.data, createdBy: req.admin._id });
    }
  });

  let inserted = 0;
  if (valid.length) inserted = (await Question.insertMany(valid, { ordered: false })).length;
  await audit({ actorType: 'ADMIN', actorId: req.admin._id, action: 'QUESTIONS_IMPORTED', details: { inserted, failed: errors.length, file: req.file.originalname }, ip: req.ip });
  res.status(inserted ? 201 : 400).json({
    success: inserted > 0,
    data: { inserted, failed: errors.length, errors: errors.slice(0, 200) },
    ...(inserted ? {} : { error: { code: 'IMPORT_FAILED', message: 'No valid questions were found in the file' } }),
  });
}
