/** Walks an error's cause chain looking for a Postgres/Prisma unique violation. */
export function isUniqueViolation(error: unknown): boolean {
  for (let e = error as { code?: string; cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    if (e.code === 'P2002' || e.code === '23505') return true;
  }
  return false;
}
