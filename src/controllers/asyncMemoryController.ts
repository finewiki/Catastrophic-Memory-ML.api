import { Request, Response, NextFunction } from 'express';
import { synapticStream } from '../config/queue.js';
import { z } from 'zod';
import { ApiError } from '../types/errors.js';
import { AuthenticatedRequest } from '../middleware/hybridAuth.js';

/**
 * Ingest Schema Blueprint
 */
const ingestSchema = z.object({
  userId: z.string().min(1, '[NEXUS] Identification (userId) required.'),
  text: z.string().min(1, '[NEXUS] Data stream (text) empty.').max(15000, 'Stream exceeds bandwidth limit.'),
  metadata: z.record(z.unknown()).optional(),
  enableGraphExtraction: z.boolean().optional()
});

/**
 * Synaptic Stream Processor
 * 
 * Manages the high-throughput ingestion of cognitive data and provides 
 * real-time telemetry on background synthesis progress.
 */
export class AsyncMemoryController {
  
  /**
   * Ingest Synaptic Data
   * 
   * Enqueues data for asynchronous synthesis within the Cortex Engine.
   */
  async addMemory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = ingestSchema.parse(req.body);

      if (!req.userContext) {
        throw new ApiError({
          code: 'AUTH_INTERCEPT',
          status: 401,
          message: 'Entity context not found in session.'
        });
      }

      if (data.userId !== req.userContext.userId) {
        throw new ApiError({
          code: 'ACCESS_DENIED',
          status: 403,
          message: 'Synaptic mismatch: Entity ID does not align with session.'
        });
      }

      // Buffer the intent into the Synaptic Stream
      const sequence = await synapticStream.add('process-synapse', {
        userId: data.userId,
        text: data.text,
        metadata: data.metadata,
        userContext: req.userContext,
        enableGraphExtraction: data.enableGraphExtraction
      }, {
        jobId: `SEQ-${data.userId}-${Date.now()}`
      });

      res.status(202).json({
        state: 'ENQUEUED',
        sequenceId: sequence.id,
        propagationPath: req.userContext.source,
        extractionActive: req.userContext.source === 'DIRECT' && data.enableGraphExtraction !== false
      });
    } catch (anomaly) {
      if (anomaly instanceof z.ZodError) {
        return next(new ApiError({
          code: 'SCHEMA_ANOMALY',
          status: 400,
          message: 'Data stream structural failure.',
          details: { errors: anomaly.errors } as Record<string, unknown>
        }));
      }
      next(anomaly);
    }
  }

  /**
   * Fetch Telemetry
   * 
   * Accesses the operational state of a specific synaptic sequence.
   */
  async getJobStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId } = req.params;
      const sequence = await synapticStream.getJob(jobId);

      if (!sequence) {
        throw new ApiError({
          code: 'SEQUENCE_NOT_FOUND',
          status: 404,
          message: 'The requested synaptic sequence does not exist in the current buffer.'
        });
      }

      const propagationState = await sequence.getState();
      
      res.json({
        sequenceId: sequence.id,
        propagationState,
        synapticProgress: sequence.progress,
        reconstructionResult: sequence.returnvalue,
        anomalyLog: sequence.failedReason
      });
    } catch (anomaly) {
      next(anomaly);
    }
  }
}
