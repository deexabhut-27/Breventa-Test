import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: { NODE_ENV: 'test', LOG_LEVEL: 'silent', SUBMISSION_GRACE_SECONDS: '0' },
    testTimeout: 30000,
    hookTimeout: 180000,
    pool: 'forks',
    include: ['tests/**/*.test.js'],
  },
});
