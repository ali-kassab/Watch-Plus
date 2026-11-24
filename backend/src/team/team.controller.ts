import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { CurrentMembership, type MembershipContext } from '../workspaces/membership.decorator.js';
import { MinRole } from '../workspaces/roles.js';
import { WorkspaceGuard } from '../workspaces/workspace.guard.js';
import { TeamService } from './team.service.js';
import { createInvitationSchema, updateMemberSchema, type CreateInvitationDto, type UpdateMemberDto } from './team.schemas.js';

@ApiTags('team')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller('workspaces/:workspaceId')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get('members')
  members(@CurrentMembership() m: MembershipContext) {
    return this.team.listMembers(m.workspaceId);
  }

  @MinRole(Role.ADMIN)
  @Patch('members/:memberId')
  updateMember(
    @CurrentMembership() m: MembershipContext,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body({ schema: updateMemberSchema }) dto: UpdateMemberDto,
  ) {
    return this.team.updateMember(m, memberId, dto);
  }

  @MinRole(Role.ADMIN)
  @HttpCode(204)
  @Delete('members/:memberId')
  async removeMember(@CurrentMembership() m: MembershipContext, @Param('memberId', ParseUUIDPipe) memberId: string) {
    await this.team.removeMember(m, memberId);
  }

  @HttpCode(204)
  @Post('leave')
  async leave(@CurrentMembership() m: MembershipContext) {
    await this.team.leave(m);
  }

  @MinRole(Role.ADMIN)
  @Get('invitations')
  invitations(@CurrentMembership() m: MembershipContext) {
    return this.team.listInvitations(m.workspaceId);
  }

  @MinRole(Role.ADMIN)
  @Post('invitations')
  invite(
    @CurrentMembership() m: MembershipContext,
    @CurrentUser() user: Express.User,
    @Body({ schema: createInvitationSchema }) dto: CreateInvitationDto,
  ) {
    return this.team.invite(m, user.id, dto);
  }

  @MinRole(Role.ADMIN)
  @HttpCode(204)
  @Delete('invitations/:invitationId')
  async revoke(@CurrentMembership() m: MembershipContext, @Param('invitationId', ParseUUIDPipe) id: string) {
    await this.team.revokeInvitation(m.workspaceId, id);
  }
}

@ApiTags('team')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly team: TeamService) {}

  @Public()
  @Get(':token')
  preview(@Param('token') token: string) {
    return this.team.previewInvitation(token);
  }

  @ApiBearerAuth()
  @Post(':token/accept')
  accept(@Param('token') token: string, @CurrentUser() user: Express.User) {
    return this.team.acceptInvitation(token, user);
  }
}
