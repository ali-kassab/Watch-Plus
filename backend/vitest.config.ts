import { defineConfig } from 'vitest/config';

// Unit tests: pure logic and services with no database.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    env: {
      NODE_ENV: 'test',
    },
  },
});
