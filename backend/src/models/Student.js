import mongoose from 'mongoose';

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

export const Student = mongoose.model('Student', studentSchema);
