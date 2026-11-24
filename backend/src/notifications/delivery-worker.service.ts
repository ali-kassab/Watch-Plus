import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { nextRetryDelayMs } from './backoff.js';
import type { EmailConfig, WebhookConfig } from './channel-config.js';
import { NotificationChannelsService } from './notification-channels.service.js';
import type { NotificationPayload } from './notification-payload.js';
import { EmailSender, WebhookSender, type SendResult } from './senders.js';

const LEASE_SECONDS = 60;

/**
 * Processes the notification outbox. Deliveries are claimed with `FOR UPDATE SKIP LOCKED`
 * and a lease, so several API processes can run the worker and a crash mid-send only
 * delays (never loses) a delivery. Failures are retried with exponential backoff.
 */
@Injectable()
export class DeliveryWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DeliveryWorker.name);
  private timer?: NodeJS.Timeout;
  private ticking = false;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: NotificationChannelsService,
    private readonly email: EmailSender,
    private readonly webhook: WebhookSender,
    private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.get('SCHEDULER_ENABLED')) return;
    this.timer = setInterval(() => void this.tick(), 3000);
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  /** Claims and processes due deliveries. Returns how many were processed. */
  async tick(limit = 20): Promise<number> {
    if (this.ticking || this.stopped) return 0;
    this.ticking = true;
    try {
      const ids = await this.claim(limit);
      await Promise.all(ids.map((id) => this.process(id)));
      return ids.length;
    } catch (e) {
      this.logger.error({ msg: 'delivery tick failed', error: (e as Error).message });
      return 0;
    } finally {
      this.ticking = false;
    }
  }

  async claim(limit: number, onlyId?: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE notification_deliveries
         SET status = 'SENDING', attempts = attempts + 1,
             locked_until = now() + make_interval(secs => ${LEASE_SECONDS}), updated_at = now()
       WHERE id IN (
         SELECT id FROM notification_deliveries
          WHERE ((status = 'PENDING' AND next_attempt_at <= now()) OR (status = 'SENDING' AND locked_until < now()))
            AND (${onlyId ?? null}::uuid IS NULL OR id = ${onlyId ?? null}::uuid)
          ORDER BY next_attempt_at
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED)
      RETURNING id`;
    return rows.map((r) => r.id);
  }

  /** Sends one claimed delivery and records the outcome. */
  async process(id: string): Promise<void> {
    const delivery = await this.prisma.notificationDelivery.findUnique({ where: { id }, include: { channel: true } });
    if (!delivery) return;
    let result: SendResult;
    if (!delivery.channel.isEnabled && delivery.event !== 'TEST') {
      result = { ok: false, error: 'Channel is disabled' };
    } else {
      try {
        const config = this.channels.open(delivery.channel);
        const payload = delivery.payload as unknown as NotificationPayload;
        result =
          delivery.channel.type === 'EMAIL'
            ? await this.email.send(config as EmailConfig, payload)
            : await this.webhook.send(config as WebhookConfig, payload, delivery.id);
      } catch (e) {
        result = { ok: false, error: (e as Error).message.slice(0, 500) };
      }
    }

    if (result.ok) {
      await this.prisma.notificationDelivery.update({
        where: { id },
        data: { status: 'SUCCESS', deliveredAt: new Date(), lockedUntil: null, lastError: null, responseStatus: result.responseStatus ?? null },
      });
      return;
    }
    const permanent = delivery.attempts >= delivery.maxAttempts || result.error === 'Channel is disabled';
    await this.prisma.notificationDelivery.update({
      where: { id },
      data: {
        status: permanent ? 'FAILED' : 'PENDING',
        lockedUntil: null,
        lastError: result.error ?? 'Unknown error',
        responseStatus: result.responseStatus ?? null,
        nextAttemptAt: new Date(Date.now() + nextRetryDelayMs(delivery.attempts)),
      },
    });
    this.logger.warn({ msg: 'notification delivery failed', deliveryId: id, attempt: delivery.attempts, permanent, error: result.error });
  }
}
