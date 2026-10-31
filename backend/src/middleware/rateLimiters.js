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
export const globalLimiter = rateLimit({ ...common, windowMs: 60 * 1000, limit: 3000 });

export const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email || '').toLowerCase()}`,
});

export const registrationLimiter = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 600 });

export const studentLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 240,
  keyGenerator: (req) => (req.student ? `student:${req.student._id}` : req.ip),
});
