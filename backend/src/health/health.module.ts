import { Module } from '@nestjs/common';
import { MonitoringModule } from '../monitoring/monitoring.module.js';
import { HealthController } from './health.controller.js';

@Module({ imports: [MonitoringModule], controllers: [HealthController] })
export class HealthModule {}
