import mongoose from 'mongoose';
import { Attempt, Examination, Question, Result, Student } from '../models/index.js';

export async function getDashboard(req, res) {
  const examId = req.query.exam && mongoose.isValidObjectId(req.query.exam) ? new mongoose.Types.ObjectId(req.query.exam) : null;
  const byExam = examId ? { examination: examId } : {};
  const since = new Date(Date.now() - 13 * 24 * 3600 * 1000);
  since.setHours(0, 0, 0, 0);

  const [students, statusCounts, scoreAgg, distribution, perExam, universities, recent, daily, questionCounts, examCounts, pipeline] = await Promise.all([
    Student.countDocuments(byExam),
    Attempt.aggregate([{ $match: byExam }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Result.aggregate([
      { $match: byExam },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          avgScore: { $avg: '$totalScore' },
          maxScore: { $max: '$totalScore' },
          avgPercentage: { $avg: '$percentage' },
          maxPercentage: { $max: '$percentage' },
          passed: { $sum: { $cond: ['$passed', 1, 0] } },
        },
      },
    ]),
    Result.aggregate([
      { $match: byExam },
      { $bucket: { groupBy: '$percentage', boundaries: [-1000, 10, 20, 30, 40, 50, 60, 70, 80, 90, 1000], default: 'other', output: { count: { $sum: 1 } } } },
    ]),
    Result.aggregate([
      { $match: byExam },
      { $group: { _id: '$examination', title: { $first: '$examTitle' }, count: { $sum: 1 }, avgPercentage: { $avg: '$percentage' }, passed: { $sum: { $cond: ['$passed', 1, 0] } } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
    Result.aggregate([
      { $match: byExam },
      { $group: { _id: '$universityName', count: { $sum: 1 }, avgPercentage: { $avg: '$percentage' } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
    Result.find(byExam).sort({ endedAt: -1 }).limit(6).select('studentName universityName examTitle percentage passed status endedAt').lean(),
    Attempt.aggregate([
      { $match: { ...byExam, startedAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Question.aggregate([{ $match: { isActive: true } }, { $group: { _id: '$difficulty', count: { $sum: 1 } } }]),
    Examination.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    // Selection pipeline: only students who finished the online test.
    Student.aggregate([{ $match: { ...byExam, latestResult: { $exists: true } } }, { $group: { _id: '$stage', count: { $sum: 1 } } }]),
  ]);

  const status = Object.fromEntries(statusCounts.map((s) => [s._id, s.count]));
  const agg = scoreAgg[0] || { count: 0, avgScore: 0, maxScore: 0, avgPercentage: 0, maxPercentage: 0, passed: 0 };
  const r2 = (n) => Math.round((n || 0) * 100) / 100;
  const labels = ['0-10', '10-20', '20-30', '30-40', '40-50', '50-60', '60-70', '70-80', '80-90', '90-100'];
  const bucketMap = Object.fromEntries(distribution.map((d) => [d._id, d.count]));
  const boundaries = [-1000, 10, 20, 30, 40, 50, 60, 70, 80, 90];

  res.json({
    success: true,
    data: {
      stats: {
        totalStudents: students,
        completed: status.COMPLETED || 0,
        ongoing: status.IN_PROGRESS || 0,
        terminated: status.TERMINATED || 0,
        evaluated: agg.count,
        averageScore: r2(agg.avgScore),
        highestScore: r2(agg.maxScore),
        averagePercentage: r2(agg.avgPercentage),
        highestPercentage: r2(agg.maxPercentage),
        passPercentage: agg.count ? r2((agg.passed / agg.count) * 100) : 0,
        passed: agg.passed,
      },
      scoreDistribution: labels.map((label, i) => ({ range: label, count: bucketMap[boundaries[i]] || 0 })),
      examPerformance: perExam.map((e) => ({ id: e._id, title: e.title, count: e.count, avgPercentage: r2(e.avgPercentage), passRate: r2((e.passed / e.count) * 100) })),
      universities: universities.map((u) => ({ name: u._id || 'Unknown', count: u.count, avgPercentage: r2(u.avgPercentage) })),
      recentResults: recent,
      dailyAttempts: daily.map((d) => ({ date: d._id, count: d.count })),
      questionBank: Object.fromEntries(questionCounts.map((q) => [q._id, q.count])),
      examinations: Object.fromEntries(examCounts.map((e) => [e._id, e.count])),
      pipeline: Object.fromEntries(['ONLINE_TEST', 'ROUND_2', 'FINAL_ROUND', 'SELECTED', 'REJECTED'].map((st) => [st, pipeline.filter((p) => (p._id || 'ONLINE_TEST') === st).reduce((a, p) => a + p.count, 0)])),
    },
  });
}
