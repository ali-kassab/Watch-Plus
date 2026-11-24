import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://pulsewatch:pulsewatch@localhost:5432/pulsewatch_test?schema=public';

// Integration + E2E tests: run against a real PostgreSQL test database, one file at a time.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts', 'test/**/*.int-spec.ts'],
    globalSetup: ['./test/helpers/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough-1234567890',
      ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      FRONTEND_URL: 'http://localhost:3000',
      SCHEDULER_ENABLED: 'false',
      ALLOW_PRIVATE_TARGETS: 'true',
      MAIL_TRANSPORT: 'smtp',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '2526',
      THROTTLE_LIMIT: '10000',
    },
  },
});
