/* eslint-disable no-console */
// Load test: N students register, start, answer every question, heartbeat and submit at the same
// time, while an admin keeps refreshing the admin pages. Runs against an in-memory MongoDB.
//   node scripts/loadTest.js [students=100] [arrivalSpreadMs=2000]
// Reports errors and latency per endpoint. Exit code 1 if any request failed.
process.env.NODE_ENV ||= 'test';
process.env.LOG_LEVEL ||= 'silent';

const N = Number(process.argv[2] || 100);
const SPREAD_MS = Number(process.argv[3] ?? 2000);

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongoose = (await import('mongoose')).default;
const mongod = await MongoMemoryServer.create();
await mongoose.connect(mongod.getUri(), { dbName: 'load', maxPoolSize: 100 });
const models = await import('../src/models/index.js');
await Promise.all(Object.values(models).map((m) => m.init()));
const { createApp } = await import('../src/app.js');
const { CATEGORIES } = await import('../src/config/constants.js');
const { signAdminToken } = await import('../src/services/tokenService.js');
const { runMonitorTick } = await import('../src/services/monitorService.js');

const server = createApp().listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;

// ---- data ----
const qs = [];
for (const [difficulty, n] of Object.entries({ EASY: 90, MEDIUM: 60, HARD: 30 }))
  for (let i = 0; i < n; i += 1)
    qs.push({ text: `${difficulty} q ${i}`, options: ['a', 'b', 'c', 'd'].map((o) => `${o}${i}`), correctOptionIndex: i % 4, category: CATEGORIES[i % CATEGORIES.length], difficulty, marks: 1, negativeMarks: 0 });
await models.Question.insertMany(qs);
const exam = await models.Examination.create({
  title: 'Load Test', slug: 'load-test', durationMinutes: 60, distribution: { easy: 30, medium: 20, hard: 10 }, categories: CATEGORIES,
  markingScheme: 'EXAM', marksPerQuestion: 1, negativeMarking: { enabled: false, marks: 0 }, passPercentage: 40,
  violationPolicy: { mode: 'STRICT', warningsAllowed: 1, heartbeatTimeoutSeconds: 45, disconnectAction: 'FLAG', maxDisconnectSeconds: 300 }, maxAttempts: 1, status: 'PUBLISHED',
});
const admin = new models.Admin({ name: 'Load Admin', email: 'load@test.edu', role: 'SUPER_ADMIN' });
await admin.setPassword('Password123');
await admin.save();
const adminAuth = { Authorization: `Bearer ${signAdminToken(admin)}` };

// ---- client ----
const stats = {};
const errors = [];
async function call(name, method, path, { body, headers = {} } = {}) {
  const t = performance.now();
  let status = 0;
  let json = null;
  try {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
    status = res.status;
    json = await res.json().catch(() => null);
  } catch (err) {
    json = { error: { message: `${err.message} ${err.cause?.code || err.cause?.message || ''}` } };
  }
  const ms = performance.now() - t;
  (stats[name] ||= []).push(ms);
  if (status < 200 || status >= 300) errors.push({ name, status, msg: json?.error?.message });
  return json?.data;
}

async function student(i) {
  // Arrivals spread over SPREAD_MS (real students never click in the same millisecond; macOS also
  // only queues 128 brand-new connections at once, which a same-instant burst of 200 would exceed).
  await new Promise((r) => setTimeout(r, Math.random() * SPREAD_MS));
  const reg = await call('register', 'POST', `/public/exams/${exam.slug}/register`, {
    body: { fullName: `Student ${String.fromCharCode(65 + (i % 26))}`, universityName: 'Load University', email: `s${i}@load.edu`, phone: String(9000000000 + i), enrollmentNumber: `ENR${i}` },
  });
  if (!reg) return;
  const auth = { Authorization: `Bearer ${reg.token}` };
  await call('me', 'GET', '/student/me', { headers: auth });
  const started = await call('start', 'POST', '/student/attempt/start', { headers: auth, body: { acceptInstructions: true } });
  if (!started) return;
  const headers = { ...auth, 'X-Exam-Session': started.sessionId };
  const total = started.questions.length;
  let seq = 0;
  for (let q = 0; q < total; q += 1) {
    await call('answer', 'PUT', `/student/attempt/responses/${q}`, { headers, body: { selectedOption: (q + i) % 4, markedForReview: false, seq: (seq += 1) } });
    if (q % 10 === 0) await call('heartbeat', 'POST', '/student/attempt/heartbeat', { headers, body: { visible: true } });
  }
  await call('submit', 'POST', '/student/attempt/submit', { headers, body: { pendingResponses: [] } });
}

const ADMIN_PAGES = [
  ['dashboard', '/admin/dashboard'],
  ['monitoring', '/admin/monitoring'],
  ['results', '/admin/results?page=1&limit=20'],
  ['results-summary', '/admin/results/summary'],
  ['students', '/admin/students?page=1&limit=20'],
  ['candidates', '/admin/candidates?page=1&limit=20'],
  ['candidates-summary', '/admin/candidates/summary'],
  ['exams', '/admin/exams'],
  ['questions', '/admin/questions?page=1&limit=20'],
  ['question-stats', '/admin/questions/stats'],
];
let running = true;
async function adminLoop() {
  while (running) {
    await Promise.all(ADMIN_PAGES.map(([n, p]) => call(`admin:${n}`, 'GET', p, { headers: adminAuth })));
    await runMonitorTick();
  }
}

const t0 = performance.now();
const adminRun = adminLoop();
await Promise.all(Array.from({ length: N }, (_, i) => student(i)));
running = false;
await adminRun;
const wall = performance.now() - t0;
// Admin pages again once every student has finished (the "after the exam" view).
for (let r = 0; r < 3; r += 1) for (const [n, p] of ADMIN_PAGES) await call(`after:${n}`, 'GET', p, { headers: adminAuth });

const pct = (a, p) => a[Math.min(a.length - 1, Math.floor((a.length * p) / 100))];
console.log(`\n${N} students, ${(wall / 1000).toFixed(1)} s wall time\n`);
console.log('endpoint'.padEnd(26), 'count'.padStart(6), 'p50'.padStart(8), 'p95'.padStart(8), 'max'.padStart(8));
for (const [name, arr] of Object.entries(stats)) {
  const s = [...arr].sort((a, b) => a - b);
  console.log(name.padEnd(26), String(s.length).padStart(6), `${pct(s, 50).toFixed(0)}ms`.padStart(8), `${pct(s, 95).toFixed(0)}ms`.padStart(8), `${s[s.length - 1].toFixed(0)}ms`.padStart(8));
}
const done = await models.Attempt.countDocuments({ status: 'COMPLETED' });
const results = await models.Result.countDocuments();
console.log(`\nCompleted attempts: ${done}/${N}, results: ${results}/${N}, failed requests: ${errors.length}`);
const grouped = errors.reduce((a, e) => ({ ...a, [`${e.name} ${e.status} ${e.msg}`]: (a[`${e.name} ${e.status} ${e.msg}`] || 0) + 1 }), {});
for (const [k, v] of Object.entries(grouped)) console.log(`  ${v}x ${k}`);

server.close();
await mongoose.disconnect();
await mongod.stop();
process.exit(errors.length || done !== N ? 1 : 0);
