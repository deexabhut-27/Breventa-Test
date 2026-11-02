import express, { Router } from 'express';
import * as exam from '../controllers/studentExamController.js';
import { requireStudent } from '../middleware/auth.js';
import { studentLimiter } from '../middleware/rateLimiters.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { responseParams, responseSchema, startSchema, submitSchema, heartbeatSchema, violationSchema } from '../validators/index.js';

const router = Router();

// sendBeacon posts text/plain (a CORS-safelisted type) with the token in the body.
router.post('/beacon', express.text({ type: '*/*', limit: '256kb' }), h(exam.beacon));

router.use(h(requireStudent), studentLimiter);
router.get('/me', h(exam.me));
router.post('/attempt/start', validate({ body: startSchema }), h(exam.start));
router.get('/attempt', h(exam.current));
router.put('/attempt/responses/:index', validate({ params: responseParams, body: responseSchema }), h(exam.answer));
router.post('/attempt/heartbeat', validate({ body: heartbeatSchema }), h(exam.heartbeat));
router.post('/attempt/violations', validate({ body: violationSchema }), h(exam.violation));
router.post('/attempt/submit', validate({ body: submitSchema }), h(exam.submit));

export default router;
