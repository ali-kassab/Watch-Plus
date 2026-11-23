import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { AppConfig } from '../config/app-config.service.js';
import { AuthService, IssuedTokens } from './auth.service.js';
import { loginSchema, registerSchema, type LoginDto, type RegisterDto } from './auth.schemas.js';
import { CurrentUser } from './current-user.decorator.js';
import { Public } from './public.decorator.js';

export const REFRESH_COOKIE = 'pw_refresh';
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  async register(@Body({ schema: registerSchema }) dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.auth.register(dto, req.header('user-agent'));
    return this.respond(res, user, tokens);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  @Post('login')
  async login(@Body({ schema: loginSchema }) dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.auth.login(dto, req.header('user-agent'));
    return this.respond(res, user, tokens);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const { user, tokens } = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], req.header('user-agent'));
      return this.respond(res, user, tokens);
    } catch (error) {
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw error;
    }
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @HttpCode(204)
  @Post('logout-all')
  async logoutAll(@CurrentUser() user: Express.User, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutAll(user.id);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  private respond(res: Response, user: unknown, tokens: IssuedTokens) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...this.cookieOptions(), expires: tokens.refreshTokenExpiresAt });
    return { user, accessToken: tokens.accessToken, expiresIn: tokens.accessTokenExpiresIn };
  }

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, sameSite: 'strict', secure: this.config.isProduction, path: '/api/auth' };
  }
}
