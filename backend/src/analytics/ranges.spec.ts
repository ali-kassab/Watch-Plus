import { bucketStart, bucketsFor, percent, RANGES } from './ranges.js';
import { overallStatus } from '../status-pages/status-pages.service.js';

describe('ranges', () => {
  it('produces contiguous aligned buckets', () => {
    const now = Date.UTC(2026, 5, 15, 12, 34);
    const buckets = bucketsFor('24h', now);
    expect(buckets).toHaveLength(24);
    expect(buckets.at(-1)).toBe(Date.UTC(2026, 5, 15, 12));
    for (let i = 1; i < buckets.length; i++) expect(buckets[i] - buckets[i - 1]).toBe(RANGES['24h'].stepMs);
    expect(bucketsFor('90d', now)).toHaveLength(90);
    expect(bucketsFor('7d', now)).toHaveLength(28);
  });

  it('aligns to the same origin as SQL date_bin', () => {
    expect(bucketStart(Date.UTC(2026, 0, 1, 5, 59), 6 * 3_600_000)).toBe(Date.UTC(2026, 0, 1, 0));
  });

  it('computes percentages', () => {
    expect(percent(0, 0)).toBeNull();
    expect(percent(999, 1000)).toBe(99.9);
    expect(percent(2, 3)).toBe(66.67);
  });
});

describe('overallStatus', () => {
  it('summarizes services', () => {
    expect(overallStatus(['up', 'up'], 0)).toBe('operational');
    expect(overallStatus(['up', 'up'], 1)).toBe('degraded');
    expect(overallStatus(['up', 'down'], 1)).toBe('partial_outage');
    expect(overallStatus(['down', 'down'], 1)).toBe('major_outage');
    expect(overallStatus([], 0)).toBe('operational');
  });
});
