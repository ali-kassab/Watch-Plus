import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { SchedulerService } from '../monitoring/scheduler.service.js';

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
  ) {}

  @Get('health')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
    return { status: 'ok', database: 'up', activeChecks: this.scheduler.activeChecks };
  }
}
