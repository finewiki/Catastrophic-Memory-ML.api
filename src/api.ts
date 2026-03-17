import { createServer, Server } from 'http';
import { forgeSensoryArray } from './app.js';
import { env, logger, prisma } from './config/index.js';
import { getEmbeddingProvider } from './services/embeddings/index.js';
import { CronScheduler } from './config/cron.js';

/**
 * The Nexus: Central Nervous System
 * 
 * This module boots the primary cognitive loop, linking the HTTP sensory inputs
 * with the vector embeddings and relational graph algorithms. 
 */
export class CognitiveNexus {
  private server: Server | null = null;
  private isCollapsing = false;

  public async awaken(): Promise<void> {
    try {
      this.printAsciiBanner();
      logger.info('[NEXUS] Synchronizing neural pathways...');

      // Establish connection to the cortex (embeddings)
      const cortexProvider = getEmbeddingProvider();

      // Boot up the main sensory receiver (Express API)
      const syntheticSenses = forgeSensoryArray({ embeddingProvider: cortexProvider });
      this.server = createServer(syntheticSenses);

      // Begin autonomic background processes (Circadian rhythms / cleanup)
      CronScheduler.init();
      logger.info('[NEXUS] Autonomic subsystems online (Circadian Cycles active).');

      // Open the sensory port
      this.server.listen(env.port, () => {
        logger.info(`[NEXUS] Cognitive Matrix is fully conscious and listening at port ${env.port}`);
      });

      this.armDefensiveProtocols();

    } catch (anomaly: unknown) {
      const errorMessage = anomaly instanceof Error ? anomaly.message : 'Unknown temporal anomaly';
      logger.error(`[FATAL ERROR] Catastrophic failure during awakening sequence: ${errorMessage}`);
      process.exit(1); 
    }
  }

  private armDefensiveProtocols(): void {
    const collapseSequence = async (signal: string) => {
      if (this.isCollapsing) return;
      this.isCollapsing = true;
      
      logger.warn(`\n[NEXUS] Received ${signal} intercept. Initiating controlled neural collapse...`);
      
      // Halt background cycles gracefully
      CronScheduler.stop();
      logger.info('[NEXUS] Autonomic routines suspended.');

      // Disconnect the database synapses
      await prisma.$disconnect();
      logger.info('[NEXUS] Synaptic database connections severed.');
      
      if (this.server) {
        this.server.close(() => {
          logger.info('[NEXUS] Sensory ports closed. Goodnight.');
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    };

    process.on('SIGINT', () => collapseSequence('SIGINT'));
    process.on('SIGTERM', () => collapseSequence('SIGTERM'));
    process.on('uncaughtException', (err: any) => {
      logger.error(`[NEXUS] Uncaught cerebral hemorrhage: ${err.message}`);
      collapseSequence('EXCEPTION');
    });
  }

  private printAsciiBanner(): void {
    const banner = `
     ____  __.              .__       _____          
    |    |/ _|____    _____ |__|____/ ____\\___.__. 
    |      < \\__  \\  /     \\|  \\__  \\   __<   |  | 
    |    |  \\ / __ \\|  Y Y  \\  |/ __ \\|  |  \\___  | 
    |____|__ (____  /__|_|  /__(____  /__|  / ____| 
            \\/    \\/      \\/        \\/      \\/      
          --- COGNITIVE NEXUS INITIATED ---
    `;
    console.log(banner);
  }
}

// Spark life into the engine
const nexus = new CognitiveNexus();
nexus.awaken();
