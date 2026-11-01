import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const common = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: (_req, res) =>
    res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' } }),
};

// Whole universities often sit behind a single NAT IP, so IP-keyed limits stay generous
// and per-student limits are applied after authentication instead.
// Student exam traffic is excluded here: a whole campus can share one IP, and students are
// limited individually by `studentLimiter` after sign-in.
export const globalLimiter = rateLimit({ ...common, windowMs: 60 * 1000, limit: 3000, skip: (req) => env.isTest || req.path.startsWith('/student/') });

export const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email || '').toLowerCase()}`,
});

export const registrationLimiter = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 3000 }); // generous: shared campus IPs

export const studentLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 240,
  keyGenerator: (req) => (req.student ? `student:${req.student._id}` : req.ip),
});
