import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '../generated/prisma/enums.js';
import { CurrentMembership, type MembershipContext } from '../workspaces/membership.decorator.js';
import { MinRole } from '../workspaces/roles.js';
import { WorkspaceGuard } from '../workspaces/workspace.guard.js';
import { NotificationChannelsService } from './notification-channels.service.js';
import { NotificationTestService } from './notification-test.service.js';
import {
  createChannelSchema,
  listDeliveriesSchema,
  updateChannelSchema,
  type CreateChannelDto,
  type ListDeliveriesQuery,
  type UpdateChannelDto,
} from './notifications.schemas.js';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@MinRole(Role.ADMIN)
@Controller('workspaces/:workspaceId/notifications')
export class NotificationsController {
  constructor(
    private readonly channels: NotificationChannelsService,
    private readonly tester: NotificationTestService,
  ) {}

  @Get('channels')
  list(@CurrentMembership() m: MembershipContext) {
    return this.channels.list(m.workspaceId);
  }

  @Post('channels')
  create(@CurrentMembership() m: MembershipContext, @Body({ schema: createChannelSchema }) dto: CreateChannelDto) {
    return this.channels.create(m.workspaceId, dto);
  }

  @Get('channels/:channelId')
  get(@CurrentMembership() m: MembershipContext, @Param('channelId', ParseUUIDPipe) id: string) {
    return this.channels.get(m.workspaceId, id);
  }

  @Patch('channels/:channelId')
  update(
    @CurrentMembership() m: MembershipContext,
    @Param('channelId', ParseUUIDPipe) id: string,
    @Body({ schema: updateChannelSchema }) dto: UpdateChannelDto,
  ) {
    return this.channels.update(m.workspaceId, id, dto);
  }

  @HttpCode(204)
  @Delete('channels/:channelId')
  async remove(@CurrentMembership() m: MembershipContext, @Param('channelId', ParseUUIDPipe) id: string) {
    await this.channels.remove(m.workspaceId, id);
  }

  @HttpCode(200)
  @Post('channels/:channelId/test')
  test(@CurrentMembership() m: MembershipContext, @Param('channelId', ParseUUIDPipe) id: string) {
    return this.tester.sendTest(m.workspaceId, id);
  }

  @Get('deliveries')
  deliveries(@CurrentMembership() m: MembershipContext, @Query({ schema: listDeliveriesSchema }) q: ListDeliveriesQuery) {
    return this.channels.listDeliveries(m.workspaceId, q);
  }
}
