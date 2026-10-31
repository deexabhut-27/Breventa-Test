import { Admin } from '../models/index.js';
import { hashManuallyAddedAdmins } from '../services/adminProvisioning.js';
import { signAdminToken } from '../services/tokenService.js';
import { audit } from '../services/auditService.js';
import { AppError } from '../utils/AppError.js';

export async function login(req, res) {
  const { email, password } = req.body;
  await hashManuallyAddedAdmins(email); // activates an admin inserted by hand in the database
  const admin = await Admin.findOne({ email }).select('+passwordHash');
  // Same message for unknown email and wrong password to avoid account enumeration.
  if (!admin || !admin.isActive || !admin.passwordHash || !(await admin.verifyPassword(password))) {
    await audit({ actorType: 'SYSTEM', action: 'ADMIN_LOGIN_FAILED', details: { email }, ip: req.ip });
    throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }
  admin.lastLoginAt = new Date();
  await admin.save();
  await audit({ actorType: 'ADMIN', actorId: admin._id, action: 'ADMIN_LOGIN', ip: req.ip });
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
  await audit({ actorType: 'ADMIN', actorId: req.admin._id, action: 'ADMIN_PROFILE_UPDATED', ip: req.ip });
  res.json({ success: true, data: req.admin.toJSON() });
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!(await req.admin.verifyPassword(currentPassword))) {
    throw AppError.badRequest('Current password is incorrect', 'INVALID_PASSWORD');
  }
  await req.admin.setPassword(newPassword);
  await req.admin.save();
  await audit({ actorType: 'ADMIN', actorId: req.admin._id, action: 'ADMIN_PASSWORD_CHANGED', ip: req.ip });
  // Older tokens are now revoked (see requireAdmin); hand back a fresh one.
  res.json({ success: true, data: { token: signAdminToken(req.admin) } });
}

export async function listAdmins(_req, res) {
  const admins = await Admin.find().sort({ createdAt: 1 });
  res.json({ success: true, data: admins });
}

export async function createAdmin(req, res) {
  const { name, email, password, role, permissions } = req.body;
  if (await Admin.exists({ email })) throw AppError.conflict('An administrator with this email already exists', 'EMAIL_TAKEN');
  const admin = new Admin({ name, email, role, permissions });
  await admin.setPassword(password);
  await admin.save();
  await audit({ actorType: 'ADMIN', actorId: req.admin._id, action: 'ADMIN_CREATED', entityType: 'Admin', entityId: admin._id, ip: req.ip });
  res.status(201).json({ success: true, data: admin.toJSON() });
}

/** Refuses changes that would leave the system without an active SUPER_ADMIN. */
async function assertOtherSuperAdmin(target) {
  if (target.role !== 'SUPER_ADMIN' || !target.isActive) return;
  const others = await Admin.countDocuments({ _id: { $ne: target._id }, role: 'SUPER_ADMIN', isActive: true });
  if (!others) throw AppError.conflict('At least one active super admin must remain', 'LAST_SUPER_ADMIN');
}

async function findOther(req) {
  if (String(req.params.id) === String(req.admin._id)) {
    throw AppError.badRequest('You cannot change your own role, access or status. Ask another super admin.', 'SELF_CHANGE');
  }
  const admin = await Admin.findById(req.params.id);
  if (!admin) throw AppError.notFound('Administrator not found');
  return admin;
}

export async function updateAdmin(req, res) {
  const admin = await findOther(req);
  const { name, email, role, permissions, isActive } = req.body;
  if (role !== 'SUPER_ADMIN' || !isActive) await assertOtherSuperAdmin(admin);
  if (email !== admin.email && (await Admin.exists({ email, _id: { $ne: admin._id } }))) {
    throw AppError.conflict('Another administrator already uses this email', 'EMAIL_TAKEN');
  }
  const before = { role: admin.role, permissions: [...admin.permissions], isActive: admin.isActive };
  admin.set({ name, email, role, permissions, isActive });
  await admin.save();
  await audit({
    actorType: 'ADMIN',
    actorId: req.admin._id,
    action: 'ADMIN_ACCESS_CHANGED',
    entityType: 'Admin',
    entityId: admin._id,
    details: { before, after: { role, permissions, isActive } },
    ip: req.ip,
  });
  res.json({ success: true, data: admin });
}

export async function setAdminStatus(req, res) {
  const admin = await findOther(req);
  if (!req.body.isActive) await assertOtherSuperAdmin(admin);
  admin.isActive = req.body.isActive;
  await admin.save();
  await audit({ actorType: 'ADMIN', actorId: req.admin._id, action: 'ADMIN_STATUS_CHANGED', entityType: 'Admin', entityId: admin._id, details: { isActive: admin.isActive }, ip: req.ip });
  res.json({ success: true, data: admin });
}

export async function resetAdminPassword(req, res) {
  const admin = await findOther(req);
  await admin.setPassword(req.body.password);
  await admin.save();
  await audit({ actorType: 'ADMIN', actorId: req.admin._id, action: 'ADMIN_PASSWORD_RESET', entityType: 'Admin', entityId: admin._id, ip: req.ip });
  res.json({ success: true, data: { id: admin._id } });
}

export async function deleteAdmin(req, res) {
  const admin = await findOther(req);
  await assertOtherSuperAdmin(admin);
  await admin.deleteOne();
  await audit({ actorType: 'ADMIN', actorId: req.admin._id, action: 'ADMIN_DELETED', entityType: 'Admin', entityId: admin._id, details: { email: admin.email }, ip: req.ip });
  res.json({ success: true, data: { id: admin._id } });
}
