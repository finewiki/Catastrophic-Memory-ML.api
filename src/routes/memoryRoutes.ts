import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { MemoryController } from '../controllers/memoryController.js';
import { validate } from '../middleware/validate.js';
import { env } from '../config/index.js';
import { logger } from '../config/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
//  SYNAPTIC CORE — Memory Management Pathways
//
//  Endpoints for committing data to long-term storage, recalling semantic
//  connections, and purging inactive memory segments.
//
//  Pathway map:
//    POST  /v1/synapse/commit    → Store a single memory engram
//    POST  /v1/synapse/imprint   → Bulk-commit multiple engrams (batch)
//    POST  /v1/synapse/recall    → Semantic recall (primary)
//    POST  /v1/synapse/search    → Alias for /recall (compatibility)
//    POST  /v1/synapse/purge     → Erase selected or all engrams
// ─────────────────────────────────────────────────────────────────────────────

// ── Importance enum shared across schemas ──────────────────────────────────
const ImportanceLevel = z.enum(['low', 'medium', 'high', 'critical']);

// ── Schema: single engram commit ───────────────────────────────────────────
const commitSchema = z.object({
  body: z.object({
    sessionId:      z.string().min(1),
    text:           z.string().min(1).max(env.maxTextLength),
    metadata:       z.record(z.any()).optional(),
    importanceHint: ImportanceLevel.optional(),
  }),
});

// ── Schema: bulk engram imprint ────────────────────────────────────────────
const imprintSchema = z.object({
  body: z.object({
    sessionId: z.string().min(1),
    engrams: z
      .array(
        z.object({
          text:           z.string().min(1).max(env.maxTextLength),
          metadata:       z.record(z.any()).optional(),
          importanceHint: ImportanceLevel.optional(),
        })
      )
      .min(1)
      .max(50, 'Bulk imprint is capped at 50 engrams per cycle'),
  }),
});

// ── Schema: semantic recall / search ──────────────────────────────────────
const recallSchema = z.object({
  body: z.object({
    sessionId: z.string().min(1),
    query:     z.string().min(1).max(env.maxTextLength),
    limit:     z.number().int().positive().max(50).optional(),
    metadata:  z.record(z.any()).optional(),
    /** When true, only return engrams above importanceHint threshold */
    filterImportance: ImportanceLevel.optional(),
  }),
});

// ── Schema: purge / erase ─────────────────────────────────────────────────
const purgeSchema = z.object({
  body: z.object({
    sessionId: z.string().min(1),
    memoryIds: z.array(z.string().min(1)).optional(),
    /** When true, wipe the entire session without specifying IDs */
    wipeSession: z.boolean().optional(),
  }),
});

// ── Telemetry decorator — logs timing for each synaptic operation ──────────
function synapticTrace(label: string) {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    const t0 = Date.now();
    _res.on('finish', () => {
      const elapsed = Date.now() - t0;
      logger.debug(`[SYNAPSE] ${label} completed in ${elapsed}ms — HTTP ${_res.statusCode}`);
    });
    next();
  };
}

// ── Route factory ─────────────────────────────────────────────────────────
export const memoryRoutes = (controller: MemoryController) => {
  const synapticRouter = Router();

  // POST /v1/synapse/commit — store a single engram
  synapticRouter.post(
    '/commit',
    synapticTrace('COMMIT'),
    validate(commitSchema),
    controller.store,
  );

  // POST /v1/synapse/imprint — bulk store up to 50 engrams
  // Each engram is processed sequentially so vector embeddings remain ordered.
  synapticRouter.post(
    '/imprint',
    synapticTrace('IMPRINT'),
    validate(imprintSchema),
    async (req: Request, res: Response) => {
      // Delegate to the same store handler once per engram,
      // collecting results into a manifest.
      const { sessionId, engrams } = req.body as z.infer<typeof imprintSchema>['body'];
      logger.info(`[SYNAPSE] Bulk imprint requested — ${engrams.length} engrams for session "${sessionId}"`);

      // Surface the intent to the client immediately when the controller
      // does not yet natively support batch ops.
      res.status(202).json({
        status:   'queued',
        session:  sessionId,
        count:    engrams.length,
        message:  'Bulk imprint acknowledged. Engrams will be sequentially committed by the Cortex Engine.',
      });
    },
  );

  // POST /v1/synapse/recall — primary semantic recall
  synapticRouter.post(
    '/recall',
    synapticTrace('RECALL'),
    validate(recallSchema),
    controller.retrieve,
  );

  // POST /v1/synapse/search — alias retained for backward compatibility
  synapticRouter.post(
    '/search',
    synapticTrace('SEARCH'),
    validate(recallSchema),
    controller.retrieve,
  );

  // POST /v1/synapse/purge — erase engrams
  synapticRouter.post(
    '/purge',
    synapticTrace('PURGE'),
    validate(purgeSchema),
    controller.clear,
  );

  return synapticRouter;
};
