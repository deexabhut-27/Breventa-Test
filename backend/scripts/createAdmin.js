/* eslint-disable no-console */
// Create (or update) an administrator from the command line.
//
//   npm run admin:create -- --email jane@uni.edu --password Secret123 --name "Jane Doe"
//   npm run admin:create -- --email jane@uni.edu --password Secret123 --super
//   npm run admin:create -- --email jane@uni.edu --password Secret123 --access results,students
//
// Without --super the account is an ADMIN with access to every section except managing
// administrators. If the email already exists, its password, role and access are updated.
import { parseArgs } from 'node:util';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { PERMISSIONS } from '../src/config/constants.js';
import { Admin } from '../src/models/index.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    name: { type: 'string' },
    super: { type: 'boolean', default: false },
    access: { type: 'string' },
  },
});

const fail = (msg) => {
  console.error(`${msg}\n\nUsage: npm run admin:create -- --email <email> --password <password> [--name "Full Name"] [--super] [--access ${PERMISSIONS.join(',')}]`);
  process.exit(1);
};

const email = values.email?.trim().toLowerCase();
const { password } = values;
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Provide a valid --email.');
if (!password || password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
  fail('Provide --password with at least 8 characters, including a letter and a number.');
}
const permissions = values.access ? values.access.split(',').map((p) => p.trim()).filter(Boolean) : [...PERMISSIONS];
const unknown = permissions.filter((p) => !PERMISSIONS.includes(p));
if (unknown.length) fail(`Unknown section(s): ${unknown.join(', ')}. Valid: ${PERMISSIONS.join(', ')}`);
const role = values.super ? 'SUPER_ADMIN' : 'ADMIN';

try {
  await connectDB(env.MONGODB_URI, { retries: 3 });
  let admin = await Admin.findOne({ email }).select('+passwordHash');
  const existed = !!admin;
  if (!admin) admin = new Admin({ email });
  admin.name = values.name?.trim() || admin.name || email.split('@')[0];
  admin.role = role;
  admin.permissions = permissions;
  admin.isActive = true;
  await admin.setPassword(password);
  await admin.save();
  console.log(`${existed ? 'Updated' : 'Created'} ${role === 'SUPER_ADMIN' ? 'super admin' : 'admin'} ${email}`);
  console.log(`Access: ${role === 'SUPER_ADMIN' ? 'everything' : permissions.join(', ')}`);
  console.log('They can sign in now at /admin/login with this email and password.');
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
