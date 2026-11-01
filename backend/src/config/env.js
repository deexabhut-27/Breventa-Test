import 'dotenv/config';
import { z } from 'zod';

const isTest = process.env.NODE_ENV === 'test';
// Vercel (serverless) sets VERCEL=1; there the API sits behind Vercel's proxy and has no long-running process.
// VERCEL_ENV / VERCEL_URL / AWS_LAMBDA_FUNCTION_NAME cover projects with system variables hidden.
const isServerless = !!(process.env.VERCEL || process.env.VERCEL_ENV || process.env.VERCEL_URL || process.env.AWS_LAMBDA_FUNCTION_NAME);

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

let parsed = schema.safeParse(process.env);
// Problems are listed by variable name only, never by value.
export const configErrors = parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${configErrors.map((e) => `  - ${e}`).join('\n')}`);
  if (!isServerless) process.exit(1);
  // On Vercel, exiting only produces an opaque FUNCTION_INVOCATION_FAILED. Start with safe
  // placeholders instead; src/vercel.js answers every request with the list of problems.
  const fallback = { ...process.env, MONGODB_URI: 'mongodb://invalid-config', JWT_SECRET: 'x'.repeat(48) };
  parsed.error.issues.forEach((i) => {
    const key = i.path[0];
    if (key !== 'MONGODB_URI' && key !== 'JWT_SECRET') delete fallback[key];
  });
  parsed = schema.safeParse(fallback);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest,
  isServerless,
};
