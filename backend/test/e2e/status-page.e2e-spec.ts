import { createTestApp, createWorkspace, registerUser, resetDatabase, type TestApp, type TestUser } from '../helpers/app.js';

describe('Public status page (e2e)', () => {
  let t: TestApp;
  let owner: TestUser;
  let base: string;
  let slug: string;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    owner = await registerUser(t, 'Owner');
    const ws = await createWorkspace(t, owner, 'Public Co');
    base = `/api/workspaces/${ws.id}`;
    slug = ws.slug;
    const visible = (await t.http().post(`${base}/monitors`).set(owner.auth)
      .send({ name: 'Website', url: 'http://127.0.0.1:9/secret-path', headers: { Authorization: 'Bearer xyz' } }).expect(201)).body.data;
    await t.http().post(`${base}/monitors`).set(owner.auth).send({ name: 'Internal DB', url: 'http://127.0.0.1:9/db', showOnStatusPage: false }).expect(201);
    await t.prisma.monitor.update({ where: { id: visible.id }, data: { health: 'DOWN' } });
    await t.prisma.checkResult.createMany({
      data: [
        { monitorId: visible.id, success: true, statusCode: 200, responseTimeMs: 100, checkedAt: new Date(Date.now() - 86_400_000) },
        { monitorId: visible.id, success: false, statusCode: 500, checkedAt: new Date(Date.now() - 86_400_000) },
        { monitorId: visible.id, success: true, statusCode: 200, responseTimeMs: 100 },
      ],
    });
    const inc = await t.http().post(`${base}/incidents`).set(owner.auth).send({ title: 'Website outage', message: 'Investigating', monitorId: visible.id }).expect(201);
    await t.http().post(`${base}/incidents/${inc.body.data.id}/updates`).set(owner.auth).send({ message: 'INTERNAL: db password rotated', isInternal: true }).expect(201);
    await t.http().post(`${base}/incidents`).set(owner.auth).send({ title: 'Private matter', message: 'hidden', isPublic: false }).expect(201);
  });
  afterAll(() => t.close());

  it('is not reachable until published', async () => {
    await t.http().get(`/api/public/status-pages/${slug}`).expect(404);
    await t.http().get('/api/public/status-pages/does-not-exist').expect(404);
  });

  it('publishes with a custom slug and rejects taken slugs', async () => {
    const res = await t.http().patch(`${base}/status-page`).set(owner.auth)
      .send({ isPublished: true, slug: 'public-co-status', title: 'Public Co Status', description: 'Live status' }).expect(200);
    expect(res.body.data).toMatchObject({ isPublished: true, slug: 'public-co-status' });
    slug = 'public-co-status';
    const other = await registerUser(t, 'Other');
    const ws2 = await createWorkspace(t, other, 'Other Co');
    await t.http().patch(`/api/workspaces/${ws2.id}/status-page`).set(other.auth).send({ slug: 'public-co-status' }).expect(409);
    await t.http().patch(`${base}/status-page`).set(owner.auth).send({ slug: 'Bad Slug!' }).expect(400);
  });

  it('shows current status, uptime history and public incidents only', async () => {
    const res = await t.http().get(`/api/public/status-pages/${slug}`).expect(200);
    const page = res.body.data;
    expect(page).toMatchObject({ title: 'Public Co Status', description: 'Live status', status: 'major_outage' });
    expect(page.services).toHaveLength(1);
    expect(page.services[0]).toMatchObject({ name: 'Website', status: 'down', uptime90d: 66.67 });
    expect(page.services[0].history).toHaveLength(90);
    expect(page.activeIncidents).toHaveLength(1);
    expect(page.activeIncidents[0]).toMatchObject({ title: 'Website outage', affectedService: 'Website' });
    expect(page.activeIncidents[0].updates).toHaveLength(1);
    expect(res.headers['cache-control']).toContain('max-age=30');
  });

  it('does not leak private workspace data', async () => {
    const json = JSON.stringify((await t.http().get(`/api/public/status-pages/${slug}`).expect(200)).body);
    for (const secret of ['127.0.0.1', 'secret-path', 'Bearer xyz', 'Internal DB', 'INTERNAL', 'Private matter', 'workspaceId', owner.email, owner.id]) {
      expect(json).not.toContain(secret);
    }
  });
});
