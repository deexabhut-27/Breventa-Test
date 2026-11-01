import mongoose from 'mongoose';
import { Result, Student } from '../models/index.js';

/** Recomputes Student.latestResult for the given students (or every student of an exam). */
const summaryOf = (r) => ({
  result: r._id,
  percentage: r.percentage,
  totalScore: r.totalScore,
  maxScore: r.maxScore,
  passed: r.passed,
  status: r.status,
  correct: r.correct,
  incorrect: r.incorrect,
  unanswered: r.unanswered,
  endedAt: r.endedAt,
  examTitle: r.examTitle,
});

export async function refreshLatestResults({ studentIds, examId, known } = {}) {
  // Fast path: a result that was just evaluated is the student's latest; store it in one write.
  if (known && studentIds?.length === 1) {
    await Student.updateOne({ _id: studentIds[0] }, { $set: { latestResult: summaryOf(known) } });
    return 1;
  }
  const match = {};
  if (studentIds) match.student = { $in: studentIds.map((id) => new mongoose.Types.ObjectId(String(id))) };
  if (examId) match.examination = new mongoose.Types.ObjectId(String(examId));
  const latest = await Result.aggregate([
    { $match: match },
    { $sort: { endedAt: -1 } },
    {
      $group: {
        _id: '$student',
        result: { $first: '$_id' },
        percentage: { $first: '$percentage' },
        totalScore: { $first: '$totalScore' },
        maxScore: { $first: '$maxScore' },
        passed: { $first: '$passed' },
        status: { $first: '$status' },
        correct: { $first: '$correct' },
        incorrect: { $first: '$incorrect' },
        unanswered: { $first: '$unanswered' },
        endedAt: { $first: '$endedAt' },
        examTitle: { $first: '$examTitle' },
      },
    },
  ]);
  const ops = latest.map(({ _id, ...latestResult }) => ({ updateOne: { filter: { _id }, update: { $set: { latestResult } } } }));
  // Students asked about explicitly who no longer have any result.
  if (studentIds) {
    const have = new Set(latest.map((l) => String(l._id)));
    studentIds.filter((id) => !have.has(String(id))).forEach((id) => ops.push({ updateOne: { filter: { _id: new mongoose.Types.ObjectId(String(id)) }, update: { $unset: { latestResult: '' } } } }));
  }
  if (ops.length) await Student.bulkWrite(ops, { ordered: false });
  return ops.length;
}
