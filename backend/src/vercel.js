// Vercel entrypoint for the "backend" service (see vercel.json → services.backend.entrypoint).
// Vercel runs the default-exported Express app as a single function. The MongoDB connection
// is opened on the first request and reused while the instance stays warm.
// Local and self-hosted runs use src/server.js instead.
import express from 'express';
import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { configErrors } from './config/env.js';
import { hashManuallyAddedAdmins } from './services/adminProvisioning.js';
import { runDataMigrations } from './services/dataMigrations.js';
import { logger } from './utils/logger.js';

let ready = null;

function ensureDb() {
  if (!ready) {
    ready = connectDB(undefined, { retries: 2 })
      .then(() => hashManuallyAddedAdmins().catch((err) => logger.error({ err }, 'Failed to activate manually added admins')))
      .then(() => runDataMigrations().catch((err) => logger.error({ err }, 'Data migrations failed')))
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
  if (configErrors.length) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'CONFIG_ERROR',
        message: 'Server environment variables are missing or invalid. Fix them in Vercel → Settings → Environment Variables, then redeploy.',
        problems: configErrors,
      },
    });
  }
  try {
    await ensureDb();
    return next();
  } catch {
    return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Database temporarily unavailable, please retry shortly' } });
  }
});
app.use(createApp());

export default app;
