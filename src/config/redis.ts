/**
 * ╔══════════════════════════════════════════════════════╗
 *  NEURAL CACHE LAYER (Redis)
 *
 *  Provides two connection adapters:
 *    • `redis`         — General-purpose cache & rate-limit store
 *                        (Upstash REST or IORedis, auto-detected)
 *    • `redisForBullMQ` — Dedicated IORedis connection for BullMQ
 *                        (BullMQ requires a raw TCP socket, not REST)
 *
 *  Both adapters expose a typed `ping()` health probe.
 * ╚══════════════════════════════════════════════════════╝
 */

import { Redis as UpstashRedis } from '@upstash/redis';
import { Redis as IORedis }       from 'ioredis';
import { env }                    from './env.js';
import { logger }                 from './logger.js';

const redisLog = logger.child('REDIS');

// ─────────────────────────────────────────────────────────────────────────────
//  Mode detection
// ─────────────────────────────────────────────────────────────────────────────

const useUpstash = !!(env.upstashRedisRestUrl && env.upstashRedisRestToken);

if (!useUpstash && !env.redisHost) {
  throw new Error(
    '[REDIS] ⚠  No cache layer configured. ' +
    'Set either UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN ' +
    'or REDIS_HOST in your environment manifest.'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Upstash REST adapter (typed wrapper)
// ─────────────────────────────────────────────────────────────────────────────

class UpstashAdapter {
  private client: UpstashRedis;
  readonly mode = 'upstash' as const;

  constructor(url: string, token: string) {
    this.client = new UpstashRedis({ url, token });
    redisLog.info('Upstash REST adapter initialised.');
  }

  /** Forward all raw calls to the underlying Upstash client. */
  get raw(): UpstashRedis { return this.client; }

  async ping(): Promise<boolean> {
    try {
      const response = await this.client.ping();
      return response === 'PONG';
    } catch {
      return false;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  IORedis adapter (typed wrapper)
// ─────────────────────────────────────────────────────────────────────────────

class IORedisAdapter {
  private client: IORedis;
  readonly mode = 'ioredis' as const;

  constructor(options: ConstructorParameters<typeof IORedis>[0]) {
    this.client = new IORedis(options as any);
    this.attachEventListeners();
  }

  get raw(): IORedis { return this.client; }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  private attachEventListeners(): void {
    this.client.on('connect',           () => redisLog.info('IORedis connected.'));
    this.client.on('ready',             () => redisLog.info('IORedis ready.'));
    this.client.on('reconnecting',      () => redisLog.warn('IORedis reconnecting…'));
    this.client.on('error', (err: Error) => redisLog.error(`IORedis error: ${err.message}`));
    this.client.on('end',               () => redisLog.warn('IORedis connection closed.'));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Exported adapters
// ─────────────────────────────────────────────────────────────────────────────

/** General-purpose cache adapter — used by rate-limiter and application cache. */
export const redis: UpstashAdapter | IORedisAdapter = useUpstash
  ? new UpstashAdapter(env.upstashRedisRestUrl!, env.upstashRedisRestToken!)
  : new IORedisAdapter({
      host:                env.redisHost!,
      port:                env.redisPort ?? 6379,
      password:            env.redisPassword,
      maxRetriesPerRequest: null,
      enableReadyCheck:    false,
      retryStrategy: (times: number) => {
        if (times > 10) return null; // stop retrying
        return Math.min(times * 200, 3000); // exponential backoff, max 3s
      },
    });

/**
 * BullMQ-dedicated IORedis connection.
 *
 * BullMQ requires a raw TCP connection (not HTTP/REST), so we always use
 * IORedis here regardless of the general-purpose adapter mode.
 */
export const redisForBullMQ = new IORedis({
  host:                env.redisHost    || 'localhost',
  port:                env.redisPort    || 6379,
  password:            env.redisPassword,
  tls:                 env.isProduction ? {} : undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck:    false,
  family:              4,
  retryStrategy: (times: number) => {
    if (times > 20) {
      redisLog.error('BullMQ Redis: max retries exceeded. Giving up.');
      return null;
    }
    return Math.min(times * 150, 5000);
  },
});

redisForBullMQ.on('connect', () => redisLog.info('BullMQ Redis connected.'));
redisForBullMQ.on('error',   (err) => redisLog.error(`BullMQ Redis error: ${err.message}`));

// ─────────────────────────────────────────────────────────────────────────────
//  Convenience health probe (used by /status/deep)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the primary Redis adapter responds to PING within 2 seconds.
 */
export async function pingRedis(): Promise<boolean> {
  try {
    return await Promise.race<boolean>([
      redis.ping(),
      new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
  } catch {
    return false;
  }
}
