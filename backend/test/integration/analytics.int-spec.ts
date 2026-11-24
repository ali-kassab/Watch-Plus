import { AnalyticsService } from '../../src/analytics/analytics.service.js';
import { createTestApp, createWorkspace, registerUser, resetDatabase, type TestApp } from '../helpers/app.js';

describe('Analytics & database constraints (integration)', () => {
  let t: TestApp;
  let analytics: AnalyticsService;
  let workspaceId: string;
  let m1: string;
  let m2: string;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    analytics = t.app.get(AnalyticsService);
    const user = await registerUser(t, 'Stats');
    workspaceId = (await createWorkspace(t, user, 'Stats Co')).id;
    const mk = (name: string) =>
      t.prisma.monitor.create({ data: { workspaceId, name, url: 'https://example.com', intervalSeconds: 60, timeoutMs: 5000, expectedStatusCodes: [200], health: 'UP' } });
    m1 = (await mk('One')).id;
    m2 = (await mk('Two')).id;
    await t.prisma.monitor.update({ where: { id: m2 }, data: { isActive: false } });
    const ago = (h: number) => new Date(Date.now() - h * 3_600_000);
    await t.prisma.checkResult.createMany({
      data: [
        { monitorId: m1, success: true, responseTimeMs: 100, checkedAt: ago(1) },
        { monitorId: m1, success: true, responseTimeMs: 300, checkedAt: ago(1) },
        { monitorId: m1, success: false, statusCode: 500, checkedAt: ago(2) },
        { monitorId: m2, success: true, responseTimeMs: 200, checkedAt: ago(3) },
        { monitorId: m1, success: true, responseTimeMs: 1000, checkedAt: ago(48) }, // outside 24h
      ],
    });
  });
  afterAll(() => t.close());

  it('computes summary statistics from stored checks', async () => {
    const s = await analytics.summary(workspaceId, '24h');
    expect(s.monitors).toEqual({ total: 2, up: 1, down: 0, pending: 0, paused: 1 });
    expect(s.checks).toEqual({ total: 4, failed: 1 });
    expect(s.uptimePercent).toBe(75);
    expect(s.avgResponseMs).toBe(200);
    const week = await analytics.summary(workspaceId, '7d');
    expect(week.checks.total).toBe(5);
    const one = await analytics.summary(workspaceId, '24h', m1);
    expect(one.uptimePercent).toBe(66.67);
  });

  it('buckets time series and fills gaps', async () => {
    const series = await analytics.timeseries(workspaceId, '24h');
    expect(series).toHaveLength(24);
    const nonEmpty = series.filter((b) => b.checks > 0);
    expect(nonEmpty.reduce((a, b) => a + b.checks, 0)).toBe(4);
    expect(series.filter((b) => b.checks === 0).every((b) => b.uptimePercent === null)).toBe(true);
    const withFailure = nonEmpty.find((b) => b.failures === 1)!;
    expect(withFailure.uptimePercent).toBe(0);
  });

  it('breaks statistics down per monitor', async () => {
    const rows = await analytics.monitorBreakdown(workspaceId, '24h');
    expect(rows).toEqual([
      expect.objectContaining({ name: 'One', status: 'up', checks: 3, uptimePercent: 66.67, avgResponseMs: 200 }),
      expect.objectContaining({ name: 'Two', status: 'paused', checks: 1, uptimePercent: 100 }),
    ]);
  });

  it('enforces one active incident per monitor at the database level', async () => {
    await t.prisma.incident.create({ data: { workspaceId, monitorId: m1, title: 'A' } });
    await expect(t.prisma.incident.create({ data: { workspaceId, monitorId: m1, title: 'B' } })).rejects.toThrow();
    await t.prisma.incident.updateMany({ where: { monitorId: m1 }, data: { status: 'RESOLVED' } });
    await expect(t.prisma.incident.create({ data: { workspaceId, monitorId: m1, title: 'C' } })).resolves.toBeTruthy();
  });

  it('cascades check history when a monitor is deleted', async () => {
    await t.prisma.monitor.delete({ where: { id: m2 } });
    expect(await t.prisma.checkResult.count({ where: { monitorId: m2 } })).toBe(0);
  });
});
