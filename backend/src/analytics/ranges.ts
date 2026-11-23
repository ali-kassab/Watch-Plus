import { z } from 'zod';

export const rangeSchema = z.enum(['24h', '7d', '30d', '90d']).default('24h');
export type Range = z.infer<typeof rangeSchema>;

const HOUR = 3_600_000;
export const RANGES: Record<Range, { durationMs: number; stepMs: number; stepSql: string }> = {
  '24h': { durationMs: 24 * HOUR, stepMs: HOUR, stepSql: '1 hour' },
  '7d': { durationMs: 7 * 24 * HOUR, stepMs: 6 * HOUR, stepSql: '6 hours' },
  '30d': { durationMs: 30 * 24 * HOUR, stepMs: 24 * HOUR, stepSql: '1 day' },
  '90d': { durationMs: 90 * 24 * HOUR, stepMs: 24 * HOUR, stepSql: '1 day' },
};

/** Must match the origin passed to SQL date_bin(). */
export const BUCKET_ORIGIN = Date.UTC(2000, 0, 1);

export function bucketStart(t: number, stepMs: number): number {
  return BUCKET_ORIGIN + Math.floor((t - BUCKET_ORIGIN) / stepMs) * stepMs;
}

/** All bucket start times covering [now - duration, now], oldest first. */
export function bucketsFor(range: Range, now = Date.now()): number[] {
  const { durationMs, stepMs } = RANGES[range];
  const first = bucketStart(now - durationMs + stepMs, stepMs);
  const out: number[] = [];
  for (let t = first; t <= now; t += stepMs) out.push(t);
  return out;
}

export function percent(ok: number, total: number): number | null {
  return total === 0 ? null : Math.round((ok / total) * 10000) / 100;
}
