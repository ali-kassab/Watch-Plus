import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentMembership, type MembershipContext } from '../workspaces/membership.decorator.js';
import { WorkspaceGuard } from '../workspaces/workspace.guard.js';
import { AnalyticsService } from './analytics.service.js';
import { rangeSchema } from './ranges.js';

const statsQuery = z.object({ range: rangeSchema, monitorId: z.uuid().optional() });
const activityQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller('workspaces/:workspaceId/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  summary(@CurrentMembership() m: MembershipContext, @Query({ schema: statsQuery }) q: z.infer<typeof statsQuery>) {
    return this.analytics.summary(m.workspaceId, q.range, q.monitorId);
  }

  @Get('timeseries')
  timeseries(@CurrentMembership() m: MembershipContext, @Query({ schema: statsQuery }) q: z.infer<typeof statsQuery>) {
    return this.analytics.timeseries(m.workspaceId, q.range, q.monitorId);
  }

  @Get('monitors')
  monitors(@CurrentMembership() m: MembershipContext, @Query({ schema: statsQuery }) q: z.infer<typeof statsQuery>) {
    return this.analytics.monitorBreakdown(m.workspaceId, q.range);
  }

  @Get('activity')
  activity(@CurrentMembership() m: MembershipContext, @Query({ schema: activityQuery }) q: z.infer<typeof activityQuery>) {
    return this.analytics.recentActivity(m.workspaceId, q.limit);
  }
}
