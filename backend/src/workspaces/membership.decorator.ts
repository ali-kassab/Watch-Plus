import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** The caller's membership in the route's workspace (populated by WorkspaceGuard). */
export const CurrentMembership = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<Request>().membership!;
});

export type MembershipContext = NonNullable<Express.Request['membership']>;
