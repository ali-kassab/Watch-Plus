import { describe, expect, it } from 'vitest';
import { logPath } from './request-id.middleware.js';

describe('logPath', () => {
  it('drops the query string', () => {
    expect(logPath('/api/workspaces/abc/monitors?q=secret&page=2')).toBe('/api/workspaces/abc/monitors');
  });

  it('redacts invitation tokens on preview and accept routes', () => {
    expect(logPath('/api/invitations/Zm9vYmFyYmF6cXV4LXRva2Vu')).toBe('/api/invitations/[redacted]');
    expect(logPath('/api/invitations/Zm9vYmFy_YmF6/accept?x=1')).toBe('/api/invitations/[redacted]/accept');
  });

  it('leaves other paths unchanged, including workspace invitation management', () => {
    expect(logPath('/api/workspaces/abc/invitations/123')).toBe('/api/workspaces/abc/invitations/123');
    expect(logPath('/api/invitations')).toBe('/api/invitations');
  });
});
