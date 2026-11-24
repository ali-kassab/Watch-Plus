import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '../generated/prisma/enums.js';
import { CurrentMembership, type MembershipContext } from '../workspaces/membership.decorator.js';
import { MinRole } from '../workspaces/roles.js';
import { WorkspaceGuard } from '../workspaces/workspace.guard.js';
import { MonitorsService } from './monitors.service.js';
import {
  createMonitorSchema,
  listChecksSchema,
  listMonitorsSchema,
  updateMonitorSchema,
  type CreateMonitorDto,
  type ListChecksQuery,
  type ListMonitorsQuery,
  type UpdateMonitorDto,
} from './monitors.schemas.js';

@ApiTags('monitors')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller('workspaces/:workspaceId/monitors')
export class MonitorsController {
  constructor(private readonly monitors: MonitorsService) {}

  @Get()
  list(@CurrentMembership() m: MembershipContext, @Query({ schema: listMonitorsSchema }) q: ListMonitorsQuery) {
    return this.monitors.list(m.workspaceId, m.role, q);
  }

  @MinRole(Role.MEMBER)
  @Post()
  create(@CurrentMembership() m: MembershipContext, @Body({ schema: createMonitorSchema }) dto: CreateMonitorDto) {
    return this.monitors.create(m.workspaceId, dto, m.role);
  }

  @Get(':monitorId')
  get(@CurrentMembership() m: MembershipContext, @Param('monitorId', ParseUUIDPipe) id: string) {
    return this.monitors.get(m.workspaceId, id, m.role);
  }

  @MinRole(Role.MEMBER)
  @Patch(':monitorId')
  update(
    @CurrentMembership() m: MembershipContext,
    @Param('monitorId', ParseUUIDPipe) id: string,
    @Body({ schema: updateMonitorSchema }) dto: UpdateMonitorDto,
  ) {
    return this.monitors.update(m.workspaceId, id, dto, m.role);
  }

  @MinRole(Role.ADMIN)
  @HttpCode(204)
  @Delete(':monitorId')
  async remove(@CurrentMembership() m: MembershipContext, @Param('monitorId', ParseUUIDPipe) id: string) {
    await this.monitors.remove(m.workspaceId, id);
  }

  @MinRole(Role.MEMBER)
  @HttpCode(200)
  @Post(':monitorId/pause')
  pause(@CurrentMembership() m: MembershipContext, @Param('monitorId', ParseUUIDPipe) id: string) {
    return this.monitors.setActive(m.workspaceId, id, false, m.role);
  }

  @MinRole(Role.MEMBER)
  @HttpCode(200)
  @Post(':monitorId/resume')
  resume(@CurrentMembership() m: MembershipContext, @Param('monitorId', ParseUUIDPipe) id: string) {
    return this.monitors.setActive(m.workspaceId, id, true, m.role);
  }

  @MinRole(Role.MEMBER)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post(':monitorId/check')
  checkNow(@CurrentMembership() m: MembershipContext, @Param('monitorId', ParseUUIDPipe) id: string) {
    return this.monitors.checkNow(m.workspaceId, id);
  }

  @Get(':monitorId/checks')
  checks(
    @CurrentMembership() m: MembershipContext,
    @Param('monitorId', ParseUUIDPipe) id: string,
    @Query({ schema: listChecksSchema }) q: ListChecksQuery,
  ) {
    return this.monitors.listChecks(m.workspaceId, id, q);
  }
}
