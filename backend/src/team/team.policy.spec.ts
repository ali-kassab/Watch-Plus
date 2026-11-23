import { ForbiddenException } from '@nestjs/common';
import { assertCanAssignRole, assertCanManageMember } from './team.policy.js';

describe('team policy', () => {
  it('owners can manage anyone and grant any role', () => {
    expect(() => assertCanManageMember('OWNER', 'OWNER')).not.toThrow();
    expect(() => assertCanAssignRole('OWNER', 'OWNER')).not.toThrow();
  });

  it('admins manage only lower roles', () => {
    expect(() => assertCanManageMember('ADMIN', 'MEMBER')).not.toThrow();
    expect(() => assertCanManageMember('ADMIN', 'VIEWER')).not.toThrow();
    expect(() => assertCanManageMember('ADMIN', 'ADMIN')).toThrow(ForbiddenException);
    expect(() => assertCanManageMember('ADMIN', 'OWNER')).toThrow(ForbiddenException);
  });

  it('nobody grants a role above their own', () => {
    expect(() => assertCanAssignRole('ADMIN', 'ADMIN')).not.toThrow();
    expect(() => assertCanAssignRole('ADMIN', 'OWNER')).toThrow(ForbiddenException);
    expect(() => assertCanAssignRole('MEMBER', 'ADMIN')).toThrow(ForbiddenException);
  });
});
