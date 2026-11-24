import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const VALID_ID = /^[A-Za-z0-9-]{8,64}$/;
/** Path segments that are bearer secrets (invitation tokens) and must never reach the logs. */
const SECRET_SEGMENT = /^(\/api\/invitations\/)[^/]+/;

/** Path for the access log: query string dropped, secret path segments redacted. */
export function logPath(originalUrl: string): string {
  return originalUrl.split('?')[0].replace(SECRET_SEGMENT, '$1[redacted]');
}

/** Assigns a request id and writes one structured access-log line per request (no bodies, no tokens). */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.header('x-request-id');
    const requestId = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      this.logger.log({
        msg: 'request',
        requestId,
        method: req.method,
        path: logPath(req.originalUrl),
        status: res.statusCode,
        durationMs: Math.round(durationMs),
        userId: req.user?.id,
      });
    });
    next();
  }
}
