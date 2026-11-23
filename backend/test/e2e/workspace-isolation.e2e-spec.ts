import { createTestApp, createWorkspace, registerUser, resetDatabase, type TestApp, type TestUser } from '../helpers/app.js';

describe('Workspace isolation (e2e)', () => {
  let t: TestApp;
  let alice: TestUser;
  let mallory: TestUser;
  let aliceWs: { id: string };
  let malloryWs: { id: string };
  let aliceMonitor: string;
  let aliceIncident: string;
  let aliceChannel: string;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    alice = await registerUser(t, 'Alice');
    mallory = await registerUser(t, 'Mallory');
    aliceWs = await createWorkspace(t, alice, 'Alice Corp');
    malloryWs = await createWorkspace(t, mallory, 'Mallory Corp');
    aliceMonitor = (
      await t.http().post(`/api/workspaces/${aliceWs.id}/monitors`).set(alice.auth).send({ name: 'API', url: 'http://127.0.0.1:9/' }).expect(201)
    ).body.data.id;
    aliceIncident = (
      await t.http().post(`/api/workspaces/${aliceWs.id}/incidents`).set(alice.auth).send({ title: 'Outage', message: 'Looking into it' }).expect(201)
    ).body.data.id;
    aliceChannel = (
      await t.http().post(`/api/workspaces/${aliceWs.id}/notifications/channels`).set(alice.auth)
        .send({ type: 'WEBHOOK', name: 'Hook', url: 'http://127.0.0.1:9/hook' }).expect(201)
    ).body.data.id;
  });
  afterAll(() => t.close());

  it('lists only the caller’s workspaces', async () => {
    const res = await t.http().get('/api/workspaces').set(mallory.auth).expect(200);
    expect(res.body.data.map((w: { id: string }) => w.id)).toEqual([malloryWs.id]);
  });

  it.each([
    ['GET', ''],
    ['GET', '/monitors'],
    ['GET', '/incidents'],
    ['GET', '/members'],
    ['GET', '/notifications/channels'],
    ['GET', '/analytics/summary'],
    ['GET', '/status-page'],
    ['PATCH', ''],
    ['DELETE', ''],
  ])('returns 404 for %s on another workspace%s', async (method, path) => {
    const req = t.http()[method.toLowerCase() as 'get'](`/api/workspaces/${aliceWs.id}${path}`).set(mallory.auth);
    await (method === 'PATCH' ? req.send({ name: 'pwned' }) : req).expect(404);
  });

  it('cannot reach another workspace’s resources through its own workspace id', async () => {
    const base = `/api/workspaces/${malloryWs.id}`;
    await t.http().get(`${base}/monitors/${aliceMonitor}`).set(mallory.auth).expect(404);
    await t.http().patch(`${base}/monitors/${aliceMonitor}`).set(mallory.auth).send({ name: 'x' }).expect(404);
    await t.http().delete(`${base}/monitors/${aliceMonitor}`).set(mallory.auth).expect(404);
    await t.http().get(`${base}/monitors/${aliceMonitor}/checks`).set(mallory.auth).expect(404);
    await t.http().get(`${base}/incidents/${aliceIncident}`).set(mallory.auth).expect(404);
    await t.http().post(`${base}/incidents/${aliceIncident}/updates`).set(mallory.auth).send({ message: 'x' }).expect(404);
    await t.http().post(`${base}/incidents`).set(mallory.auth).send({ title: 'Steal', message: 'x', monitorId: aliceMonitor }).expect(404);
    await t.http().get(`${base}/notifications/channels/${aliceChannel}`).set(mallory.auth).expect(404);
    await t.http().post(`${base}/notifications/channels/${aliceChannel}/test`).set(mallory.auth).expect(404);
    const stats = await t.http().get(`${base}/analytics/summary?monitorId=${aliceMonitor}`).set(mallory.auth).expect(200);
    expect(stats.body.data.monitors.total).toBe(0);
  });

  it('rejects malformed workspace ids without leaking errors', async () => {
    await t.http().get('/api/workspaces/not-a-uuid/monitors').set(mallory.auth).expect(404);
  });

  it('never exposes webhook secrets or full URLs', async () => {
    const res = await t.http().get(`/api/workspaces/${aliceWs.id}/notifications/channels`).set(alice.auth).expect(200);
    const json = JSON.stringify(res.body);
    expect(json).not.toContain('whsec_');
    expect(json).not.toContain('/hook');
    expect(res.body.data[0].target.hasSecret).toBe(true);
    const row = await t.prisma.notificationChannel.findUniqueOrThrow({ where: { id: aliceChannel } });
    expect(row.configEncrypted).not.toContain('127.0.0.1');
  });
});
