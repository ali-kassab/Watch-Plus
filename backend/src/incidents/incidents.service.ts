import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service.js';
import { PaginatedResult, toSkipTake } from '../common/http/paginated.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { isUniqueViolation } from '../common/prisma/prisma-errors.js';
import type { Incident, Monitor, Prisma } from '../generated/prisma/client.js';
import type { IncidentStatus } from '../generated/prisma/enums.js';
import type { NotificationPayload } from '../notifications/notification-payload.js';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service.js';
import { assertCanTransition } from './incident-lifecycle.js';
import type { AddIncidentUpdateDto, CreateIncidentDto, ListIncidentsQuery, ResolveIncidentDto, UpdateIncidentDto } from './incidents.schemas.js';

type Tx = Prisma.TransactionClient;
const ACTIVE = { not: 'RESOLVED' } as const;

export interface OutageInfo {
  statusCode: number | null;
  responseTimeMs: number | null;
  error: string | null;
}

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: NotificationDispatcher,
    private readonly config: AppConfig,
  ) {}

  async list(workspaceId: string, q: ListIncidentsQuery) {
    const where: Prisma.IncidentWhereInput = {
      workspaceId,
      monitorId: q.monitorId,
      severity: q.severity,
      status: q.state === 'active' ? ACTIVE : q.state === 'resolved' ? 'RESOLVED' : undefined,
    };
    const [items, total] = await Promise.all([
      this.prisma.incident.findMany({
        where,
        orderBy: [{ startedAt: 'desc' }],
        ...toSkipTake(q),
        include: { monitor: { select: { id: true, name: true } }, _count: { select: { updates: true } } },
      }),
      this.prisma.incident.count({ where }),
    ]);
    return new PaginatedResult(items, total, q);
  }

  async get(workspaceId: string, id: string) {
    const incident = await this.prisma.incident.findFirst({
      where: { id, workspaceId },
      include: {
        monitor: { select: { id: true, name: true, url: true, health: true } },
        createdBy: { select: { id: true, name: true } },
        updates: { orderBy: { createdAt: 'desc' }, include: { author: { select: { id: true, name: true } } } },
      },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }

  async create(workspaceId: string, userId: string, dto: CreateIncidentDto) {
    if (dto.monitorId) {
      const monitor = await this.prisma.monitor.findFirst({ where: { id: dto.monitorId, workspaceId }, select: { id: true } });
      if (!monitor) throw new NotFoundException('Monitor not found');
    }
    try {
      const incident = await this.prisma.$transaction(async (tx) => {
        const created = await tx.incident.create({
          data: {
            workspaceId,
            monitorId: dto.monitorId,
            title: dto.title,
            severity: dto.severity,
            status: dto.status,
            isPublic: dto.isPublic,
            createdById: userId,
            updates: { create: { type: 'CREATED', status: dto.status, message: dto.message, authorId: userId } },
          },
        });
        await this.notifyUpdate(tx, created, dto.message);
        return created;
      });
      return this.get(workspaceId, incident.id);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('This monitor already has an active incident');
      throw error;
    }
  }

  async update(workspaceId: string, id: string, dto: UpdateIncidentDto) {
    const incident = await this.find(workspaceId, id);
    await this.prisma.incident.update({ where: { id: incident.id }, data: dto });
    return this.get(workspaceId, id);
  }

  /** Adds a timeline entry: a public update (optionally changing status) or an internal note. */
  async addUpdate(workspaceId: string, id: string, userId: string, dto: AddIncidentUpdateDto) {
    const incident = await this.find(workspaceId, id);
    if (dto.status === 'RESOLVED') return this.resolve(workspaceId, id, userId, { resolution: dto.message });
    if (dto.status) assertCanTransition(incident.status, dto.status);
    if (incident.status === 'RESOLVED' && !dto.isInternal) {
      throw new ConflictException('Resolved incidents only accept internal notes');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.incidentUpdate.create({
        data: {
          incidentId: incident.id,
          type: dto.isInternal ? 'NOTE' : dto.status ? 'STATUS_CHANGE' : 'UPDATE',
          status: dto.status ?? null,
          message: dto.message,
          isInternal: dto.isInternal,
          authorId: userId,
        },
      });
      const updated = dto.status ? await tx.incident.update({ where: { id: incident.id }, data: { status: dto.status } }) : incident;
      if (!dto.isInternal) await this.notifyUpdate(tx, updated, dto.message);
    });
    return this.get(workspaceId, id);
  }

  async resolve(workspaceId: string, id: string, userId: string | null, dto: ResolveIncidentDto) {
    const incident = await this.find(workspaceId, id);
    assertCanTransition(incident.status, 'RESOLVED');
    await this.prisma.$transaction(async (tx) => {
      const resolved = await this.resolveInTx(tx, incident, dto.resolution, userId);
      await this.notifyUpdate(tx, resolved, dto.resolution);
    });
    return this.get(workspaceId, id);
  }

  // ---- Automatic incidents (called by the monitoring engine inside its transaction) ----

  /**
   * Opens an automatic incident for a monitor that just went down. If an incident is already
   * active for the monitor (e.g. opened manually) a timeline entry is added instead, so one
   * outage never produces duplicate incidents. The partial unique index backs this up under races.
   */
  async openForOutage(tx: Tx, monitor: Monitor, outage: OutageInfo): Promise<Incident> {
    const existing = await tx.incident.findFirst({ where: { monitorId: monitor.id, status: ACTIVE } });
    const detail = outage.error ?? `HTTP ${outage.statusCode}`;
    if (existing) {
      await tx.incidentUpdate.create({
        data: { incidentId: existing.id, type: 'UPDATE', message: `Monitor check failed: ${detail}` },
      });
      return existing;
    }
    const incident = await tx.incident.create({
      data: {
        workspaceId: monitor.workspaceId,
        monitorId: monitor.id,
        title: `${monitor.name} is down`,
        status: 'OPEN',
        severity: 'MAJOR',
        isAutomatic: true,
        updates: { create: { type: 'CREATED', status: 'OPEN', message: `Automatically opened: ${detail}` } },
      },
    });
    this.logger.log({ msg: 'automatic incident opened', incidentId: incident.id, monitorId: monitor.id });
    return incident;
  }

  /** Auto-resolves an automatic incident on recovery; manual incidents only get a timeline entry. */
  async handleRecovery(tx: Tx, monitor: Monitor, downtimeLabel: string): Promise<Incident | null> {
    const incident = await tx.incident.findFirst({ where: { monitorId: monitor.id, status: ACTIVE } });
    if (!incident) return null;
    if (!incident.isAutomatic) {
      await tx.incidentUpdate.create({
        data: { incidentId: incident.id, type: 'UPDATE', message: `Monitor is responding normally again (down for ${downtimeLabel}).`, isInternal: true },
      });
      return incident;
    }
    const resolved = await this.resolveInTx(tx, incident, `Monitor recovered automatically after ${downtimeLabel}.`, null);
    this.logger.log({ msg: 'automatic incident resolved', incidentId: incident.id, monitorId: monitor.id });
    return resolved;
  }

  /** Resolves the active incident of a monitor that is being deleted or paused for good. */
  async resolveForMonitor(tx: Tx, monitorId: string, reason: string) {
    const incident = await tx.incident.findFirst({ where: { monitorId, status: ACTIVE } });
    if (incident) await this.resolveInTx(tx, incident, reason, null);
  }

  incidentUrl(incident: Pick<Incident, 'id' | 'workspaceId'>) {
    return `${this.config.get('FRONTEND_URL')}/w/${incident.workspaceId}/incidents/${incident.id}`;
  }

  private async resolveInTx(tx: Tx, incident: Incident, resolution: string, userId: string | null) {
    await tx.incidentUpdate.create({
      data: { incidentId: incident.id, type: 'RESOLVED', status: 'RESOLVED', message: resolution, authorId: userId },
    });
    return tx.incident.update({
      where: { id: incident.id },
      data: { status: 'RESOLVED' as IncidentStatus, resolvedAt: new Date(), resolution },
    });
  }

  private async notifyUpdate(tx: Tx, incident: Incident, message: string) {
    const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: incident.workspaceId }, select: { id: true, name: true } });
    const payload: NotificationPayload = {
      event: 'INCIDENT_UPDATED',
      occurredAt: new Date().toISOString(),
      workspace,
      summary: `Incident "${incident.title}" is now ${incident.status}.`,
      incident: { id: incident.id, title: incident.title, status: incident.status, severity: incident.severity, url: this.incidentUrl(incident) },
      message,
    };
    await this.dispatcher.enqueue(tx, incident.workspaceId, 'INCIDENT_UPDATED', payload);
  }

  private async find(workspaceId: string, id: string) {
    const incident = await this.prisma.incident.findFirst({ where: { id, workspaceId } });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }
}
