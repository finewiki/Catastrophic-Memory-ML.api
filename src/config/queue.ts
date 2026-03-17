/**
 * ╔══════════════════════════════════════════════════════╗
 *  SYNAPTIC STREAM — BullMQ Job Queues
 *
 *  Maintains two purpose-built queues:
 *    • synapticStream     — Async memory ingestion pipeline
 *    • consolidationStream — Periodic sleep-cycle consolidation
 *
 *  A `JobRegistry` map provides a single lookup point for all
 *  queue instances, making it easy to iterate or introspect
 *  them from admin / health endpoints.
 * ╚══════════════════════════════════════════════════════╝
 */

import { Queue, QueueEvents } from 'bullmq';
import { redisForBullMQ }     from './redis.js';
import { logger }             from './logger.js';
import { env }                from './env.js';
import { UserContext }        from '../types/billing.js';

const queueLog = logger.child('QUEUE');

// ─────────────────────────────────────────────────────────────────────────────
//  Job Data Types
// ─────────────────────────────────────────────────────────────────────────────

/** Payload for an asynchronous memory ingestion job. */
export interface AddMemoryJobData {
  userId:                string;
  text:                  string;
  sessionId?:            string;
  metadata?:             Record<string, unknown>;
  userContext:           UserContext;
  enableGraphExtraction?: boolean;
  importanceHint?:       'low' | 'medium' | 'high' | 'critical';
}

/** Payload for a sleep-cycle consolidation job. */
export interface ConsolidationJobData {
  /** When set, consolidate only this user; otherwise global sweep. */
  userId?:       string;
  triggeredBy:   'cron' | 'admin' | 'manual';
  triggeredAt:   string; // ISO-8601
}

// ─────────────────────────────────────────────────────────────────────────────
//  Shared job defaults
// ─────────────────────────────────────────────────────────────────────────────

const sharedJobOptions = {
  removeOnComplete: { count: 250, age: 48 * 3_600 }, // keep 250 or 48 hrs (whichever first)
  removeOnFail:     { count: 1_000 },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
//  Queue: Synaptic Stream  (memory ingestion)
// ─────────────────────────────────────────────────────────────────────────────

export const synapticStream = new Queue<AddMemoryJobData>('memory-processing', {
  connection: redisForBullMQ,
  defaultJobOptions: {
    ...sharedJobOptions,
    attempts: 5,
    backoff: { type: 'exponential', delay: 3_000 },
  },
});

synapticStream.on('error', (err) =>
  queueLog.error(`Synaptic Stream anomaly: ${err.message}`)
);

// ─────────────────────────────────────────────────────────────────────────────
//  Queue: Consolidation Stream  (sleep-cycle jobs)
// ─────────────────────────────────────────────────────────────────────────────

export const consolidationStream = new Queue<ConsolidationJobData>('consolidation', {
  connection: redisForBullMQ,
  defaultJobOptions: {
    ...sharedJobOptions,
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
    // Consolidation jobs lock a resource for the duration defined in env
    lockDuration: env.consolidation.lockDurationSec * 1_000,
  },
});

consolidationStream.on('error', (err) =>
  queueLog.error(`Consolidation Stream anomaly: ${err.message}`)
);

// ─────────────────────────────────────────────────────────────────────────────
//  Job Registry — single lookup point for all queues
// ─────────────────────────────────────────────────────────────────────────────

export const JobRegistry = {
  synapticStream,
  consolidationStream,
} satisfies Record<string, Queue>;

export type JobRegistryKey = keyof typeof JobRegistry;

// ─────────────────────────────────────────────────────────────────────────────
//  Queue health snapshot (used by /admin/vitals & /status/deep)
// ─────────────────────────────────────────────────────────────────────────────

export interface QueueHealthSnapshot {
  name:    string;
  waiting: number;
  active:  number;
  failed:  number;
  delayed: number;
  paused:  boolean;
}

/**
 * Returns a health snapshot for every registered queue.
 * Resolves in parallel for minimal latency.
 */
export async function getQueueHealth(): Promise<QueueHealthSnapshot[]> {
  const entries = Object.entries(JobRegistry) as [JobRegistryKey, Queue][];

  const snapshots = await Promise.allSettled(
    entries.map(async ([, queue]) => {
      const [waiting, active, failed, delayed, isPaused] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
        queue.isPaused(),
      ]);

      return {
        name:    queue.name,
        waiting,
        active,
        failed,
        delayed,
        paused:  isPaused,
      } satisfies QueueHealthSnapshot;
    })
  );

  return snapshots
    .filter((r): r is PromiseFulfilledResult<QueueHealthSnapshot> => r.status === 'fulfilled')
    .map(r => r.value);
}
