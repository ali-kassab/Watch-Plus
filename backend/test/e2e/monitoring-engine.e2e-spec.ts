import { DeliveryWorker } from '../../src/notifications/delivery-worker.service.js';
import { HttpCheckerService } from '../../src/monitoring/http-checker.service.js';
import { MonitoringService } from '../../src/monitoring/monitoring.service.js';
import { SchedulerService } from '../../src/monitoring/scheduler.service.js';
import { verifyWebhook } from '../../src/notifications/webhook-signature.js';
import { createTestApp, createWorkspace, registerUser, resetDatabase, type TestApp, type TestUser } from '../helpers/app.js';
import { startSmtpSink } from '../helpers/smtp-sink.js';
import { startTargetServer } from '../helpers/target-server.js';

describe('Monitoring engine, incidents & notifications (e2e)', () => {
  let t: TestApp;
  let owner: TestUser;
  let ws: { id: string };
  let base: string;
  let target: Awaited<ReturnType<typeof startTargetServer>>;
  let receiver: Awaited<ReturnType<typeof startTargetServer>>;
  let smtp: Awaited<ReturnType<typeof startSmtpSink>>;
  let scheduler: SchedulerService;
  let worker: DeliveryWorker;
  let engine: MonitoringService;
  let monitorId: string;
  let webhookSecret: string;

  const runDueChecks = async () => {
    const n = await scheduler.tick();
    await scheduler.drain();
    return n;
  };
  const makeDue = (id: string) => t.prisma.monitor.update({ where: { id }, data: { nextCheckAt: new Date(Date.now() - 1000) } });
  const flushDeliveries = async () => {
    await t.prisma.notificationDelivery.updateMany({ where: { status: 'PENDING' }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    return worker.tick();
  };

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    scheduler = t.app.get(SchedulerService);
    worker = t.app.get(DeliveryWorker);
    engine = t.app.get(MonitoringService);
    t.app.get(HttpCheckerService).retryDelayMs = 1;
    target = await startTargetServer();
    receiver = await startTargetServer();
    smtp = await startSmtpSink();
    owner = await registerUser(t, 'Ops');
    ws = await createWorkspace(t, owner, 'Ops Co');
    base = `/api/workspaces/${ws.id}`;

    const hook = await t.http().post(`${base}/notifications/channels`).set(owner.auth)
      .send({ type: 'WEBHOOK', name: 'Receiver', url: receiver.url('/hook') }).expect(201);
    webhookSecret = hook.body.data.signingSecret;
    expect(webhookSecret).toMatch(/^whsec_/);
    await t.http().post(`${base}/notifications/channels`).set(owner.auth)
      .send({ type: 'EMAIL', name: 'On-call', recipients: ['oncall@example.com'], events: ['MONITOR_DOWN'] }).expect(201);

    monitorId = (
      await t.http().post(`${base}/monitors`).set(owner.auth)
        .send({ name: 'Checkout API', url: target.url('/health'), intervalSeconds: 30, timeoutMs: 500, retries: 1, expectedStatusCodes: [200, 204] })
        .expect(201)
    ).body.data.id;
  });
  afterAll(async () => {
    await t.close();
    await Promise.all([target.close(), receiver.close(), smtp.close()]);
  });

  it('runs due checks automatically and stores results', async () => {
    target.state.status = 200;
    expect(await runDueChecks()).toBe(1);
    const monitor = await t.prisma.monitor.findUniqueOrThrow({ where: { id: monitorId } });
    expect(monitor.health).toBe('UP');
    expect(monitor.lockedUntil).toBeNull();
    expect(monitor.nextCheckAt.getTime()).toBeGreaterThan(Date.now() + 25_000);
    const checks = await t.prisma.checkResult.findMany({ where: { monitorId } });
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ success: true, statusCode: 200 });
    expect(checks[0].responseTimeMs).toBeGreaterThanOrEqual(0);
    // Not due again until the interval has elapsed
    expect(await runDueChecks()).toBe(0);
    // First UP from PENDING is not a transition: no notifications
    expect(await t.prisma.notificationDelivery.count()).toBe(0);
  });

  it('opens one automatic incident and notifies when the monitor goes down', async () => {
    target.state.status = 503;
    await makeDue(monitorId);
    await runDueChecks();

    const monitor = await t.prisma.monitor.findUniqueOrThrow({ where: { id: monitorId } });
    expect(monitor.health).toBe('DOWN');
    const last = await t.prisma.checkResult.findFirstOrThrow({ where: { monitorId }, orderBy: { checkedAt: 'desc' } });
    expect(last).toMatchObject({ success: false, statusCode: 503, errorType: 'STATUS_MISMATCH', attempts: 2 });

    const incidents = await t.prisma.incident.findMany({ where: { monitorId } });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({ status: 'OPEN', isAutomatic: true, title: 'Checkout API is down' });

    const deliveries = await t.prisma.notificationDelivery.findMany({ where: { event: 'MONITOR_DOWN' } });
    expect(deliveries).toHaveLength(2); // webhook + email
    expect(await worker.tick()).toBe(2);

    const hook = receiver.state.requests.find((r) => r.url === '/hook')!;
    expect(hook.headers['x-pulsewatch-event']).toBe('MONITOR_DOWN');
    expect(verifyWebhook(hook.body, hook.headers['x-pulsewatch-signature'] as string, webhookSecret)).toBe(true);
    expect(JSON.parse(hook.body)).toMatchObject({ event: 'MONITOR_DOWN', monitor: { name: 'Checkout API' }, check: { statusCode: 503 } });

    expect(smtp.messages).toHaveLength(1);
    expect(smtp.messages[0].to).toEqual(['oncall@example.com']);
    expect(smtp.messages[0].raw).toContain('DOWN');
    expect(await t.prisma.notificationDelivery.count({ where: { status: 'SUCCESS' } })).toBe(2);
  });

  it('does not create duplicate incidents or alerts while the outage continues', async () => {
    await makeDue(monitorId);
    await runDueChecks();
    expect(await t.prisma.incident.count({ where: { monitorId } })).toBe(1);
    expect(await t.prisma.notificationDelivery.count({ where: { event: 'MONITOR_DOWN' } })).toBe(2);
  });

  it('auto-resolves the incident and notifies on recovery', async () => {
    target.state.status = 204;
    await makeDue(monitorId);
    await runDueChecks();
    const monitor = await t.prisma.monitor.findUniqueOrThrow({ where: { id: monitorId } });
    expect(monitor.health).toBe('UP');
    const incident = await t.prisma.incident.findFirstOrThrow({ where: { monitorId }, include: { updates: true } });
    expect(incident.status).toBe('RESOLVED');
    expect(incident.resolvedAt).not.toBeNull();
    expect(incident.updates.map((u) => u.type).sort()).toEqual(['CREATED', 'RESOLVED']);
    // Email channel only subscribes to MONITOR_DOWN; the webhook gets the recovery.
    const recovered = await t.prisma.notificationDelivery.findMany({ where: { event: 'MONITOR_RECOVERED' } });
    expect(recovered).toHaveLength(1);
    await worker.tick();
    expect(receiver.state.requests.filter((r) => r.headers['x-pulsewatch-event'] === 'MONITOR_RECOVERED')).toHaveLength(1);
  });

  it('a new outage after resolution opens a new incident', async () => {
    target.state.status = 500;
    await makeDue(monitorId);
    await runDueChecks();
    expect(await t.prisma.incident.count({ where: { monitorId } })).toBe(2);
    expect(await t.prisma.incident.count({ where: { monitorId, status: { not: 'RESOLVED' } } })).toBe(1);
    target.state.status = 200;
    await makeDue(monitorId);
    await runDueChecks();
  });

  it('records timeouts', async () => {
    target.state.delayMs = 1500;
    await makeDue(monitorId);
    await runDueChecks();
    target.state.delayMs = 0;
    const last = await t.prisma.checkResult.findFirstOrThrow({ where: { monitorId }, orderBy: { checkedAt: 'desc' } });
    expect(last).toMatchObject({ success: false, errorType: 'TIMEOUT' });
    target.state.status = 200;
    await makeDue(monitorId);
    await runDueChecks();
  });

  it('records connection failures', async () => {
    const id = (
      await t.http().post(`${base}/monitors`).set(owner.auth).send({ name: 'Dead port', url: 'http://127.0.0.1:1/', retries: 0 }).expect(201)
    ).body.data.id;
    await runDueChecks();
    const last = await t.prisma.checkResult.findFirstOrThrow({ where: { monitorId: id } });
    expect(last).toMatchObject({ success: false, errorType: 'CONNECTION' });
    await t.http().delete(`${base}/monitors/${id}`).set(owner.auth).expect(204);
    // Deleting a monitor resolves its open incident and keeps the history
    const orphan = await t.prisma.incident.findFirstOrThrow({ where: { title: 'Dead port is down' } });
    expect(orphan).toMatchObject({ status: 'RESOLVED', monitorId: null });
  });

  it('never leases the same monitor twice (no overlapping checks)', async () => {
    await makeDue(monitorId);
    const [a, b] = await Promise.all([engine.claimDue(10), engine.claimDue(10)]);
    expect([...a, ...b].filter((id) => id === monitorId)).toHaveLength(1);
    expect(await engine.claimOne(monitorId)).toBe(false);
    await t.http().post(`${base}/monitors/${monitorId}/check`).set(owner.auth).expect(409);
    await t.prisma.monitor.update({ where: { id: monitorId }, data: { lockedUntil: null } });
  });

  it('recovers stale leases after a crash or restart', async () => {
    await t.prisma.monitor.update({
      where: { id: monitorId },
      data: { lockedUntil: new Date(Date.now() - 1000), nextCheckAt: new Date(Date.now() - 60_000) },
    });
    expect(await engine.claimDue(10)).toContain(monitorId);
    await engine.runClaimed(monitorId);
    expect((await t.prisma.monitor.findUniqueOrThrow({ where: { id: monitorId } })).lockedUntil).toBeNull();
  });

  it('skips paused monitors and supports on-demand checks', async () => {
    await t.http().post(`${base}/monitors/${monitorId}/pause`).set(owner.auth).expect(200);
    await makeDue(monitorId);
    expect(await runDueChecks()).toBe(0);
    await t.http().post(`${base}/monitors/${monitorId}/check`).set(owner.auth).expect(409);
    const resumed = await t.http().post(`${base}/monitors/${monitorId}/resume`).set(owner.auth).expect(200);
    expect(resumed.body.data.status).toBe('up');
    const now = await t.http().post(`${base}/monitors/${monitorId}/check`).set(owner.auth).expect(200);
    expect(now.body.data).toMatchObject({ success: true, statusCode: 200 });
    const list = await t.http().get(`${base}/monitors/${monitorId}/checks?pageSize=5`).set(owner.auth).expect(200);
    expect(list.body.meta).toMatchObject({ page: 1, pageSize: 5 });
    expect(list.body.data[0].success).toBe(true);
  });

  it('retries failed webhook deliveries with backoff and logs them', async () => {
    receiver.state.status = 500;
    const test1 = await t.prisma.notificationDelivery.create({
      data: {
        workspaceId: ws.id,
        channelId: (await t.prisma.notificationChannel.findFirstOrThrow({ where: { type: 'WEBHOOK' } })).id,
        event: 'MONITOR_DOWN',
        payload: { event: 'MONITOR_DOWN', summary: 'retry test', occurredAt: new Date().toISOString(), workspace: { id: ws.id, name: 'Ops Co' } },
        maxAttempts: 3,
      },
    });
    await worker.tick();
    let d = await t.prisma.notificationDelivery.findUniqueOrThrow({ where: { id: test1.id } });
    expect(d).toMatchObject({ status: 'PENDING', attempts: 1, responseStatus: 500 });
    expect(d.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 20_000);
    expect(await worker.tick()).toBe(0); // not due yet

    await flushDeliveries();
    await flushDeliveries();
    d = await t.prisma.notificationDelivery.findUniqueOrThrow({ where: { id: test1.id } });
    expect(d).toMatchObject({ status: 'FAILED', attempts: 3 });

    receiver.state.status = 200;
    const log = await t.http().get(`${base}/notifications/deliveries?status=FAILED`).set(owner.auth).expect(200);
    expect(log.body.data[0]).toMatchObject({ id: test1.id, status: 'FAILED', summary: 'retry test' });
    expect(JSON.stringify(log.body)).not.toContain(webhookSecret);
  });

  it('sends test notifications synchronously', async () => {
    const channels = await t.http().get(`${base}/notifications/channels`).set(owner.auth).expect(200);
    for (const c of channels.body.data) {
      const res = await t.http().post(`${base}/notifications/channels/${c.id}/test`).set(owner.auth).expect(200);
      expect(res.body.data).toMatchObject({ ok: true, status: 'SUCCESS' });
    }
    expect(smtp.messages.some((m) => m.raw.includes('This is a test notification'))).toBe(true);
  });

  it('rejects SSRF targets for webhooks when private targets are disallowed', async () => {
    // ALLOW_PRIVATE_TARGETS is enabled for this suite; validate the rule directly instead.
    const { validateTargetUrl } = await import('../../src/common/net/ip-policy.js');
    expect(validateTargetUrl(receiver.url('/hook'), false).ok).toBe(false);
  });
});
