import 'dotenv/config';
import { z } from 'zod';

const isTest = process.env.NODE_ENV === 'test';
// Vercel (serverless) sets VERCEL=1; there the API sits behind Vercel's proxy and has no long-running process.
const isServerless = !!process.env.VERCEL;

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5050),
  MONGODB_URI: isTest ? z.string().default('') : z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().optional(),
  JWT_SECRET: isTest
    ? z.string().default('test-secret-test-secret-test-secret-123')
    : z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ADMIN_JWT_EXPIRES_IN: z.string().default('8h'),
  STUDENT_JWT_EXPIRES_IN: z.string().default('24h'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(isServerless ? 1 : 0),
  CRON_SECRET: z.string().optional(),
  LOG_LEVEL: z.string().default(isTest ? 'silent' : 'info'),
  MONITOR_INTERVAL_SECONDS: z.coerce.number().int().positive().default(15),
  HEARTBEAT_INTERVAL_SECONDS: z.coerce.number().int().positive().default(15),
  SUBMISSION_GRACE_SECONDS: z.coerce.number().int().min(0).default(5),
  ADMIN_NAME: z.string().default('System Administrator'),
  ADMIN_EMAIL: z.string().email().default('admin@university.edu'),
  ADMIN_PASSWORD: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest,
  isServerless,
};
