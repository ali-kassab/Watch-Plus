import { z } from 'zod';
import { emailSchema } from '../auth/auth.schemas.js';
import { Role } from '../generated/prisma/enums.js';

const roleSchema = z.enum([Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER]);

export const updateMemberSchema = z.object({ role: roleSchema });
export type UpdateMemberDto = z.infer<typeof updateMemberSchema>;

export const createInvitationSchema = z.object({ email: emailSchema, role: roleSchema.default(Role.MEMBER) });
export type CreateInvitationDto = z.infer<typeof createInvitationSchema>;
