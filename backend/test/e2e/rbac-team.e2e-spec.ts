import { addMember, createTestApp, createWorkspace, registerUser, resetDatabase, type TestApp, type TestUser } from '../helpers/app.js';

describe('Roles & team management (e2e)', () => {
  let t: TestApp;
  let owner: TestUser, admin: TestUser, member: TestUser, viewer: TestUser, outsider: TestUser;
  let ws: { id: string };
  let base: string;
  let monitorId: string;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    [owner, admin, member, viewer, outsider] = await Promise.all(['Owner', 'Admin', 'Member', 'Viewer', 'Outsider'].map((n) => registerUser(t, n)));
    ws = await createWorkspace(t, owner, 'Team Co');
    base = `/api/workspaces/${ws.id}`;
    await addMember(t, owner, ws.id, admin, 'ADMIN');
    await addMember(t, owner, ws.id, member, 'MEMBER');
    await addMember(t, owner, ws.id, viewer, 'VIEWER');
    monitorId = (
      await t.http().post(`${base}/monitors`).set(owner.auth)
        .send({ name: 'API', url: 'http://127.0.0.1:9/', headers: { 'X-Api-Key': 'top-secret' } }).expect(201)
    ).body.data.id;
  });
  afterAll(() => t.close());

  const memberId = async (user: TestUser) =>
    (await t.prisma.membership.findFirstOrThrow({ where: { workspaceId: ws.id, userId: user.id } })).id;

  it('lists members with roles', async () => {
    const res = await t.http().get(`${base}/members`).set(viewer.auth).expect(200);
    expect(res.body.data.map((m: { role: string }) => m.role).sort()).toEqual(['ADMIN', 'MEMBER', 'OWNER', 'VIEWER']);
  });

  it('viewers can read but not write', async () => {
    await t.http().get(`${base}/monitors`).set(viewer.auth).expect(200);
    await t.http().post(`${base}/monitors`).set(viewer.auth).send({ name: 'x', url: 'http://127.0.0.1:9/' }).expect(403);
    await t.http().post(`${base}/incidents`).set(viewer.auth).send({ title: 'Nope', message: 'x' }).expect(403);
    await t.http().post(`${base}/monitors/${monitorId}/pause`).set(viewer.auth).expect(403);
    await t.http().get(`${base}/notifications/channels`).set(viewer.auth).expect(403);
  });

  it('masks monitor header values for viewers only', async () => {
    const asViewer = await t.http().get(`${base}/monitors/${monitorId}`).set(viewer.auth).expect(200);
    expect(asViewer.body.data.headers['X-Api-Key']).toBe('••••••');
    const asMember = await t.http().get(`${base}/monitors/${monitorId}`).set(member.auth).expect(200);
    expect(asMember.body.data.headers['X-Api-Key']).toBe('top-secret');
  });

  it('members manage monitors and incidents but cannot delete monitors or manage the team', async () => {
    await t.http().patch(`${base}/monitors/${monitorId}`).set(member.auth).send({ name: 'API v2' }).expect(200);
    await t.http().delete(`${base}/monitors/${monitorId}`).set(member.auth).expect(403);
    await t.http().post(`${base}/invitations`).set(member.auth).send({ email: 'x@example.com' }).expect(403);
    await t.http().patch(`${base}/status-page`).set(member.auth).send({ isPublished: true }).expect(403);
  });

  it('admins cannot grant OWNER or manage owners and peers', async () => {
    await t.http().post(`${base}/invitations`).set(admin.auth).send({ email: 'new@example.com', role: 'OWNER' }).expect(403);
    await t.http().patch(`${base}/members/${await memberId(member)}`).set(admin.auth).send({ role: 'OWNER' }).expect(403);
    await t.http().delete(`${base}/members/${await memberId(owner)}`).set(admin.auth).expect(403);
    await t.http().patch(`${base}/members/${await memberId(viewer)}`).set(admin.auth).send({ role: 'MEMBER' }).expect(200);
    await t.http().patch(`${base}/members/${await memberId(viewer)}`).set(admin.auth).send({ role: 'VIEWER' }).expect(200);
  });

  it('only owners delete the workspace', async () => {
    await t.http().delete(base).set(admin.auth).expect(403);
  });

  it('keeps at least one owner', async () => {
    await t.http().post(`${base}/leave`).set(owner.auth).expect(400);
    await t.http().patch(`${base}/members/${await memberId(owner)}`).set(owner.auth).send({ role: 'ADMIN' }).expect(400);
  });

  it('invitations are single-use, email-bound and revocable', async () => {
    const inv = await t.http().post(`${base}/invitations`).set(owner.auth).send({ email: outsider.email, role: 'VIEWER' }).expect(201);
    const token = inv.body.data.inviteUrl.split('/invite/')[1];
    expect(JSON.stringify(inv.body)).not.toContain('tokenHash');
    const preview = await t.http().get(`/api/invitations/${token}`).expect(200);
    expect(preview.body.data).toMatchObject({ workspaceName: 'Team Co', role: 'VIEWER' });

    await t.http().post(`/api/invitations/${token}/accept`).set(member.auth).expect(403);
    await t.http().post(`/api/invitations/${token}/accept`).expect(401);
    await t.http().post(`/api/invitations/${token}/accept`).set(outsider.auth).expect(201);
    await t.http().post(`/api/invitations/${token}/accept`).set(outsider.auth).expect(410);
    await t.http().get(`${base}/monitors`).set(outsider.auth).expect(200);

    const again = await t.http().post(`${base}/invitations`).set(owner.auth).send({ email: 'later@example.com' }).expect(201);
    await t.http().delete(`${base}/invitations/${again.body.data.id}`).set(owner.auth).expect(204);
    await t.http().get(`/api/invitations/${again.body.data.inviteUrl.split('/invite/')[1]}`).expect(410);
    await t.http().post(`${base}/invitations`).set(owner.auth).send({ email: member.email }).expect(409);
  });

  it('removed members immediately lose access', async () => {
    await t.http().delete(`${base}/members/${await memberId(outsider)}`).set(admin.auth).expect(204);
    await t.http().get(`${base}/monitors`).set(outsider.auth).expect(404);
  });

  it('admins can delete monitors; owners can delete the workspace', async () => {
    await t.http().delete(`${base}/monitors/${monitorId}`).set(admin.auth).expect(204);
    await t.http().delete(base).set(owner.auth).expect(204);
    await t.http().get(base).set(owner.auth).expect(404);
  });
});
