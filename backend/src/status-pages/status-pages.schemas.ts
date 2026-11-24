import { z } from 'zod';

export const updateStatusPageSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).nullable(),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(50)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single dashes'),
    isPublished: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateStatusPageDto = z.infer<typeof updateStatusPageSchema>;
