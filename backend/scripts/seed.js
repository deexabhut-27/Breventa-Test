/* eslint-disable no-console */
import { randomBytes } from 'node:crypto';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { Admin, Examination, Question } from '../src/models/index.js';
import { makeSlug } from '../src/services/examService.js';
import { defaultExam, sampleQuestions } from './seedData.js';

const args = new Set(process.argv.slice(2));
const adminOnly = args.has('--admin-only');
const force = args.has('--force-questions');

async function seedAdmin() {
  const existing = await Admin.findOne({ email: env.ADMIN_EMAIL });
  if (existing) {
    console.log(`Admin ${env.ADMIN_EMAIL} already exists - skipped.`);
    return existing;
  }
  const password = env.ADMIN_PASSWORD || `Adm!n-${randomBytes(6).toString('base64url')}1`;
  const admin = new Admin({ name: env.ADMIN_NAME, email: env.ADMIN_EMAIL, role: 'SUPER_ADMIN' });
  await admin.setPassword(password);
  await admin.save();
  console.log(`Created SUPER_ADMIN ${env.ADMIN_EMAIL}`);
  if (!env.ADMIN_PASSWORD) console.log(`Generated password: ${password}  (change it after first login)`);
  return admin;
}

async function seedQuestions(admin) {
  const count = await Question.countDocuments();
  if (count > 0 && !force) {
    console.log(`Question bank already has ${count} questions - skipped (use --force-questions to add the sample set anyway).`);
    return;
  }
  await Question.insertMany(sampleQuestions.map((q) => ({ ...q, createdBy: admin._id })));
  const by = sampleQuestions.reduce((a, q) => ({ ...a, [q.difficulty]: (a[q.difficulty] || 0) + 1 }), {});
  console.log(`Inserted ${sampleQuestions.length} sample questions (Easy ${by.EASY}, Medium ${by.MEDIUM}, Hard ${by.HARD}).`);
}

async function seedExam(admin) {
  if (await Examination.exists({})) {
    console.log('An examination already exists - skipped default examination.');
    return;
  }
  const exam = await Examination.create({
    ...defaultExam,
    slug: makeSlug(defaultExam.title),
    status: 'PUBLISHED',
    publishedAt: new Date(),
    createdBy: admin._id,
  });
  console.log(`Created and published "${exam.title}"`);
  console.log(`Student URL path: /exam/${exam.slug}`);
}

try {
  await connectDB(env.MONGODB_URI, { retries: 3 });
  await Promise.all([Admin.init(), Question.init(), Examination.init()]);
  const admin = await seedAdmin();
  if (!adminOnly) {
    await seedQuestions(admin);
    await seedExam(admin);
  }
  console.log('Seeding complete.');
} catch (err) {
  console.error('Seeding failed:', err.message);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
