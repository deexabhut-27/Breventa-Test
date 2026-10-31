import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';
import { sleep } from '../utils/helpers.js';

mongoose.set('strictQuery', true);

let listenersAttached = false;

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  const conn = mongoose.connection;
  conn.on('disconnected', () => logger.warn('MongoDB disconnected'));
  conn.on('reconnected', () => logger.info('MongoDB reconnected'));
  conn.on('error', (err) => logger.error({ err }, 'MongoDB connection error'));
}

/** Connect with exponential backoff. The driver handles reconnects after the first success. */
export async function connectDB(uri = env.MONGODB_URI, { dbName = env.MONGODB_DB_NAME, retries = 8 } = {}) {
  attachListeners();
  for (let attempt = 1; ; attempt += 1) {
    try {
      await mongoose.connect(uri, {
        dbName,
        // Many short-lived serverless instances share Atlas' connection limit, so keep each pool small there.
        maxPoolSize: env.isServerless ? 10 : 100,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        retryWrites: true,
      });
      logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
      return mongoose.connection;
    } catch (err) {
      if (attempt >= retries) {
        logger.error({ err }, 'MongoDB connection failed, giving up');
        throw err;
      }
      const delay = Math.min(30000, 1000 * 2 ** attempt);
      logger.warn({ attempt, delay, msg: err.message }, 'MongoDB connection failed, retrying');
      await sleep(delay);
    }
  }
}

export async function disconnectDB() {
  await mongoose.connection.close();
}

export const isDbReady = () => mongoose.connection.readyState === 1;
