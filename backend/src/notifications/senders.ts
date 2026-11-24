import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service.js';
import { MailService } from '../common/mail/mail.service.js';
import { classify, safeRequest } from '../common/net/safe-http.js';
import type { EmailConfig, WebhookConfig } from './channel-config.js';
import { renderEmail, type NotificationPayload } from './notification-payload.js';
import { signWebhook } from './webhook-signature.js';

export interface SendResult {
  ok: boolean;
  responseStatus?: number;
  error?: string;
}

@Injectable()
export class EmailSender {
  constructor(private readonly mail: MailService) {}

  async send(config: EmailConfig, payload: NotificationPayload): Promise<SendResult> {
    const { subject, text } = renderEmail(payload);
    try {
      await this.mail.send({ to: config.recipients, subject, text });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `SMTP error: ${(e as Error).message}`.slice(0, 500) };
    }
  }
}

@Injectable()
export class WebhookSender {
  constructor(private readonly config: AppConfig) {}

  async send(config: WebhookConfig, payload: NotificationPayload, deliveryId: string): Promise<SendResult> {
    const body = JSON.stringify(payload);
    try {
      const res = await safeRequest({
        url: config.url,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-pulsewatch-event': payload.event,
          'x-pulsewatch-delivery': deliveryId,
          'x-pulsewatch-signature': signWebhook(body, config.secret),
        },
        body,
        timeoutMs: 10_000,
        allowPrivate: this.config.get('ALLOW_PRIVATE_TARGETS'),
        maxBodyBytes: 2048,
      });
      if (res.statusCode >= 200 && res.statusCode < 300) return { ok: true, responseStatus: res.statusCode };
      return { ok: false, responseStatus: res.statusCode, error: `Webhook responded with HTTP ${res.statusCode}` };
    } catch (e) {
      return { ok: false, error: classify(e).message };
    }
  }
}
