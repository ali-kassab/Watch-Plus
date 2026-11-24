import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC } from './public.decorator.js';

interface AccessPayload {
  sub: string;
  email: string;
  typ: string;
}

/** Global guard: every route requires a valid access token unless marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const [scheme, token] = (req.header('authorization') ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Missing access token');
    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token, { algorithms: ['HS256'] });
      if (payload.typ !== 'access') throw new Error('wrong token type');
      req.user = { id: payload.sub, email: payload.email };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
