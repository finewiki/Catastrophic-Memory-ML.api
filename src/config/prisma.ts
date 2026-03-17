/**
 * ╔══════════════════════════════════════════════════════╗
 *  CORTEX DATABASE CLIENT (Prisma)
 *
 *  • Singleton PrismaClient with structured slow-query warnings
 *  • Query-duration middleware — logs any query that exceeds
 *    SLOW_QUERY_THRESHOLD_MS with the full query string + params
 *  • Graceful disconnection helper for shutdown sequences
 * ╚══════════════════════════════════════════════════════╝
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { env } from './env.js';
import { logger } from './logger.js';

// ─────────────────────────────────────────────────────────────────────────────
//  Determine Prisma log levels based on environment
// ─────────────────────────────────────────────────────────────────────────────

const prismaLogLevels: Prisma.LogLevel[] = env.isProduction
  ? ['error']
  : ['error', 'warn'];

// ─────────────────────────────────────────────────────────────────────────────
//  Client instantiation
// ─────────────────────────────────────────────────────────────────────────────

export const prisma = new PrismaClient({
  datasources: { db: { url: env.databaseUrl } },
  log: prismaLogLevels,
  errorFormat: env.isProduction ? 'minimal' : 'pretty',
});

// ─────────────────────────────────────────────────────────────────────────────
//  Slow-query middleware
// ─────────────────────────────────────────────────────────────────────────────

const dbLog = logger.child('DB');
const threshold = env.slowQueryThresholdMs;

prisma.$use(async (params: Prisma.MiddlewareParams, next: (params: Prisma.MiddlewareParams) => Promise<unknown>) => {
  const t0 = Date.now();
  const result = await next(params);
  const elapsed = Date.now() - t0;

  if (elapsed >= threshold) {
    dbLog.warn(`Slow query detected — ${elapsed}ms`, {
      model:  params.model,
      action: params.action,
      elapsed,
    });
  } else {
    dbLog.debug(`${params.model}.${params.action} — ${elapsed}ms`);
  }

  return result;
});

// ─────────────────────────────────────────────────────────────────────────────
//  Graceful shutdown helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cleanly close all database connections.
 * Call this inside your shutdown / collapse sequence instead of
 * calling `prisma.$disconnect()` directly, so we also log the event.
 */
export async function shutdownPrisma(): Promise<void> {
  dbLog.info('Severing database synapses…');
  await prisma.$disconnect();
  dbLog.info('Database connections closed.');
}
