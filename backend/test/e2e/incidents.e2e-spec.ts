import { addMember, createTestApp, createWorkspace, registerUser, resetDatabase, type TestApp, type TestUser } from '../helpers/app.js';

describe('Incident management (e2e)', () => {
  let t: TestApp;
  let owner: TestUser;
  let viewer: TestUser;
  let base: string;
  let monitorId: string;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    owner = await registerUser(t, 'Owner');
    viewer = await registerUser(t, 'Viewer');
    const ws = await createWorkspace(t, owner, 'Incidents Co');
    base = `/api/workspaces/${ws.id}`;
    await addMember(t, owner, ws.id, viewer, 'VIEWER');
    monitorId = (await t.http().post(`${base}/monitors`).set(owner.auth).send({ name: 'Web', url: 'http://127.0.0.1:9/' }).expect(201)).body.data.id;
  });
  afterAll(() => t.close());

  it('runs the full lifecycle with a timeline', async () => {
    const created = await t.http().post(`${base}/incidents`).set(owner.auth)
      .send({ title: 'Elevated error rates', severity: 'CRITICAL', message: 'We are investigating.', monitorId }).expect(201);
    const id = created.body.data.id;
    expect(created.body.data).toMatchObject({ status: 'INVESTIGATING', severity: 'CRITICAL', isAutomatic: false });

    await t.http().post(`${base}/incidents/${id}/updates`).set(owner.auth).send({ status: 'IDENTIFIED', message: 'Bad deploy found.' }).expect(201);
    await t.http().post(`${base}/incidents/${id}/updates`).set(owner.auth).send({ message: 'Rolled back v1.2.3', isInternal: true }).expect(201);
    await t.http().post(`${base}/incidents/${id}/updates`).set(owner.auth).send({ status: 'IDENTIFIED', message: 'again' }).expect(409);
    await t.http().post(`${base}/incidents/${id}/updates`).set(owner.auth).send({ status: 'MONITORING', message: 'Fix deployed.' }).expect(201);
    await t.http().post(`${base}/incidents/${id}/updates`).set(owner.auth).send({ status: 'MONITORING', message: 'x', isInternal: true }).expect(400);

    const resolved = await t.http().post(`${base}/incidents/${id}/resolve`).set(owner.auth).send({ resolution: 'Rollback fixed it.' }).expect(200);
    expect(resolved.body.data).toMatchObject({ status: 'RESOLVED', resolution: 'Rollback fixed it.' });
    expect(resolved.body.data.resolvedAt).toBeTruthy();
    const types = resolved.body.data.updates.map((u: { type: string }) => u.type);
    expect(types).toEqual(['RESOLVED', 'STATUS_CHANGE', 'NOTE', 'STATUS_CHANGE', 'CREATED']);
    expect(resolved.body.data.updates.find((u: { type: string }) => u.type === 'NOTE').isInternal).toBe(true);

    await t.http().post(`${base}/incidents/${id}/resolve`).set(owner.auth).send({ resolution: 'again' }).expect(409);
    await t.http().post(`${base}/incidents/${id}/updates`).set(owner.auth).send({ status: 'OPEN', message: 'reopen' }).expect(409);
    await t.http().post(`${base}/incidents/${id}/updates`).set(owner.auth).send({ message: 'Postmortem scheduled', isInternal: true }).expect(201);
  });

  it('prevents two active incidents for the same monitor', async () => {
    await t.http().post(`${base}/incidents`).set(owner.auth).send({ title: 'First outage', message: 'x', monitorId }).expect(201);
    const dup = await t.http().post(`${base}/incidents`).set(owner.auth).send({ title: 'Second outage', message: 'x', monitorId }).expect(409);
    expect(dup.body.error.message).toContain('already has an active incident');
    // Incidents without a monitor are not limited
    await t.http().post(`${base}/incidents`).set(owner.auth).send({ title: 'General issue', message: 'x' }).expect(201);
    await t.http().post(`${base}/incidents`).set(owner.auth).send({ title: 'Another general issue', message: 'x' }).expect(201);
  });

  it('filters and paginates incident history', async () => {
    const active = await t.http().get(`${base}/incidents?state=active`).set(viewer.auth).expect(200);
    expect(active.body.data.every((i: { status: string }) => i.status !== 'RESOLVED')).toBe(true);
    expect(active.body.meta.total).toBe(3);
    const resolved = await t.http().get(`${base}/incidents?state=resolved`).set(viewer.auth).expect(200);
    expect(resolved.body.meta.total).toBe(1);
    const page = await t.http().get(`${base}/incidents?pageSize=2&page=2`).set(viewer.auth).expect(200);
    expect(page.body.meta).toMatchObject({ page: 2, pageSize: 2, total: 4, totalPages: 2 });
    const byMonitor = await t.http().get(`${base}/incidents?monitorId=${monitorId}`).set(viewer.auth).expect(200);
    expect(byMonitor.body.meta.total).toBe(2);
  });

  it('allows editing title, severity and visibility', async () => {
    const list = await t.http().get(`${base}/incidents?state=active`).set(owner.auth).expect(200);
    const id = list.body.data[0].id;
    const res = await t.http().patch(`${base}/incidents/${id}`).set(owner.auth).send({ severity: 'MINOR', isPublic: false }).expect(200);
    expect(res.body.data).toMatchObject({ severity: 'MINOR', isPublic: false });
    await t.http().patch(`${base}/incidents/${id}`).set(viewer.auth).send({ severity: 'MAJOR' }).expect(403);
  });
});
