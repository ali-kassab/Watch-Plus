import { z } from 'zod';
import { passwordSchema } from '../auth/auth.schemas.js';

export const updateProfileSchema = z.object({ name: z.string().trim().min(1).max(100) });
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
