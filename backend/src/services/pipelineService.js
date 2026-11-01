import mongoose from 'mongoose';
import { Attempt, CandidateNote, Result, Student } from '../models/index.js';
import { logger } from '../utils/logger.js';
import { refreshLatestResults } from './latestResultService.js';

const SYSTEM = { name: 'System (pass mark)' };

/**
 * Keeps Round 2 in step with the pass mark:
 *  - a candidate still in "Online test" whose latest result passes moves to Round 2 (autoQualified);
 *  - a candidate who was auto-qualified but no longer passes (pass mark raised) moves back.
 * Candidates moved, rejected or selected by a person are never touched.
 * Every move is a conditional update plus a note, so it is safe alongside admins' own decisions.
 */
export async function syncAutoQualification(examId, { studentIds, known } = {}) {
  const match = { examination: new mongoose.Types.ObjectId(String(examId)) };
  if (studentIds) match.student = { $in: studentIds.map((id) => new mongoose.Types.ObjectId(String(id))) };
  // A just-evaluated result is the student's latest, so it can be used without a query.
  const latest = known && studentIds?.length === 1
    ? [{ _id: studentIds[0], passed: known.passed, percentage: known.percentage, passPercentage: known.passPercentage }]
    : await Result.aggregate([
    { $match: match },
    { $sort: { endedAt: -1 } },
        { $group: { _id: '$student', passed: { $first: '$passed' }, percentage: { $first: '$percentage' }, passPercentage: { $first: '$passPercentage' } } },
      ]);

  let qualified = 0;
  let movedBack = 0;
  const now = new Date();
  for (const r of latest) {
    if (r.passed) {
      const s = await Student.findOneAndUpdate(
        { _id: r._id, stage: { $in: ['ONLINE_TEST', null] }, autoHold: { $ne: true } },
        { $set: { stage: 'ROUND_2', autoQualified: true, stageUpdatedAt: now, stageUpdatedBy: SYSTEM } },
        { new: true, projection: { examination: 1 } },
      );
      if (s) {
        qualified += 1;
        await CandidateNote.create({
          student: s._id,
          examination: s.examination,
          type: 'DECISION',
          stage: 'ONLINE_TEST',
          fromStage: 'ONLINE_TEST',
          toStage: 'ROUND_2',
          text: `Automatically qualified for Round 2: passed the online test with ${r.percentage}% (pass mark ${r.passPercentage}%)`,
          plain: `Automatically qualified for Round 2 (${r.percentage}%)`,
          author: SYSTEM,
        });
      }
    } else {
      const s = await Student.findOneAndUpdate(
        { _id: r._id, stage: 'ROUND_2', autoQualified: true },
        { $set: { stage: 'ONLINE_TEST', autoQualified: false, stageUpdatedAt: now, stageUpdatedBy: SYSTEM } },
        { new: true, projection: { examination: 1 } },
      );
      if (s) {
        movedBack += 1;
        await CandidateNote.create({
          student: s._id,
          examination: s.examination,
          type: 'DECISION',
          stage: 'ROUND_2',
          fromStage: 'ROUND_2',
          toStage: 'ONLINE_TEST',
          text: `Moved back to Online test: pass mark is now ${r.passPercentage}% and the score was ${r.percentage}%`,
          plain: `Moved back to Online test (pass mark ${r.passPercentage}%)`,
          author: SYSTEM,
        });
      }
    }
  }
  return { qualified, movedBack };
}

/**
 * Applies a (new) pass mark to an examination after the fact: re-marks every finished result
 * Pass/Fail, keeps attempts' snapshot in line (so re-evaluation agrees), then re-syncs Round 2.
 * Terminated attempts always stay "not passed".
 */
export async function applyPassMark(exam) {
  const pass = exam.passPercentage;
  const results = await Result.updateMany({ examination: exam._id }, [
    {
      $set: {
        passPercentage: pass,
        passed: { $and: [{ $eq: ['$status', 'COMPLETED'] }, { $gte: ['$percentage', pass] }] },
      },
    },
  ]);
  await Attempt.updateMany({ examination: exam._id }, { $set: { 'policy.passPercentage': pass } });
  await refreshLatestResults({ examId: exam._id });
  const pipeline = await syncAutoQualification(exam._id);
  logger.info({ exam: String(exam._id), pass, results: results.modifiedCount, ...pipeline }, 'Pass mark applied');
  return { resultsUpdated: results.modifiedCount, ...pipeline };
}
