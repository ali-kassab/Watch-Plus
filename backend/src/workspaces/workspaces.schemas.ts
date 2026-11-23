import { z } from 'zod';

export const createWorkspaceSchema = z.object({ name: z.string().trim().min(2).max(80) });
export type CreateWorkspaceDto = z.infer<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z.object({ name: z.string().trim().min(2).max(80) });
export type UpdateWorkspaceDto = z.infer<typeof updateWorkspaceSchema>;
