import mongoose from 'mongoose';
import { ACTIVE_STAGES, STAGES } from '../config/constants.js';

const studentSchema = new mongoose.Schema(
  {
    examination: { type: mongoose.Schema.Types.ObjectId, ref: 'Examination', required: true },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    universityName: { type: String, required: true, trim: true, maxlength: 200 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 200 },
    enrollmentNumber: { type: String, trim: true, maxlength: 50 },
    ipAddress: String,
    userAgent: String,
    // Latest evaluated result, copied here so candidate lists never have to search the results collection.
    latestResult: {
      type: new mongoose.Schema(
        {
          result: { type: mongoose.Schema.Types.ObjectId, ref: 'Result' },
          percentage: Number,
          totalScore: Number,
          maxScore: Number,
          passed: Boolean,
          status: String,
          correct: Number,
          incorrect: Number,
          unanswered: Number,
          endedAt: Date,
          examTitle: String,
        },
        { _id: false },
      ),
      default: undefined,
    },
    // Selection pipeline after the online test.
    stage: { type: String, enum: STAGES, default: 'ONLINE_TEST' },
    rejectedAtStage: { type: String, enum: ACTIVE_STAGES },
    stageUpdatedAt: Date,
    stageUpdatedBy: { id: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }, name: String },
    noteCount: { type: Number, default: 0 },
    // One shared, auto-saved rich-text note per candidate. `version` guards against overwriting
    // another admin's edits made at the same time.
    notes: {
      html: { type: String, default: '', maxlength: 50000 },
      plain: { type: String, default: '', maxlength: 400 },
      version: { type: Number, default: 0 },
      updatedAt: Date,
      updatedBy: { id: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }, name: String },
    },
    // true while the candidate sits in Round 2 only because they passed the online test (not moved by a person).
    autoQualified: { type: Boolean, default: false },
    // set when a person moves the candidate back to the online test: automatic qualification then leaves them alone.
    autoHold: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// A student may register only once per examination, by email, phone, or enrollment number.
studentSchema.index({ examination: 1, email: 1 }, { unique: true });
studentSchema.index({ examination: 1, phone: 1 }, { unique: true });
studentSchema.index(
  { examination: 1, enrollmentNumber: 1 },
  { unique: true, partialFilterExpression: { enrollmentNumber: { $type: 'string' } } },
);
studentSchema.index({ universityName: 1 });
studentSchema.index({ createdAt: -1 });
studentSchema.index({ examination: 1, stage: 1, 'latestResult.percentage': -1 });
studentSchema.index({ stage: 1, 'latestResult.percentage': -1 });
studentSchema.index({ stageUpdatedAt: -1 });

export const Student = mongoose.model('Student', studentSchema);
