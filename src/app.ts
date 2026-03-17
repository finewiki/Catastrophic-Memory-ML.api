import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env, logger } from './config/index.js';
import { requestLogger } from './middleware/requestLogger.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';

// Neural Pathway Imports (Routes)
import { memoryRoutes } from './routes/memoryRoutes.js';
import { healthRoutes } from './routes/healthRoutes.js';
import { adminRoutes } from './routes/adminRoutes.js';
import asyncMemoryRoutes from './routes/asyncMemoryRoutes.js';
import graphRAGRoutes from './routes/graphRAGRoutes.js';
import userRoutes from './routes/userRoutes.js';

// Cognitive Processor Imports (Controllers)
import { MemoryController } from './controllers/memoryController.js';
import { HealthController } from './controllers/healthController.js';
import { AdminController } from './controllers/adminController.js';
import { EmbeddingProvider } from './services/embeddings/EmbeddingProvider.js';

export interface NexusDependencies {
  embeddingProvider: EmbeddingProvider;
}

/**
 * Forge Sensory Array
 * 
 * This function constructs the Express instance, configuring the 
 * middleware 'senses' and mounting the neural pathways that handle 
 * incoming cognitive data streams.
 */
export const forgeSensoryArray = ({ embeddingProvider }: NexusDependencies): Express => {
  const sensoryApp = express();

  // Shield the nexus with standard security protocols
  sensoryApp.use(helmet());
  
  // Configure the Neural Filter (CORS)
  sensoryApp.use(
    cors({
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        // Standard bypass for mobile/curls or internal loops
        if (!origin) return callback(null, true);

        const allowedClusters = [
          'localhost',
          '127.0.0.1',
          '.vercel.app',
          '.netlify.app'
        ];

        const isAuthorized = allowedClusters.some(cluster => origin.includes(cluster));

        if (isAuthorized || env.nodeEnv === 'development') {
          return callback(null, true);
        }

        callback(new Error('[NEXUS] Origin intercept: Neural pathway rejected by filter.'));
      },
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    })
  );
  
  // Data ingest configuration
  sensoryApp.use(express.json({ limit: '2mb' }));
  sensoryApp.use(requestLogger);
  sensoryApp.use(rateLimiter);

  // Initialize Neural Processors (Controllers)
  // These will handle the logic once the sensory input is received.
  const synapticController = new MemoryController(null as any); 
  const diagnosticController = new HealthController(embeddingProvider);
  const coreAdminController = new AdminController(null as any);

  // Health check: The basic pulse of the Nexus
  sensoryApp.get('/pulse', diagnosticController.health);

  const mainRouter = express.Router();

  /**
   * Neural Pathway Mapping
   * Linking URI patterns to their respective cognitive processors.
   */
  mainRouter.use('/synapse', memoryRoutes(synapticController)); // Standard memory ops
  mainRouter.use('/stream', asyncMemoryRoutes);                // Background processing
  mainRouter.use('/recursive', graphRAGRoutes);               // Graph retrieval
  mainRouter.use('/core', adminRoutes(coreAdminController));  // System admin
  mainRouter.use('/identity', userRoutes);                    // User profiles/keys
  mainRouter.use(healthRoutes(diagnosticController));

  // Mount the main matrix
  sensoryApp.use('/v1', mainRouter);

  // Catch-all Cerebral Hemorrhage Handler (Errors)
  sensoryApp.use(errorHandler);

  logger.info('[SENSORY] Neural pathways mapped successfully.');

  return sensoryApp;
};
