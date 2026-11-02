import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { isDbReady } from '../config/db.js';

const DB_WAIT_MS = 8000;

/** Resolves true once MongoDB is connected, or false after `ms`. Short drops (network blips, Atlas failover) are waited out. */
function waitForDb(ms) {
  if (isDbReady()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const conn = mongoose.connection;
    const done = (ok) => {
      clearTimeout(timer);
      conn.off('connected', onUp);
      conn.off('reconnected', onUp);
      resolve(ok);
    };
    const onUp = () => done(true);
    const timer = setTimeout(() => done(isDbReady()), ms);
    conn.on('connected', onUp);
    conn.on('reconnected', onUp);
  });
}

export async function requireDb(_req, _res, next) {
  if (isDbReady() || (await waitForDb(DB_WAIT_MS))) return next();
  return next(new AppError(503, 'Database temporarily unavailable, please retry shortly', 'DB_UNAVAILABLE'));
}

export function notFound(req, _res, next) {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`, 'ROUTE_NOT_FOUND'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let error = err;

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    error = AppError.badRequest(details[0]?.message || 'Validation failed', 'VALIDATION_ERROR', details);
  } else if (err instanceof mongoose.Error.CastError) {
    error = AppError.badRequest(`Invalid value for ${err.path}`, 'INVALID_ID');
  } else if (err?.code === 11000) {
    error = AppError.conflict('A record with the same unique value already exists', 'DUPLICATE');
  } else if (err?.type === 'entity.parse.failed') {
    error = AppError.badRequest('Malformed JSON body', 'INVALID_JSON');
  } else if (err?.type === 'entity.too.large') {
    error = new AppError(413, 'Request body too large', 'PAYLOAD_TOO_LARGE');
  } else if (err?.name === 'MulterError') {
    error = AppError.badRequest(err.message, 'UPLOAD_ERROR');
  } else if (err?.name === 'MongoServerSelectionError' || err?.name === 'MongoNetworkError') {
    error = new AppError(503, 'Database temporarily unavailable, please retry shortly', 'DB_UNAVAILABLE');
  }

  if (!(error instanceof AppError)) {
    logger.error({ err, path: req.originalUrl, method: req.method }, 'Unhandled error');
    error = new AppError(500, 'Internal server error', 'INTERNAL_ERROR');
  } else if (error.statusCode >= 500) {
    logger.error({ err, path: req.originalUrl }, error.message);
  }

  if (res.headersSent) return res.end();
  return res.status(error.statusCode).json({
    success: false,
    error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
  });
}
