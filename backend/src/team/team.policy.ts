import { ForbiddenException } from '@nestjs/common';
import { Role } from '../generated/prisma/enums.js';
import { ROLE_RANK } from '../workspaces/roles.js';

/**
 * Team management rules (the route guard already requires ADMIN or OWNER):
 * - OWNERs may manage everyone, including other owners.
 * - Other managers may only act on members ranked strictly below them.
 * - Nobody can grant a role above their own.
 */
export function assertCanAssignRole(actor: Role, role: Role): void {
  if (ROLE_RANK[role] > ROLE_RANK[actor]) {
    throw new ForbiddenException(`You cannot grant the ${role} role`);
  }
}

export function assertCanManageMember(actor: Role, target: Role): void {
  if (actor === Role.OWNER) return;
  if (ROLE_RANK[target] >= ROLE_RANK[actor]) {
    throw new ForbiddenException('You can only manage members with a lower role than yours');
  }
}
