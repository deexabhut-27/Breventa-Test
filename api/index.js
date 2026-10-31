// Vercel serverless entry: every /api/* request is routed here (see vercel.json).
// The Express app and the MongoDB connection are created once per warm instance and reused.
import { createApp } from '../backend/src/app.js';
import { connectDB } from '../backend/src/config/db.js';
import { hashManuallyAddedAdmins } from '../backend/src/services/adminProvisioning.js';
import { logger } from '../backend/src/utils/logger.js';

const app = createApp();
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

export default async function handler(req, res) {
  try {
    await ensureDb();
  } catch {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Database temporarily unavailable, please retry shortly' } }));
  }
  return app(req, res);
}
