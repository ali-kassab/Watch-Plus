import { z } from 'zod';
import { HttpMethod } from '../generated/prisma/enums.js';

const FORBIDDEN_HEADERS = new Set([
  'host', 'content-length', 'transfer-encoding', 'connection', 'upgrade', 'te', 'trailer', 'keep-alive', 'expect',
]);
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/;

export const methodSchema = z.enum(Object.values(HttpMethod) as [HttpMethod, ...HttpMethod[]]);
export const METHODS_WITH_BODY: HttpMethod[] = ['POST', 'PUT', 'PATCH', 'DELETE'];

export const headersSchema = z
  .record(z.string(), z.string().max(2000))
  .superRefine((headers, ctx) => {
    const names = Object.keys(headers);
    if (names.length > 20) ctx.addIssue({ code: 'custom', message: 'At most 20 custom headers are allowed' });
    for (const name of names) {
      if (!HEADER_NAME.test(name)) ctx.addIssue({ code: 'custom', message: `Invalid header name "${name}"` });
      else if (FORBIDDEN_HEADERS.has(name.toLowerCase()) || name.toLowerCase().startsWith('proxy-')) {
        ctx.addIssue({ code: 'custom', message: `Header "${name}" cannot be set` });
      }
      if (/[\r\n\0]/.test(headers[name])) ctx.addIssue({ code: 'custom', message: `Header "${name}" contains invalid characters` });
    }
  });

const baseFields = {
  name: z.string().trim().min(1).max(100),
  url: z.string().trim().max(2048).pipe(z.url({ protocol: /^https?$/, error: 'Must be a valid http(s) URL' })),
  method: methodSchema.default('GET'),
  intervalSeconds: z.coerce.number().int().min(10).max(86_400).default(60),
  timeoutMs: z.coerce.number().int().min(500).max(60_000).default(10_000),
  expectedStatusCodes: z.array(z.number().int().min(100).max(599)).min(1).max(100).default([200]),
  headers: headersSchema.default({}),
  body: z.string().max(10_000).nullable().optional(),
  retries: z.coerce.number().int().min(0).max(3).default(1),
  isActive: z.boolean().default(true),
  showOnStatusPage: z.boolean().default(true),
};

function crossFieldRules(v: { method?: HttpMethod; body?: string | null; timeoutMs?: number; intervalSeconds?: number }, ctx: z.RefinementCtx) {
  if (v.body && v.method && !METHODS_WITH_BODY.includes(v.method)) {
    ctx.addIssue({ code: 'custom', path: ['body'], message: `A request body is not supported for ${v.method}` });
  }
  if (v.timeoutMs && v.intervalSeconds && v.timeoutMs >= v.intervalSeconds * 1000) {
    ctx.addIssue({ code: 'custom', path: ['timeoutMs'], message: 'Timeout must be shorter than the check interval' });
  }
}

export const createMonitorSchema = z.object(baseFields).superRefine(crossFieldRules);
export type CreateMonitorDto = z.infer<typeof createMonitorSchema>;

export const updateMonitorSchema = z
  .object({
    name: baseFields.name,
    url: baseFields.url,
    method: methodSchema,
    intervalSeconds: z.coerce.number().int().min(10).max(86_400),
    timeoutMs: z.coerce.number().int().min(500).max(60_000),
    expectedStatusCodes: z.array(z.number().int().min(100).max(599)).min(1).max(100),
    headers: headersSchema,
    body: z.string().max(10_000).nullable(),
    retries: z.coerce.number().int().min(0).max(3),
    showOnStatusPage: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateMonitorDto = z.infer<typeof updateMonitorSchema>;

export const listMonitorsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(['up', 'down', 'pending', 'paused']).optional(),
  q: z.string().trim().max(100).optional(),
});
export type ListMonitorsQuery = z.infer<typeof listMonitorsSchema>;

export const listChecksSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  result: z.enum(['success', 'failure']).optional(),
});
export type ListChecksQuery = z.infer<typeof listChecksSchema>;
