import { decideTransition, isExpectedStatus } from './check-evaluator.js';

describe('decideTransition', () => {
  it.each([
    ['PENDING', true, 'UP', null],
    ['PENDING', false, 'DOWN', 'WENT_DOWN'],
    ['UP', true, 'UP', null],
    ['UP', false, 'DOWN', 'WENT_DOWN'],
    ['DOWN', false, 'DOWN', null],
    ['DOWN', true, 'UP', 'RECOVERED'],
  ] as const)('%s + success=%s -> %s (%s)', (prev, success, next, transition) => {
    expect(decideTransition(prev, success)).toEqual({ next, transition });
  });
});

describe('isExpectedStatus', () => {
  it('matches configured codes only', () => {
    expect(isExpectedStatus(200, [200, 204])).toBe(true);
    expect(isExpectedStatus(204, [200, 204])).toBe(true);
    expect(isExpectedStatus(500, [200])).toBe(false);
    expect(isExpectedStatus(301, [200])).toBe(false);
  });
});
