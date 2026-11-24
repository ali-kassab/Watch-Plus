/** Exponential backoff for failed deliveries: 30s, 60s, 120s, ... capped at 1 hour. */
export function nextRetryDelayMs(attempts: number, baseMs = 30_000, capMs = 3_600_000): number {
  return Math.min(capMs, baseMs * 2 ** Math.max(0, attempts - 1));
}
