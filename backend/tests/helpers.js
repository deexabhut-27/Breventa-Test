import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { CATEGORIES } from '../src/config/constants.js';
import * as models from '../src/models/index.js';
import { makeSlug } from '../src/services/examService.js';
import { signAdminToken } from '../src/services/tokenService.js';
import { clearAllCaches } from '../src/services/cache.js';

let mongod;
export const app = createApp();
export const api = () => request(app);

export async function setupDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'exam-test' });
  await Promise.all(Object.values(models).map((m) => m.init()));
}

export async function teardownDb() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

export async function clearDb() {
  await Promise.all(Object.values(models).map((m) => m.deleteMany({})));
  await mongoose.connection.db.collection('app_meta').deleteMany({});
  clearAllCaches();
}

export async function createAdmin(overrides = {}) {
  const admin = new models.Admin({ name: 'Test Admin', email: 'admin@test.edu', role: 'SUPER_ADMIN', ...overrides });
  await admin.setPassword(overrides.password || 'Password123');
  await admin.save();
  return { admin, token: signAdminToken(admin), auth: { Authorization: `Bearer ${signAdminToken(admin)}` } };
}

/** Creates `counts` active questions per difficulty, cycling through categories. Option 0..3 text encodes the index. */
export async function seedQuestions({ EASY = 30, MEDIUM = 20, HARD = 10 } = {}, extra = {}) {
  const docs = [];
  for (const [difficulty, n] of Object.entries({ EASY, MEDIUM, HARD })) {
    for (let i = 0; i < n; i += 1) {
      const correct = i % 4;
      docs.push({
        text: `${difficulty} question number ${i + 1}`,
        options: ['opt-0', 'opt-1', 'opt-2', 'opt-3'].map((o) => `${o} ${difficulty} ${i}`),
        correctOptionIndex: correct,
        category: CATEGORIES[i % CATEGORIES.length],
        difficulty,
        marks: 1,
        negativeMarks: 0,
        ...extra,
      });
    }
  }
  return models.Question.insertMany(docs);
}

export async function createExam(overrides = {}) {
  return models.Examination.create({
    title: 'Placement Test',
    slug: makeSlug('Placement Test'),
    durationMinutes: 60,
    distribution: { easy: 30, medium: 20, hard: 10 },
    categories: CATEGORIES,
    markingScheme: 'EXAM',
    marksPerQuestion: 1,
    negativeMarking: { enabled: false, marks: 0 },
    passPercentage: 40,
    violationPolicy: { mode: 'STRICT', warningsAllowed: 1, heartbeatTimeoutSeconds: 45, disconnectAction: 'FLAG', maxDisconnectSeconds: 300 },
    maxAttempts: 1,
    status: 'PUBLISHED',
    ...overrides,
  });
}

let counter = 0;
export function studentData(overrides = {}) {
  counter += 1;
  return {
    fullName: `Student ${String.fromCharCode(65 + (counter % 26))}`,
    universityName: 'Test University',
    phone: `98765${String(10000 + counter).slice(-5)}`,
    email: `student${counter}@test.edu`,
    enrollmentNumber: `ENR${counter}`,
    ...overrides,
  };
}

export async function registerStudent(exam, overrides = {}) {
  const res = await api().post(`/api/public/exams/${exam.slug}/register`).send(studentData(overrides));
  if (res.status !== 201) throw new Error(`Registration failed: ${JSON.stringify(res.body)}`);
  return { token: res.body.data.token, student: res.body.data.student, auth: { Authorization: `Bearer ${res.body.data.token}` } };
}

/** Registers a student and starts the exam; returns headers for subsequent exam calls. */
export async function startExam(exam, overrides = {}) {
  const reg = await registerStudent(exam, overrides);
  const res = await api().post('/api/student/attempt/start').set(reg.auth).send({ acceptInstructions: true });
  if (res.status !== 201) throw new Error(`Start failed: ${JSON.stringify(res.body)}`);
  const headers = { ...reg.auth, 'X-Exam-Session': res.body.data.sessionId };
  return { ...reg, payload: res.body.data, headers };
}

/** For a given attempt, returns the displayed option index that is correct for question `index`. */
export async function correctDisplayedOption(attemptId, index) {
  const attempt = await models.Attempt.findById(attemptId).lean();
  const aq = attempt.questions[index];
  const q = await models.Question.findById(aq.question).select('+correctOptionIndex').lean();
  return aq.optionOrder.indexOf(q.correctOptionIndex);
}
