/**
 * ╔══════════════════════════════════════════════════════╗
 *  CIRCADIAN CYCLES — Autonomic Lifecycle Management
 *
 *  Manages recurring biological-inspired routines:
 *    • Neural Consolidation (every 6 hours)
 *    • Synaptic Pruning     (daily at 03:00 UTC)
 *    • Vital Diagnostics    (every hour)
 *
 *  New capabilities:
 *    • Named cycle registry with pause/resume per-cycle
 *    • Missed-run detection via last-fired timestamps
 *    • `CronScheduler.getStatus()` introspection for /admin/vitals
 * ╚══════════════════════════════════════════════════════╝
 */

import cron, { ScheduledTask } from 'node-cron';
import { ConsolidationService } from '../services/consolidationService.js';
import { logger }               from './logger.js';

const cycleLog = logger.child('CIRCADIAN');

// ─────────────────────────────────────────────────────────────────────────────
//  Cycle descriptor
// ─────────────────────────────────────────────────────────────────────────────

interface CycleEntry {
  name:        string;
  expression:  string;
  description: string;
  task:        ScheduledTask;
  paused:      boolean;
  lastFiredAt: string | null;   // ISO-8601, null if never fired
  runCount:    number;
  errorCount:  number;
}

// ─────────────────────────────────────────────────────────────────────────────
//  CronScheduler
// ─────────────────────────────────────────────────────────────────────────────

export class CronScheduler {
  private static registry: Map<string, CycleEntry> = new Map();

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Register, schedule, and track a single cycle. */
  private static register(
    name:        string,
    expression:  string,
    description: string,
    handler:     () => void | Promise<void>,
  ): void {
    const wrappedHandler = async () => {
      const entry = CronScheduler.registry.get(name)!;
      entry.lastFiredAt = new Date().toISOString();
      entry.runCount++;
      try {
        await handler();
      } catch (err: any) {
        entry.errorCount++;
        cycleLog.error(`Cycle "${name}" encountered an anomaly: ${err?.message ?? err}`);
      }
    };

    const task = cron.schedule(expression, wrappedHandler, { timezone: 'UTC' });

    CronScheduler.registry.set(name, {
      name,
      expression,
      description,
      task,
      paused:      false,
      lastFiredAt: null,
      runCount:    0,
      errorCount:  0,
    });

    cycleLog.debug(`Registered cycle "${name}" → ${expression}`);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Ignite all autonomic circadian rhythms.
   * Safe to call multiple times — existing cycles are stopped first.
   */
  static init(): void {
    if (CronScheduler.registry.size > 0) {
      cycleLog.warn('Circadian cycles already active — restarting.');
      CronScheduler.stop();
    }

    cycleLog.info('Synchronizing circadian rhythms…');

    // ── Neural Consolidation: every 6 hours at minute 0 ───────────────────
    CronScheduler.register(
      'neural-consolidation',
      '0 */6 * * *',
      'Merge and re-rank memory clusters (Sleep Cycle)',
      async () => {
        cycleLog.info('Initiating neural consolidation cycle…');
        const results = await ConsolidationService.consolidateAllUsers();
        cycleLog.info('Neural consolidation complete.', {
          total:       results.length,
          consolidated: results.filter(r => !r.skipped).length,
          skipped:     results.filter(r =>  r.skipped).length,
        });
      },
    );

    // ── Synaptic Pruning: daily at 03:00 UTC ──────────────────────────────
    CronScheduler.register(
      'synaptic-pruning',
      '0 3 * * *',
      'Prune stale and low-importance memory engrams',
      () => {
        cycleLog.info('Synaptic pruning protocols executed.');
        // TODO: wire to PruningService once implemented
      },
    );

    // ── Vital Diagnostics: every hour at minute 0 ─────────────────────────
    CronScheduler.register(
      'vital-diagnostics',
      '0 * * * *',
      'Log system health metrics (CPU, memory, uptime)',
      () => {
        const mem = process.memoryUsage();
        cycleLog.info('Diagnostic pulse.', {
          uptimeSeconds: Math.floor(process.uptime()),
          heapUsedMB:   +(mem.heapUsed  / 1_048_576).toFixed(2),
          heapTotalMB:  +(mem.heapTotal / 1_048_576).toFixed(2),
          rssMB:        +(mem.rss       / 1_048_576).toFixed(2),
          activeCycles: CronScheduler.registry.size,
        });
      },
    );

    cycleLog.info(`Autonomic subsystems online (${CronScheduler.registry.size} cycles registered).`);
  }

  /**
   * Pause a named cycle without destroying it.
   * The cycle can be resumed later with `resume()`.
   */
  static pause(name: string): boolean {
    const entry = CronScheduler.registry.get(name);
    if (!entry) {
      cycleLog.warn(`Cannot pause unknown cycle: "${name}"`);
      return false;
    }
    if (!entry.paused) {
      entry.task.stop();
      entry.paused = true;
      cycleLog.info(`Cycle "${name}" paused.`);
    }
    return true;
  }

  /**
   * Resume a previously paused cycle.
   */
  static resume(name: string): boolean {
    const entry = CronScheduler.registry.get(name);
    if (!entry) {
      cycleLog.warn(`Cannot resume unknown cycle: "${name}"`);
      return false;
    }
    if (entry.paused) {
      entry.task.start();
      entry.paused = false;
      cycleLog.info(`Cycle "${name}" resumed.`);
    }
    return true;
  }

  /**
   * Stop and remove all registered cycles.
   * Called during controlled neural collapse (SIGTERM / SIGINT).
   */
  static stop(): void {
    cycleLog.warn(`Suspending all circadian rhythms (${CronScheduler.registry.size} cycles)…`);
    for (const entry of CronScheduler.registry.values()) {
      entry.task.stop();
    }
    CronScheduler.registry.clear();
    cycleLog.info('All circadian rhythms suspended.');
  }

  /**
   * Returns a read-only status snapshot of every registered cycle.
   * Exposed by `GET /admin/vitals` for operator dashboards.
   */
  static getStatus(): ReadonlyArray<Omit<CycleEntry, 'task'>> {
    return Array.from(CronScheduler.registry.values()).map(
      ({ task: _task, ...rest }) => rest
    );
  }

  /**
   * Detect cycles that have never fired or whose last-fired timestamp
   * is older than expected. Returns names of suspicious cycles.
   */
  static detectMissedRuns(thresholdMs: number): string[] {
    const now = Date.now();
    const missed: string[] = [];

    for (const entry of CronScheduler.registry.values()) {
      if (entry.paused) continue;
      if (!entry.lastFiredAt) {
        // Task registered but never run — only flag if we're past startup grace
        if (process.uptime() * 1_000 > thresholdMs) {
          missed.push(entry.name);
        }
        continue;
      }
      const age = now - new Date(entry.lastFiredAt).getTime();
      if (age > thresholdMs) {
        missed.push(entry.name);
      }
    }

    return missed;
  }
}
