import { execSync } from 'node:child_process';

/** Applies all migrations to the test database once before the suite. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://pulsewatch:pulsewatch@localhost:5432/pulsewatch_test?schema=public';
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
}
