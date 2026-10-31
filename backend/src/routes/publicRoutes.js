import { Router } from 'express';
import { continueRegistration, getPublicExam, listOpenExams, register } from '../controllers/publicController.js';
import { registrationLimiter } from '../middleware/rateLimiters.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { registrationSchema, studentLoginSchema } from '../validators/index.js';
import { z } from 'zod';

const slug = validate({ params: z.object({ slug: z.string().trim().min(3).max(80).regex(/^[a-z0-9-]+$/i) }) });
const router = Router();

router.get('/exams', h(listOpenExams));
router.get('/exams/:slug', slug, h(getPublicExam));
router.post('/exams/:slug/register', registrationLimiter, slug, validate({ body: registrationSchema }), h(register));
router.post('/exams/:slug/continue', registrationLimiter, slug, validate({ body: studentLoginSchema }), h(continueRegistration));

export default router;
