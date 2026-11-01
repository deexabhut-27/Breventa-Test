import mongoose from 'mongoose';
import { Attempt, Question, Result, StudentResponse } from '../models/index.js';
import { ATTEMPT_STATUS } from '../config/constants.js';
import { finalizeAttempt, remainingMs } from '../services/attemptService.js';
import { AppError } from '../utils/AppError.js';

export async function liveMonitoring(req, res) {
  const match = { status: ATTEMPT_STATUS.IN_PROGRESS };
  if (req.query.exam && mongoose.isValidObjectId(req.query.exam)) match.examination = new mongoose.Types.ObjectId(req.query.exam);
  const now = Date.now();
  const hourAgo = new Date(now - 3600 * 1000);

  const [attempts, recentEvents, terminatedLastHour, completedLastHour] = await Promise.all([
    Attempt.aggregate([
      { $match: match },
      {
        $project: {
          student: 1,
          examination: 1,
          startedAt: 1,
          expiresAt: 1,
          lastHeartbeatAt: 1,
          connectionState: 1,
          violationCount: 1,
          policy: 1,
          questionCount: { $size: '$questions' },
          lastEvent: { $arrayElemAt: ['$violations', -1] },
        },
      },
      { $lookup: { from: 'students', localField: 'student', foreignField: '_id', as: 'student', pipeline: [{ $project: { fullName: 1, universityName: 1, email: 1, phone: 1 } }] } },
      { $lookup: { from: 'examinations', localField: 'examination', foreignField: '_id', as: 'examination', pipeline: [{ $project: { title: 1 } }] } },
      { $addFields: { student: { $first: '$student' }, examination: { $first: '$examination' } } },
      { $sort: { startedAt: -1 } },
    ]),
    Attempt.aggregate([
      { $match: { ...(match.examination ? { examination: match.examination } : {}), updatedAt: { $gte: hourAgo } } },
      { $unwind: '$violations' },
      { $match: { 'violations.at': { $gte: hourAgo }, 'violations.type': { $nin: ['RECONNECTED'] } } },
      { $sort: { 'violations.at': -1 } },
      { $limit: 40 },
      { $lookup: { from: 'students', localField: 'student', foreignField: '_id', as: 'student', pipeline: [{ $project: { fullName: 1, universityName: 1 } }] } },
      { $project: { _id: 1, status: 1, event: '$violations', student: { $first: '$student' } } },
    ]),
    Attempt.countDocuments({ ...(match.examination ? { examination: match.examination } : {}), status: ATTEMPT_STATUS.TERMINATED, endedAt: { $gte: hourAgo } }),
    Attempt.countDocuments({ ...(match.examination ? { examination: match.examination } : {}), status: ATTEMPT_STATUS.COMPLETED, endedAt: { $gte: hourAgo } }),
  ]);

  const answered = await StudentResponse.aggregate([
    { $match: { attempt: { $in: attempts.map((a) => a._id) }, selectedOption: { $ne: null } } },
    { $group: { _id: '$attempt', n: { $sum: 1 } } },
  ]);
  const answeredMap = new Map(answered.map((a) => [String(a._id), a.n]));

  const rows = attempts.map((a) => ({
    ...a,
    answered: answeredMap.get(String(a._id)) || 0,
    remainingMs: remainingMs({ expiresAt: a.expiresAt }, now),
    secondsSinceHeartbeat: a.lastHeartbeatAt ? Math.round((now - new Date(a.lastHeartbeatAt)) / 1000) : null,
  }));

  res.json({
    success: true,
    data: {
      serverNow: new Date(now).toISOString(),
      stats: {
        inProgress: rows.length,
        disconnected: rows.filter((r) => r.connectionState === 'DISCONNECTED').length,
        withViolations: rows.filter((r) => r.violationCount > 0).length,
        terminatedLastHour,
        completedLastHour,
      },
      attempts: rows,
      recentEvents,
    },
  });
}

/** Full attempt review for administrators, including the answer key and each response. */
export async function attemptDetail(req, res) {
  const attempt = await Attempt.findById(req.params.id)
    .populate('student')
    .populate('examination', 'title slug durationMinutes passPercentage')
    .lean();
  if (!attempt) throw AppError.notFound('Attempt not found');
  const ids = attempt.questions.map((q) => q.question);
  const [questions, responses, result] = await Promise.all([
    Question.find({ _id: { $in: ids } }).select('+correctOptionIndex +explanation').lean(),
    StudentResponse.find({ attempt: attempt._id }).lean(),
    Result.findOne({ attempt: attempt._id }).lean(),
  ]);
  const qMap = new Map(questions.map((q) => [String(q._id), q]));
  const rMap = new Map(responses.map((r) => [String(r.question), r]));
  const review = attempt.questions.map((aq, index) => {
    const q = qMap.get(String(aq.question));
    const r = rMap.get(String(aq.question));
    const selected = r?.selectedOption ?? null;
    return {
      index,
      text: q?.text ?? '[deleted question]',
      options: q?.options ?? [],
      correctOptionIndex: q?.correctOptionIndex,
      explanation: q?.explanation,
      selectedOption: selected,
      markedForReview: !!r?.markedForReview,
      difficulty: aq.difficulty,
      category: aq.category,
      marks: aq.marks,
      negativeMarks: aq.negativeMarks,
      outcome: selected === null ? 'UNANSWERED' : selected === q?.correctOptionIndex ? 'CORRECT' : 'INCORRECT',
    };
  });
  const { questions: _omit, ...rest } = attempt;
  res.json({ success: true, data: { attempt: rest, result, review } });
}

export async function adminTerminate(req, res) {
  const { finalized, attempt } = await finalizeAttempt(req.params.id, {
    status: ATTEMPT_STATUS.TERMINATED,
    submissionType: 'TERMINATED',
    reason: `Terminated by administrator: ${req.body.reason}`,
  });
  if (!finalized) throw AppError.conflict(`Attempt is already ${attempt.status.toLowerCase()}`, 'ATTEMPT_CLOSED');
  res.json({ success: true, data: { id: attempt._id, status: attempt.status } });
}

export async function adminForceSubmit(req, res) {
  const { finalized, attempt } = await finalizeAttempt(req.params.id, {
    status: ATTEMPT_STATUS.COMPLETED,
    submissionType: 'ADMIN_FORCED',
  });
  if (!finalized) throw AppError.conflict(`Attempt is already ${attempt.status.toLowerCase()}`, 'ATTEMPT_CLOSED');
  res.json({ success: true, data: { id: attempt._id, status: attempt.status } });
}
