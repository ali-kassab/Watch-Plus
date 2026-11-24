import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { AppConfig } from '../config/app-config.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { isUniqueViolation } from '../common/prisma/prisma-errors.js';
import { generateOpaqueToken, sha256 } from '../common/security/tokens.js';
import type { LoginDto, RegisterDto } from './auth.schemas.js';

export interface IssuedTokens {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

/** Window in which presenting an already rotated token is treated as a benign race (two tabs refreshing at once). */
const ROTATION_GRACE_MS = 10_000;

export const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  async register(dto: RegisterDto, userAgent?: string) {
    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);
    try {
      const user = await this.prisma.user.create({
        data: { email: dto.email, name: dto.name, passwordHash },
        select: { id: true, email: true, name: true, createdAt: true },
      });
      this.logger.log({ msg: 'user registered', userId: user.id });
      return { user, tokens: await this.issueTokens(user, randomUUID(), userAgent) };
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('An account with this email already exists');
      throw error;
    }
  }

  async login(dto: LoginDto, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Verify against a dummy hash when the user does not exist so timing does not reveal registered emails.
    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const valid = await argon2.verify(hash, dto.password).catch(() => false);
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');
    const publicUser = { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
    return { user: publicUser, tokens: await this.issueTokens(publicUser, randomUUID(), userAgent) };
  }

  /** Rotates a refresh token. Reuse of an already rotated token revokes the entire token family. */
  async refresh(rawToken: string | undefined, userAgent?: string) {
    if (!rawToken) throw new UnauthorizedException('Missing refresh token');
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { user: { select: { id: true, email: true, name: true, createdAt: true } } },
    });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    if (stored.revokedAt) {
      const benignRace = stored.replacedBy && Date.now() - stored.revokedAt.getTime() < ROTATION_GRACE_MS;
      if (!benignRace) {
        await this.prisma.refreshToken.updateMany({
          where: { familyId: stored.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        this.logger.warn({ msg: 'refresh token reuse detected; family revoked', userId: stored.userId });
      }
      throw new UnauthorizedException('Refresh token has been revoked');
    }
    if (stored.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException('Refresh token expired');

    const tokens = await this.issueTokens(stored.user, stored.familyId, userAgent);
    const newRecord = await this.prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: sha256(tokens.refreshToken) },
      select: { id: true },
    });
    // Atomic claim: only one concurrent request can rotate this token.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date(), replacedBy: newRecord.id },
    });
    if (claimed.count === 0) {
      await this.prisma.refreshToken.update({ where: { id: newRecord.id }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('Refresh token has been revoked');
    }
    return { user: stored.user, tokens };
  }

  async logout(rawToken: string | undefined) {
    if (!rawToken) return;
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
    if (!stored) return;
    await this.prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAll(userId: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async issueTokens(user: { id: string; email: string }, familyId: string, userAgent?: string): Promise<IssuedTokens> {
    const ttl = this.config.get('JWT_ACCESS_TTL_SECONDS');
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email, typ: 'access' }, { expiresIn: ttl });
    const refreshToken = generateOpaqueToken(48);
    const refreshTokenExpiresAt = new Date(Date.now() + this.config.get('REFRESH_TOKEN_TTL_DAYS') * 86_400_000);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        familyId,
        expiresAt: refreshTokenExpiresAt,
        userAgent: userAgent?.slice(0, 255),
      },
    });
    return { accessToken, accessTokenExpiresIn: ttl, refreshToken, refreshTokenExpiresAt };
  }

  private getDummyHash() {
    this.dummyHash ??= argon2.hash(generateOpaqueToken(), ARGON2_OPTIONS);
    return this.dummyHash;
  }
}
