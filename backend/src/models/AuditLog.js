import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    actorType: { type: String, enum: ['ADMIN', 'STUDENT', 'SYSTEM'], required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId },
    action: { type: String, required: true },
    entityType: String,
    entityId: { type: mongoose.Schema.Types.ObjectId },
    details: mongoose.Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
