import { Body, Controller, Get, Header, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { CurrentMembership, type MembershipContext } from '../workspaces/membership.decorator.js';
import { MinRole } from '../workspaces/roles.js';
import { WorkspaceGuard } from '../workspaces/workspace.guard.js';
import { StatusPagesService } from './status-pages.service.js';
import { updateStatusPageSchema, type UpdateStatusPageDto } from './status-pages.schemas.js';

@ApiTags('status-pages')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller('workspaces/:workspaceId/status-page')
export class StatusPageSettingsController {
  constructor(private readonly pages: StatusPagesService) {}

  @Get()
  get(@CurrentMembership() m: MembershipContext) {
    return this.pages.getSettings(m.workspaceId);
  }

  @MinRole(Role.ADMIN)
  @Patch()
  update(@CurrentMembership() m: MembershipContext, @Body({ schema: updateStatusPageSchema }) dto: UpdateStatusPageDto) {
    return this.pages.updateSettings(m.workspaceId, dto);
  }
}

@ApiTags('public')
@Controller('public/status-pages')
export class PublicStatusPageController {
  constructor(private readonly pages: StatusPagesService) {}

  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Header('Cache-Control', 'public, max-age=30')
  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.pages.getPublic(slug.toLowerCase().slice(0, 50));
  }
}
