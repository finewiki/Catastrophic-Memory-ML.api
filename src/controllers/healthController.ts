import { Request, Response, NextFunction } from 'express';
import { prisma, redis } from '../config/index.js';
import { EmbeddingProvider } from '../services/embeddings/EmbeddingProvider.js';

/**
 * Diagnostic Processor
 * 
 * Conducts real-time telemetry on the matrix's internal stability,
 * verifying active synapses and the resonator state of the embedding engine.
 */
export class HealthController {
  constructor(private cortexResonator?: EmbeddingProvider) {}

  /**
   * Diagnostic Pulse check
   */
  health = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      // Verify Synaptic Database integrity
      const synapticStability = await prisma
        .$queryRaw`SELECT 1 as stability`
        .then(() => 'STABLE')
        .catch(() => 'DEGRADED');

      // Verify Neural Cache (Redis) signaling
      const cacheSignaling = await (redis as any)
        .ping()
        .then(() => 'ACTIVE')
        .catch(() => 'SILENT');

      res.json({
        matrixStatus: 'SYNCHRONIZED',
        synapticStability,
        cacheSignaling,
        cortexResonator: this.cortexResonator?.isEnabled() ? 'OPERATIONAL' : 'OFFLINE',
        chronosTimestamp: new Date().toISOString()
      });
    } catch (anomaly) {
      next(anomaly);
    }
  };
}
