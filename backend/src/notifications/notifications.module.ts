import { Module } from '@nestjs/common';
import { MailModule } from '../common/mail/mail.module.js';
import { DeliveryWorker } from './delivery-worker.service.js';
import { NotificationChannelsService } from './notification-channels.service.js';
import { NotificationDispatcher } from './notification-dispatcher.service.js';
import { NotificationTestService } from './notification-test.service.js';
import { NotificationsController } from './notifications.controller.js';
import { EmailSender, WebhookSender } from './senders.js';

@Module({
  imports: [MailModule],
  controllers: [NotificationsController],
  providers: [NotificationChannelsService, NotificationDispatcher, DeliveryWorker, NotificationTestService, EmailSender, WebhookSender],
  exports: [NotificationDispatcher, DeliveryWorker],
})
export class NotificationsModule {}
