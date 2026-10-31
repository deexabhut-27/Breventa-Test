import { AuditLog } from '../models/index.js';
import { logger } from '../utils/logger.js';

/** Audit logging must never break the request that triggered it. */
export async function audit({ actorType, actorId, action, entityType, entityId, details, ip }) {
  try {
    await AuditLog.create({ actorType, actorId, action, entityType, entityId, details, ip });
  } catch (err) {
    logger.error({ err, action }, 'Failed to write audit log');
  }
}
