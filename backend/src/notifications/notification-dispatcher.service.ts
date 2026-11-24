import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { NotificationEvent } from '../generated/prisma/enums.js';
import type { NotificationPayload } from './notification-payload.js';

type Tx = Prisma.TransactionClient;

/**
 * Writes deliveries into the notification outbox. Called inside the same transaction
 * as the state change that caused it, so an event is never lost or sent for a rolled-back change.
 */
@Injectable()
export class NotificationDispatcher {
  async enqueue(tx: Tx, workspaceId: string, event: NotificationEvent, payload: NotificationPayload): Promise<number> {
    const channels = await tx.notificationChannel.findMany({
      where: { workspaceId, isEnabled: true, events: { has: event } },
      select: { id: true },
    });
    if (channels.length === 0) return 0;
    await tx.notificationDelivery.createMany({
      data: channels.map((c) => ({ workspaceId, channelId: c.id, event, payload: payload as unknown as Prisma.InputJsonValue })),
    });
    return channels.length;
  }
}
