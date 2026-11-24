import { Body, Controller, Delete, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { CurrentMembership, type MembershipContext } from './membership.decorator.js';
import { MinRole } from './roles.js';
import { WorkspaceGuard } from './workspace.guard.js';
import { WorkspacesService } from './workspaces.service.js';
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  type CreateWorkspaceDto,
  type UpdateWorkspaceDto,
} from './workspaces.schemas.js';

@ApiTags('workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  list(@CurrentUser() user: Express.User) {
    return this.workspaces.listForUser(user.id);
  }

  @Post()
  create(@CurrentUser() user: Express.User, @Body({ schema: createWorkspaceSchema }) dto: CreateWorkspaceDto) {
    return this.workspaces.create(user.id, dto);
  }

  @UseGuards(WorkspaceGuard)
  @Get(':workspaceId')
  get(@CurrentMembership() m: MembershipContext) {
    return this.workspaces.get(m.workspaceId, m.role);
  }

  @UseGuards(WorkspaceGuard)
  @MinRole(Role.ADMIN)
  @Patch(':workspaceId')
  update(@CurrentMembership() m: MembershipContext, @Body({ schema: updateWorkspaceSchema }) dto: UpdateWorkspaceDto) {
    return this.workspaces.update(m.workspaceId, dto);
  }

  @UseGuards(WorkspaceGuard)
  @MinRole(Role.OWNER)
  @HttpCode(204)
  @Delete(':workspaceId')
  async remove(@CurrentMembership() m: MembershipContext) {
    await this.workspaces.remove(m.workspaceId);
  }
}
