import mongoose from 'mongoose';
import { ATTEMPT_STATUS, CATEGORIES, DIFFICULTIES, SUBMISSION_TYPES, VIOLATION_TYPES } from '../config/constants.js';

const attemptQuestionSchema = new mongoose.Schema(
  {
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    difficulty: { type: String, enum: DIFFICULTIES, required: true },
    category: { type: String, enum: CATEGORIES, required: true },
    marks: { type: Number, required: true },
    negativeMarks: { type: Number, required: true },
    // optionOrder[displayedPosition] = original option index
    optionOrder: { type: [Number], required: true },
  },
  { _id: false },
);

const violationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: VIOLATION_TYPES, required: true },
    counted: { type: Boolean, default: false },
    reason: String,
    eventId: String,
    at: { type: Date, default: Date.now },
    clientAt: Date,
    source: { type: String, enum: ['CLIENT', 'BEACON', 'SERVER'], default: 'CLIENT' },
  },
  { _id: false },
);

const attemptSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    examination: { type: mongoose.Schema.Types.ObjectId, ref: 'Examination', required: true },
    attemptNumber: { type: Number, required: true, min: 1 },
    status: { type: String, enum: Object.values(ATTEMPT_STATUS), default: ATTEMPT_STATUS.IN_PROGRESS },
    submissionType: { type: String, enum: SUBMISSION_TYPES },
    startedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    endedAt: Date,
    questions: { type: [attemptQuestionSchema], required: true },
    // Snapshot of the policy at start, so later edits to the exam never change running attempts.
    policy: {
      mode: { type: String, enum: ['STRICT', 'WARNING'], required: true },
      maxViolations: { type: Number, required: true },
      heartbeatTimeoutSeconds: { type: Number, required: true },
      disconnectAction: { type: String, enum: ['FLAG', 'TERMINATE'], required: true },
      maxDisconnectSeconds: { type: Number, required: true },
      passPercentage: { type: Number, required: true },
    },
    sessionId: { type: String, select: false },
    sessionStartedAt: Date,
    lastHeartbeatAt: Date,
    connectionState: { type: String, enum: ['ONLINE', 'DISCONNECTED'], default: 'ONLINE' },
    violations: { type: [violationSchema], default: [] },
    violationCount: { type: Number, default: 0 },
    // Copy attempts are tracked separately from the tab-switch policy (see COPY_WARNINGS_ALLOWED).
    copyCount: { type: Number, default: 0 },
    // Set while the examination page is hidden; cleared when the student comes back.
    awaySince: Date,
    awayEventId: String,
    terminationReason: String,
    // Set when an administrator lets the student retake a terminated attempt. The attempt stays
    // as history but no longer blocks a new start or counts toward maxAttempts.
    retakeAllowedAt: Date,
    retakeAllowedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    evaluated: { type: Boolean, default: false },
    ipAddress: String,
    userAgent: String,
  },
  { timestamps: true },
);

attemptSchema.index({ student: 1, examination: 1, attemptNumber: 1 }, { unique: true });
// At most one running attempt per student per examination (guards concurrent START requests).
attemptSchema.index(
  { student: 1, examination: 1 },
  { unique: true, partialFilterExpression: { status: ATTEMPT_STATUS.IN_PROGRESS }, name: 'one_active_attempt' },
);
attemptSchema.index({ status: 1, expiresAt: 1 });
attemptSchema.index({ status: 1, evaluated: 1 });
attemptSchema.index({ examination: 1, status: 1 });

export const Attempt = mongoose.model('Attempt', attemptSchema);
