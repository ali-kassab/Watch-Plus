import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Monitor } from '../generated/prisma/client.js';
import { IncidentsService } from '../incidents/incidents.service.js';
import type { NotificationPayload } from '../notifications/notification-payload.js';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service.js';
import { decideTransition } from './check-evaluator.js';
import { formatDuration } from './duration.js';
import { HttpCheckerService, type CheckOutcome } from './http-checker.service.js';

/** Extra lease time on top of the worst-case check duration. */
const LEASE_PADDING_MS = 15_000;

/**
 * The monitoring engine: claims due monitors, runs their checks and applies the results
 * (check history, health, incidents, notifications) atomically.
 */
@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly checker: HttpCheckerService,
    private readonly incidents: IncidentsService,
    private readonly dispatcher: NotificationDispatcher,
  ) {}

  /**
   * Atomically leases up to `limit` due monitors. `FOR UPDATE SKIP LOCKED` plus the
   * `locked_until` lease guarantee that one monitor is never checked twice at the same
   * time, even with several API processes. Expired leases (crash / restart) are reclaimed.
   */
  async claimDue(limit: number): Promise<string[]> {
    if (limit <= 0) return [];
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE monitors m
         SET locked_until = now() + make_interval(secs => (m.timeout_ms * (m.retries + 1) + ${LEASE_PADDING_MS}) / 1000.0)
       WHERE m.id IN (
         SELECT id FROM monitors
          WHERE is_active AND next_check_at <= now()
            AND (locked_until IS NULL OR locked_until < now())
          ORDER BY next_check_at
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED)
      RETURNING m.id`;
    return rows.map((r) => r.id);
  }

  /** Leases one specific monitor for an on-demand check. Returns false if it is already being checked. */
  async claimOne(monitorId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE monitors m
         SET locked_until = now() + make_interval(secs => (m.timeout_ms * (m.retries + 1) + ${LEASE_PADDING_MS}) / 1000.0)
       WHERE m.id = ${monitorId}::uuid AND (m.locked_until IS NULL OR m.locked_until < now())
      RETURNING m.id`;
    return rows.length === 1;
  }

  /** Runs the check for a monitor that the caller has leased, then records the outcome. */
  async runClaimed(monitorId: string): Promise<CheckOutcome | null> {
    const monitor = await this.prisma.monitor.findUnique({ where: { id: monitorId } });
    if (!monitor) return null;
    let outcome: CheckOutcome;
    try {
      outcome = await this.checker.check({
        url: monitor.url,
        method: monitor.method,
        headers: (monitor.headers ?? {}) as Record<string, string>,
        body: monitor.body,
        timeoutMs: monitor.timeoutMs,
        expectedStatusCodes: monitor.expectedStatusCodes,
        retries: monitor.retries,
      });
    } catch (e) {
      outcome = { success: false, statusCode: null, responseTimeMs: null, errorType: 'UNKNOWN', error: (e as Error).message, attempts: 1 };
    }
    await this.recordResult(monitor, outcome);
    return outcome;
  }

  /** Persists a check result and applies any health transition in one transaction. */
  async recordResult(monitor: Monitor, outcome: CheckOutcome, now = new Date()): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Re-read inside the transaction: the monitor may have been edited, paused or deleted meanwhile.
        const current = await tx.monitor.findUnique({ where: { id: monitor.id }, include: { workspace: { select: { id: true, name: true } } } });
        if (!current) return;

        await tx.checkResult.create({
          data: {
            monitorId: current.id,
            checkedAt: now,
            success: outcome.success,
            statusCode: outcome.statusCode,
            responseTimeMs: outcome.responseTimeMs,
            errorType: outcome.errorType,
            error: outcome.error?.slice(0, 500) ?? null,
            attempts: outcome.attempts,
          },
        });

        const { next, transition } = decideTransition(current.health, outcome.success);
        await tx.monitor.update({
          where: { id: current.id },
          data: {
            health: next,
            lastCheckedAt: now,
            lastStatusCode: outcome.statusCode,
            lastResponseTimeMs: outcome.responseTimeMs,
            lastError: outcome.error?.slice(0, 500) ?? null,
            healthChangedAt: next !== current.health ? now : undefined,
            nextCheckAt: new Date(now.getTime() + current.intervalSeconds * 1000),
            lockedUntil: null,
          },
        });

        if (!transition) return;
        const base = {
          occurredAt: now.toISOString(),
          workspace: current.workspace,
          monitor: { id: current.id, name: current.name, url: current.url },
          check: { statusCode: outcome.statusCode, responseTimeMs: outcome.responseTimeMs, error: outcome.error },
        };
        if (transition === 'WENT_DOWN') {
          const incident = await this.incidents.openForOutage(tx, current, outcome);
          const payload: NotificationPayload = {
            ...base,
            event: 'MONITOR_DOWN',
            summary: `${current.name} is DOWN: ${outcome.error ?? `HTTP ${outcome.statusCode}`}`,
            incident: { id: incident.id, title: incident.title, status: incident.status, severity: incident.severity, url: this.incidents.incidentUrl(incident) },
          };
          await this.dispatcher.enqueue(tx, current.workspaceId, 'MONITOR_DOWN', payload);
          this.logger.warn({ msg: 'monitor went down', monitorId: current.id, errorType: outcome.errorType });
        } else {
          const downFor = formatDuration(now.getTime() - (current.healthChangedAt ?? now).getTime());
          const incident = await this.incidents.handleRecovery(tx, current, downFor);
          const payload: NotificationPayload = {
            ...base,
            event: 'MONITOR_RECOVERED',
            summary: `${current.name} is back UP after ${downFor}.`,
            incident: incident
              ? { id: incident.id, title: incident.title, status: incident.status, severity: incident.severity, url: this.incidents.incidentUrl(incident) }
              : undefined,
          };
          await this.dispatcher.enqueue(tx, current.workspaceId, 'MONITOR_RECOVERED', payload);
          this.logger.log({ msg: 'monitor recovered', monitorId: current.id, downFor });
        }
      });
    } catch (e) {
      // Release the lease so the monitor is retried on the next tick instead of after lease expiry.
      await this.prisma.monitor.updateMany({ where: { id: monitor.id }, data: { lockedUntil: null } }).catch(() => undefined);
      throw e;
    }
  }

  async pruneHistory(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
    const [checks] = await this.prisma.$transaction([
      this.prisma.checkResult.deleteMany({ where: { checkedAt: { lt: cutoff } } }),
      this.prisma.notificationDelivery.deleteMany({ where: { createdAt: { lt: cutoff }, status: { in: ['SUCCESS', 'FAILED'] } } }),
    ]);
    return checks.count;
  }
}
