import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { PaginatedResult } from './paginated.js';

/** Wraps every successful JSON response in `{ data }` (and `meta` for paginated lists). */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((value: unknown) => {
        if (value instanceof StreamableFile) return value;
        if (value instanceof PaginatedResult) return { data: value.items, meta: value.meta };
        return { data: value ?? null };
      }),
    );
  }
}
