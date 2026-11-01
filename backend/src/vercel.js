// Vercel entrypoint for the "backend" service (see vercel.json → services.backend.entrypoint).
// Vercel runs the default-exported Express app as a single function. The MongoDB connection
// is opened on the first request and reused while the instance stays warm.
// Local and self-hosted runs use src/server.js instead.
//
// The application is loaded with dynamic imports so that a start-up failure is answered with a
// readable JSON error (message only, no stack or secret values) instead of Vercel's opaque
// FUNCTION_INVOCATION_FAILED page.
import express from 'express';

process.env.VERCEL ||= '1';

let loaded = null;
let loadError = null;

async function load() {
  if (loaded) return loaded;
  if (loadError) throw loadError;
  try {
    const [{ createApp }, { connectDB }, { configErrors }, { hashManuallyAddedAdmins }, { runDataMigrations }, { logger }] = await Promise.all([
      import('./app.js'),
      import('./config/db.js'),
      import('./config/env.js'),
      import('./services/adminProvisioning.js'),
      import('./services/dataMigrations.js'),
      import('./utils/logger.js'),
    ]);
    loaded = { app: createApp(), connectDB, configErrors, hashManuallyAddedAdmins, runDataMigrations, logger, ready: null };
    return loaded;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Backend failed to start', err);
    loadError = err;
    throw err;
  }
}

function ensureDb(ctx) {
  if (!ctx.ready) {
    ctx.ready = ctx
      .connectDB(undefined, { retries: 2 })
      .then(() => ctx.hashManuallyAddedAdmins().catch((err) => ctx.logger.error({ err }, 'Failed to activate manually added admins')))
      .then(() => ctx.runDataMigrations().catch((err) => ctx.logger.error({ err }, 'Data migrations failed')))
      .catch((err) => {
        ctx.ready = null; // retry on the next request instead of caching the failure
        throw err;
      });
  }
  return ctx.ready;
}

const app = express();
app.disable('x-powered-by');
app.use(async (req, res, next) => {
  let ctx;
  try {
    ctx = await load();
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'STARTUP_FAILED', message: `Backend failed to start: ${err?.message || err}` } });
  }
  if (ctx.configErrors.length) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'CONFIG_ERROR',
        message: 'Server environment variables are missing or invalid. Fix them in Vercel → Settings → Environment Variables, then redeploy.',
        problems: ctx.configErrors,
      },
    });
  }
  try {
    await ensureDb(ctx);
  } catch (err) {
    return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: `Database temporarily unavailable: ${err?.message?.slice(0, 200) || 'connection failed'}` } });
  }
  return ctx.app(req, res, next);
});

export default app;
