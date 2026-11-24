import { ConflictException } from '@nestjs/common';
import type { IncidentStatus } from '../generated/prisma/enums.js';

/** Order in which an incident normally progresses. Any unresolved status may move to any other. */
export const INCIDENT_FLOW: IncidentStatus[] = ['OPEN', 'INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED'];

export function isActive(status: IncidentStatus): boolean {
  return status !== 'RESOLVED';
}

/** Resolved incidents are immutable history: a recurrence is a new incident. */
export function assertCanTransition(from: IncidentStatus, to: IncidentStatus): void {
  if (from === 'RESOLVED') throw new ConflictException('Resolved incidents cannot be changed; open a new incident instead');
  if (from === to) throw new ConflictException(`Incident is already ${to}`);
}
