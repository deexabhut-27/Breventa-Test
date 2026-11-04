/* eslint-disable no-console */
// Adds any sample questions that are not yet in the question bank (matched by question text).
// Safe to run more than once: existing questions are never changed or duplicated.
//   npm run questions:add            -> adds the missing questions
//   npm run questions:add -- --dry   -> only shows what would be added
import { connectDB, disconnectDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { Admin, Question } from '../src/models/index.js';
import { sampleQuestions } from './seedData.js';

const dry = process.argv.includes('--dry');
const key = (t) => t.trim().replace(/\s+/g, ' ').toLowerCase();

try {
  await connectDB(env.MONGODB_URI, { retries: 3 });
  const existing = new Set((await Question.find().select('text').lean()).map((q) => key(q.text)));
  const missing = sampleQuestions.filter((q) => !existing.has(key(q.text)));
  const by = (list) => list.reduce((a, q) => ({ ...a, [q.difficulty]: (a[q.difficulty] || 0) + 1 }), {});
  console.log(`Bank has ${existing.size} questions. Missing from the sample set: ${missing.length}`, by(missing));
  if (missing.length && !dry) {
    const admin = await Admin.findOne({ role: 'SUPER_ADMIN' }).select('_id').lean();
    await Question.insertMany(missing.map((q) => ({ ...q, createdBy: admin?._id })));
    console.log(`Added ${missing.length} questions.`);
  }
  const counts = await Question.aggregate([{ $match: { isActive: true } }, { $group: { _id: '$difficulty', n: { $sum: 1 } } }]);
  console.log('Active questions now:', Object.fromEntries(counts.map((c) => [c._id, c.n])));
} catch (err) {
  console.error('Adding questions failed:', err.message);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
