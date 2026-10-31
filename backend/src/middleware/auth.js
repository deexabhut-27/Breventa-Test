import { Admin, Student } from '../models/index.js';
import { verifyToken } from '../services/tokenService.js';
import { AppError } from '../utils/AppError.js';

function bearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

function decode(token, audience) {
  try {
    return verifyToken(token, audience);
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw AppError.unauthorized('Session expired, please sign in again', 'TOKEN_EXPIRED');
    throw AppError.unauthorized('Invalid authentication token', 'INVALID_TOKEN');
  }
}

export async function requireAdmin(req, _res, next) {
  const token = bearer(req);
  if (!token) return next(AppError.unauthorized());
  const payload = decode(token, 'admin');
  const admin = await Admin.findById(payload.sub).select('+passwordHash');
  if (!admin || !admin.isActive) return next(AppError.unauthorized('Account not found or disabled'));
  if (admin.passwordChangedAt && payload.iat * 1000 < admin.passwordChangedAt.getTime() - 1000) {
    return next(AppError.unauthorized('Password changed, please sign in again', 'TOKEN_REVOKED'));
  }
  req.admin = admin;
  return next();
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.admin || !roles.includes(req.admin.role)) return next(AppError.forbidden());
  return next();
};

/** Passes if the admin holds ANY of the given module permissions (SUPER_ADMIN always passes). */
export const requirePermission = (...permissions) => (req, _res, next) => {
  if (!req.admin || !permissions.some((p) => req.admin.can(p))) {
    return next(AppError.forbidden('You do not have access to this section. Ask a super admin to grant it.', 'NO_PERMISSION'));
  }
  return next();
};

export async function requireStudent(req, _res, next) {
  const token = bearer(req);
  if (!token) return next(AppError.unauthorized());
  const payload = decode(token, 'student');
  const student = await Student.findById(payload.sub);
  if (!student) return next(AppError.unauthorized('Registration not found'));
  req.student = student;
  return next();
}

/** Used by the sendBeacon endpoint, which cannot set headers. */
export async function studentFromRawToken(token) {
  const payload = decode(token, 'student');
  const student = await Student.findById(payload.sub);
  if (!student) throw AppError.unauthorized('Registration not found');
  return student;
}
