import { z } from 'zod';

const status = z.enum(['OPEN', 'INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED']);
const severity = z.enum(['MINOR', 'MAJOR', 'CRITICAL']);

export const createIncidentSchema = z.object({
  title: z.string().trim().min(3).max(200),
  severity: severity.default('MAJOR'),
  status: status.exclude(['RESOLVED']).default('INVESTIGATING'),
  monitorId: z.uuid().optional(),
  message: z.string().trim().min(1).max(5000),
  isPublic: z.boolean().default(true),
});
export type CreateIncidentDto = z.infer<typeof createIncidentSchema>;

export const updateIncidentSchema = z
  .object({ title: z.string().trim().min(3).max(200), severity, isPublic: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateIncidentDto = z.infer<typeof updateIncidentSchema>;

export const addIncidentUpdateSchema = z
  .object({
    message: z.string().trim().min(1).max(5000),
    status: status.optional(),
    isInternal: z.boolean().default(false),
  })
  .refine((v) => !(v.isInternal && v.status), { message: 'Internal notes cannot change the incident status', path: ['status'] });
export type AddIncidentUpdateDto = z.infer<typeof addIncidentUpdateSchema>;

export const resolveIncidentSchema = z.object({ resolution: z.string().trim().min(1).max(5000) });
export type ResolveIncidentDto = z.infer<typeof resolveIncidentSchema>;

export const listIncidentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  state: z.enum(['active', 'resolved', 'all']).default('all'),
  monitorId: z.uuid().optional(),
  severity: severity.optional(),
});
export type ListIncidentsQuery = z.infer<typeof listIncidentsSchema>;
