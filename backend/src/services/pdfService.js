import PDFDocument from 'pdfkit';
import { DIFFICULTY_LABELS } from '../config/constants.js';
import { groupByUniversity, summarize } from './resultQuery.js';

const BRAND = '#1e3a8a';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';

const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) : '-');
const fmtDuration = (s) => (s || s === 0 ? `${Math.floor(s / 60)}m ${s % 60}s` : '-');
const statusText = (r) => (r.status === 'TERMINATED' ? 'Terminated' : 'Completed');

function createDoc(res, { title, filename, layout = 'portrait' }) {
  const doc = new PDFDocument({ size: 'A4', layout, margins: { top: 80, bottom: 60, left: 40, right: 40 }, bufferPages: true, info: { Title: title } });
  if (res) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);
  }
  return doc;
}

function decorate(doc, title) {
  const range = doc.bufferedPageRange();
  const generated = fmtDate(new Date());
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const { width, height } = doc.page;
    const { left, right, bottom } = doc.page.margins;
    doc.page.margins.bottom = 0; // allow writing in the footer area without adding pages
    doc.rect(0, 0, width, 56).fill(BRAND);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text('University Placement Examination', left, 16, { lineBreak: false });
    doc.font('Helvetica').fontSize(9).text(title, left, 36, { width: width - left - right, lineBreak: false });
    doc.moveTo(left, height - 42).lineTo(width - right, height - 42).strokeColor(BORDER).lineWidth(1).stroke();
    doc.fillColor(MUTED).fontSize(8).text(`Generated ${generated}  |  Confidential`, left, height - 34, { lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, left, height - 34, { width: width - left - right, align: 'right', lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
}

function heading(doc, text) {
  ensureSpace(doc, 40);
  doc.moveDown(0.6).fillColor(BRAND).font('Helvetica-Bold').fontSize(12).text(text, doc.page.margins.left);
  doc.moveDown(0.3).fillColor('#0f172a').font('Helvetica').fontSize(10);
}

function ensureSpace(doc, needed) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function keyValueGrid(doc, pairs, columns = 2) {
  const left = doc.page.margins.left;
  const usable = doc.page.width - left - doc.page.margins.right;
  const colWidth = usable / columns;
  for (let i = 0; i < pairs.length; i += columns) {
    ensureSpace(doc, 30);
    const y = doc.y;
    let maxH = 0;
    pairs.slice(i, i + columns).forEach(([k, v], j) => {
      const x = left + j * colWidth;
      doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(k.toUpperCase(), x, y, { width: colWidth - 10 });
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text(String(v ?? '-'), x, y + 11, { width: colWidth - 10 });
      maxH = Math.max(maxH, doc.y - y);
    });
    doc.y = y + maxH + 6;
  }
  doc.x = left;
}

/** Draws a table with automatic page breaks and repeated header rows. */
function table(doc, columns, rows, { fontSize = 8.5, zebra = true } = {}) {
  const left = doc.page.margins.left;
  const usable = doc.page.width - left - doc.page.margins.right;
  const totalWeight = columns.reduce((a, c) => a + (c.width || 1), 0);
  const widths = columns.map((c) => ((c.width || 1) / totalWeight) * usable);
  const pad = 4;

  const rowHeight = (cells, font) => {
    doc.font(font).fontSize(fontSize);
    return Math.max(...cells.map((c, i) => doc.heightOfString(String(c ?? '-'), { width: widths[i] - pad * 2 }))) + pad * 2;
  };
  const drawRow = (cells, { header = false, fill } = {}) => {
    const font = header ? 'Helvetica-Bold' : 'Helvetica';
    const h = rowHeight(cells, font);
    if (doc.y + h > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      if (!header) drawRow(columns.map((c) => c.header), { header: true });
    }
    const y = doc.y;
    if (header) doc.rect(left, y, usable, h).fill('#eef2ff');
    else if (fill) doc.rect(left, y, usable, h).fill(fill);
    let x = left;
    cells.forEach((c, i) => {
      doc.fillColor(header ? BRAND : columns[i].color?.(c) || '#0f172a').font(font).fontSize(fontSize)
        .text(String(c ?? '-'), x + pad, y + pad, { width: widths[i] - pad * 2, align: columns[i].align || 'left' });
      x += widths[i];
    });
    doc.moveTo(left, y + h).lineTo(left + usable, y + h).strokeColor(BORDER).lineWidth(0.5).stroke();
    doc.y = y + h;
  };

  drawRow(columns.map((c) => c.header), { header: true });
  rows.forEach((r, idx) => drawRow(columns.map((c) => c.get(r, idx)), { fill: zebra && idx % 2 ? '#f8fafc' : null }));
  doc.x = left;
  doc.moveDown(0.5);
}

const bucketRow = (label, b) => [label, b?.total ?? 0, b?.correct ?? 0, b?.incorrect ?? 0, b?.unanswered ?? 0, `${b?.score ?? 0} / ${b?.maxScore ?? 0}`];
const bucketColumns = ['Section', 'Questions', 'Correct', 'Incorrect', 'Unanswered', 'Score'].map((header, i) => ({
  header,
  width: i === 0 ? 2.2 : 1,
  align: i === 0 ? 'left' : 'center',
  get: (r) => r[i],
}));

/** Individual student report. */
export function writeStudentReport(res, result, attempt) {
  const title = `Student Result Report - ${result.studentName}`;
  const doc = createDoc(res, { title, filename: `result-${(result.studentName || 'student').replace(/\W+/g, '_')}.pdf` });

  const passColor = result.status === 'TERMINATED' ? '#b91c1c' : result.passed ? '#15803d' : '#b45309';
  const verdict = result.status === 'TERMINATED' ? `TERMINATED · ${result.passed ? 'PASS' : 'FAIL'}` : result.passed ? 'PASS' : 'FAIL';
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#0f172a').text(result.studentName || '-', 40, 80);
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(result.examTitle || '');
  const boxY = 80;
  doc.roundedRect(doc.page.width - 190, boxY, 150, 52, 6).fill(passColor);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text(`${result.percentage ?? 0}%`, doc.page.width - 190, boxY + 8, { width: 150, align: 'center' });
  doc.fontSize(10).text(verdict, doc.page.width - 190, boxY + 33, { width: 150, align: 'center' });
  doc.y = boxY + 64;
  doc.x = 40;

  heading(doc, 'Student Details');
  keyValueGrid(doc, [
    ['Full name', result.studentName],
    ['University', result.universityName],
    ['Email', result.email],
    ['Phone', result.phone],
    ['Enrollment number', result.enrollmentNumber || '-'],
  ]);

  heading(doc, 'Examination Details');
  keyValueGrid(doc, [
    ['Examination', result.examTitle],
    ['Status', statusText(result)],
    ['Started', fmtDate(result.startedAt)],
    ['Ended', fmtDate(result.endedAt)],
    ['Time used', fmtDuration(result.durationUsedSeconds)],
    ['Submission', result.submissionType || '-'],
    ['Pass mark', `${result.passPercentage ?? '-'}%`],
    ['Violations recorded', result.violationCount ?? 0],
  ]);
  if (result.status === 'TERMINATED') {
    ensureSpace(doc, 44);
    const y = doc.y + 4;
    doc.roundedRect(40, y, doc.page.width - 80, 32, 4).fill('#fef2f2');
    doc.fillColor('#b91c1c').font('Helvetica-Bold').fontSize(9)
      .text(`Termination reason: ${result.terminationReason || '-'}`, 50, y + 11, { width: doc.page.width - 100, lineBreak: false, ellipsis: true });
    doc.x = 40;
    doc.y = y + 40;
  }

  heading(doc, 'Score Summary');
  keyValueGrid(doc, [
    ['Total score', `${result.totalScore} / ${result.maxScore}`],
    ['Percentage', `${result.percentage}%`],
    ['Correct', result.correct],
    ['Incorrect', result.incorrect],
    ['Unanswered', result.unanswered],
    ['Result', verdict],
  ], 3);

  heading(doc, 'Marks Breakdown');
  const s = result.scores || {};
  table(doc, bucketColumns, [
    bucketRow(DIFFICULTY_LABELS.EASY, s.easy),
    bucketRow(DIFFICULTY_LABELS.MEDIUM, s.medium),
    bucketRow(DIFFICULTY_LABELS.HARD, s.hard),
    bucketRow('Aptitude', s.aptitude),
    bucketRow('Reasoning', s.reasoning),
  ]);

  if (result.categoryScores?.length) {
    heading(doc, 'Category Breakdown');
    table(doc, bucketColumns, result.categoryScores.map((c) => bucketRow(c.category, c)));
  }

  const events = (attempt?.violations || []).filter((v) => v.type !== 'SESSION_REPLACED' || attempt.violations.length < 30);
  if (events.length) {
    heading(doc, 'Monitoring Events');
    table(doc, [
      { header: 'Time', width: 1.4, get: (v) => fmtDate(v.at) },
      { header: 'Event', width: 1.4, get: (v) => v.type.replace(/_/g, ' ') },
      { header: 'Counted', width: 0.7, align: 'center', get: (v) => (v.counted ? 'Yes' : 'No') },
      { header: 'Details', width: 3, get: (v) => v.reason || '-' },
    ], events.slice(0, 100));
  }

  decorate(doc, title);
  doc.end();
  return doc;
}

const resultColumns = [
  { header: '#', width: 0.35, align: 'center', get: (_r, i) => i + 1 },
  { header: 'Student', width: 1.6, get: (r) => `${r.studentName}\n${r.enrollmentNumber || ''}`.trim() },
  { header: 'University', width: 1.6, get: (r) => r.universityName },
  { header: 'Contact', width: 1.9, get: (r) => `${r.email}\n${r.phone}` },
  { header: 'Easy', width: 0.55, align: 'center', get: (r) => r.scores?.easy?.score ?? 0 },
  { header: 'Med', width: 0.55, align: 'center', get: (r) => r.scores?.medium?.score ?? 0 },
  { header: 'Hard', width: 0.55, align: 'center', get: (r) => r.scores?.hard?.score ?? 0 },
  { header: 'C/I/U', width: 0.9, align: 'center', get: (r) => `${r.correct}/${r.incorrect}/${r.unanswered}` },
  { header: 'Score', width: 0.8, align: 'center', get: (r) => `${r.totalScore}/${r.maxScore}` },
  { header: '%', width: 0.6, align: 'center', get: (r) => r.percentage },
  {
    header: 'Result',
    width: 0.9,
    align: 'center',
    get: (r) => (r.status === 'TERMINATED' ? `TERM. ${r.passed ? 'PASS' : 'FAIL'}` : r.passed ? 'PASS' : 'FAIL'),
    color: (v) => (v === 'PASS' ? '#15803d' : v === 'FAIL' ? '#b45309' : '#b91c1c'),
  },
];

function summaryBlock(doc, rows) {
  const s = summarize(rows);
  keyValueGrid(doc, [
    ['Students', s.count],
    ['Average score', s.average],
    ['Highest score', s.highest],
    ['Average %', `${s.averagePercentage ?? 0}%`],
    ['Pass rate', `${s.passRate}%`],
    ['Terminated', s.terminated],
  ], 6);
}

/** Results listing. mode: 'all' | 'filtered' | 'university' */
export function writeResultsReport(res, rows, { title, filterText, byUniversity = false }) {
  const doc = createDoc(res, { title, filename: `${title.replace(/\W+/g, '_').toLowerCase()}.pdf`, layout: 'landscape' });
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#0f172a').text(title, 40, 76);
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`Filters: ${filterText}`);
  doc.moveDown(0.5);

  heading(doc, 'Overall Summary');
  summaryBlock(doc, rows);

  if (!rows.length) {
    doc.moveDown().fillColor(MUTED).fontSize(11).text('No results match the selected filters.');
  } else if (byUniversity) {
    const groups = groupByUniversity(rows);
    heading(doc, 'University Summary');
    table(doc, [
      { header: 'University', width: 3, get: (g) => g[0] },
      { header: 'Students', width: 1, align: 'center', get: (g) => g[1].length },
      { header: 'Average score', width: 1, align: 'center', get: (g) => summarize(g[1]).average },
      { header: 'Highest', width: 1, align: 'center', get: (g) => summarize(g[1]).highest },
      { header: 'Pass rate', width: 1, align: 'center', get: (g) => `${summarize(g[1]).passRate}%` },
      { header: 'Terminated', width: 1, align: 'center', get: (g) => summarize(g[1]).terminated },
    ], groups);
    for (const [university, list] of groups) {
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(14).fillColor(BRAND).text(university, 40, 76);
      doc.moveDown(0.3);
      summaryBlock(doc, list);
      table(doc, resultColumns, list);
    }
  } else {
    heading(doc, 'Student Results');
    table(doc, resultColumns, rows);
  }

  decorate(doc, title);
  doc.end();
  return doc;
}
