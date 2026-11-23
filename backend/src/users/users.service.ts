import { BadRequestException, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { ARGON2_OPTIONS } from '../auth/auth.service.js';
import type { ChangePasswordDto, UpdateProfileDto } from './users.schemas.js';

const PUBLIC_USER = { id: true, email: true, name: true, createdAt: true } as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: PUBLIC_USER });
  }

  update(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({ where: { id: userId }, data: { name: dto.name }, select: PUBLIC_USER });
  }

  /** Changing the password revokes every refresh token (signs out all other sessions). */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await argon2.verify(user.passwordHash, dto.currentPassword).catch(() => false);
    if (!ok) throw new BadRequestException('Current password is incorrect');
    const passwordHash = await argon2.hash(dto.newPassword, ARGON2_OPTIONS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }
}
