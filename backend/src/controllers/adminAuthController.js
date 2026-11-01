import { Admin } from '../models/index.js';
import { adminCache } from '../services/cache.js';
import { hashManuallyAddedAdmins } from '../services/adminProvisioning.js';
import { signAdminToken } from '../services/tokenService.js';
import { AppError } from '../utils/AppError.js';

export async function login(req, res) {
  const { email, password } = req.body;
  await hashManuallyAddedAdmins(email); // activates an admin inserted by hand in the database
  const admin = await Admin.findOne({ email }).select('+passwordHash');
  // Same message for unknown email and wrong password to avoid account enumeration.
  if (!admin || !admin.isActive || !admin.passwordHash || !(await admin.verifyPassword(password))) {
    throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }
  admin.lastLoginAt = new Date();
  await admin.save();
  res.json({ success: true, data: { token: signAdminToken(admin), admin: admin.toJSON() } });
}

export function me(req, res) {
  res.json({ success: true, data: req.admin.toJSON() });
}

export async function updateProfile(req, res) {
  const { name, email } = req.body;
  if (email !== req.admin.email && (await Admin.exists({ email, _id: { $ne: req.admin._id } }))) {
    throw AppError.conflict('Another administrator already uses this email', 'EMAIL_TAKEN');
  }
  req.admin.name = name;
  req.admin.email = email;
  await req.admin.save();
  adminCache.delete(req.admin._id);
  res.json({ success: true, data: req.admin.toJSON() });
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!(await req.admin.verifyPassword(currentPassword))) {
    throw AppError.badRequest('Current password is incorrect', 'INVALID_PASSWORD');
  }
  await req.admin.setPassword(newPassword);
  await req.admin.save();
  // Older tokens are now revoked (see requireAdmin); hand back a fresh one.
  adminCache.delete(req.admin._id);
  res.json({ success: true, data: { token: signAdminToken(req.admin) } });
}

export async function listAdmins(_req, res) {
  const admins = await Admin.find().sort({ createdAt: 1 });
  res.json({ success: true, data: admins });
}

export async function createAdmin(req, res) {
  const { name, email, password } = req.body;
  if (await Admin.exists({ email })) throw AppError.conflict('An administrator with this email already exists', 'EMAIL_TAKEN');
  // Every administrator has full access (one role).
  const admin = new Admin({ name, email, role: 'SUPER_ADMIN' });
  await admin.setPassword(password);
  await admin.save();
  res.status(201).json({ success: true, data: admin.toJSON() });
}

/** Refuses changes that would leave the system without an active SUPER_ADMIN. */
async function assertOtherSuperAdmin(target) {
  if (target.role !== 'SUPER_ADMIN' || !target.isActive) return;
  const others = await Admin.countDocuments({ _id: { $ne: target._id }, role: 'SUPER_ADMIN', isActive: true });
  if (!others) throw AppError.conflict('At least one active administrator must remain', 'LAST_SUPER_ADMIN');
}

async function findOther(req) {
  if (String(req.params.id) === String(req.admin._id)) {
    throw AppError.badRequest('You cannot disable or remove your own account. Ask another administrator.', 'SELF_CHANGE');
  }
  const admin = await Admin.findById(req.params.id);
  if (!admin) throw AppError.notFound('Administrator not found');
  return admin;
}

export async function updateAdmin(req, res) {
  const admin = await findOther(req);
  const { name, email, isActive } = req.body;
  if (!isActive) await assertOtherSuperAdmin(admin);
  if (email !== admin.email && (await Admin.exists({ email, _id: { $ne: admin._id } }))) {
    throw AppError.conflict('Another administrator already uses this email', 'EMAIL_TAKEN');
  }
  admin.set({ name, email, isActive, role: 'SUPER_ADMIN' });
  await admin.save();
  adminCache.delete(admin._id);
  res.json({ success: true, data: admin });
}

export async function setAdminStatus(req, res) {
  const admin = await findOther(req);
  if (!req.body.isActive) await assertOtherSuperAdmin(admin);
  admin.isActive = req.body.isActive;
  await admin.save();
  adminCache.delete(admin._id);
  res.json({ success: true, data: admin });
}

export async function resetAdminPassword(req, res) {
  const admin = await findOther(req);
  await admin.setPassword(req.body.password);
  await admin.save();
  adminCache.delete(admin._id);
  res.json({ success: true, data: { id: admin._id } });
}

export async function deleteAdmin(req, res) {
  const admin = await findOther(req);
  await assertOtherSuperAdmin(admin);
  await admin.deleteOne();
  adminCache.delete(admin._id);
  res.json({ success: true, data: { id: admin._id } });
}
