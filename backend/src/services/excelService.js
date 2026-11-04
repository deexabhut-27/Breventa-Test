import ExcelJS from 'exceljs';
import { DIFFICULTY_LABELS } from '../config/constants.js';
import { groupByUniversity, summarize } from './resultQuery.js';

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };

function styleHeader(sheet) {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: 'middle' };
  row.height = 20;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  if (sheet.columnCount) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
}

export const RESULT_COLUMNS = [
  { header: 'Student Name', key: 'studentName', width: 24 },
  { header: 'University', key: 'universityName', width: 28 },
  { header: 'Phone', key: 'phone', width: 15 },
  { header: 'Email', key: 'email', width: 28 },
  { header: 'Enrollment No.', key: 'enrollmentNumber', width: 16 },
  { header: 'Examination', key: 'examTitle', width: 28 },
  { header: 'Start Time', key: 'startedAt', width: 20, style: { numFmt: 'dd-mmm-yyyy hh:mm' } },
  { header: 'End Time', key: 'endedAt', width: 20, style: { numFmt: 'dd-mmm-yyyy hh:mm' } },
  { header: 'Duration Used (min)', key: 'durationMinutes', width: 12 },
  { header: 'Easy Score', key: 'easy', width: 10 },
  { header: 'Medium Score', key: 'medium', width: 10 },
  { header: 'Hard Score', key: 'hard', width: 10 },
  { header: 'Aptitude Score', key: 'aptitude', width: 12 },
  { header: 'Reasoning Score', key: 'reasoning', width: 12 },
  { header: 'Correct', key: 'correct', width: 9 },
  { header: 'Incorrect', key: 'incorrect', width: 9 },
  { header: 'Unanswered', key: 'unanswered', width: 11 },
  { header: 'Total Score', key: 'totalScore', width: 10 },
  { header: 'Max Score', key: 'maxScore', width: 10 },
  { header: 'Percentage', key: 'percentage', width: 10 },
  { header: 'Pass/Fail', key: 'result', width: 10 },
  { header: 'Status', key: 'status', width: 12 },
  { header: 'Violations', key: 'violationCount', width: 10 },
  { header: 'Termination Reason', key: 'terminationReason', width: 40 },
];

export const toResultRow = (r) => ({
  studentName: r.studentName,
  universityName: r.universityName,
  phone: r.phone,
  email: r.email,
  enrollmentNumber: r.enrollmentNumber || '',
  examTitle: r.examTitle,
  startedAt: r.startedAt ? new Date(r.startedAt) : null,
  endedAt: r.endedAt ? new Date(r.endedAt) : null,
  durationMinutes: r.durationUsedSeconds != null ? Math.round((r.durationUsedSeconds / 60) * 100) / 100 : null,
  easy: r.scores?.easy?.score ?? 0,
  medium: r.scores?.medium?.score ?? 0,
  hard: r.scores?.hard?.score ?? 0,
  aptitude: r.scores?.aptitude?.score ?? 0,
  reasoning: r.scores?.reasoning?.score ?? 0,
  correct: r.correct,
  incorrect: r.incorrect,
  unanswered: r.unanswered,
  totalScore: r.totalScore,
  maxScore: r.maxScore,
  percentage: r.percentage,
  result: r.status === 'TERMINATED' ? `TERMINATED (${r.passed ? 'PASS' : 'FAIL'})` : r.passed ? 'PASS' : 'FAIL',
  status: r.status,
  violationCount: r.violationCount ?? 0,
  terminationReason: r.terminationReason || '',
});

function addResultsSheet(wb, name, rows) {
  const sheet = wb.addWorksheet(name.slice(0, 31).replace(/[*?:\\/[\]]/g, ' '));
  sheet.columns = RESULT_COLUMNS;
  rows.forEach((r) => sheet.addRow(toResultRow(r)));
  styleHeader(sheet);
  return sheet;
}

