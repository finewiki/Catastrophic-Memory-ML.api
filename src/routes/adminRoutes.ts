import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AdminController } from '../controllers/adminController.js';
import { validate } from '../middleware/validate.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { logger } from '../config/logger.js';
import { prisma } from '../config/prisma.js';

// ─────────────────────────────────────────────────────────────────────────────
//  CORTEX COMMAND — Administrative Operations Pathway
//
//  Privileged endpoints for corpus maintenance, memory consolidation,
//  live diagnostics, and neural mapping. All routes require a valid
//  admin credential (adminAuth middleware).
//
//  Pathway map:
//    POST  /v1/core/admin/prune       → Prune stale / low-importance engrams
//    POST  /v1/core/admin/consolidate → Trigger Sleep Cycle consolidation
//    GET   /v1/core/admin/vitals      → Live system diagnostic snapshot
//    POST  /v1/core/admin/neuralmap   → Return active memory segment statistics
// ─────────────────────────────────────────────────────────────────────────────

// ── Schema: prune parameters ───────────────────────────────────────────────
const pruneSchema = z.object({
  body: z
    .object({
      /** Remove engrams older than N days */
      maxAgeDays: z.number().positive().optional(),
      /** Remove sessions silent for N days */
      inactiveDays: z.number().positive().optional(),
      /** Drop engrams below this importance score (0–1) */
      importanceThreshold: z.number().min(0).max(1).optional(),
      /** Maximum number of records to evaluate per prune cycle */
      take: z.number().int().positive().max(1000).optional(),
    })
    .optional(),
});

// ── Schema: neuralmap query parameters ────────────────────────────────────
const neuralmapSchema = z.object({
  body: z
    .object({
      /** Scope the map to a specific user ID */
      userId: z.string().optional(),
      /** Scope the map to a specific session ID */
      sessionId: z.string().optional(),
    })
    .optional(),
});

// ── Route factory ─────────────────────────────────────────────────────────
export const adminRoutes = (controller: AdminController) => {
  const commandRouter = Router();

  // ── POST /admin/prune ──────────────────────────────────────────────────
  // Purge stale or low-importance engrams based on configurable thresholds.
  commandRouter.post(
    '/admin/prune',
    adminAuth,
    validate(pruneSchema),
    (req: Request, res: Response, next) => {
      logger.warn(`[COMMAND] Prune cycle initiated — params: ${JSON.stringify(req.body ?? {})}`);
      controller.prune(req, res, next);
    },
  );

  // ── POST /admin/consolidate ────────────────────────────────────────────
  // Trigger a Sleep Cycle — the background process that merges, compresses,
  // and re-ranks memory clusters to improve future recall efficiency.
  commandRouter.post(
    '/admin/consolidate',
    adminAuth,
    (req: Request, res: Response, next) => {
      const scope = req.body?.userId ? `user:${req.body.userId}` : 'global';
      logger.info(`[COMMAND] Consolidation cycle triggered — scope: ${scope}`);
      controller.consolidate(req, res, next);
    },
  );

  // ── GET /admin/vitals ─────────────────────────────────────────────────
  // Returns a real-time diagnostic snapshot of the Nexus: uptime, memory
  // pressure, database reachability, and process resource usage.
  commandRouter.get(
    '/admin/vitals',
    adminAuth,
    async (_req: Request, res: Response) => {
      try {
        const startedAt = new Date(Date.now() - process.uptime() * 1_000).toISOString();
        const mem = process.memoryUsage();

        // Quick DB round-trip to confirm reachability
        let dbStatus: 'online' | 'degraded' = 'online';
        try {
          await prisma.$queryRaw`SELECT 1`;
        } catch {
          dbStatus = 'degraded';
        }

        res.json({
          nexus: 'COGNITIVE NEXUS',
          status: dbStatus === 'online' ? 'nominal' : 'degraded',
          startedAt,
          uptimeSeconds: Math.floor(process.uptime()),
          database: dbStatus,
          memory: {
            heapUsedMB:  +(mem.heapUsed  / 1_048_576).toFixed(2),
            heapTotalMB: +(mem.heapTotal / 1_048_576).toFixed(2),
            rssMB:       +(mem.rss       / 1_048_576).toFixed(2),
            externalMB:  +(mem.external  / 1_048_576).toFixed(2),
          },
          pid: process.pid,
          nodeVersion: process.version,
        });
      } catch (err) {
        logger.error('[COMMAND] Failed to assemble vitals snapshot', { err });
        res.status(500).json({ error: 'Vitals snapshot unavailable.' });
      }
    },
  );

  // ── POST /admin/neuralmap ──────────────────────────────────────────────
  // Returns an aggregate statistical map of memory segments stored in the
  // corpus — total count, per-session breakdown, and importance distribution.
  commandRouter.post(
    '/admin/neuralmap',
    adminAuth,
    validate(neuralmapSchema),
    async (req: Request, res: Response) => {
      try {
        const { userId, sessionId } = req.body ?? {};

        const where: Record<string, unknown> = {};
        if (userId)    where['userId']    = userId;
        if (sessionId) where['sessionId'] = sessionId;

        const [total, byImportance] = await Promise.all([
          // Total engram count
          prisma.memory.count({ where }),
          // Breakdown by importance bucket
          prisma.memory.groupBy({
            by: ['importanceScore' as any],
            where,
            _count: { _all: true },
          }),
        ]);

        logger.info(`[COMMAND] Neural map generated — ${total} engrams scanned.`);

        res.json({
          scope:       userId ? `user:${userId}` : sessionId ? `session:${sessionId}` : 'global',
          totalEngrams: total,
          importanceDistribution: byImportance,
          generatedAt: new Date().toISOString(),
        });
      } catch (err) {
        logger.error('[COMMAND] Neural map generation failed', { err });
        res.status(500).json({ error: 'Failed to generate neural map.' });
      }
    },
  );

  return commandRouter;
};
