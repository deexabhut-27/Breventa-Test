import mongoose from 'mongoose';

const studentResponseSchema = new mongoose.Schema(
  {
    attempt: { type: mongoose.Schema.Types.ObjectId, ref: 'Attempt', required: true },
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    questionIndex: { type: Number, required: true, min: 0 },
    // Index into the ORIGINAL question options (after reversing the shuffle). null = no answer.
    selectedOption: { type: Number, min: 0, max: 3, default: null },
    // Position the student actually clicked in their shuffled view.
    displayedOption: { type: Number, min: 0, max: 3, default: null },
    markedForReview: { type: Boolean, default: false },
    visited: { type: Boolean, default: true },
    // Monotonic client sequence; stale (out-of-order) writes are discarded.
    seq: { type: Number, required: true, default: 0 },
    answeredAt: Date,
  },
  { timestamps: true },
);

studentResponseSchema.index({ attempt: 1, question: 1 }, { unique: true });
studentResponseSchema.index({ attempt: 1, questionIndex: 1 });

export const StudentResponse = mongoose.model('StudentResponse', studentResponseSchema);
