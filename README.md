# University Placement Examination System

A full-stack platform for running online aptitude and logical-reasoning examinations for university placements: student registration via a public link, a server-controlled timer, randomized question papers, browser monitoring with configurable tab-switch policies, automatic evaluation, a complete admin dashboard, and PDF / Excel / CSV reports.

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4, React Router 7, Axios, Lucide icons, Recharts |
| Backend | Node.js (≥ 20), Express 5, Mongoose 8, JWT, bcrypt (bcryptjs), Zod, Helmet, express-rate-limit, Pino |
| Reports | PDFKit, ExcelJS |
| Database | MongoDB (Atlas or a self-hosted replica set) |
| Tests | Vitest, Supertest, mongodb-memory-server |

---

## Quick start

```bash
# 1. Install everything (root, backend and frontend)
npm install

# 2. Configure the API
cp backend/.env.example backend/.env
#    edit backend/.env: MONGODB_URI, JWT_SECRET, ADMIN_EMAIL / ADMIN_PASSWORD

# 3. Create the first admin, the 60-question sample bank and a published sample exam
npm run seed

# 4. Run API (http://localhost:5050) and web app (http://localhost:5173) together
npm run dev
```

* Home page <http://localhost:5173/>: students see the examinations currently open for registration. Only a browser with a valid admin session is forwarded to the admin panel, and the home page never links to it.
* Admin panel: <http://localhost:5173/admin>. Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `backend/.env`.
* Student link: shown in the seed output and on each published examination's page (`/exam/<slug>`).

> **macOS note:** port 5000 is used by AirPlay Receiver, so the API defaults to **5050**.

### Useful scripts

