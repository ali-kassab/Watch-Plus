import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { z } from 'zod';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Role } from '../generated/prisma/enums.js';
import { hasRole, MIN_ROLE } from './roles.js';

const uuid = z.uuid();

/**
 * Enforces workspace isolation for every `/workspaces/:workspaceId/...` route:
 * the caller must be a member (otherwise 404, so workspace ids cannot be probed)
 * and hold at least the role declared with @MinRole (otherwise 403).
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const workspaceId = req.params.workspaceId;
    if (!req.user || typeof workspaceId !== 'string' || !uuid.safeParse(workspaceId).success) {
      throw new NotFoundException('Workspace not found');
    }
    const membership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: req.user.id } },
      select: { id: true, workspaceId: true, role: true },
    });
    if (!membership) throw new NotFoundException('Workspace not found');

    const required =
      this.reflector.getAllAndOverride<Role>(MIN_ROLE, [context.getHandler(), context.getClass()]) ?? Role.VIEWER;
    if (!hasRole(membership.role, required)) {
      throw new ForbiddenException(`This action requires the ${required} role or higher`);
    }
    req.membership = membership;
    return true;
  }
}
