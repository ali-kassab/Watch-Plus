import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { bucketsFor, percent, RANGES, type Range } from './ranges.js';

interface AggRow {
  total: bigint;
  ok: bigint;
  avg_ms: number | null;
  p95_ms: number | null;
}

/** All statistics are computed from the check_results table with SQL aggregates. */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(workspaceId: string, range: Range, monitorId?: string) {
    const since = new Date(Date.now() - RANGES[range].durationMs);
    const monitorWhere = { workspaceId, ...(monitorId ? { id: monitorId } : {}) };
    const [byState, activeIncidents, agg] = await Promise.all([
      this.prisma.monitor.groupBy({ by: ['isActive', 'health'], where: monitorWhere, _count: { _all: true } }),
      this.prisma.incident.count({ where: { workspaceId, status: { not: 'RESOLVED' }, ...(monitorId ? { monitorId } : {}) } }),
      this.prisma.$queryRaw<AggRow[]>`
        SELECT count(*) AS total, count(*) FILTER (WHERE c.success) AS ok,
               avg(c.response_time_ms) FILTER (WHERE c.success)::float AS avg_ms,
               percentile_cont(0.95) WITHIN GROUP (ORDER BY c.response_time_ms) FILTER (WHERE c.success) AS p95_ms
          FROM check_results c JOIN monitors m ON m.id = c.monitor_id
         WHERE m.workspace_id = ${workspaceId}::uuid AND c.checked_at >= ${since}
           ${this.monitorFilter(monitorId)}`,
    ]);
    const counts = { total: 0, up: 0, down: 0, pending: 0, paused: 0 };
    for (const row of byState) {
      const n = row._count._all;
      counts.total += n;
      if (!row.isActive) counts.paused += n;
      else counts[row.health.toLowerCase() as 'up' | 'down' | 'pending'] += n;
    }
    const a = agg[0];
    const total = Number(a?.total ?? 0);
    const ok = Number(a?.ok ?? 0);
    return {
      range,
      monitors: counts,
      activeIncidents,
      checks: { total, failed: total - ok },
      uptimePercent: percent(ok, total),
      avgResponseMs: a?.avg_ms != null ? Math.round(a.avg_ms) : null,
      p95ResponseMs: a?.p95_ms != null ? Math.round(a.p95_ms) : null,
    };
  }

  /** Bucketed uptime and response time series; empty buckets are returned with null values. */
  async timeseries(workspaceId: string, range: Range, monitorId?: string) {
    const { durationMs, stepSql } = RANGES[range];
    const since = new Date(Date.now() - durationMs);
    const rows = await this.prisma.$queryRaw<(AggRow & { bucket: Date })[]>`
      SELECT date_bin(${stepSql}::interval, c.checked_at, TIMESTAMPTZ '2000-01-01 00:00:00+00') AS bucket,
             count(*) AS total, count(*) FILTER (WHERE c.success) AS ok,
             avg(c.response_time_ms) FILTER (WHERE c.success)::float AS avg_ms,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY c.response_time_ms) FILTER (WHERE c.success) AS p95_ms
        FROM check_results c JOIN monitors m ON m.id = c.monitor_id
       WHERE m.workspace_id = ${workspaceId}::uuid AND c.checked_at >= ${since}
         ${this.monitorFilter(monitorId)}
       GROUP BY 1 ORDER BY 1`;
    const byBucket = new Map(rows.map((r) => [r.bucket.getTime(), r]));
    return bucketsFor(range).map((t) => {
      const r = byBucket.get(t);
      const total = Number(r?.total ?? 0);
      const ok = Number(r?.ok ?? 0);
      return {
        bucket: new Date(t).toISOString(),
        checks: total,
        failures: total - ok,
        uptimePercent: percent(ok, total),
        avgResponseMs: r?.avg_ms != null ? Math.round(r.avg_ms) : null,
        p95ResponseMs: r?.p95_ms != null ? Math.round(r.p95_ms) : null,
      };
    });
  }

  /** Per-monitor uptime and latency for the range (dashboard table and bar chart). */
  async monitorBreakdown(workspaceId: string, range: Range) {
    const since = new Date(Date.now() - RANGES[range].durationMs);
    const rows = await this.prisma.$queryRaw<(AggRow & { id: string; name: string; health: string; is_active: boolean })[]>`
      SELECT m.id, m.name, m.health::text AS health, m.is_active,
             count(c.id) AS total, count(c.id) FILTER (WHERE c.success) AS ok,
             avg(c.response_time_ms) FILTER (WHERE c.success)::float AS avg_ms,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY c.response_time_ms) FILTER (WHERE c.success) AS p95_ms
        FROM monitors m
        LEFT JOIN check_results c ON c.monitor_id = m.id AND c.checked_at >= ${since}
       WHERE m.workspace_id = ${workspaceId}::uuid
       GROUP BY m.id
       ORDER BY m.name`;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.is_active ? r.health.toLowerCase() : 'paused',
      checks: Number(r.total),
      uptimePercent: percent(Number(r.ok), Number(r.total)),
      avgResponseMs: r.avg_ms != null ? Math.round(r.avg_ms) : null,
      p95ResponseMs: r.p95_ms != null ? Math.round(r.p95_ms) : null,
    }));
  }

  async recentActivity(workspaceId: string, limit: number) {
    const checks = await this.prisma.checkResult.findMany({
      where: { monitor: { workspaceId } },
      orderBy: { checkedAt: 'desc' },
      take: limit,
      include: { monitor: { select: { id: true, name: true } } },
    });
    return checks.map((c) => ({ ...c, id: c.id.toString() }));
  }

  private monitorFilter(monitorId?: string) {
    return monitorId ? Prisma.sql`AND c.monitor_id = ${monitorId}::uuid` : Prisma.empty;
  }
}
