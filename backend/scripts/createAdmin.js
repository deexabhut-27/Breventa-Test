/* eslint-disable no-console */
// Create (or update) an administrator from the command line.
//
//   npm run admin:create -- --email jane@uni.edu --password Secret123 --name "Jane Doe"
//
// Every administrator has full access. If the email already exists, its name and password are updated.
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

  },
});

const fail = (msg) => {
  console.error(`${msg}\n\nUsage: npm run admin:create -- --email <email> --password <password> [--name "Full Name"]`);
  process.exit(1);
};

const email = values.email?.trim().toLowerCase();
const { password } = values;
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Provide a valid --email.');
if (!password || password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
  fail('Provide --password with at least 8 characters, including a letter and a number.');
}

try {
  await connectDB(env.MONGODB_URI, { retries: 3 });
  let admin = await Admin.findOne({ email }).select('+passwordHash');
  const existed = !!admin;
  if (!admin) admin = new Admin({ email });
  admin.name = values.name?.trim() || admin.name || email.split('@')[0];
  admin.role = 'SUPER_ADMIN';
  admin.permissions = [...PERMISSIONS];
  admin.isActive = true;
  await admin.setPassword(password);
  await admin.save();
  console.log(`${existed ? 'Updated' : 'Created'} administrator ${email} (full access)`);
  console.log('They can sign in now at /admin/login with this email and password.');
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
