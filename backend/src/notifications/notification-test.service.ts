import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { DeliveryWorker } from './delivery-worker.service.js';
import type { NotificationPayload } from './notification-payload.js';

/** Sends a test notification through the normal outbox path and reports the result synchronously. */
@Injectable()
export class NotificationTestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly worker: DeliveryWorker,
  ) {}

  async sendTest(workspaceId: string, channelId: string) {
    const channel = await this.prisma.notificationChannel.findFirst({
      where: { id: channelId, workspaceId },
      include: { workspace: { select: { id: true, name: true } } },
    });
    if (!channel) throw new NotFoundException('Notification channel not found');
    const payload: NotificationPayload = {
      event: 'TEST',
      occurredAt: new Date().toISOString(),
      workspace: channel.workspace,
      summary: `This is a test notification for channel "${channel.name}".`,
    };
    const delivery = await this.prisma.notificationDelivery.create({
      data: { workspaceId, channelId, event: 'TEST', payload: payload as unknown as Prisma.InputJsonValue, maxAttempts: 1 },
    });
    const claimed = await this.worker.claim(1, delivery.id);
    if (claimed.length) await this.worker.process(delivery.id);
    const result = await this.prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
      select: { id: true, status: true, lastError: true, responseStatus: true, deliveredAt: true },
    });
    return { ...result, ok: result.status === 'SUCCESS' };
  }
}
