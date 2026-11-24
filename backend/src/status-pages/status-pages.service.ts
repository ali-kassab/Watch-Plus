import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { isUniqueViolation } from '../common/prisma/prisma-errors.js';
import { bucketsFor, percent } from '../analytics/ranges.js';
import type { UpdateStatusPageDto } from './status-pages.schemas.js';

export type OverallStatus = 'operational' | 'degraded' | 'partial_outage' | 'major_outage';

export function overallStatus(statuses: string[], activeIncidents: number): OverallStatus {
  const down = statuses.filter((s) => s === 'down').length;
  if (down > 0 && down === statuses.length) return 'major_outage';
  if (down > 0) return 'partial_outage';
  if (activeIncidents > 0) return 'degraded';
  return 'operational';
}

@Injectable()
export class StatusPagesService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(workspaceId: string) {
    return this.prisma.statusPage.findUniqueOrThrow({ where: { workspaceId } });
  }

  async updateSettings(workspaceId: string, dto: UpdateStatusPageDto) {
    try {
      return await this.prisma.statusPage.update({ where: { workspaceId }, data: dto });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('This status page address is already taken');
      throw e;
    }
  }

  /**
   * Public, unauthenticated view. Deliberately returns only display data: no monitor URLs,
   * ids, headers, internal notes, member names or workspace ids.
   */
  async getPublic(slug: string) {
    const page = await this.prisma.statusPage.findUnique({ where: { slug } });
    if (!page || !page.isPublished) throw new NotFoundException('Status page not found');

    const monitors = await this.prisma.monitor.findMany({
      where: { workspaceId: page.workspaceId, showOnStatusPage: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, isActive: true, health: true, lastCheckedAt: true },
    });
    const ids = monitors.map((m) => m.id);
    const days = bucketsFor('90d');
    const since = new Date(days[0]);
    const daily = ids.length
      ? await this.prisma.$queryRaw<{ monitor_id: string; day: Date; ok: bigint; total: bigint }[]>`
          SELECT monitor_id, date_bin('1 day'::interval, checked_at, TIMESTAMPTZ '2000-01-01 00:00:00+00') AS day,
                 count(*) FILTER (WHERE success) AS ok, count(*) AS total
            FROM check_results
           WHERE monitor_id = ANY(${ids}::uuid[]) AND checked_at >= ${since}
           GROUP BY 1, 2`
      : [];
    const byMonitor = new Map<string, Map<number, { ok: number; total: number }>>();
    for (const r of daily) {
      if (!byMonitor.has(r.monitor_id)) byMonitor.set(r.monitor_id, new Map());
      byMonitor.get(r.monitor_id)!.set(r.day.getTime(), { ok: Number(r.ok), total: Number(r.total) });
    }

    const services = monitors.map((m, index) => {
      const series = byMonitor.get(m.id) ?? new Map();
      let ok = 0;
      let total = 0;
      const history = days.map((d) => {
        const v = series.get(d);
        ok += v?.ok ?? 0;
        total += v?.total ?? 0;
        return { date: new Date(d).toISOString().slice(0, 10), uptimePercent: v ? percent(v.ok, v.total) : null };
      });
      return {
        key: `service-${index + 1}`,
        name: m.name,
        status: m.isActive ? m.health.toLowerCase() : 'paused',
        uptime90d: percent(ok, total),
        lastCheckedAt: m.lastCheckedAt,
        history,
      };
    });

    const incidentSelect = {
      id: true, title: true, status: true, severity: true, startedAt: true, resolvedAt: true,
      monitor: { select: { name: true } },
      updates: {
        where: { isInternal: false },
        orderBy: { createdAt: 'desc' as const },
        select: { id: true, status: true, message: true, createdAt: true },
      },
    };
    const [active, resolved] = await Promise.all([
      this.prisma.incident.findMany({
        where: { workspaceId: page.workspaceId, isPublic: true, status: { not: 'RESOLVED' } },
        orderBy: { startedAt: 'desc' },
        select: incidentSelect,
      }),
      this.prisma.incident.findMany({
        where: { workspaceId: page.workspaceId, isPublic: true, status: 'RESOLVED', resolvedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
        orderBy: { resolvedAt: 'desc' },
        take: 20,
        select: incidentSelect,
      }),
    ]);
    const shape = (i: (typeof active)[number]) => ({ ...i, affectedService: i.monitor?.name ?? null, monitor: undefined });

    return {
      title: page.title,
      description: page.description,
      status: overallStatus(services.filter((s) => s.status !== 'paused').map((s) => s.status), active.length),
      services,
      activeIncidents: active.map(shape),
      resolvedIncidents: resolved.map(shape),
      generatedAt: new Date().toISOString(),
    };
  }
}
