import mongoose from 'mongoose';
import { Attempt, Result, Student } from '../models/index.js';
import { audit } from '../services/auditService.js';
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
      { $lookup: { from: 'results', localField: '_id', foreignField: 'student', as: 'result', pipeline: [{ $sort: { endedAt: -1 } }, { $limit: 1 }, { $project: { percentage: 1, passed: 1, totalScore: 1 } }] } },
      { $addFields: { exam: { $first: '$exam' }, attempt: { $first: '$attempt' }, result: { $first: '$result' } } },
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

  const or = [{ email }, { phone }];
  if (enrollmentNumber) or.push({ enrollmentNumber });
  const clash = await Student.findOne({ examination: student.examination, _id: { $ne: student._id }, $or: or }).lean();
  if (clash) {
    const field = clash.email === email ? 'email address' : clash.phone === phone ? 'phone number' : 'enrollment number';
    throw AppError.conflict(`Another student in this examination already uses this ${field}`, 'ALREADY_REGISTERED');
  }

  const before = { fullName: student.fullName, universityName: student.universityName, phone: student.phone, email: student.email, enrollmentNumber: student.enrollmentNumber };
  student.set({ fullName, universityName, phone, email, enrollmentNumber: enrollmentNumber || undefined });
  await student.save();
  // Results keep a denormalised copy for fast filtering and exports.
  await Result.updateMany(
    { student: student._id },
    { $set: { studentName: fullName, universityName, phone, email, enrollmentNumber: enrollmentNumber || undefined } },
  );
  await audit({ actorType: 'ADMIN', actorId: req.admin._id, action: 'STUDENT_UPDATED', entityType: 'Student', entityId: student._id, details: { before }, ip: req.ip });
  res.json({ success: true, data: student });
}

export async function deleteStudent(req, res) {
  const student = await Student.findById(req.params.id);
  if (!student) throw AppError.notFound('Student not found');
  const removed = await deleteStudents([student._id]);
  await audit({
    actorType: 'ADMIN',
    actorId: req.admin._id,
    action: 'STUDENT_DELETED',
    entityType: 'Student',
    details: { email: student.email, fullName: student.fullName, ...removed },
    ip: req.ip,
  });
  res.json({ success: true, data: { id: student._id, removed } });
}
