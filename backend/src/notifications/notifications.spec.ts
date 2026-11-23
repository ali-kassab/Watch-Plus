import { nextRetryDelayMs } from './backoff.js';
import { maskUrl } from './channel-config.js';
import { renderEmail } from './notification-payload.js';
import { signWebhook, verifyWebhook } from './webhook-signature.js';

describe('nextRetryDelayMs', () => {
  it('backs off exponentially with a cap', () => {
    expect(nextRetryDelayMs(1)).toBe(30_000);
    expect(nextRetryDelayMs(2)).toBe(60_000);
    expect(nextRetryDelayMs(3)).toBe(120_000);
    expect(nextRetryDelayMs(20)).toBe(3_600_000);
  });
});

describe('webhook signatures', () => {
  const body = JSON.stringify({ event: 'MONITOR_DOWN' });
  it('round-trips', () => {
    const header = signWebhook(body, 'super-secret-value');
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(verifyWebhook(body, header, 'super-secret-value')).toBe(true);
  });
  it('rejects tampered bodies, wrong secrets and stale timestamps', () => {
    const header = signWebhook(body, 'super-secret-value');
    expect(verifyWebhook(body + ' ', header, 'super-secret-value')).toBe(false);
    expect(verifyWebhook(body, header, 'other-secret-value')).toBe(false);
    const old = signWebhook(body, 'super-secret-value', Math.floor(Date.now() / 1000) - 3600);
    expect(verifyWebhook(body, old, 'super-secret-value')).toBe(false);
  });
});

describe('maskUrl', () => {
  it('hides paths and query strings that may contain tokens', () => {
    expect(maskUrl('https://hooks.slack.com/services/T000/B000/XXXXabcd')).toBe('https://hooks.slack.com/…abcd');
    expect(maskUrl('https://example.com/hook?token=secret1234')).toBe('https://example.com/…1234');
    expect(maskUrl('https://example.com/hook?token=secret1234')).not.toContain('secret');
  });
});

describe('renderEmail', () => {
  it('renders a down alert', () => {
    const { subject, text } = renderEmail({
      event: 'MONITOR_DOWN',
      occurredAt: '2026-01-01T00:00:00.000Z',
      workspace: { id: 'w', name: 'Acme' },
      summary: 'API is DOWN',
      monitor: { id: 'm', name: 'API', url: 'https://api.example.com' },
      check: { statusCode: 503, responseTimeMs: 120, error: 'Unexpected status code 503' },
    });
    expect(subject).toContain('DOWN');
    expect(subject).toContain('API');
    expect(text).toContain('Status code: 503');
    expect(text).toContain('Workspace: Acme');
  });
});
