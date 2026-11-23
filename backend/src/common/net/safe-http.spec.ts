import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { guardedLookup, safeRequest, SafeHttpError } from './safe-http.js';

describe('safeRequest', () => {
  let server: http.Server;
  let base: string;
  let handler: (req: http.IncomingMessage, res: http.ServerResponse) => void;

  beforeAll(async () => {
    server = http.createServer((req, res) => handler(req, res));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });

  it('returns status code, body and response time', async () => {
    handler = (_req, res) => res.writeHead(201).end('created');
    const res = await safeRequest({ url: `${base}/x`, method: 'GET', timeoutMs: 2000, allowPrivate: true });
    expect(res.statusCode).toBe(201);
    expect(res.body).toBe('created');
    expect(res.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('sends method, headers and body', async () => {
    let seen: { method?: string; header?: string; body: string } = { body: '' };
    handler = (req, res) => {
      req.on('data', (c) => (seen.body += c));
      req.on('end', () => {
        seen = { ...seen, method: req.method, header: req.headers['x-api-key'] as string };
        res.end('ok');
      });
    };
    await safeRequest({ url: base, method: 'POST', headers: { 'x-api-key': 'k1' }, body: '{"a":1}', timeoutMs: 2000, allowPrivate: true });
    expect(seen).toEqual({ method: 'POST', header: 'k1', body: '{"a":1}' });
  });

  it('does not follow redirects', async () => {
    handler = (_req, res) => res.writeHead(302, { location: 'http://169.254.169.254/' }).end();
    const res = await safeRequest({ url: base, method: 'GET', timeoutMs: 2000, allowPrivate: true });
    expect(res.statusCode).toBe(302);
  });

  it('times out slow responses', async () => {
    handler = (_req, res) => setTimeout(() => !res.destroyed && res.end('late'), 500);
    await expect(safeRequest({ url: base, method: 'GET', timeoutMs: 100, allowPrivate: true })).rejects.toMatchObject({ type: 'TIMEOUT' });
  });

  it('classifies refused connections', async () => {
    await expect(safeRequest({ url: 'http://127.0.0.1:1/', method: 'GET', timeoutMs: 2000, allowPrivate: true })).rejects.toMatchObject({
      type: 'CONNECTION',
    });
  });

  it('blocks private targets when not allowed', async () => {
    await expect(safeRequest({ url: base, method: 'GET', timeoutMs: 2000, allowPrivate: false })).rejects.toMatchObject({
      type: 'BLOCKED_TARGET',
    });
  });
});

describe('guardedLookup', () => {
  it('refuses host names that resolve to private addresses (DNS rebinding protection)', async () => {
    const lookup = guardedLookup(false);
    const err = await new Promise<unknown>((resolve) => lookup('localhost', {}, (e) => resolve(e)));
    expect(err).toBeInstanceOf(SafeHttpError);
    expect((err as SafeHttpError).type).toBe('BLOCKED_TARGET');
  });

  it('resolves normally when private targets are allowed', async () => {
    const lookup = guardedLookup(true);
    const address = await new Promise<string>((resolve) => lookup('localhost', {}, (_e, a) => resolve(a as string)));
    expect(['127.0.0.1', '::1']).toContain(address);
  });
});
