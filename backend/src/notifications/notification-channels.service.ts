import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service.js';
import { validateTargetUrl } from '../common/net/ip-policy.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { PaginatedResult, toSkipTake } from '../common/http/paginated.js';
import { decrypt, encrypt } from '../common/security/encryption.js';
import { generateOpaqueToken } from '../common/security/tokens.js';

import type { NotificationChannel } from '../generated/prisma/client.js';
import { emailConfigSchema, maskUrl, webhookConfigSchema, type ChannelConfig, type EmailConfig, type WebhookConfig } from './channel-config.js';
import type { CreateChannelDto, ListDeliveriesQuery, UpdateChannelDto } from './notifications.schemas.js';

@Injectable()
export class NotificationChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async list(workspaceId: string) {
    const channels = await this.prisma.notificationChannel.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' } });
    return channels.map((c) => this.toResponse(c));
  }

  async get(workspaceId: string, id: string) {
    return this.toResponse(await this.find(workspaceId, id));
  }

  /** The webhook signing secret is returned exactly once, in the create (or rotate) response. */
  async create(workspaceId: string, dto: CreateChannelDto) {
    let config: ChannelConfig;
    let signingSecret: string | undefined;
    if (dto.type === 'EMAIL') {
      config = { recipients: dto.recipients };
    } else {
      this.assertSafeWebhookUrl(dto.url);
      signingSecret = dto.secret ?? `whsec_${generateOpaqueToken(24)}`;
      config = { url: dto.url, secret: signingSecret };
    }
    const channel = await this.prisma.notificationChannel.create({
      data: {
        workspaceId,
        type: dto.type,
        name: dto.name,
        events: dto.events,
        isEnabled: dto.isEnabled,
        configEncrypted: this.seal(config),
      },
    });
    return { ...this.toResponse(channel), ...(signingSecret ? { signingSecret } : {}) };
  }

  async update(workspaceId: string, id: string, dto: UpdateChannelDto) {
    const channel = await this.find(workspaceId, id);
    let configEncrypted: string | undefined;
    let signingSecret: string | undefined;
    if (channel.type === 'EMAIL' && dto.recipients) {
      configEncrypted = this.seal({ recipients: dto.recipients });
    }
    if (channel.type === 'WEBHOOK' && (dto.url || dto.rotateSecret)) {
      const current = this.open(channel) as WebhookConfig;
      if (dto.url) this.assertSafeWebhookUrl(dto.url);
      if (dto.rotateSecret) signingSecret = `whsec_${generateOpaqueToken(24)}`;
      configEncrypted = this.seal({ url: dto.url ?? current.url, secret: signingSecret ?? current.secret });
    }
    const updated = await this.prisma.notificationChannel.update({
      where: { id: channel.id },
      data: { name: dto.name, events: dto.events, isEnabled: dto.isEnabled, configEncrypted },
    });
    return { ...this.toResponse(updated), ...(signingSecret ? { signingSecret } : {}) };
  }

  async remove(workspaceId: string, id: string) {
    const channel = await this.find(workspaceId, id);
    await this.prisma.notificationChannel.delete({ where: { id: channel.id } });
  }

  async listDeliveries(workspaceId: string, q: ListDeliveriesQuery) {
    const where = { workspaceId, status: q.status, channelId: q.channelId };
    const [items, total] = await Promise.all([
      this.prisma.notificationDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(q),
        select: {
          id: true, event: true, status: true, attempts: true, maxAttempts: true, nextAttemptAt: true,
          lastError: true, responseStatus: true, deliveredAt: true, createdAt: true, payload: true,
          channel: { select: { id: true, name: true, type: true } },
        },
      }),
      this.prisma.notificationDelivery.count({ where }),
    ]);
    const mapped = items.map(({ payload, ...d }) => ({ ...d, summary: (payload as { summary?: string }).summary ?? null }));
    return new PaginatedResult(mapped, total, q);
  }

  /** Decrypts a channel's configuration. For server-side use only (delivery worker). */
  open(channel: Pick<NotificationChannel, 'type' | 'configEncrypted'>): ChannelConfig {
    const raw = JSON.parse(decrypt(channel.configEncrypted, this.config.get('ENCRYPTION_KEY')));
    return channel.type === 'EMAIL' ? emailConfigSchema.parse(raw) : webhookConfigSchema.parse(raw);
  }

  private seal(config: ChannelConfig): string {
    return encrypt(JSON.stringify(config), this.config.get('ENCRYPTION_KEY'));
  }

  private assertSafeWebhookUrl(url: string) {
    const v = validateTargetUrl(url, this.config.get('ALLOW_PRIVATE_TARGETS'));
    if (!v.ok) throw new BadRequestException(v.reason);
  }

  private async find(workspaceId: string, id: string) {
    const channel = await this.prisma.notificationChannel.findFirst({ where: { id, workspaceId } });
    if (!channel) throw new NotFoundException('Notification channel not found');
    return channel;
  }

  /** Public shape: e-mail recipients are shown to admins; webhook URLs are masked and secrets never returned. */
  private toResponse(c: NotificationChannel) {
    const config = this.open(c);
    const target =
      c.type === 'EMAIL'
        ? { recipients: (config as EmailConfig).recipients }
        : { url: maskUrl((config as WebhookConfig).url), hasSecret: true };
    return { id: c.id, type: c.type, name: c.name, events: c.events, isEnabled: c.isEnabled, target, createdAt: c.createdAt, updatedAt: c.updatedAt };
  }
}

