import { Module } from '@nestjs/common';
import { IncidentsModule } from '../incidents/incidents.module.js';
import { MonitoringModule } from '../monitoring/monitoring.module.js';
import { MonitorsController } from './monitors.controller.js';
import { MonitorsService } from './monitors.service.js';

@Module({
  imports: [MonitoringModule, IncidentsModule],
  controllers: [MonitorsController],
  providers: [MonitorsService],
})
export class MonitorsModule {}
