import { createTestApp, registerUser, resetDatabase, type TestApp } from '../helpers/app.js';

describe('Auth (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
  });
  afterAll(() => t.close());

  const cookieOf = (res: { headers: Record<string, unknown> }) =>
    ((res.headers['set-cookie'] as string[]) ?? []).find((c) => c.startsWith('pw_refresh='))?.split(';')[0];

  it('registers, sets an httpOnly refresh cookie and never returns the password hash', async () => {
    const res = await t.http().post('/api/auth/register').send({ email: 'Ada@Example.com', name: 'Ada', password: 'correct-horse-battery' }).expect(201);
    expect(res.body.data.user.email).toBe('ada@example.com');
    expect(res.body.data.accessToken).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    const raw = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(raw).toContain('HttpOnly');
    expect(raw).toContain('SameSite=Strict');
    expect(raw).toContain('Path=/api/auth');
    const stored = await t.prisma.user.findUniqueOrThrow({ where: { email: 'ada@example.com' } });
    expect(stored.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('rejects duplicate emails and invalid input', async () => {
    await t.http().post('/api/auth/register').send({ email: 'ada@example.com', name: 'Ada', password: 'correct-horse-battery' }).expect(409);
    const bad = await t.http().post('/api/auth/register').send({ email: 'nope', name: '', password: 'x' }).expect(400);
    expect(bad.body.error.code).toBe('BAD_REQUEST');
    expect(bad.body.error.details.length).toBeGreaterThanOrEqual(3);
  });

  it('logs in with valid credentials only', async () => {
    await t.http().post('/api/auth/login').send({ email: 'ada@example.com', password: 'wrong-password' }).expect(401);
    await t.http().post('/api/auth/login').send({ email: 'ghost@example.com', password: 'whatever-123' }).expect(401);
    const ok = await t.http().post('/api/auth/login').send({ email: 'ADA@example.com', password: 'correct-horse-battery' }).expect(200);
    expect(ok.body.data.user.name).toBe('Ada');
  });

  it('protects routes with the access token', async () => {
    const u = await registerUser(t, 'Bob');
    await t.http().get('/api/users/me').expect(401);
    await t.http().get('/api/users/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
    const me = await t.http().get('/api/users/me').set(u.auth).expect(200);
    expect(me.body.data.email).toBe(u.email);
  });

  it('rotates refresh tokens and detects reuse of a rotated token', async () => {
    const u = await registerUser(t, 'Carol');
    const first = await t.http().post('/api/auth/refresh').set('Cookie', u.cookie).expect(200);
    const rotated = cookieOf(first)!;
    expect(rotated).not.toEqual(u.cookie);
    await t.http().get('/api/users/me').set('Authorization', `Bearer ${first.body.data.accessToken}`).expect(200);

    // Simulate a stolen old token being replayed later than the concurrency grace window.
    await t.prisma.refreshToken.updateMany({ where: { userId: u.id, revokedAt: { not: null } }, data: { revokedAt: new Date(Date.now() - 60_000) } });
    await t.http().post('/api/auth/refresh').set('Cookie', u.cookie).expect(401);
    // The whole family is revoked: the legitimately rotated token stops working too.
    await t.http().post('/api/auth/refresh').set('Cookie', rotated).expect(401);
  });

  it('logout revokes the refresh token', async () => {
    const u = await registerUser(t, 'Dan');
    await t.http().post('/api/auth/logout').set('Cookie', u.cookie).expect(204);
    await t.http().post('/api/auth/refresh').set('Cookie', u.cookie).expect(401);
    await t.http().post('/api/auth/refresh').expect(401);
  });

  it('changing the password revokes all sessions', async () => {
    const u = await registerUser(t, 'Eve');
    await t.http().post('/api/users/me/password').set(u.auth).send({ currentPassword: 'bad', newPassword: 'another-good-pass' }).expect(400);
    await t.http().post('/api/users/me/password').set(u.auth).send({ currentPassword: 'correct-horse-battery', newPassword: 'another-good-pass' }).expect(204);
    await t.http().post('/api/auth/refresh').set('Cookie', u.cookie).expect(401);
    await t.http().post('/api/auth/login').send({ email: u.email, password: 'another-good-pass' }).expect(200);
  });

  it('updates the profile', async () => {
    const u = await registerUser(t, 'Fay');
    const res = await t.http().patch('/api/users/me').set(u.auth).send({ name: 'Fay Updated' }).expect(200);
    expect(res.body.data.name).toBe('Fay Updated');
  });

  it('returns consistent error envelopes with request ids', async () => {
    const res = await t.http().get('/api/does-not-exist').set('X-Request-Id', 'test-request-0001').expect(404);
    expect(res.body).toMatchObject({ error: { statusCode: 404, code: 'NOT_FOUND' }, requestId: 'test-request-0001' });
    expect(res.headers['x-request-id']).toBe('test-request-0001');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
