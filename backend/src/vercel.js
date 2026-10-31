// Vercel entrypoint for the "backend" service (see vercel.json → services.backend.entrypoint).
// Vercel runs the default-exported Express app as a single function. The MongoDB connection
// is opened on the first request and reused while the instance stays warm.
// Local and self-hosted runs use src/server.js instead.
import express from 'express';
import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { hashManuallyAddedAdmins } from './services/adminProvisioning.js';
import { logger } from './utils/logger.js';

let ready = null;

function ensureDb() {
  if (!ready) {
    ready = connectDB(undefined, { retries: 2 })
      .then(() => hashManuallyAddedAdmins().catch((err) => logger.error({ err }, 'Failed to activate manually added admins')))
      .catch((err) => {
        ready = null; // retry on the next request instead of caching the failure
        throw err;
      });
  }
  return ready;
}

const app = express();
app.disable('x-powered-by');
app.use(async (_req, res, next) => {
  try {
    await ensureDb();
    return next();
  } catch {
    return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Database temporarily unavailable, please retry shortly' } });
  }
});
app.use(createApp());

export default app;
