import { createMonitorSchema, updateMonitorSchema } from './monitors.schemas.js';

describe('createMonitorSchema', () => {
  const base = { name: 'API', url: 'https://api.example.com/health' };

  it('applies defaults', () => {
    expect(createMonitorSchema.parse(base)).toMatchObject({
      method: 'GET', intervalSeconds: 60, timeoutMs: 10_000, expectedStatusCodes: [200], retries: 1, isActive: true, headers: {},
    });
  });

  it('rejects bodies for GET/HEAD and timeouts longer than the interval', () => {
    expect(createMonitorSchema.safeParse({ ...base, body: '{}' }).success).toBe(false);
    expect(createMonitorSchema.safeParse({ ...base, method: 'POST', body: '{}' }).success).toBe(true);
    expect(createMonitorSchema.safeParse({ ...base, intervalSeconds: 10, timeoutMs: 15_000 }).success).toBe(false);
  });

  it('validates headers', () => {
    expect(createMonitorSchema.safeParse({ ...base, headers: { Authorization: 'Bearer x' } }).success).toBe(true);
    expect(createMonitorSchema.safeParse({ ...base, headers: { Host: 'internal' } }).success).toBe(false);
    expect(createMonitorSchema.safeParse({ ...base, headers: { 'Bad Name': 'x' } }).success).toBe(false);
    expect(createMonitorSchema.safeParse({ ...base, headers: { 'X-A': 'a\r\nInjected: 1' } }).success).toBe(false);
  });

  it('rejects non-http URLs and out-of-range values', () => {
    expect(createMonitorSchema.safeParse({ ...base, url: 'ftp://x.com' }).success).toBe(false);
    expect(createMonitorSchema.safeParse({ ...base, intervalSeconds: 5 }).success).toBe(false);
    expect(createMonitorSchema.safeParse({ ...base, expectedStatusCodes: [700] }).success).toBe(false);
  });
});

describe('updateMonitorSchema', () => {
  it('requires at least one field', () => {
    expect(updateMonitorSchema.safeParse({}).success).toBe(false);
    expect(updateMonitorSchema.safeParse({ name: 'New' }).success).toBe(true);
  });
});
