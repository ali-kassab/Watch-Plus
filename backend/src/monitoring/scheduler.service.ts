import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service.js';
import { MonitoringService } from './monitoring.service.js';

const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Polling scheduler backed by PostgreSQL (no Redis). Every tick it leases due monitors
 * up to the free concurrency budget and runs their checks in the background.
 * All scheduling state (next_check_at, locked_until) lives in the database, so a restart
 * simply resumes: overdue monitors are checked on the first tick and stale leases expire.
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private timer?: NodeJS.Timeout;
  private lastMaintenance = 0;
  private ticking = false;
  private stopping = false;

  constructor(
    private readonly monitoring: MonitoringService,
    private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.get('SCHEDULER_ENABLED')) {
      this.logger.log('Scheduler disabled (SCHEDULER_ENABLED=false)');
      return;
    }
    const tickMs = this.config.get('SCHEDULER_TICK_MS');
    this.timer = setInterval(() => void this.tick(), tickMs);
    this.logger.log({ msg: 'scheduler started', tickMs, maxConcurrency: this.config.get('SCHEDULER_MAX_CONCURRENCY') });
    void this.tick();
  }

  async onApplicationShutdown() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    // Let in-flight checks finish (bounded) so their results are not lost.
    await Promise.race([Promise.allSettled(this.inFlight.values()), new Promise((r) => setTimeout(r, 10_000))]);
  }

  get activeChecks(): number {
    return this.inFlight.size;
  }

  async tick(): Promise<number> {
    if (this.ticking || this.stopping) return 0;
    this.ticking = true;
    try {
      const capacity = this.config.get('SCHEDULER_MAX_CONCURRENCY') - this.inFlight.size;
      const ids = (await this.monitoring.claimDue(capacity)).filter((id) => !this.inFlight.has(id));
      for (const id of ids) {
        const run = this.monitoring
          .runClaimed(id)
          .catch((e: Error) => this.logger.error({ msg: 'check failed to record', monitorId: id, error: e.message }))
          .finally(() => this.inFlight.delete(id));
        this.inFlight.set(id, run);
      }
      await this.maintenance();
      return ids.length;
    } catch (e) {
      this.logger.error({ msg: 'scheduler tick failed', error: (e as Error).message });
      return 0;
    } finally {
      this.ticking = false;
    }
  }

  /** Waits until all currently running checks have finished (used by tests). */
  async drain(): Promise<void> {
    await Promise.allSettled(this.inFlight.values());
  }

  private async maintenance() {
    if (Date.now() - this.lastMaintenance < MAINTENANCE_INTERVAL_MS) return;
    this.lastMaintenance = Date.now();
    const removed = await this.monitoring.pruneHistory(this.config.get('CHECK_RETENTION_DAYS'));
    if (removed) this.logger.log({ msg: 'pruned check history', removed });
  }
}
