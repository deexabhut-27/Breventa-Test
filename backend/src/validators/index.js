import mongoose from 'mongoose';
import { z } from 'zod';
import { CATEGORIES, DIFFICULTIES, STAGES, VIOLATION_TYPES } from '../config/constants.js';

const emptyToUndef = (schema) => z.preprocess((v) => (v === '' || v === null ? undefined : v), schema);

export const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid id');
export const idParams = z.object({ id: objectId });

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(200);
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

// Normalises "+91 98765-43210" -> "+919876543210".
export const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-().]/g, ''))
  .refine((v) => /^\+?[0-9]{10,15}$/.test(v), 'Enter a valid phone number (10-15 digits)');

// ---------- Admin auth ----------
export const adminLoginSchema = z.object({ email, password: z.string().min(1, 'Password is required').max(128) });
export const profileSchema = z.object({ name: z.string().trim().min(2).max(120), email });
export const passwordChangeSchema = z
  .object({ currentPassword: z.string().min(1), newPassword: password })
  .refine((d) => d.currentPassword !== d.newPassword, { message: 'New password must differ from the current one', path: ['newPassword'] });
// Every administrator has full access, so only identity and status are editable.
export const createAdminSchema = z.object({ name: z.string().trim().min(2).max(120), email, password });
export const updateAdminSchema = z.object({ name: z.string().trim().min(2).max(120), email, isActive: z.boolean() });
export const resetAdminPasswordSchema = z.object({ password });
export const adminStatusSchema = z.object({ isActive: z.boolean() });

// ---------- Questions ----------
export const questionSchema = z.object({
  text: z.string().trim().min(5, 'Question text is too short').max(4000),
  options: z.array(z.string().trim().min(1, 'Options cannot be empty').max(1000)).length(4, 'Exactly four options are required'),
  correctOptionIndex: z.preprocess((v) => (v === null || v === '' ? undefined : v), z.coerce.number({ invalid_type_error: 'Select the correct answer' }).int().min(0).max(3)),
  explanation: z.string().trim().max(4000).optional().default(''),
  category: z.enum(CATEGORIES),
  difficulty: z.enum(DIFFICULTIES),
  marks: z.coerce.number().min(0).max(100).default(1),
  negativeMarks: z.coerce.number().min(0).max(100).default(0),
  isActive: z.boolean().default(true),
}).refine((q) => new Set(q.options.map((o) => o.toLowerCase())).size === 4, { message: 'Options must be unique', path: ['options'] });

export const questionStatusSchema = z.object({ isActive: z.boolean() });

export const questionListSchema = z.object({
  search: emptyToUndef(z.string().trim().max(200).optional()),
  category: emptyToUndef(z.enum(CATEGORIES).optional()),
  difficulty: emptyToUndef(z.enum(DIFFICULTIES).optional()),
  status: emptyToUndef(z.enum(['active', 'inactive']).optional()),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'difficulty', 'category', 'marks']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const questionExportSchema = questionListSchema.extend({ format: z.enum(['xlsx', 'csv']).default('xlsx') });

// ---------- Examinations ----------
const count = z.coerce.number().int().min(0).max(1000);
const examBase = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(4000).optional().default(''),
  instructions: z.string().trim().max(10000).optional().default(''),
  durationMinutes: z.coerce.number().int().min(1).max(600),
  distribution: z.object({ easy: count, medium: count, hard: count }),
  categories: z.array(z.enum(CATEGORIES)).min(1, 'Select at least one category'),
  markingScheme: z.enum(['EXAM', 'QUESTION']).default('EXAM'),
  marksPerQuestion: z.coerce.number().min(0).max(100).default(1),
  negativeMarking: z.object({ enabled: z.boolean(), marks: z.coerce.number().min(0).max(100).default(0) }),
  startAt: emptyToUndef(z.coerce.date().optional()),
  endAt: emptyToUndef(z.coerce.date().optional()),
  passPercentage: z.coerce.number().min(0).max(100).default(40),
  violationPolicy: z.object({
    mode: z.enum(['STRICT', 'WARNING']),
    warningsAllowed: z.coerce.number().int().min(1).max(10).default(1),
    heartbeatTimeoutSeconds: z.coerce.number().int().min(15).max(600).default(45),
    disconnectAction: z.enum(['FLAG', 'TERMINATE']).default('FLAG'),
    maxDisconnectSeconds: z.coerce.number().int().min(30).max(7200).default(300),
  }),
  maxAttempts: z.coerce.number().int().min(1).max(10).default(1),
});

