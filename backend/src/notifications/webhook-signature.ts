import { createHmac, timingSafeEqual } from 'node:crypto';

/** Header: `X-PulseWatch-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">` */
export function signWebhook(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${mac}`;
}

/** Reference verifier for receivers (also used in tests). */
export function verifyWebhook(body: string, header: string, secret: string, toleranceSec = 300): boolean {
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || !parts.v1 || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = Buffer.from(signWebhook(body, secret, t).split('v1=')[1], 'hex');
  const given = Buffer.from(parts.v1, 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
