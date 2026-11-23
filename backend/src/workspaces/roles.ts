import { SetMetadata } from '@nestjs/common';
import { Role } from '../generated/prisma/enums.js';

export const ROLE_RANK: Record<Role, number> = { VIEWER: 0, MEMBER: 1, ADMIN: 2, OWNER: 3 };

export function hasRole(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export const MIN_ROLE = 'minRole';
/**
 * Minimum workspace role required for a route (default: VIEWER, i.e. any member).
 * Permission matrix: VIEWER reads; MEMBER manages monitors & incidents;
 * ADMIN manages notifications, status page and team; OWNER deletes the workspace and manages owners.
 */
export const MinRole = (role: Role) => SetMetadata(MIN_ROLE, role);
