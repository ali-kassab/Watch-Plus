import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

const CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_ERROR',
};

/**
 * Single place that shapes error responses:
 * `{ error: { statusCode, code, message, details? }, requestId }`.
 * Unexpected errors are logged once, and their internals never reach the client.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: string[] | undefined;
    let code: string | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as { message?: unknown; code?: string };
        if (Array.isArray(b.message)) {
          details = b.message.map(String);
          message = statusCode === 400 ? 'Validation failed' : details[0];
        } else if (typeof b.message === 'string') {
          message = b.message;
        }
        code = b.code;
      }
    } else if (isBodyParserError(exception)) {
      statusCode = exception.status;
      message = exception.type === 'entity.too.large' ? 'Request body too large' : 'Malformed request body';
    } else {
      this.logger.error(
        { msg: 'unhandled error', requestId: req.requestId, path: req.originalUrl.split('?')[0] },
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(statusCode).json({
      error: {
        statusCode,
        code: code ?? CODES[statusCode] ?? `HTTP_${statusCode}`,
        message,
        ...(details ? { details } : {}),
      },
      requestId: req.requestId,
    });
  }
}

function isBodyParserError(e: unknown): e is { status: number; type: string } {
  return typeof e === 'object' && e !== null && 'type' in e && 'status' in e && typeof (e as { status: unknown }).status === 'number';
}
