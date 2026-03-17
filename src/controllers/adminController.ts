import { Request, Response, NextFunction } from 'express';
import { ConsolidationService } from '../services/consolidationService.js';
import { z } from 'zod';

/**
 * Consolidation Blueprint
 */
const stabilizationSchema = z.object({
  entityId: z.string().optional() // userId mapped to entityId for theme
});

/**
 * Architect Controller
 * 
 * High-level administrative interface for managing matrix health,
 * executing manual consolidation protocols, and pruning spectral memory fragments.
 */
export class AdminController {
  constructor(private matrixService: any = null) {} 

  /**
   * Prune Spectral Fragments
   * 
   * Manually triggers the removal of low-importance or decayed synaptic weights.
   */
  prune = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const outcome = await this.matrixService.pruneOldMemories(req.body);
      res.json({
        protocol: 'SPECTRAL_PRUNE',
        stabilizationStatus: 'COMPLETE',
        outcome
      });
    } catch (anomaly) {
      next(anomaly);
    }
  };

  /**
   * Trigger Neural Consolidation
   * 
   * Forces a consolidation cycle to optimize synaptic connections and 
   * reduce cognitive entropy.
   */
  consolidate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = stabilizationSchema.parse(req.body);

      if (data.entityId) {
        // Targeted consolidation
        const result = await ConsolidationService.consolidateUser(data.entityId);
        res.json({
          protocol: 'TARGETED_STABILIZATION',
          entityId: data.entityId,
          result
        });
      } else {
        // Global consolidation pulse
        const results = await ConsolidationService.consolidateAllUsers();
        res.json({
          protocol: 'GLOBAL_Batch_STABILIZATION',
          entitiesProcessed: results.length,
          synapsesOptimized: results.filter(r => !r.skipped).length,
          spectralFragmentsSkipped: results.filter(r => r.skipped).length,
          telemetry: results
        });
      }
    } catch (anomaly) {
      next(anomaly);
    }
  };
}
