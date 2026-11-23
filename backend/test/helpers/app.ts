import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/bootstrap.js';
import { PrismaService } from '../../src/common/prisma/prisma.service.js';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ bodyParser: false, logger: ['error'] });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma, http: () => request(app.getHttpServer()), close: () => app.close() };
}

/** Removes all rows (keeps the schema). Tests run sequentially, so this is safe between files. */
export async function resetDatabase(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE notification_deliveries, notification_channels, incident_updates, incidents,
      check_results, monitors, status_pages, invitations, memberships, refresh_tokens, workspaces, users
    RESTART IDENTITY CASCADE`);
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
  cookie: string;
  auth: { Authorization: string };
}

let counter = 0;
export async function registerUser(t: TestApp, name = 'User'): Promise<TestUser> {
  const email = `${name.toLowerCase().replace(/\W/g, '')}-${Date.now()}-${counter++}@example.com`;
  const res = await t.http().post('/api/auth/register').send({ email, name, password: 'correct-horse-battery' }).expect(201);
  const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('pw_refresh='))!.split(';')[0];
  return { id: res.body.data.user.id, email, token: res.body.data.accessToken, cookie, auth: { Authorization: `Bearer ${res.body.data.accessToken}` } };
}

export async function createWorkspace(t: TestApp, user: TestUser, name = 'Acme') {
  const res = await t.http().post('/api/workspaces').set(user.auth).send({ name }).expect(201);
  return res.body.data as { id: string; slug: string };
}

/** Invites `invitee` with `role` and accepts the invitation. */
export async function addMember(t: TestApp, owner: TestUser, workspaceId: string, invitee: TestUser, role: string) {
  const inv = await t.http().post(`/api/workspaces/${workspaceId}/invitations`).set(owner.auth).send({ email: invitee.email, role }).expect(201);
  const token = (inv.body.data.inviteUrl as string).split('/invite/')[1];
  await t.http().post(`/api/invitations/${token}/accept`).set(invitee.auth).expect(201);
}
