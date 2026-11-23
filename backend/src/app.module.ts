import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { ApiExceptionFilter } from './common/http/api-exception.filter.js';
import { RequestContextMiddleware } from './common/http/request-id.middleware.js';
import { ResponseEnvelopeInterceptor } from './common/http/response.interceptor.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { AppConfig } from './config/app-config.service.js';
import { AppConfigModule } from './config/config.module.js';
import { HealthModule } from './health/health.module.js';
import { IncidentsModule } from './incidents/incidents.module.js';
import { MonitoringModule } from './monitoring/monitoring.module.js';
import { MonitorsModule } from './monitors/monitors.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { StatusPagesModule } from './status-pages/status-pages.module.js';
import { TeamModule } from './team/team.module.js';
import { UsersModule } from './users/users.module.js';
import { WorkspacesModule } from './workspaces/workspaces.module.js';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: config.get('THROTTLE_LIMIT') }],
        // Authenticated callers are limited per user, anonymous callers per IP.
        getTracker: (req: Record<string, any>) => (req.user ? `user:${req.user.id}` : `ip:${req.ip}`),
      }),
    }),
    AuthModule,
    UsersModule,
    WorkspacesModule,
    TeamModule,
    MonitorsModule,
    MonitoringModule,
    IncidentsModule,
    NotificationsModule,
    StatusPagesModule,
    AnalyticsModule,
    HealthModule,
  ],
  providers: [
    // Order matters: authentication runs before throttling so limits can be per user.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}
