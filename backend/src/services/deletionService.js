import { Attempt, AuditLog, Examination, Result, Student, StudentResponse } from '../models/index.js';

/**
 * Permanent, cascading deletes. Children are removed before parents so an interrupted
 * delete never leaves orphans pointing at missing records; re-running finishes the job.
 */
export async function deleteAttempts(attemptIds) {
  if (!attemptIds.length) return { attempts: 0, responses: 0, results: 0 };
  const [responses, results] = await Promise.all([
    StudentResponse.deleteMany({ attempt: { $in: attemptIds } }),
    Result.deleteMany({ attempt: { $in: attemptIds } }),
  ]);
  await AuditLog.deleteMany({ entityId: { $in: attemptIds } });
  const attempts = await Attempt.deleteMany({ _id: { $in: attemptIds } });
  return { attempts: attempts.deletedCount, responses: responses.deletedCount, results: results.deletedCount };
}

export async function deleteStudents(studentIds) {
  if (!studentIds.length) return { students: 0, attempts: 0, responses: 0, results: 0 };
  const attemptIds = (await Attempt.find({ student: { $in: studentIds } }).select('_id').lean()).map((a) => a._id);
  const removed = await deleteAttempts(attemptIds);
  await Result.deleteMany({ student: { $in: studentIds } });
  await AuditLog.deleteMany({ $or: [{ actorId: { $in: studentIds } }, { entityId: { $in: studentIds } }] });
  const students = await Student.deleteMany({ _id: { $in: studentIds } });
  return { students: students.deletedCount, ...removed };
}

export async function deleteExamination(examId) {
  const studentIds = (await Student.find({ examination: examId }).select('_id').lean()).map((s) => s._id);
  const removed = await deleteStudents(studentIds);
  // Anything left that still references the exam (defensive: e.g. records from a half-finished delete).
  const strayAttempts = (await Attempt.find({ examination: examId }).select('_id').lean()).map((a) => a._id);
  const stray = await deleteAttempts(strayAttempts);
  await Result.deleteMany({ examination: examId });
  await AuditLog.deleteMany({ entityId: examId });
  await Examination.deleteOne({ _id: examId });
  return {
    students: removed.students,
    attempts: removed.attempts + stray.attempts,
    responses: removed.responses + stray.responses,
    results: removed.results + stray.results,
  };
}
