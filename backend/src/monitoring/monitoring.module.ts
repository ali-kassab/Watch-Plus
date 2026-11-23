import { Module } from '@nestjs/common';
import { IncidentsModule } from '../incidents/incidents.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { HttpCheckerService } from './http-checker.service.js';
import { MonitoringService } from './monitoring.service.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  imports: [IncidentsModule, NotificationsModule],
  providers: [HttpCheckerService, MonitoringService, SchedulerService],
  exports: [MonitoringService, SchedulerService, HttpCheckerService],
})
export class MonitoringModule {}
