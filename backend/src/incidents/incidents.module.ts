import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { IncidentsController } from './incidents.controller.js';
import { IncidentsService } from './incidents.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [IncidentsController],
  providers: [IncidentsService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
