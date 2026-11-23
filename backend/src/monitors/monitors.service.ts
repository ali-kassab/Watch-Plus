import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service.js';
import { validateTargetUrl } from '../common/net/ip-policy.js';
import { PaginatedResult, toSkipTake } from '../common/http/paginated.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Prisma, type Monitor } from '../generated/prisma/client.js';
import { Role } from '../generated/prisma/enums.js';
import { IncidentsService } from '../incidents/incidents.service.js';
import { MonitoringService } from '../monitoring/monitoring.service.js';
import { hasRole } from '../workspaces/roles.js';
import { METHODS_WITH_BODY, type CreateMonitorDto, type ListChecksQuery, type ListMonitorsQuery, type UpdateMonitorDto } from './monitors.schemas.js';

export type MonitorStatus = 'up' | 'down' | 'pending' | 'paused';

export function monitorStatus(m: Pick<Monitor, 'isActive' | 'health'>): MonitorStatus {
  if (!m.isActive) return 'paused';
  return m.health.toLowerCase() as MonitorStatus;
}

@Injectable()
export class MonitorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly monitoring: MonitoringService,
    private readonly incidents: IncidentsService,
  ) {}

  async list(workspaceId: string, role: Role, q: ListMonitorsQuery) {
    const where: Prisma.MonitorWhereInput = { workspaceId };
    if (q.q) where.OR = [{ name: { contains: q.q, mode: 'insensitive' } }, { url: { contains: q.q, mode: 'insensitive' } }];
    if (q.status === 'paused') where.isActive = false;
    else if (q.status) Object.assign(where, { isActive: true, health: q.status.toUpperCase() });

    const [items, total] = await Promise.all([
      this.prisma.monitor.findMany({ where, orderBy: [{ createdAt: 'asc' }], ...toSkipTake(q) }),
      this.prisma.monitor.count({ where }),
    ]);
    const uptime = await this.uptime24h(items.map((m) => m.id));
    return new PaginatedResult(
      items.map((m) => ({ ...this.toResponse(m, role), uptime24h: uptime.get(m.id) ?? null })),
      total,
      q,
    );
  }

  async get(workspaceId: string, id: string, role: Role) {
    const monitor = await this.find(workspaceId, id);
    const [uptime, activeIncident] = await Promise.all([
      this.uptime24h([id]),
      this.prisma.incident.findFirst({ where: { monitorId: id, status: { not: 'RESOLVED' } }, select: { id: true, title: true, status: true, startedAt: true } }),
    ]);
    return { ...this.toResponse(monitor, role), uptime24h: uptime.get(id) ?? null, activeIncident };
  }

  async create(workspaceId: string, dto: CreateMonitorDto, role: Role) {
    this.assertSafeUrl(dto.url);
    const monitor = await this.prisma.monitor.create({
      data: {
        workspaceId,
        name: dto.name,
        url: dto.url,
        method: dto.method,
        intervalSeconds: dto.intervalSeconds,
        timeoutMs: dto.timeoutMs,
        expectedStatusCodes: [...new Set(dto.expectedStatusCodes)].sort((a, b) => a - b),
        headers: dto.headers,
        body: dto.body ?? null,
        retries: dto.retries,
        isActive: dto.isActive,
        showOnStatusPage: dto.showOnStatusPage,
        nextCheckAt: new Date(),
      },
    });
    return this.toResponse(monitor, role);
  }

  async update(workspaceId: string, id: string, dto: UpdateMonitorDto, role: Role) {
    const current = await this.find(workspaceId, id);
    if (dto.url) this.assertSafeUrl(dto.url);
    const method = dto.method ?? current.method;
    const body = dto.body !== undefined ? dto.body : current.body;
    if (body && !METHODS_WITH_BODY.includes(method)) throw new BadRequestException(`A request body is not supported for ${method}`);
    const timeoutMs = dto.timeoutMs ?? current.timeoutMs;
    const intervalSeconds = dto.intervalSeconds ?? current.intervalSeconds;
    if (timeoutMs >= intervalSeconds * 1000) throw new BadRequestException('Timeout must be shorter than the check interval');

    const updated = await this.prisma.monitor.update({
      where: { id: current.id },
      data: {
        ...dto,
        expectedStatusCodes: dto.expectedStatusCodes ? [...new Set(dto.expectedStatusCodes)].sort((a, b) => a - b) : undefined,
        // Re-check soon so a configuration change is reflected quickly.
        nextCheckAt: new Date(),
      },
    });
    return this.toResponse(updated, role);
  }

  async setActive(workspaceId: string, id: string, isActive: boolean, role: Role) {
    const current = await this.find(workspaceId, id);
    const updated = await this.prisma.monitor.update({
      where: { id: current.id },
      data: isActive ? { isActive: true, nextCheckAt: new Date() } : { isActive: false },
    });
    return this.toResponse(updated, role);
  }

  async remove(workspaceId: string, id: string) {
    const monitor = await this.find(workspaceId, id);
    await this.prisma.$transaction(async (tx) => {
      await this.incidents.resolveForMonitor(tx, monitor.id, `Monitor "${monitor.name}" was deleted.`);
      await tx.monitor.delete({ where: { id: monitor.id } });
    });
  }

  /** Runs a check immediately, using the same lease as the scheduler (never overlaps a running check). */
  async checkNow(workspaceId: string, id: string) {
    const monitor = await this.find(workspaceId, id);
    if (!monitor.isActive) throw new ConflictException('Resume the monitor before running a check');
    if (!(await this.monitoring.claimOne(monitor.id))) throw new ConflictException('A check for this monitor is already running');
    return this.monitoring.runClaimed(monitor.id);
  }

  async listChecks(workspaceId: string, id: string, q: ListChecksQuery) {
    await this.find(workspaceId, id);
    const where: Prisma.CheckResultWhereInput = { monitorId: id, success: q.result ? q.result === 'success' : undefined };
    const [items, total] = await Promise.all([
      this.prisma.checkResult.findMany({ where, orderBy: { checkedAt: 'desc' }, ...toSkipTake(q) }),
      this.prisma.checkResult.count({ where }),
    ]);
    return new PaginatedResult(
      items.map((c) => ({ ...c, id: c.id.toString() })),
      total,
      q,
    );
  }

  private async uptime24h(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<{ monitor_id: string; ok: bigint; total: bigint }[]>`
      SELECT monitor_id, count(*) FILTER (WHERE success) AS ok, count(*) AS total
        FROM check_results
       WHERE monitor_id = ANY(${ids}::uuid[]) AND checked_at > now() - interval '24 hours'
       GROUP BY monitor_id`;
    return new Map(rows.map((r) => [r.monitor_id, Math.round((Number(r.ok) / Number(r.total)) * 10000) / 100]));
  }

  private assertSafeUrl(url: string) {
    const v = validateTargetUrl(url, this.config.get('ALLOW_PRIVATE_TARGETS'));
    if (!v.ok) throw new BadRequestException(v.reason);
  }

  private async find(workspaceId: string, id: string) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id, workspaceId } });
    if (!monitor) throw new NotFoundException('Monitor not found');
    return monitor;
  }

  /** Header values may carry API keys: viewers only see header names. Scheduler internals are never exposed. */
  private toResponse(m: Monitor, role: Role) {
    const { lockedUntil: _l, headers, ...rest } = m;
    const h = (headers ?? {}) as Record<string, string>;
    return {
      ...rest,
      status: monitorStatus(m),
      headers: hasRole(role, Role.MEMBER) ? h : Object.fromEntries(Object.keys(h).map((k) => [k, '••••••'])),
    };
  }
}
