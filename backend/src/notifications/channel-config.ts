import { z } from 'zod';
import { emailSchema } from '../auth/auth.schemas.js';

export const emailConfigSchema = z.object({ recipients: z.array(emailSchema).min(1).max(10) });
export const webhookConfigSchema = z.object({
  url: z.string().trim().max(2048).pipe(z.url({ protocol: /^https?$/ })),
  secret: z.string().min(16).max(200),
});
export type EmailConfig = z.infer<typeof emailConfigSchema>;
export type WebhookConfig = z.infer<typeof webhookConfigSchema>;
export type ChannelConfig = EmailConfig | WebhookConfig;

/** Masks a webhook URL so tokens embedded in paths or query strings are never shown again. */
export function maskUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const tail = (u.pathname + u.search).slice(-4);
    return `${u.origin}/…${tail.length === 4 ? tail : ''}`;
  } catch {
    return '…';
  }
}
