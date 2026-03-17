import { Worker, Job } from 'bullmq';
import { redisForBullMQ } from './config/redis.js';
import { AddMemoryJobData } from './config/queue.js';
import { CostGuard } from './services/hybridCostGuard.js';
import { EmbeddingProvider } from './services/embeddings/EmbeddingProvider.js';
import { OllamaProvider } from './services/embeddings/OllamaProvider.js';
import { OpenAIEmbeddingProvider } from './services/embeddings/OpenAIEmbeddingProvider.js';
import { GraphExtractionService } from './services/graphExtractionService.js';
import { prisma } from './config/prisma.js';
import { env, logger } from './config/index.js';

/**
 * Cortex Engine
 * 
 * The primary asynchronous processing loop for cognitive data.
 * It handles embedding generation, graph extraction, and synaptic storage.
 */
class CortexEngine {
  private processor: Worker;
  private cortexProvider: EmbeddingProvider;
  private graphExtractor: GraphExtractionService;

  constructor() {
    logger.info('[CORTEX] Initializing neural processor...');

    // Synchronize embedding provider with environment configuration
    if (env.embeddingProvider === 'ollama') {
      this.cortexProvider = new OllamaProvider();
    } else {
      this.cortexProvider = new OpenAIEmbeddingProvider(env.openAiApiKey!);
    }

    this.graphExtractor = new GraphExtractionService();

    // Establish the processing loop
    this.processor = new Worker<AddMemoryJobData>(
      'memory-processing',
      this.synthesizeData.bind(this),
      {
        connection: redisForBullMQ,
        concurrency: 8, // Optimized for parallel ingestion
        limiter: {
          max: 20, 
          duration: 1000 
        }
      }
    );

    this.processor.on('completed', (job) => {
      logger.info(`[CORTEX] Sync complete: Job ${job.id} finalized successfully.`);
    });

    this.processor.on('failed', (job, err) => {
      logger.error(`[CORTEX] Critical anomaly in Job ${job?.id}: ${err.message}`);
    });

    logger.info('[CORTEX] Neural processing loop active.');
  }

