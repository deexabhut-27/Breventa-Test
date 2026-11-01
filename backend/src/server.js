import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { env } from './config/env.js';
import { hashManuallyAddedAdmins } from './services/adminProvisioning.js';
import { runDataMigrations } from './services/dataMigrations.js';
import { startMonitor, stopMonitor } from './services/monitorService.js';
import { logger } from './utils/logger.js';

async function main() {
  await connectDB();
  await hashManuallyAddedAdmins().catch((err) => logger.error({ err }, 'Failed to activate manually added admins'));
  await runDataMigrations().catch((err) => logger.error({ err }, 'Data migrations failed'));
  const app = createApp();
  // A large accept backlog lets a burst of students connect at once (capped by the OS setting).
  const server = app.listen({ port: env.PORT, backlog: 2048 }, () => logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API server listening'));
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  startMonitor();

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down gracefully');
    stopMonitor();
    const force = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 15000);
    force.unref();
    server.close(async () => {
      try {
        await disconnectDB();
      } finally {
        logger.info('Shutdown complete');
        process.exit(0);
      }
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled promise rejection'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    shutdown('uncaughtException');
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
