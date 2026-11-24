import { z } from 'zod';
import { emailSchema } from '../auth/auth.schemas.js';

export const subscribableEvents = z.enum(['MONITOR_DOWN', 'MONITOR_RECOVERED', 'INCIDENT_UPDATED']);
const events = z.array(subscribableEvents).min(1).default(['MONITOR_DOWN', 'MONITOR_RECOVERED', 'INCIDENT_UPDATED']);

export const createChannelSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('EMAIL'),
    name: z.string().trim().min(1).max(80),
    events,
    isEnabled: z.boolean().default(true),
    recipients: z.array(emailSchema).min(1).max(10),
  }),
  z.object({
    type: z.literal('WEBHOOK'),
    name: z.string().trim().min(1).max(80),
    events,
    isEnabled: z.boolean().default(true),
    url: z.string().trim().max(2048).pipe(z.url({ protocol: /^https?$/, error: 'Must be a valid http(s) URL' })),
    /** Optional: a signing secret is generated when omitted. */
    secret: z.string().min(16).max(200).optional(),
  }),
]);
export type CreateChannelDto = z.infer<typeof createChannelSchema>;

export const updateChannelSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    events: z.array(subscribableEvents).min(1),
    isEnabled: z.boolean(),
    recipients: z.array(emailSchema).min(1).max(10),
    url: z.string().trim().max(2048).pipe(z.url({ protocol: /^https?$/ })),
    rotateSecret: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateChannelDto = z.infer<typeof updateChannelSchema>;

export const listDeliveriesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['PENDING', 'SENDING', 'SUCCESS', 'FAILED']).optional(),
  channelId: z.uuid().optional(),
});
export type ListDeliveriesQuery = z.infer<typeof listDeliveriesSchema>;
