import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ISSUER = 'placement-exam';

export function signAdminToken(admin) {
  return jwt.sign({ sub: String(admin._id), role: admin.role, typ: 'admin' }, env.JWT_SECRET, {
    expiresIn: env.ADMIN_JWT_EXPIRES_IN,
    issuer: ISSUER,
    audience: 'admin',
  });
}

export function signStudentToken(student) {
  return jwt.sign(
    { sub: String(student._id), exam: String(student.examination), role: 'STUDENT', typ: 'student' },
    env.JWT_SECRET,
    { expiresIn: env.STUDENT_JWT_EXPIRES_IN, issuer: ISSUER, audience: 'student' },
  );
}

export function verifyToken(token, audience) {
  return jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER, audience, algorithms: ['HS256'] });
}
