/**
 * ╔══════════════════════════════════════════════════════╗
 *  CONFIG BARREL
 *
 *  Single import point for all configuration singletons.
 *  Import from here instead of reaching into individual
 *  config files — keeps consumer code clean and consistent.
 * ╚══════════════════════════════════════════════════════╝
 *
 *  Usage:
 *    import { env, logger, prisma }            from './config/index.js';
 *    import { redis, redisForBullMQ, pingRedis } from './config/index.js';
 *    import { synapticStream, getQueueHealth } from './config/index.js';
 *    import { CronScheduler }                  from './config/index.js';
 */

export { env, type EnvConfig }                        from './env.js';
export { logger, type Logger, type LogLevel }          from './logger.js';
export { prisma, shutdownPrisma }                     from './prisma.js';
export { redis, redisForBullMQ, pingRedis }           from './redis.js';
export {
  synapticStream,
  consolidationStream,
  JobRegistry,
  getQueueHealth,
  type AddMemoryJobData,
  type ConsolidationJobData,
  type QueueHealthSnapshot,
  type JobRegistryKey,
}                                                     from './queue.js';
export { CronScheduler }                              from './cron.js';
