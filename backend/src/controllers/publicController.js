import { Examination, Student } from '../models/index.js';
import { EXAM_STATUS } from '../config/constants.js';
import { activeUniversityNames } from './universityController.js';
import { publicExamView } from '../services/examService.js';
import { signStudentToken } from '../services/tokenService.js';
import { studentCache } from '../services/cache.js';
import { AppError } from '../utils/AppError.js';
import { isDuplicateKeyError } from '../utils/helpers.js';
import { phoneMatch } from '../validators/index.js';

async function findPublicExam(slug) {
  const exam = await Examination.findOne({ slug: String(slug).toLowerCase() });
  if (!exam || exam.status === EXAM_STATUS.DRAFT) throw AppError.notFound('Examination not found or not yet published', 'EXAM_NOT_FOUND');
  return exam;
}

function assertRegistrationOpen(exam) {
  if (exam.status !== EXAM_STATUS.PUBLISHED) throw AppError.forbidden('Registration for this examination is closed', 'EXAM_NOT_AVAILABLE');
  if (exam.endAt && new Date() > exam.endAt) throw AppError.forbidden('The examination window has closed', 'EXAM_CLOSED');
}

const studentView = (s) => ({
  id: s._id,
  fullName: s.fullName,
  universityName: s.universityName,
  email: s.email,
  phone: s.phone,
  enrollmentNumber: s.enrollmentNumber,
});

/** Examinations students can currently register for (shown on the public home page). */
export async function listOpenExams(_req, res) {
  const now = new Date();
  const exams = await Examination.find({ status: EXAM_STATUS.PUBLISHED, $or: [{ endAt: null }, { endAt: { $exists: false } }, { endAt: { $gt: now } }] })
    .select('title description slug durationMinutes totalQuestions startAt endAt')
    .sort({ startAt: 1, createdAt: -1 })
    .limit(50)
    .lean();
  res.json({ success: true, data: exams.map(({ _id, ...e }) => e), serverNow: now.toISOString() });
}

export async function getPublicExam(req, res) {
  const exam = await findPublicExam(req.params.slug);
  res.json({ success: true, data: { ...publicExamView(exam), serverNow: new Date().toISOString() } });
}

const loginResponse = (student) => ({ success: true, data: { token: signStudentToken(student), student: studentView(student), existing: true } });

export async function register(req, res) {
  const exam = await findPublicExam(req.params.slug);
  const { fullName, phone, email, enrollmentNumber } = req.body;
  let { universityName } = req.body;

  // Already registered with this email + phone? Log in to that profile instead (any number of
  // times, even after a terminated attempt or once registration has closed).
  const existing = await Student.findOne({ examination: exam._id, email, phone: phoneMatch(phone) });
  if (existing) return res.json(loginResponse(existing));
  assertRegistrationOpen(exam);

  // Once admins have added universities, students must pick one from that list.
  const allowed = await activeUniversityNames();
  if (allowed.length) {
    const wanted = universityName.trim().replace(/\s+/g, ' ').toLowerCase();
    const match = allowed.find((n) => n.toLowerCase() === wanted);
    if (!match) throw AppError.badRequest('Select your university from the list', 'INVALID_UNIVERSITY');
    universityName = match;
  }

  // One write: the unique indexes (exam + email / phone / enrollment) reject duplicates,
  // and the error says which field clashed. No separate lookup first.
  let student;
  try {
    student = await Student.create({
      examination: exam._id,
      fullName,
      universityName,
      phone,
      email,
      enrollmentNumber,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')?.slice(0, 300),
    });
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    const key = Object.keys(err.keyValue || err.keyPattern || {}).find((k) => k !== 'examination');
    const field = key === 'phone' ? 'phone number' : key === 'enrollmentNumber' ? 'enrollment number' : 'email address';
    throw AppError.conflict(
      `This ${field} is already registered for this examination with different details. Enter the same email address and phone number you registered with.`,
      'ALREADY_REGISTERED',
    );
  }
  studentCache.set(student._id, student.toObject()); // the next request (START) needs no lookup
  res.status(201).json({ success: true, data: { token: signStudentToken(student), student: studentView(student) } });
}

export async function continueRegistration(req, res) {
  const exam = await findPublicExam(req.params.slug);
  const { email, phone } = req.body;
  // Students can log back in any number of times, including after a terminated attempt
  // (the instructions page then explains why they cannot start).
  const student = await Student.findOne({ examination: exam._id, email, phone: phoneMatch(phone) });
  if (!student) {
    const clash = await Student.findOne({ examination: exam._id, $or: [{ email }, { phone: phoneMatch(phone) }] }).select('email').lean();
    if (clash) {
      const which = clash.email === email ? 'email address is registered with a different phone number' : 'phone number is registered with a different email address';
      throw AppError.conflict(`This ${which}. Enter the same email address and phone number you registered with.`, 'DETAILS_MISMATCH');
    }
    throw AppError.notFound('No registration matches this email and phone number for this examination', 'REGISTRATION_NOT_FOUND');
  }
  res.json(loginResponse(student));
}

export { studentView };