  /**
   * Synthesize Data
   * 
   * Transforms raw text inputs into multi-dimensional synaptic links.
   */
  private async synthesizeData(job: Job<AddMemoryJobData>): Promise<{ memoryId: string; synergyRating: number }> {
    const { userId, text, metadata, userContext, enableGraphExtraction = true } = job.data;

    logger.info(`[CORTEX] Synthesizing memory for Entity: ${userId} [${userContext.source}]`);

    await job.updateProgress(10);
    
    // Preliminary bandwidth analysis
    const estimatedTokens = Math.ceil(text.length / 4);
    const willExtractGraph = enableGraphExtraction && userContext.source === 'DIRECT';
    
    const estimatedRequirement = CostGuard.calculateEstimatedCost(
      estimatedTokens,
      true, 
      willExtractGraph
    );

    // Verify entity bandwidth allowance
    const bandwidthCheck = await CostGuard.checkAccess(userId, userContext, estimatedRequirement);
    
    if (!bandwidthCheck.allowed) {
      throw new Error('[CORTEX] Access Intercept: Insufficient synaptic bandwidth or permissions.');
    }

    // Step 1: Neural Embedding Generation
    await job.updateProgress(30);
    const vectorEmbedding = await this.cortexProvider.generateEmbedding(text);
    logger.info(`[CORTEX] Vector stabilization complete (${vectorEmbedding.length} dims)`);

    // Step 2: Semantic Graph Mapping
    await job.updateProgress(50);
    let synapticEntities: any[] = [];
    let synapticLinks: any[] = [];
    let cognitiveUsage: any = null;

    if (willExtractGraph && bandwidthCheck.allowBackgroundJobs) {
      logger.info('[CORTEX] Mapping relational graph (Deep Extraction mode)...');
      const extraction = await this.graphExtractor.extractGraph(text);
      synapticEntities = (extraction as any).entities || [];
      synapticLinks = (extraction as any).relationships || [];
      cognitiveUsage = (extraction as any).usage;
      
      logger.info(`[CORTEX] Successfully mapped ${synapticEntities.length} entities and ${synapticLinks.length} links.`);
    }

    // Step 3: Synaptic Commitment (Database)
    await job.updateProgress(70);

    const persistenceResult = await prisma.$transaction(async (tx: any) => {
      // Create primary Memory node
      const memoryResult = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "Memory" (
          id, "userId", text, "compressedText", metadata, embedding,
          "importanceScore", confidence, "createdAt", "lastAccessedAt"
        )
        VALUES (
          gen_random_uuid(), ${userId}, ${text}, ${text.slice(0, 500)}, ${JSON.stringify(metadata || {})}::jsonb,
          ${`[${vectorEmbedding.join(',')}]`}::vector,
          0.5, 1.0, NOW(), NOW()
        )
        RETURNING id
      `;
      
      const memoryId = memoryResult[0].id;
      const entityLookup = new Map<string, string>();

      // Establish Synaptic Entities
      for (const eData of synapticEntities) {
        const eDescritpion = `${eData.name} (${eData.type}): ${eData.description || ''}`;
        const eEmbedding = await this.cortexProvider.generateEmbedding(eDescritpion);
        
        const eResult = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO "Entity" (
            id, "userId", name, type, description, embedding, importance, confidence,
            "createdAt", "updatedAt", "lastAccessedAt"
          )
          VALUES (
            gen_random_uuid(), ${userId}, ${eData.name}, ${eData.type},
            ${eData.description || null}, ${`[${eEmbedding.join(',')}]`}::vector,
            0.5, 1.0, NOW(), NOW(), NOW()
          )
          ON CONFLICT ("userId", name, type)
          DO UPDATE SET
            description = EXCLUDED.description,
            embedding = EXCLUDED.embedding,
            "lastAccessedAt" = NOW(),
            "updatedAt" = NOW()
          RETURNING id
        `;

        entityLookup.set(eData.name, eResult[0].id);
      }

      // Link Synapses
      for (const link of synapticLinks) {
        const fromId = entityLookup.get(link.from);
        const toId = entityLookup.get(link.to);

        if (fromId && toId) {
          try {
            await tx.relationship.upsert({
              where: {
                userId_fromEntityId_toEntityId_predicate: {
                  userId,
                  fromEntityId: fromId,
                  toEntityId: toId,
                  predicate: link.predicate
                }
              },
              create: {
                userId,
                fromEntityId: fromId,
                toEntityId: toId,
                predicate: link.predicate,
                confidence: 1.0,
                weight: 1.0
              },
              update: {
                confidence: 1.0,
                updatedAt: new Date()
              }
            });
          } catch (e) {
            logger.warn(`[CORTEX] Link establishment failed for ${link.from} -> ${link.to}`);
          }
        }
      }

      return { memoryId };
    });

    await job.updateProgress(90);

    // Final Bandwidth Synchronization
    const actualTokens = (cognitiveUsage?.total_tokens || estimatedTokens) + 128; 
    const finalRequirement = CostGuard.calculateEstimatedCost(actualTokens, true, willExtractGraph);

    try {
      await CostGuard.deduct(userId, userContext, finalRequirement);
    } catch (err) {
      logger.warn(`[CORTEX] Mandatory bandwidth deduction deferred: ${err}`);
    }

    await job.updateProgress(100);

    return {
      memoryId: persistenceResult.memoryId,
      synergyRating: finalRequirement
    };
  }

  public async terminate(): Promise<void> {
    logger.info('[CORTEX] Suspending neural processing...');
    await this.processor.close();
  }
}

// Initializing Cortex Engine
const engine = new CortexEngine();

// Graceful sequence interrupts
const handleShutdown = async (signal: string) => {
  logger.warn(`\n[CORTEX] ${signal} intercept. Powering down...`);
  await engine.terminate();
  process.exit(0);
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

export default engine;