export const examSchema = examBase
  .refine((e) => e.distribution.easy + e.distribution.medium + e.distribution.hard > 0, {
    message: 'The examination must include at least one question',
    path: ['distribution'],
  })
  .refine((e) => !e.startAt || !e.endAt || e.endAt > e.startAt, { message: 'End must be after start', path: ['endAt'] })
  .refine((e) => e.violationPolicy.disconnectAction !== 'TERMINATE' || e.violationPolicy.maxDisconnectSeconds > e.violationPolicy.heartbeatTimeoutSeconds, {
    message: 'Disconnect termination time must exceed the heartbeat timeout',
    path: ['violationPolicy', 'maxDisconnectSeconds'],
  });

export const examListSchema = z.object({
  status: emptyToUndef(z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']).optional()),
  search: emptyToUndef(z.string().trim().max(200).optional()),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ---------- Students ----------
export const registrationSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name is required')
    .max(120)
    .regex(/^[\p{L}][\p{L}\s.'-]*$/u, 'Name may contain letters, spaces, apostrophes, dots and hyphens only'),
  universityName: z.string().trim().min(2, 'University name is required').max(200),
  phone,
  email,
  enrollmentNumber: emptyToUndef(
    z.string().trim().max(50).regex(/^[A-Za-z0-9/_-]+$/, 'Enrollment number may contain letters, digits, /, _ and - only').optional(),
  ),
});

export const studentUpdateSchema = registrationSchema;

export const studentLoginSchema = z.object({ email, phone });

export const studentListSchema = z.object({
  exam: emptyToUndef(objectId.optional()),
  search: emptyToUndef(z.string().trim().max(200).optional()),
  university: emptyToUndef(z.string().trim().max(200).optional()),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------- Examination engine ----------
const responseItem = z.object({
  index: z.coerce.number().int().min(0).max(1000),
  selectedOption: z.number().int().min(0).max(3).nullable().default(null),
  markedForReview: z.boolean().default(false),
  seq: z.number().int().positive(),
});

export const startSchema = z.object({ acceptInstructions: z.literal(true, { errorMap: () => ({ message: 'You must accept the examination instructions' }) }) });
export const responseParams = z.object({ index: z.coerce.number().int().min(0).max(1000) });
export const responseSchema = responseItem.omit({ index: true });
export const pendingSchema = z.array(responseItem).max(1000).optional().default([]);
export const violationSchema = z.object({
  type: z.enum(VIOLATION_TYPES),
  reason: z.string().trim().max(500).optional(),
  eventId: z.string().trim().max(100).optional(),
  clientAt: emptyToUndef(z.coerce.date().optional()),
  pendingResponses: pendingSchema,
});
export const submitSchema = z.object({ pendingResponses: pendingSchema });
export const beaconSchema = z.object({
  token: z.string().min(10).max(4000),
  sessionId: z.string().min(10).max(100),
  kind: z.enum(['violation', 'unload']),
  type: z.enum(VIOLATION_TYPES).optional(),
  reason: z.string().trim().max(500).optional(),
  eventId: z.string().trim().max(100).optional(),
  pendingResponses: pendingSchema,
});

export const terminateSchema = z.object({ reason: z.string().trim().min(3).max(500) });

// ---------- Selection pipeline ----------
export const candidateListSchema = z.object({
  exam: emptyToUndef(objectId.optional()),
  stage: emptyToUndef(z.enum(STAGES).optional()),
  search: emptyToUndef(z.string().trim().max(200).optional()),
  minPercentage: emptyToUndef(z.coerce.number().min(-1000).max(100).optional()),
  sort: z.enum(['score', 'recent', 'name']).default('score'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const liveSchema = candidateListSchema;
export const shortlistSchema = z.object({
  exam: objectId,
  minPercentage: z.coerce.number().min(0, 'Cut-off cannot be negative').max(100),
  topN: emptyToUndef(z.coerce.number().int().min(1).max(10000).optional()),
  includeTerminated: z.boolean().default(false),
  note: z.string().trim().max(1000).optional(),
});
export const notesUpdateSchema = z.object({
  html: z.string().max(50000, 'Notes are too long'),
  baseVersion: z.number().int().min(0),
  force: z.boolean().default(false),
});
export const decisionSchema = z.object({
  decision: z.enum(['ADVANCE', 'REJECT', 'REVERT']),
  expectedStage: z.enum(STAGES),
  note: z.string().trim().max(4000).optional(),
});
export const activitySchema = z.object({
  exam: emptyToUndef(objectId.optional()),
  since: emptyToUndef(z.coerce.date().optional()),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
