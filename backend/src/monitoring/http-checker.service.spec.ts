import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AppConfig } from '../config/app-config.service.js';
import { HttpCheckerService, type CheckTarget } from './http-checker.service.js';

describe('HttpCheckerService', () => {
  let server: http.Server;
  let url: string;
  let responses: number[];
  let hits = 0;

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      hits++;
      res.writeHead(responses.shift() ?? 200).end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });
  beforeEach(() => (hits = 0));

  const make = (allowPrivate = true) => {
    const checker = new HttpCheckerService({ get: () => allowPrivate } as unknown as AppConfig);
    checker.retryDelayMs = 1;
    return checker;
  };
  const target = (overrides: Partial<CheckTarget> = {}): CheckTarget => ({
    url, method: 'GET', headers: {}, body: null, timeoutMs: 2000, expectedStatusCodes: [200], retries: 2, ...overrides,
  });

  it('succeeds on an expected status', async () => {
    responses = [200];
    const r = await make().check(target());
    expect(r).toMatchObject({ success: true, statusCode: 200, errorType: null, attempts: 1 });
  });

  it('retries failures and succeeds when a retry passes', async () => {
    responses = [500, 200];
    const r = await make().check(target());
    expect(r).toMatchObject({ success: true, attempts: 2 });
    expect(hits).toBe(2);
  });

  it('reports a status mismatch after exhausting retries', async () => {
    responses = [503, 503, 503];
    const r = await make().check(target());
    expect(r).toMatchObject({ success: false, statusCode: 503, errorType: 'STATUS_MISMATCH', attempts: 3 });
    expect(r.error).toContain('Unexpected status code 503');
  });

  it('does not retry SSRF-blocked targets', async () => {
    const r = await make(false).check(target());
    expect(r).toMatchObject({ success: false, errorType: 'BLOCKED_TARGET', attempts: 1 });
    expect(hits).toBe(0);
  });
});
