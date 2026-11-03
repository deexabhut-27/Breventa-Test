import mongoose from 'mongoose';
import { Attempt, Result, Student } from '../models/index.js';
import { phoneMatch } from '../validators/index.js';
import { studentCache } from '../services/cache.js';
import { deleteStudents } from '../services/deletionService.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegex, pageMeta } from '../utils/helpers.js';

export async function listStudents(req, res) {
  const q = req.valid.query;
  const match = {};
  if (q.exam) match.examination = new mongoose.Types.ObjectId(q.exam);
  if (q.university) match.universityName = { $regex: escapeRegex(q.university), $options: 'i' };
  if (q.search) {
    const rx = { $regex: escapeRegex(q.search), $options: 'i' };
    match.$or = [{ fullName: rx }, { email: rx }, { phone: rx }, { enrollmentNumber: rx }, { universityName: rx }];
  }
  const [items, total] = await Promise.all([
    Student.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $skip: (q.page - 1) * q.limit },
      { $limit: q.limit },
      { $lookup: { from: 'examinations', localField: 'examination', foreignField: '_id', as: 'exam', pipeline: [{ $project: { title: 1 } }] } },
      {
        $lookup: {
          from: 'attempts',
          localField: '_id',
          foreignField: 'student',
          as: 'attempt',
          pipeline: [{ $sort: { attemptNumber: -1 } }, { $limit: 1 }, { $project: { status: 1, startedAt: 1, endedAt: 1, violationCount: 1 } }],
        },
      },
      { $addFields: { exam: { $first: '$exam' }, attempt: { $first: '$attempt' }, result: '$latestResult' } },
      { $project: { latestResult: 0, 'notes.html': 0 } },
    ]),
    Student.countDocuments(match),
  ]);
  res.json({ success: true, data: items, meta: pageMeta(total, q.page, q.limit) });
}

export async function getStudent(req, res) {
  const student = await Student.findById(req.params.id).populate('examination', 'title slug');
  if (!student) throw AppError.notFound('Student not found');
  const [attempts, results] = await Promise.all([
    Attempt.find({ student: student._id }).select('-questions').sort({ attemptNumber: 1 }).lean(),
    Result.find({ student: student._id }).sort({ endedAt: 1 }).lean(),
  ]);
  res.json({ success: true, data: { student, attempts, results } });
}

export async function updateStudent(req, res) {
  const student = await Student.findById(req.params.id);
  if (!student) throw AppError.notFound('Student not found');
  const { fullName, universityName, phone, email, enrollmentNumber } = req.body;

  const or = [{ email }, { phone: phoneMatch(phone) }];
  if (enrollmentNumber) or.push({ enrollmentNumber });
  const clash = await Student.findOne({ examination: student.examination, _id: { $ne: student._id }, $or: or }).lean();
  if (clash) {
    const field = clash.email === email ? 'email address' : clash.phone.endsWith(phone) ? 'phone number' : 'enrollment number';
    throw AppError.conflict(`Another student in this examination already uses this ${field}`, 'ALREADY_REGISTERED');
  }

  student.set({ fullName, universityName, phone, email, enrollmentNumber: enrollmentNumber || undefined });
  await student.save();
  // Results keep a denormalised copy for fast filtering and exports.
  await Result.updateMany(
    { student: student._id },
    { $set: { studentName: fullName, universityName, phone, email, enrollmentNumber: enrollmentNumber || undefined } },
  );
  studentCache.delete(student._id);
  res.json({ success: true, data: student });
}

export async function deleteStudent(req, res) {
  const student = await Student.findById(req.params.id);
  if (!student) throw AppError.notFound('Student not found');
  const removed = await deleteStudents([student._id]);
  studentCache.delete(student._id);
  res.json({ success: true, data: { id: student._id, removed } });
}
