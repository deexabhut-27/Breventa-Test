import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { isDbReady } from './config/db.js';
import { errorHandler, notFound, requireDb } from './middleware/error.js';
import { globalLimiter } from './middleware/rateLimiters.js';
import { sanitizeInput } from './middleware/sanitize.js';
import adminRoutes from './routes/adminRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import { logger } from './utils/logger.js';
import { maybeRunMonitorTick, runMonitorTick } from './services/monitorService.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin)),
      credentials: false,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Exam-Session'],
      exposedHeaders: ['Content-Disposition'],
    }),
  );
  app.use(compression());
  if (!env.isTest) {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
        autoLogging: { ignore: (req) => req.url.endsWith('/heartbeat') || req.url === '/api/health' },
        serializers: { req: (req) => ({ id: req.id, method: req.method, url: req.url }) },
      }),
    );
  }

  // Abort requests that hang (e.g. while the database is unreachable).
  app.use((req, res, next) => {
    res.setTimeout(30000, () => {
      if (!res.headersSent) res.status(503).json({ success: false, error: { code: 'TIMEOUT', message: 'Request timed out, please retry' } });
    });
    next();
  });

  app.get('/api/health', (_req, res) => {
    const ok = isDbReady();
    res.status(ok ? 200 : 503).json({ success: ok, data: { status: ok ? 'ok' : 'degraded', db: ok ? 'connected' : 'disconnected', time: new Date().toISOString() } });
  });

  app.use('/api', globalLimiter, express.json({ limit: '1mb' }), sanitizeInput, requireDb);

  // Vercel Cron target (daily backstop for the serverless monitor). Protected by CRON_SECRET when set.
  app.get('/api/cron/monitor', async (req, res, next) => {
    if (env.CRON_SECRET && req.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid cron secret' } });
    }
    try {
      return res.json({ success: true, data: await runMonitorTick() });
    } catch (err) {
      return next(err);
    }
  });

  if (env.isServerless) {
    app.use('/api/admin', async (_req, _res, next) => {
      await maybeRunMonitorTick();
      next();
    });
  }
  app.use('/api/admin', adminRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/student', studentRoutes);
  app.use('/api', notFound);

  // Optionally serve the built frontend from the same origin (recommended for production).
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');
  if (env.isProduction && fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
