import type { MonitorHealth } from '../generated/prisma/enums.js';

export type Transition = 'WENT_DOWN' | 'RECOVERED' | null;

export function isExpectedStatus(statusCode: number, expected: number[]): boolean {
  return expected.includes(statusCode);
}

/**
 * Health state machine. PENDING is the state of a monitor that has never been checked:
 * a first success silently becomes UP, a first failure is a real outage (WENT_DOWN).
 */
export function decideTransition(previous: MonitorHealth, success: boolean): { next: MonitorHealth; transition: Transition } {
  if (success) {
    return { next: 'UP', transition: previous === 'DOWN' ? 'RECOVERED' : null };
  }
  return { next: 'DOWN', transition: previous === 'DOWN' ? null : 'WENT_DOWN' };
}
