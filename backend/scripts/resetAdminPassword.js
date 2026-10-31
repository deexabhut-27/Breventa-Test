/* eslint-disable no-console */
// Sets (or creates) the admin account from ADMIN_EMAIL / ADMIN_PASSWORD in backend/.env.
// Usage: npm run admin:reset
import { connectDB, disconnectDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { Admin } from '../src/models/index.js';

if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 8 || !/[A-Za-z]/.test(env.ADMIN_PASSWORD) || !/[0-9]/.test(env.ADMIN_PASSWORD)) {
  console.error('Set ADMIN_PASSWORD in backend/.env (at least 8 characters, with a letter and a number).');
  process.exit(1);
}

try {
  await connectDB(env.MONGODB_URI, { retries: 3 });
  let admin = await Admin.findOne({ email: env.ADMIN_EMAIL }).select('+passwordHash');
  if (!admin) admin = new Admin({ name: env.ADMIN_NAME, email: env.ADMIN_EMAIL, role: 'SUPER_ADMIN' });
  await admin.setPassword(env.ADMIN_PASSWORD);
  admin.isActive = true;
  await admin.save();
  console.log(`Password updated for ${admin.email}. Sign in with ADMIN_EMAIL / ADMIN_PASSWORD from backend/.env.`);
} catch (err) {
  console.error('Reset failed:', err.message);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
