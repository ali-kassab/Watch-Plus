import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof paginationSchema>;

/** Returned by services for list endpoints; the response interceptor turns it into `{ data, meta }`. */
export class PaginatedResult<T> {
  constructor(
    readonly items: T[],
    readonly total: number,
    readonly pagination: Pagination,
  ) {}

  get meta() {
    return {
      page: this.pagination.page,
      pageSize: this.pagination.pageSize,
      total: this.total,
      totalPages: Math.max(1, Math.ceil(this.total / this.pagination.pageSize)),
    };
  }
}

export function toSkipTake(p: Pagination) {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}
