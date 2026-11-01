import mongoose from 'mongoose';
import { STAGES } from '../config/constants.js';

/** Notes and decisions on a candidate, shown as a timeline and used for live activity updates. */
const candidateNoteSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    examination: { type: mongoose.Schema.Types.ObjectId, ref: 'Examination', required: true },
    type: { type: String, enum: ['NOTE', 'DECISION'], required: true },
    stage: { type: String, enum: STAGES, required: true }, // stage the candidate was in when written
    fromStage: { type: String, enum: STAGES },
    toStage: { type: String, enum: STAGES },
    // NOTE: sanitised rich text (HTML). DECISION: plain sentence describing the move.
    text: { type: String, trim: true, maxlength: 20000, default: '' },
    plain: { type: String, maxlength: 400, default: '' }, // preview text for cards and the activity feed
    author: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
      name: { type: String, required: true },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

candidateNoteSchema.index({ student: 1, createdAt: -1 });
candidateNoteSchema.index({ examination: 1, createdAt: -1 });
candidateNoteSchema.index({ createdAt: -1 });

export const CandidateNote = mongoose.model('CandidateNote', candidateNoteSchema);
