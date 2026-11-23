import { ConflictException } from '@nestjs/common';
import { assertCanTransition, isActive } from './incident-lifecycle.js';

describe('incident lifecycle', () => {
  it('allows moving between unresolved statuses in any order', () => {
    expect(() => assertCanTransition('OPEN', 'INVESTIGATING')).not.toThrow();
    expect(() => assertCanTransition('INVESTIGATING', 'IDENTIFIED')).not.toThrow();
    expect(() => assertCanTransition('MONITORING', 'INVESTIGATING')).not.toThrow();
    expect(() => assertCanTransition('IDENTIFIED', 'RESOLVED')).not.toThrow();
  });

  it('rejects no-op transitions', () => {
    expect(() => assertCanTransition('MONITORING', 'MONITORING')).toThrow(ConflictException);
  });

  it('treats resolved incidents as immutable', () => {
    expect(() => assertCanTransition('RESOLVED', 'OPEN')).toThrow(/cannot be changed/);
    expect(isActive('RESOLVED')).toBe(false);
    expect(isActive('MONITORING')).toBe(true);
  });
});
