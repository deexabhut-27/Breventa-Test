import bcrypt from 'bcryptjs';
import { Admin } from '../models/index.js';
import { PERMISSIONS } from '../config/constants.js';
import { logger } from '../utils/logger.js';

/**
 * Admins can be added by hand in MongoDB (e.g. Atlas "Insert Document") with a plain
 * `password` field. Such documents are converted here: the password is bcrypt-hashed,
 * missing fields get safe defaults, and the plain-text password is removed.
 * Runs at server start and, lazily, on login for the email being used.
 */
export async function hashManuallyAddedAdmins(email) {
  const filter = { password: { $exists: true } };
  if (email) filter.email = { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
  const docs = await Admin.collection.find(filter).toArray();
  let converted = 0;
  for (const doc of docs) {
    const plain = doc.password == null ? '' : String(doc.password);
    if (plain.length < 8 || !doc.email) {
      logger.warn({ email: doc.email }, 'Manually added admin skipped: needs an email and a password of at least 8 characters');
      continue;
    }
    const role = 'SUPER_ADMIN'; // every administrator has full access
    const permissions = Array.isArray(doc.permissions) ? doc.permissions.filter((p) => PERMISSIONS.includes(p)) : [...PERMISSIONS];
    const now = new Date();
    await Admin.collection.updateOne(
      { _id: doc._id, password: { $exists: true } },
      {
        $set: {
          email: String(doc.email).trim().toLowerCase(),
          name: doc.name ? String(doc.name).trim() : String(doc.email).split('@')[0],
          passwordHash: await bcrypt.hash(plain, 12),
          passwordChangedAt: now,
          role,
          permissions,
          isActive: doc.isActive !== false,
          createdAt: doc.createdAt || now,
          updatedAt: now,
        },
        $unset: { password: '' },
      },
    );
    converted += 1;
    logger.info({ email: doc.email, role }, 'Manually added admin activated (password hashed)');
  }
  return converted;
}
