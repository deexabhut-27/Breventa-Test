import mongoose from 'mongoose';

/** Universities students pick from when registering. Managed by admins. */
const universitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    // Lower-cased name, so "ABC University" and "abc university" cannot both be added.
    key: { type: String, required: true, unique: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

universitySchema.pre('validate', function setKey() {
  if (this.name) this.key = this.name.trim().replace(/\s+/g, ' ').toLowerCase();
});

universitySchema.index({ isActive: 1, name: 1 });

export const University = mongoose.model('University', universitySchema);
