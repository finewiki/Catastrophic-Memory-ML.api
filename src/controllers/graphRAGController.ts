import { Request, Response, NextFunction } from 'express';
import { GraphRAGService } from '../services/graphRAGService.js';
import { z } from 'zod';
import { ApiError } from '../types/errors.js';

/**
 * Reasoning Blueprint
 */
const reasoningSchema = z.object({
  userId: z.string().min(1, '[NEXUS] Identity missing.'),
  query: z.string().min(1, '[NEXUS] Query signal empty.'),
  maxMemories: z.number().int().min(1).max(20).optional(),
  maxEntities: z.number().int().min(1).max(20).optional(),
  graphDepth: z.number().int().min(1).max(5).optional(),
  minSimilarity: z.number().min(0).max(1).optional()
});

/**
 * Reasoning Processor
 * 
 * Executes deep semantic reasoning by traversing the relational knowledge graph.
 * Synthesizes multi-hop connections into a coherent cognitive context.
 */
export class GraphRAGController {
  constructor(private reasoningService: GraphRAGService) {}

  /**
   * Deep Reason
   * 
   * Triggers a multi-hop traversal of the synaptic matrix to synthesize context.
   */
  async retrieve(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const intent = reasoningSchema.parse(req.body);

      const timestampStart = Date.now();
      const synthesis = await this.reasoningService.retrieve(intent);
      const latency = Date.now() - timestampStart;

      res.json({
        signal: intent.query,
        matrixIdentity: intent.userId,
        
        // Synaptic Telemetry
        synthesisStats: {
          synapsesRecalled: synthesis.memories.length,
          entitiesIdentified: synthesis.entities.length,
          graphNodesTraversed: synthesis.graphNodes.length,
          bandwidthUsage: synthesis.totalTokens,
          latencyMs: latency
        },

        // Contextual Output
        recalledMemories: synthesis.memories,
        identifiedEntities: synthesis.entities,
        relationalGraph: synthesis.graphNodes,
        
        // Synthesized Cognitive Context
        reasoningContext: synthesis.contextSummary
      });
    } catch (anomaly) {
      if (anomaly instanceof z.ZodError) {
        next(new ApiError({
          code: 'SIGNAL_INTERFERENCE',
          status: 400,
          message: 'Malformed reasoning intent.',
          details: { errors: anomaly.errors } as Record<string, unknown>
        }));
      } else {
        next(anomaly);
      }
    }
  }
}
