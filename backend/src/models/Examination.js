import mongoose from 'mongoose';
import { CATEGORIES, EXAM_STATUS } from '../config/constants.js';

const examinationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 4000, default: '' },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    instructions: { type: String, trim: true, maxlength: 10000, default: '' },
    durationMinutes: { type: Number, required: true, min: 1, max: 600 },
    distribution: {
      easy: { type: Number, default: 30, min: 0 },
      medium: { type: Number, default: 20, min: 0 },
      hard: { type: Number, default: 10, min: 0 },
    },
    totalQuestions: { type: Number, min: 1 },
    categories: {
      type: [{ type: String, enum: CATEGORIES }],
      validate: { validator: (v) => v.length > 0, message: 'Select at least one category' },
      default: () => [...CATEGORIES],
    },
    // EXAM: every question carries marksPerQuestion / negativeMarking.marks.
    // QUESTION: each question's own marks / negativeMarks are used.
    markingScheme: { type: String, enum: ['EXAM', 'QUESTION'], default: 'EXAM' },
    marksPerQuestion: { type: Number, default: 1, min: 0, max: 100 },
    negativeMarking: {
      enabled: { type: Boolean, default: false },
      marks: { type: Number, default: 0.25, min: 0, max: 100 },
    },
    startAt: Date,
    endAt: Date,
    passPercentage: { type: Number, default: 40, min: 0, max: 100 },
    violationPolicy: {
      mode: { type: String, enum: ['STRICT', 'WARNING'], default: 'STRICT' },
      // Number of warnings in WARNING mode; termination happens on violation warningsAllowed + 1.
      warningsAllowed: { type: Number, default: 1, min: 1, max: 10 },
      heartbeatTimeoutSeconds: { type: Number, default: 45, min: 15, max: 600 },
      // FLAG only records a lost connection; TERMINATE ends the attempt after maxDisconnectSeconds.
      disconnectAction: { type: String, enum: ['FLAG', 'TERMINATE'], default: 'FLAG' },
      maxDisconnectSeconds: { type: Number, default: 300, min: 30, max: 7200 },
    },
    maxAttempts: { type: Number, default: 1, min: 1, max: 10 },
    status: { type: String, enum: Object.values(EXAM_STATUS), default: EXAM_STATUS.DRAFT },
    publishedAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true },
);

examinationSchema.pre('validate', function computeTotal(next) {
  const d = this.distribution || {};
  this.totalQuestions = (d.easy || 0) + (d.medium || 0) + (d.hard || 0);
  if (this.totalQuestions < 1) this.invalidate('distribution', 'The examination must contain at least one question');
  if (this.startAt && this.endAt && this.endAt <= this.startAt) {
    this.invalidate('endAt', 'End date/time must be after the start date/time');
  }
  next();
});

examinationSchema.index({ status: 1, createdAt: -1 });

export const Examination = mongoose.model('Examination', examinationSchema);
