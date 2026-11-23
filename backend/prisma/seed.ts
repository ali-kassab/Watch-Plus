/**
 * Development seed. Creates a demo account, workspace, monitors pointing at public
 * endpoints, a published status page and a resolved incident. By default it also
 * generates 7 days of synthetic check history (SEED_HISTORY=false to skip) so the
 * charts have something to show before the scheduler has collected real data.
 *
 * Demo login: demo@pulsewatch.dev / pulsewatch-demo
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const DEMO_EMAIL = 'demo@pulsewatch.dev';

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    console.log('Seed: demo user already exists, nothing to do.');
    return;
  }
  const passwordHash = await argon2.hash('pulsewatch-demo', { type: argon2.argon2id });
  const user = await prisma.user.create({ data: { email: DEMO_EMAIL, name: 'Demo User', passwordHash } });
  const workspace = await prisma.workspace.create({
    data: {
      name: 'Demo Inc',
      slug: 'demo-inc',
      memberships: { create: { userId: user.id, role: 'OWNER' } },
      statusPage: { create: { slug: 'demo-inc', title: 'Demo Inc Status', description: 'Live status of Demo Inc services.', isPublished: true } },
    },
  });

  const monitors = await Promise.all(
    [
      { name: 'Marketing website', url: 'https://example.com', intervalSeconds: 60 },
      { name: 'GitHub API', url: 'https://api.github.com', intervalSeconds: 120 },
      { name: 'Httpbin status', url: 'https://httpbin.org/status/200', intervalSeconds: 60 },
      { name: 'Httpbin POST', url: 'https://httpbin.org/post', method: 'POST' as const, body: '{"ping":true}', headers: { 'content-type': 'application/json' }, intervalSeconds: 300 },
    ].map((m) =>
      prisma.monitor.create({
        data: { workspaceId: workspace.id, timeoutMs: 10_000, expectedStatusCodes: [200], health: 'UP', headers: {}, ...m },
      }),
    ),
  );

  if (process.env.SEED_HISTORY !== 'false') {
    const now = Date.now();
    const rows = [];
    for (const [i, m] of monitors.entries()) {
      for (let t = now - 7 * 86_400_000; t < now; t += 15 * 60_000) {
        // A short simulated outage two days ago on the third monitor.
        const outage = i === 2 && t > now - 2 * 86_400_000 && t < now - 2 * 86_400_000 + 45 * 60_000;
        const ok = !outage && Math.random() > 0.004;
        rows.push({
          monitorId: m.id,
          checkedAt: new Date(t),
          success: ok,
          statusCode: ok ? 200 : 503,
          responseTimeMs: ok ? Math.round(80 + i * 60 + Math.random() * 120 + (Math.sin(t / 3_600_000) + 1) * 30) : null,
          errorType: ok ? null : ('STATUS_MISMATCH' as const),
          error: ok ? null : 'Unexpected status code 503 (expected 200)',
        });
      }
    }
    await prisma.checkResult.createMany({ data: rows });
    console.log(`Seed: generated ${rows.length} synthetic check results.`);
  }

  const started = new Date(Date.now() - 2 * 86_400_000);
  await prisma.incident.create({
    data: {
      workspaceId: workspace.id,
      monitorId: monitors[2].id,
      title: 'Httpbin status is down',
      status: 'RESOLVED',
      severity: 'MAJOR',
      isAutomatic: true,
      startedAt: started,
      resolvedAt: new Date(started.getTime() + 45 * 60_000),
      resolution: 'Upstream provider restored service.',
      updates: {
        create: [
          { type: 'CREATED', status: 'OPEN', message: 'Automatically opened: Unexpected status code 503 (expected 200)', createdAt: started },
          { type: 'STATUS_CHANGE', status: 'IDENTIFIED', message: 'Upstream provider outage identified.', authorId: user.id, createdAt: new Date(started.getTime() + 10 * 60_000) },
          { type: 'NOTE', message: 'Escalated to vendor support (ticket #4821).', isInternal: true, authorId: user.id, createdAt: new Date(started.getTime() + 12 * 60_000) },
          { type: 'RESOLVED', status: 'RESOLVED', message: 'Upstream provider restored service.', createdAt: new Date(started.getTime() + 45 * 60_000) },
        ],
      },
    },
  });

  console.log(`Seed complete. Login: ${DEMO_EMAIL} / pulsewatch-demo — public status page: /status/demo-inc`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
