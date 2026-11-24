import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { isUniqueViolation } from '../common/prisma/prisma-errors.js';
import { Role } from '../generated/prisma/enums.js';
import { slugify, withSuffix } from './slug.js';
import type { CreateWorkspaceDto, UpdateWorkspaceDto } from './workspaces.schemas.js';

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { workspace: { include: { _count: { select: { monitors: true, memberships: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      role: m.role,
      monitorCount: m.workspace._count.monitors,
      memberCount: m.workspace._count.memberships,
      createdAt: m.workspace.createdAt,
    }));
  }

  /** Creates a workspace with the creator as OWNER and an unpublished status page. */
  async create(userId: string, dto: CreateWorkspaceDto) {
    const base = slugify(dto.name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : withSuffix(base);
      try {
        const workspace = await this.prisma.workspace.create({
          data: {
            name: dto.name,
            slug,
            memberships: { create: { userId, role: Role.OWNER } },
            statusPage: { create: { slug, title: `${dto.name} Status`, isPublished: false } },
          },
        });
        this.logger.log({ msg: 'workspace created', workspaceId: workspace.id, userId });
        return { ...workspace, role: Role.OWNER };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new Error('Could not allocate a unique workspace slug');
  }

  async get(workspaceId: string, role: Role) {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      include: { statusPage: { select: { slug: true, isPublished: true } } },
    });
    return { ...workspace, role };
  }

  update(workspaceId: string, dto: UpdateWorkspaceDto) {
    return this.prisma.workspace.update({ where: { id: workspaceId }, data: { name: dto.name } });
  }

  async remove(workspaceId: string) {
    await this.prisma.workspace.delete({ where: { id: workspaceId } });
    this.logger.log({ msg: 'workspace deleted', workspaceId });
  }
}