export function buildResultsWorkbook(rows, { byUniversity = false, filterText = '' } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'University Placement Examination System';
  wb.created = new Date();
  addResultsSheet(wb, 'Results', rows);

  const summary = wb.addWorksheet('Summary');
  const s = summarize(rows);
  summary.columns = [{ header: 'Metric', key: 'k', width: 28 }, { header: 'Value', key: 'v', width: 50 }];
  [
    ['Generated', new Date().toISOString()],
    ['Filters', filterText],
    ['Students', s.count],
    ['Average score', s.average],
    ['Highest score', s.highest],
    ['Lowest score', s.lowest],
    ['Pass rate (%)', s.passRate],
    ['Terminated', s.terminated],
  ].forEach(([k, v]) => summary.addRow({ k, v }));
  styleHeader(summary);

  if (byUniversity) {
    const groups = groupByUniversity(rows);
    const uni = wb.addWorksheet('University Summary');
    uni.columns = [
      { header: 'University', key: 'u', width: 36 },
      { header: 'Students', key: 'n', width: 10 },
      { header: 'Average Score', key: 'avg', width: 14 },
      { header: 'Highest Score', key: 'max', width: 14 },
      { header: 'Pass Rate (%)', key: 'pass', width: 14 },
      { header: 'Terminated', key: 't', width: 12 },
    ];
    groups.forEach(([u, list]) => {
      const g = summarize(list);
      uni.addRow({ u, n: g.count, avg: g.average, max: g.highest, pass: g.passRate, t: g.terminated });
    });
    styleHeader(uni);
    const used = new Set(['Results', 'Summary', 'University Summary']);
    groups.forEach(([u, list]) => {
      let name = u.slice(0, 28).replace(/[*?:\\/[\]]/g, ' ');
      while (used.has(name)) name = `${name.slice(0, 26)}_${used.size}`;
      used.add(name);
      addResultsSheet(wb, name, list);
    });
  }
  return wb;
}

export const QUESTION_COLUMNS = [
  { header: 'Question', key: 'text', width: 60 },
  { header: 'Option A', key: 'a', width: 24 },
  { header: 'Option B', key: 'b', width: 24 },
  { header: 'Option C', key: 'c', width: 24 },
  { header: 'Option D', key: 'd', width: 24 },
  { header: 'Correct Option', key: 'correct', width: 14 },
  { header: 'Category', key: 'category', width: 22 },
  { header: 'Difficulty', key: 'difficulty', width: 12 },
  { header: 'Marks', key: 'marks', width: 8 },
  { header: 'Negative Marks', key: 'negativeMarks', width: 14 },
  { header: 'Explanation', key: 'explanation', width: 50 },
  { header: 'Active', key: 'active', width: 8 },
];

export function buildQuestionsWorkbook(questions) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Questions');
  sheet.columns = QUESTION_COLUMNS;
  questions.forEach((q) =>
    sheet.addRow({
      text: q.text,
      a: q.options[0],
      b: q.options[1],
      c: q.options[2],
      d: q.options[3],
      correct: 'ABCD'[q.correctOptionIndex],
      category: q.category,
      difficulty: DIFFICULTY_LABELS[q.difficulty] === 'Hard/Tricky' ? 'Hard' : DIFFICULTY_LABELS[q.difficulty],
      marks: q.marks,
      negativeMarks: q.negativeMarks,
      explanation: q.explanation || '',
      active: q.isActive ? 'Yes' : 'No',
    }),
  );
  styleHeader(sheet);
  return wb;
}

export async function sendWorkbook(res, wb, { filename, format = 'xlsx', sheetName }) {
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    const buf = await wb.csv.writeBuffer({ sheetName, dateFormat: 'YYYY-MM-DD HH:mm', formatterOptions: { writeBOM: true } });
    return res.send(buf);
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  const buf = await wb.xlsx.writeBuffer();
  return res.send(Buffer.from(buf));
}
