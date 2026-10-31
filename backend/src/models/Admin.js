import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { PERMISSIONS } from '../config/constants.js';

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 200 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['SUPER_ADMIN', 'ADMIN'], default: 'ADMIN' },
    // Ignored for SUPER_ADMIN, who always has full access.
    permissions: { type: [{ type: String, enum: PERMISSIONS }], default: () => [...PERMISSIONS] },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
    passwordChangedAt: Date,
  },
  { timestamps: true },
);

adminSchema.methods.setPassword = async function setPassword(password) {
  this.passwordHash = await bcrypt.hash(password, 12);
  this.passwordChangedAt = new Date();
};

adminSchema.methods.verifyPassword = function verifyPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

adminSchema.methods.can = function can(permission) {
  return this.role === 'SUPER_ADMIN' || this.permissions.includes(permission);
};

adminSchema.methods.effectivePermissions = function effectivePermissions() {
  return this.role === 'SUPER_ADMIN' ? [...PERMISSIONS] : [...this.permissions];
};

adminSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    if (ret.role === 'SUPER_ADMIN') ret.permissions = [...PERMISSIONS];
    delete ret.__v;
    return ret;
  },
});

export const Admin = mongoose.model('Admin', adminSchema);
