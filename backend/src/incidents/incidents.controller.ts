import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { CurrentMembership, type MembershipContext } from '../workspaces/membership.decorator.js';
import { MinRole } from '../workspaces/roles.js';
import { WorkspaceGuard } from '../workspaces/workspace.guard.js';
import { IncidentsService } from './incidents.service.js';
import {
  addIncidentUpdateSchema,
  createIncidentSchema,
  listIncidentsSchema,
  resolveIncidentSchema,
  updateIncidentSchema,
  type AddIncidentUpdateDto,
  type CreateIncidentDto,
  type ListIncidentsQuery,
  type ResolveIncidentDto,
  type UpdateIncidentDto,
} from './incidents.schemas.js';

@ApiTags('incidents')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller('workspaces/:workspaceId/incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  list(@CurrentMembership() m: MembershipContext, @Query({ schema: listIncidentsSchema }) q: ListIncidentsQuery) {
    return this.incidents.list(m.workspaceId, q);
  }

  @MinRole(Role.MEMBER)
  @Post()
  create(@CurrentMembership() m: MembershipContext, @CurrentUser() u: Express.User, @Body({ schema: createIncidentSchema }) dto: CreateIncidentDto) {
    return this.incidents.create(m.workspaceId, u.id, dto);
  }

  @Get(':incidentId')
  get(@CurrentMembership() m: MembershipContext, @Param('incidentId', ParseUUIDPipe) id: string) {
    return this.incidents.get(m.workspaceId, id);
  }

  @MinRole(Role.MEMBER)
  @Patch(':incidentId')
  update(
    @CurrentMembership() m: MembershipContext,
    @Param('incidentId', ParseUUIDPipe) id: string,
    @Body({ schema: updateIncidentSchema }) dto: UpdateIncidentDto,
  ) {
    return this.incidents.update(m.workspaceId, id, dto);
  }

  @MinRole(Role.MEMBER)
  @Post(':incidentId/updates')
  addUpdate(
    @CurrentMembership() m: MembershipContext,
    @CurrentUser() u: Express.User,
    @Param('incidentId', ParseUUIDPipe) id: string,
    @Body({ schema: addIncidentUpdateSchema }) dto: AddIncidentUpdateDto,
  ) {
    return this.incidents.addUpdate(m.workspaceId, id, u.id, dto);
  }

  @MinRole(Role.MEMBER)
  @HttpCode(200)
  @Post(':incidentId/resolve')
  resolve(
    @CurrentMembership() m: MembershipContext,
    @CurrentUser() u: Express.User,
    @Param('incidentId', ParseUUIDPipe) id: string,
    @Body({ schema: resolveIncidentSchema }) dto: ResolveIncidentDto,
  ) {
    return this.incidents.resolve(m.workspaceId, id, u.id, dto);
  }
}
