import mongoose from 'mongoose';
import { ATTEMPT_STATUS, SUBMISSION_TYPES } from '../config/constants.js';

const bucketSchema = new mongoose.Schema(
  {
    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    correct: { type: Number, default: 0 },
    incorrect: { type: Number, default: 0 },
    unanswered: { type: Number, default: 0 },
  },
  { _id: false },
);

const resultSchema = new mongoose.Schema(
  {
    attempt: { type: mongoose.Schema.Types.ObjectId, ref: 'Attempt', required: true, unique: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    examination: { type: mongoose.Schema.Types.ObjectId, ref: 'Examination', required: true },
    // Denormalised for fast filtering, sorting and exporting.
    studentName: String,
    universityName: String,
    email: String,
    phone: String,
    enrollmentNumber: String,
    examTitle: String,
    status: { type: String, enum: [ATTEMPT_STATUS.COMPLETED, ATTEMPT_STATUS.TERMINATED], required: true },
    submissionType: { type: String, enum: SUBMISSION_TYPES },
    terminationReason: String,
    // Copied from the attempt: an administrator allowed the student to retake the examination.
    retakeAllowedAt: Date,
    startedAt: Date,
    endedAt: Date,
    durationUsedSeconds: Number,
    totalQuestions: Number,
    attempted: Number,
    correct: Number,
    incorrect: Number,
    unanswered: Number,
    maxScore: Number,
    totalScore: Number,
    percentage: Number,
    passPercentage: Number,
    passed: Boolean,
    violationCount: Number,
    scores: {
      easy: bucketSchema,
      medium: bucketSchema,
      hard: bucketSchema,
      aptitude: bucketSchema,
      reasoning: bucketSchema,
    },
    categoryScores: [{ category: String, ...bucketSchema.obj }],
    evaluatedAt: Date,
  },
  { timestamps: true },
);

resultSchema.index({ student: 1, endedAt: -1 });
resultSchema.index({ examination: 1, totalScore: -1 });
resultSchema.index({ universityName: 1 });
resultSchema.index({ status: 1, passed: 1 });
resultSchema.index({ endedAt: -1 });
resultSchema.index({ email: 1 });
resultSchema.index({ phone: 1 });

export const Result = mongoose.model('Result', resultSchema);