| Command | Where | Purpose |
|---|---|---|
| `npm run dev` | root | API + web app with hot reload |
| `npm run seed` | root | Seed admin, sample questions, sample exam (idempotent) |
| `npm --prefix backend run seed:admin` | root | Create only the admin account |
| `npm run admin:create -- --email … --password …` | root | Create or update an administrator (see *Adding administrators*) |
| `npm run admin:reset` | root | Set the admin password to `ADMIN_PASSWORD` from `backend/.env` (use if you can't sign in) |
| `npm test` | root | Run the backend test suite |
| `npm run build` | root | Production build of the frontend (`frontend/dist`) |
| `npm start` | root | Production API (also serves `frontend/dist` when present) |

---

## Environment variables (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `MONGODB_URI` | — | MongoDB connection string (required) |
| `MONGODB_DB_NAME` | from URI | Database name |
| `JWT_SECRET` | — | ≥ 32 random characters (required) |
| `ADMIN_JWT_EXPIRES_IN` / `STUDENT_JWT_EXPIRES_IN` | `8h` / `24h` | Token lifetimes |
| `PORT` | `5050` | API port |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins |
| `TRUST_PROXY` | `0` | Number of reverse proxies in front of the API (set `1` behind Nginx / a load balancer) |
| `MONITOR_INTERVAL_SECONDS` | `15` | How often the server checks timers and heartbeats |
| `HEARTBEAT_INTERVAL_SECONDS` | `15` | How often browsers send heartbeats |
| `SUBMISSION_GRACE_SECONDS` | `5` | Network grace period after the timer expires |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | First administrator created by `npm run seed` (a random password is generated and printed if omitted) |

`.env` files are git-ignored; only `.env.example` is committed. The frontend needs no configuration when served from the same origin. `frontend/.env.example` documents `VITE_API_URL` for split hosting.

---

## Architecture

```
backend/
  src/
    config/        env validation, MongoDB connection with retry, constants
    models/        Admin, Student, Examination, Question, Attempt, StudentResponse, Result, CandidateNote
    middleware/    JWT auth + RBAC, Zod validation, operator sanitisation, rate limits, errors
    validators/    Zod schemas for every request
    services/      attempt engine, evaluation, heartbeat monitor, result queries, PDF, Excel, caching
    controllers/   admin, question, exam, student, monitoring, result, public, student-exam
    routes/        /api/admin, /api/public, /api/student
    app.js         Express app (Helmet, CORS, compression, logging, timeouts)
    server.js      startup, background monitor, graceful shutdown
  scripts/         seed.js + seedData.js (60 sample questions)
  tests/           Vitest + Supertest suites (in-memory MongoDB)
frontend/
  src/
    pages/admin    Dashboard, Exams, Exam editor/detail, Question bank, Students,
                   Live monitoring, Results, Result detail, Terminated, Settings
    pages/student  Registration, Instructions, Exam room, Finished
    exam/          SaveQueue (offline-safe answer sync), server timer, proctoring hook
    components/    UI kit, admin layout, error boundary
```

### Administrators

There is one role: **every administrator has full access**, including all sections and managing other administrators (add, edit, reset password, disable, remove). To prevent lock-outs, an administrator cannot disable or remove their own account, and the last active administrator cannot be removed. API access checks remain in place on every request.

### Adding administrators

**From the admin panel (easiest):** open **Administrators** in the left sidebar → **Add administrator**, then enter a name, email and password. The account has full access and can sign in immediately.

**From the backend** (useful for scripts or if no administrator can sign in):

**Command line:** Run from the project root:

```bash
npm run admin:create -- --email jane@university.edu --password Secret123 --name "Jane Doe"
```

The account has full access and can sign in immediately at `/admin/login`. Running the command again for an existing email updates that account's name and password. Passwords need at least 8 characters, including a letter and a number.

**Directly in MongoDB (Atlas → Browse Collections → `admins` → Insert Document).**

```json
{ "name": "Jane Doe", "email": "jane@university.edu", "password": "Secret123" }
```

The account gets full access. The first time that email signs in, or the next time the API starts, the password is replaced with a bcrypt hash and the plain-text value is deleted from the database. Documents with a password shorter than 8 characters are ignored until fixed.

### Editing while an examination is running

Examinations can be edited at any time, including while published or while students are taking them. Each running attempt keeps its own snapshot (questions, option order, timer, marks, monitoring policy), so edits apply only to students who start afterwards. Student registrations (name, university, email, phone, enrollment number) can be edited from **Students**; the change also updates their results and exports.

### Selection rounds (after the online test)

**Selection rounds** in the admin sidebar runs the hiring pipeline:

`Online test` → `Round 2` → `Final round` → `Selected` (or `Rejected` at any round)

* **Automatic Round 2**: a student whose online test **passes** moves to Round 2 automatically (shown as *Auto · passed*, with a system note). The exam's **pass percentage can be changed at any time, even after the test**. All finished results are then re-marked Pass/Fail, newly passing students move to Round 2, and auto-qualified students who no longer pass move back. Candidates a person has moved, rejected or selected are never changed automatically. Terminated tests never pass.
* **One-click decisions**: *Round 2 / Qualified for final round / Mark as selected / Undo* act immediately. Only *Reject* asks for confirmation and a reason.
* **Shortlist for Round 2**: pick an examination and a cut-off (minimum %, optionally only the top N, optionally including terminated attempts). Preview who qualifies, then confirm. Candidates can also be moved one by one.
* **Each candidate** has one shared **Notes** document with a rich-text editor (bold, italic, underline, heading, bullet and numbered lists). It **saves automatically** about a second after you stop typing, shows *Saved / Last edited by…*, and picks up colleagues' edits live. If two admins type at the same moment, the second sees *Load their version* / *Keep mine* instead of silently losing text. A reason entered when rejecting is appended to the note. Notes are sanitised on the server, so formatting is kept but scripts and other unsafe HTML are removed. The decision buttons sit below the notes.
* **Live updates**: the page, the open candidate and the dashboard's pipeline card refresh automatically (every 5 s, every 15 s on the dashboard) and pop up changes made by other admins. Decisions are conditional, so if two admins act on the same candidate at once, the second is told it already changed instead of overwriting it.

### Deleting data

Deletes are permanent and cascade through the database:

| Delete | Also removed |
|---|---|
| Examination (type its title to confirm) | All its registrations, attempts, saved answers, results and monitoring logs. Students mid-exam are signed out. The question bank is kept. |
| Student | Their attempts, answers, results, selection notes and logs (works even mid-exam). |
| Result | The attempt and its answers. The student stays registered and can take the exam again. |
| Question | The question only. If students have already seen it, a second confirmation is required; existing scores are kept. |

### How the examination engine works

1. **Start** (`POST /api/student/attempt/start`): the server checks the exam window and the student's previous attempts, picks questions per difficulty with a cryptographically secure shuffle, shuffles each question's options, stores the order in the attempt, records `startedAt`/`expiresAt`, and issues a random session id. A partial unique index guarantees at most one `IN_PROGRESS` attempt per student, even under concurrent START requests.
2. **Timer**: the browser displays `expiresAt − serverNow`, measured with the monotonic `performance.now()` clock and re-synced on every heartbeat. Refreshing, closing or changing the computer clock never changes the deadline. `expiresAt` is capped at the exam's end time.
3. **Answers**: each change is written to `localStorage` and sent immediately. Failed sends retry with backoff, and a sequence number makes the server discard out-of-order writes. The student's click on a shuffled position is mapped back to the original option on the server, and the answer key never leaves the server.
4. **Every exam API** re-validates the attempt: it must exist, be `IN_PROGRESS`, match the session id, and be unexpired. Expired attempts are auto-submitted on the spot.
5. **Finalisation** is a single atomic `IN_PROGRESS → COMPLETED/TERMINATED` update, so manual submit, timer expiry, termination and admin actions can never double-submit. Evaluation is idempotent (upsert keyed by attempt) and retried by the monitor if it ever fails.
6. **Background monitor** (every `MONITOR_INTERVAL_SECONDS`): auto-submits expired attempts (covers closed browsers and dead devices), flags lost heartbeats, optionally terminates after a configurable disconnection limit, and re-runs failed evaluations. All transitions are conditional updates, so multiple API instances can run safely.

### Monitoring and anti-cheating

| Signal | Handling |
|---|---|
| Tab switch / minimise / app switch (`visibilitychange`) | Reported **immediately** with `navigator.sendBeacon`, then confirmed by XHR when the page is visible again (same event id, de-duplicated). Counts toward the policy. |
| Policy | **Strict**: terminate on the first violation. **Warning**: N warnings (configurable), terminate on the next one. Shown to students before they start. |
| Refresh / close (`beforeunload`, `pagehide`) | `beforeunload` shows a warning; `pagehide` sends an "unload" beacon that is **logged, not counted**. If an unload is cancelled and the page stays hidden, it is counted. |
| Heartbeats | Every 15 s. Silence beyond the timeout marks the attempt *disconnected* (not cheating); reconnecting clears it. Optional termination after a long, configurable gap. |
| Multiple windows | One session id per attempt; opening the exam elsewhere invalidates the old window (it shows "Continue in this window"). |
| Back button, copy/paste, context menu | Blocked and logged. |
| Terminated attempts | Saved answers are evaluated, the result is marked *Terminated*, and the student can never restart. |

> **Limits:** browser-based monitoring cannot detect a second device, another person in the room, or every OS-level trick, and browser events are best-effort when a device loses power. The server-side timer, heartbeat monitor and atomic state transitions are the authority; combine them with invigilation for high-stakes exams.

### Scoring

* Marking scheme per exam: the same marks for every question (`EXAM`), or each question's own marks (`QUESTION`).
* Negative marking can be switched on and off per exam (a fixed deduction, or each question's own negative marks).
* The result stores total, percentage, pass/fail, correct/incorrect/unanswered, Easy/Medium/Hard scores, an **Aptitude** score (Quantitative, Verbal, General) and a **Reasoning** score (Logical, Analytical), plus a per-category breakdown.
* Terminated attempts are scored but are always marked *not passed*.
* Admins can **re-evaluate** a result after correcting an answer key.

---

## API reference

All responses are `{ success, data, meta? }` or `{ success: false, error: { code, message, details? } }`.

### Public (`/api/public`)
| Method | Path | Description |
|---|---|---|
| GET | `/exams` | Examinations currently open (used by the home page) |
| GET | `/exams/:slug` | Public exam details (no answers) |
| POST | `/exams/:slug/register` | Register `{ fullName, universityName, phone, email, enrollmentNumber? }` → student token. Duplicate email / phone / enrollment per exam → `409 ALREADY_REGISTERED` |
| POST | `/exams/:slug/continue` | Resume a registration `{ email, phone }` → student token |

### Student (`/api/student`, `Authorization: Bearer <student token>`, exam calls also send `X-Exam-Session`)
| Method | Path | Description |
|---|---|---|
| GET | `/me` | Student, exam rules, attempt status (`canStart`, `blockedReason`) |
| POST | `/attempt/start` | `{ acceptInstructions: true }` → questions, saved responses, timer, `sessionId` (resumes an active attempt) |
| GET | `/attempt` | Current attempt (used after refresh) |
| PUT | `/attempt/responses/:index` | `{ selectedOption: 0-3 \| null, markedForReview, seq }` |
| POST | `/attempt/heartbeat` | → `{ remainingMs, serverNow }` |
| POST | `/attempt/violations` | `{ type, eventId?, reason?, pendingResponses? }` → policy outcome |
| POST | `/attempt/submit` | `{ pendingResponses? }`; second call → `409 ALREADY_SUBMITTED` |
| POST | `/beacon` | `sendBeacon` target (text/plain JSON with token + session) |

### Admin (`/api/admin`, `Authorization: Bearer <admin token>`)
| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `GET /auth/me`, `PUT /auth/profile`, `PUT /auth/password` |
| Admins | `GET/POST /admins` `{ name, email, password }`, `PUT /admins/:id` `{ name, email, isActive }`, `PATCH /admins/:id/status`, `POST /admins/:id/reset-password`, `DELETE /admins/:id` |
| Dashboard | `GET /dashboard?exam=` |
| Questions | `GET /questions` (search, category, difficulty, status, page, sort), `GET /questions/stats`, `POST /questions`, `GET/PUT/DELETE /questions/:id`, `PATCH /questions/:id/status`, `POST /questions/import` (multipart `file`, .xlsx/.csv), `GET /questions/export?format=xlsx\|csv`, `GET /questions/import-template` |
| Examinations | `GET/POST /exams`, `GET/PUT/DELETE /exams/:id`, `GET /exams/:id/availability`, `POST /exams/:id/publish\|unpublish\|close\|duplicate` |
| Students | `GET /students` (exam, search, university), `GET/PUT/DELETE /students/:id` |
| Monitoring | `GET /monitoring?exam=`, `GET /attempts/:id` (full review incl. answer key), `POST /attempts/:id/terminate` `{ reason }`, `POST /attempts/:id/force-submit` |
| Results | `GET /results` (filters below), `GET /results/:id`, `GET /results/:id/pdf`, `POST /results/:id/reevaluate`, `GET /results/export/pdf?mode=filtered\|all\|university`, `GET /results/export/excel?format=xlsx\|csv&mode=university`, `GET /results/summary` |

**Result filters** (shared by the table and every export, so exports always match the screen): `search, name, university, email, phone, exam, from, to, difficulty (total|easy|medium|hard — which score min/max apply to), minScore, maxScore, status (COMPLETED|TERMINATED), passed (true|false), sortBy, sortOrder, page, limit`.

**Question import columns:** `Question, Option A, Option B, Option C, Option D, Correct Option (A–D), Category, Difficulty (Easy/Medium/Hard), Marks, Negative Marks, Explanation, Active`. Download the template from the Question Bank page. Invalid rows are reported with row numbers; valid rows are imported.

---

## Testing

```bash
npm test                 # from the repo root
# or
cd backend && npm test
```

The suite (106 tests) runs against a throw-away in-memory MongoDB, so it never touches your database. It covers registration and duplicate prevention, admin auth and token revocation, RBAC, unauthorized access, operator-injection stripping, question CRUD/import/export, exam configuration and publish validation, question and option randomization, correct-answer mapping, the server-side timer, refresh behaviour, answer saving and stale-write rejection, single-session enforcement, strict and warning tab-switch policies, beacon handling, heartbeat flagging and termination, auto-submission on expiry, role/permission enforcement, student editing, editing a running exam, scoring with negative marking, duplicate submission and concurrent START protection, the dashboard, monitoring, and PDF / Excel / CSV generation.

The first run downloads a MongoDB binary for `mongodb-memory-server` (~70 MB).

---

## Performance and capacity

* **Load-tested:** 500 students arriving within 10 seconds, each saving 30 answers, with heartbeats and submission, while 3 admins refreshed live pages every second. Zero errors; answer saves took 9 ms typical (12 ms for 95%). This ran against a local database, so the app itself is not the bottleneck.
* **How it stays fast:**
  * Each student's latest result is stored on the student record, so candidate lists, the dashboard and the Students page never search the results collection per student.
  * Short-lived in-memory caches hold the student, the exam settings, question text and each attempt's question order.
  * Heartbeats skip the question list.
  * The Selection page uses one combined live request.
  * The website is split into pieces: a student opening an exam link downloads about 115 KB instead of the whole admin panel.
* **100 students pressing START at the same moment on the free Atlas M0 tier:** all 100 got into the exam and all 100 results were saved. Starting took about 7 s and submitting about 7–9 s, because M0 caps database operations per second. The browser retries START and submit automatically and shows a "please wait" message, so a burst slows students down but does not fail them.
* **Database tier matters most.** The free Atlas **M0** tier is throttled (limited operations per second and connections). A real exam with 500 students produces roughly 50–150 requests per second on average, more at the start and end. Use **M10 or higher** for exams with more than ~100 students at the same time, and keep the database in the same region as the API (Vercel functions: set the function region near your Atlas region).

## Deploying to Vercel

The repo deploys as one Vercel project with two **services** (see `vercel.json`):

| Service | Root | Framework | Public path |
|---|---|---|---|
| `backend` | `backend/` | Express, entry `src/vercel.js` | `/api/*` |
| `frontend` | `frontend/` | Vite (static SPA) | everything else |

The backend receives the full original path (`/api/...`), which is where all its routes live. The frontend calls the API on the same domain, so no service bindings or API URL are needed.

1. Push to GitHub and import the repo in Vercel. Leave the root directory empty; the services are detected from `vercel.json`.
2. Add **two** environment variables: `MONGODB_URI` (Atlas connection string including the database name) and `JWT_SECRET` (48+ random characters).
3. In MongoDB Atlas → **Network Access**, allow `0.0.0.0/0`, because Vercel has no fixed IPs.
4. Deploy. Students use `https://<your-app>.vercel.app/exam/<slug>`; admins use `/admin/login`.

Everything else has a built-in default. Optional: `CRON_SECRET` protects the daily monitor cron. Run `vercel dev` to test both services together locally.

On Vercel there is no always-on process, so the background monitor runs whenever an admin uses the panel and once a day via Vercel Cron. Students' timers and auto-submit are enforced on every request, so they don't depend on it.

## Production deployment (own server)

1. **Database:** MongoDB Atlas (M10+ recommended for hundreds of concurrent students; M0/M2 shared tiers are throttled), or a self-hosted replica set. Add your server's IP to the Atlas *Network Access* list.
2. **Build and run:**
   ```bash
   npm install
   npm run build                  # builds public
   NODE_ENV=production npm --prefix backend start
   ```
   In production the API also serves `frontend/dist`, so students and admins use a single origin. Run it under a process manager (PM2 or systemd) or in a container.
3. **Reverse proxy:** put Nginx (or a cloud load balancer) in front for HTTPS, and set `TRUST_PROXY=1` and `CORS_ORIGINS=https://your-domain`.
4. **Scaling:** the API is stateless (JWT + MongoDB), so you can run several instances behind the load balancer. The monitor runs in every instance safely because all state transitions are atomic.
5. **Secrets:** use a long random `JWT_SECRET`, change the seeded admin password after first login, and never commit `.env`.

Example Nginx block:

```nginx
server {
  listen 443 ssl http2;
  server_name exams.example.edu;
  location / {
    proxy_pass http://127.0.0.1:5050;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Server selection timed out` / requests take many seconds | Check the Atlas *Network Access* IP list and your network. Some ISPs and hotspots route through NAT64 with very high latency to Atlas; try another network. The API returns `503` and reconnects automatically. |
| Web app shows "examination link is invalid" in dev | Make sure the API is on the port Vite proxies to (`5050`); on macOS, port 5000 belongs to AirPlay. |
| Students behind one university IP hit rate limits | Limits are per student after login; raise `registrationLimiter` in `backend/src/middleware/rateLimiters.js` if needed. |
| PDF shows boxes for non-Latin names | PDFKit's built-in fonts are Latin-only; register a Unicode TTF font in `pdfService.js`. |
