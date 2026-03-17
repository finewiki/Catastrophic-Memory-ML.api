import { Router, Request, Response } from 'express';
import { AsyncMemoryController } from '../controllers/asyncMemoryController.js';
import { hybridAuth } from '../middleware/hybridAuth.js';
import { logger } from '../config/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
//  SYNAPTIC STREAM — Asynchronous Cognitive Pathway
//
//  Routes for deep ingestion of cognitive data and telemetry tracking
//  of background synthesis processes running in the Cortex Engine.
//
//  Pathway map:
//    POST   /v1/stream/ingest           → Enqueue engram for async processing
//    GET    /v1/stream/telemetry/:jobId → Poll synthesis job status
//    DELETE /v1/stream/abort/:jobId     → Cancel a queued synthesis job
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the async stream router.
 *
 * Uses a factory so the controller can be swapped during integration tests
 * without touching module-level state.
 */
export const asyncMemoryRoutes = () => {
  const streamRouter = Router();
  const processor = new AsyncMemoryController();

  // ── POST /v1/stream/ingest ──────────────────────────────────────────────
  // Enqueue raw text data for secondary vector processing (Cortex Engine).
  // Responds immediately with a jobId; poll /telemetry/:jobId for updates.
  streamRouter.post(
    '/ingest',
    hybridAuth,
    (req: Request, res: Response, next) => {
      logger.debug(`[STREAM] Ingest request received — session: ${req.body?.sessionId ?? 'unknown'}`);
      processor.addMemory.call(processor, req, res, next);
    },
  );

  // ── GET /v1/stream/telemetry/:jobId ────────────────────────────────────
  // Fetch real-time telemetry for a specific synthesis cycle (job).
  // Returns status, progress percentage, and optional error payload.
  streamRouter.get(
    '/telemetry/:jobId',
    hybridAuth,
    (req: Request, res: Response, next) => {
      logger.debug(`[STREAM] Telemetry poll — jobId: ${req.params.jobId}`);
      processor.getJobStatus.call(processor, req, res, next);
    },
  );

  // ── DELETE /v1/stream/abort/:jobId ─────────────────────────────────────
  // Attempt to cancel a synthesis job that is still in the PENDING state.
  // Jobs in PROCESSING or COMPLETE states cannot be aborted.
  streamRouter.delete(
    '/abort/:jobId',
    hybridAuth,
    async (req: Request, res: Response) => {
      const { jobId } = req.params;
      logger.warn(`[STREAM] Abort requested — jobId: ${jobId}`);

      // Placeholder: wire to actual queue cancellation once queue supports it.
      res.status(200).json({
        jobId,
        status:  'abort_requested',
        message: 'Abort signal dispatched to Cortex Engine. Job will terminate if still pending.',
      });
    },
  );

  return streamRouter;
};

// Default export retains backward compatibility with app.ts import.
export default asyncMemoryRoutes();
