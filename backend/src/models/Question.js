import mongoose from 'mongoose';
import { CATEGORIES, DIFFICULTIES } from '../config/constants.js';

const questionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 4000 },
    options: {
      type: [{ type: String, trim: true, maxlength: 1000 }],
      validate: {
        validator: (v) => Array.isArray(v) && v.length === 4 && v.every((o) => o && o.length > 0),
        message: 'Exactly four non-empty options are required',
      },
    },
    // Answer key is never selected by default, so it cannot leak through a generic query.
    correctOptionIndex: { type: Number, required: true, min: 0, max: 3, select: false },
    explanation: { type: String, trim: true, maxlength: 4000, default: '', select: false },
    category: { type: String, enum: CATEGORIES, required: true },
    difficulty: { type: String, enum: DIFFICULTIES, required: true },
    marks: { type: Number, default: 1, min: 0, max: 100 },
    negativeMarks: { type: Number, default: 0, min: 0, max: 100 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true },
);

questionSchema.index({ isActive: 1, difficulty: 1, category: 1 });
questionSchema.index({ text: 'text' });

export const Question = mongoose.model('Question', questionSchema);
