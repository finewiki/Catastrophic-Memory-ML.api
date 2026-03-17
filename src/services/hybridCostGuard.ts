import { redis } from '../config/redis.js';
import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { UserContext, AccessCheckResult, OveragePolicy } from '../types/billing.js';
import { ApiError } from '../types/errors.js';
import Stripe from 'stripe';

// Initialize Stripe Nexus
const stripe = new Stripe(env.stripeSecretKey || '', {
  apiVersion: '2025-12-15.clover',
  typescript: true,
});

/**
 * Bandwidth Regulator: Unified Resource Control
 * 
 * Enforces the "Golden Law of Ingestion":
 * - Spectral Links (RapidAPI): Bypass synaptic credit check, block background neural synthesis.
 * - Direct Synapses: Verify credits, allow tier-specific overages.
 */
export class BandwidthRegulator {
  private static readonly REDIS_RESONANCE_KEY = (entityId: string) => `entity:${entityId}:resonance`;
  private static readonly REDIS_LOCK_KEY = (entityId: string) => `entity:${entityId}:lock`;
  
  // Cognitive Unit (CU) Pricing - TOKEN-BASED SYNERGY
  private static readonly LOGISTICS = {
    UNIT_COST_PER_SIGNAL: 0.3, // $0.003 in cents
    AMATEUR_INCLUDED_CU: 100_000, 
    ARCHITECT_INCLUDED_CU: 1_000_000 
  };

  private static readonly REGULATORY_POLICIES: Record<string, OveragePolicy> = {
    PRO: {
      enabled: true,
      maxNegativeBalance: -100000, // -$1000.00 (unlimited with billing)
      triggerInvoice: true
    },
    HOBBY: {
      enabled: false,
      maxNegativeBalance: 0, // Hard limit at $0
      triggerInvoice: false
    },
    FREE: {
      enabled: false,
      maxNegativeBalance: 0,
      triggerInvoice: false
    }
  };

  /**
   * Verify Synaptic Bandwidth
   * 
   * Verifies if an entity has sufficient credit resonance to perform 
   * a cognitive operation.
   * 
   * @param entityId - Entity ID (formerly userId)
   * @param context - User context with source, tier, and balance
   * @param estimatedLoad - Estimated cost in cents (formerly estimatedCost)
   * @returns Access check result with permissions
   */
  static async verifyBandwidth(
    entityId: string,
    context: UserContext,
    estimatedLoad: number
  ): Promise<AccessCheckResult> {
    
    // SPECTRAL LINK: Bypass check, restricted features
    if (context.source === 'RAPIDAPI') {
      logger.info('[BANDWIDTH] Spectral link intercepted: Bypassing resonance check.', {
        entityId,
        tier: context.tier,
        estimatedLoad
      });

      return {
        allowed: true,
        allowBackgroundJobs: false, // CRITICAL: Block expensive features
        estimatedCost: estimatedLoad,
        reason: 'SPECTRAL_LINK_EXTERNAL_BILLING'
      };
    }

    // DIRECT SYNAPSE: Enforce local resonance policy
    const currentResonance = await this.peakAvailableResonance(entityId);
    const policy = this.REGULATORY_POLICIES[context.tier] || this.REGULATORY_POLICIES.FREE;

    const projectedResonance = currentResonance - estimatedLoad;

    if (projectedResonance < policy.maxNegativeBalance) {
      const deficiency = Math.abs(projectedResonance - policy.maxNegativeBalance);
      
      logger.warn('[BANDWIDTH] Insufficient spectral resonance.', {
        entityId,
        tier: context.tier,
        currentResonance,
        estimatedLoad,
        projectedResonance,
        deficiency
      });

      if (policy.triggerInvoice && context.tier === 'PRO') {
        await this.triggerStripeBilling(entityId, deficiency);
      }

      throw new ApiError({
        code: 'INSUFFICIENT_RESONANCE',
        status: 402,
        message: `Insufficient cognitive resonance. Required escalation: $${(deficiency / 100).toFixed(2)}.`,
        details: {
          currentResonance,
          estimatedLoad,
          deficiency,
          tier: context.tier
        }
      });
    }

    logger.info('[BANDWIDTH] Access granted: Resonance stable.', {
      entityId,
      tier: context.tier,
      resonance: currentResonance,
      estimatedLoad,
      projectedResonance
    });

    return {
      allowed: true,
      allowBackgroundJobs: true, // Direct users can use all features
      estimatedCost: estimatedLoad,
      reason: 'RESONANCE_VERIFIED'
    };
  }

  /**
   * Drain Synaptic Credits
   * 
   * Deducts cognitive units from the entity's resonance pool.
   * 
   * @param entityId - Entity ID
   * @param context - User context
   * @param actualLoad - Actual cost in cents (formerly actualCost)
   */
  static async drainCredits(
    entityId: string,
    context: UserContext,
    actualLoad: number
  ): Promise<void> {
    if (context.source === 'RAPIDAPI') {
      logger.debug('[BANDWIDTH] Spectral link: Skipping local drainage.', { entityId, actualLoad });
      return;
    }

    const resonanceKey = this.REDIS_RESONANCE_KEY(entityId);
    
    try {
      const newResonance = await redis.incrby(resonanceKey, -actualLoad);
      
      logger.info('[BANDWIDTH] Resonance drained.', {
        entityId,
        load: actualLoad,
        newResonance,
        tier: context.tier
      });

      // Background sync to persistent matrix
      this.syncResonanceToMatrix(entityId, newResonance).catch(anomaly => {
        logger.error('[BANDWIDTH] Failed to sync resonance to matrix.', { entityId, anomaly: anomaly.message });
      });

      const policy = this.REGULATORY_POLICIES[context.tier] || this.REGULATORY_POLICIES.FREE;
      if (newResonance < policy.maxNegativeBalance && policy.triggerInvoice) {
        await this.triggerStripeBilling(entityId, Math.abs(newResonance));
      }
    } catch (anomaly) {
      logger.error('[BANDWIDTH] Failed to drain resonance pool.', {
        entityId,
        load: actualLoad,
        anomaly: anomaly instanceof Error ? anomaly.message : String(anomaly)
      });
      throw new ApiError({
        code: 'REGULATORY_FAILURE',
        status: 500,
        message: 'Synaptic drainage failed.'
      });
    }
  }

  /**
   * Peak Available Resonance
   * 
   * Retrieves the current cognitive resonance (balance) for an entity from the cache,
   * with a fallback to the persistent matrix if not found.
   * 
   * @param entityId - Entity ID
   * @returns Current resonance in cents
   */
  static async peakAvailableResonance(entityId: string): Promise<number> {
    const resonanceKey = this.REDIS_RESONANCE_KEY(entityId);
    
    try {
      const resonance = await redis.get(resonanceKey);
      
      if (resonance === null) {
        logger.debug('[BANDWIDTH] Resonance absent in cache: Pulling from persistent matrix.', { entityId });
        return await this.loadResonanceFromMatrix(entityId);
      }
      
      return parseInt(resonance, 10);
    } catch (anomaly) {
      logger.error('[BANDWIDTH] Cache parity failure. Falling back to persistent matrix.', {
        entityId,
        anomaly: anomaly instanceof Error ? anomaly.message : String(anomaly)
      });
      return await this.loadResonanceFromMatrix(entityId);
    }
  }

  /**
   * Inject Resonance Credits
   * 
   * Adds cognitive units to an entity's resonance pool.
   * 
   * @param entityId - Entity ID
   * @param quantumAmount - Amount to add in cents (formerly amount)
   * @returns New resonance balance
   */
  static async addCredits(entityId: string, quantumAmount: number): Promise<number> {
    const resonanceKey = this.REDIS_RESONANCE_KEY(entityId);
    
    try {
      const newResonance = await redis.incrby(resonanceKey, quantumAmount);
      logger.info('[BANDWIDTH] Resonance injected.', { entityId, amount: quantumAmount, newResonance });
      await this.syncResonanceToMatrix(entityId, newResonance);
      return newResonance;
    } catch (anomaly) {
      logger.error('[BANDWIDTH] Credits injection failure.', {
        entityId,
        amount: quantumAmount,
        anomaly: anomaly instanceof Error ? anomaly.message : String(anomaly)
      });
      throw new ApiError({
        code: 'INJECTION_FAILURE',
        status: 500,
        message: 'Resonance injection failed.'
      });
    }
  }

  /**
   * Load Resonance from Persistent Matrix
   * 
   * Initializes or retrieves an entity's resonance from the database.
   * 
   * @param entityId - Entity ID
   * @returns Current resonance
   */
  private static async loadResonanceFromMatrix(entityId: string): Promise<number> {
    const record = await prisma.userBilling.findUnique({
      where: { userId: entityId },
      select: { creditsBalance: true }
    });

    // If no billing record, assume 0 balance
    if (!record) {
      logger.warn('[BANDWIDTH] Entity billing record not found in matrix.', { entityId });
      return 0;
    }

    const balance = record.creditsBalance;
    
    // Store in Redis for future queries
    await redis.set(this.REDIS_RESONANCE_KEY(entityId), balance.toString());
    
    return balance;
  }

  /**
   * Sync Resonance to Persistent Matrix
   * 
   * Asynchronously updates the entity's resonance in the database.
   * 
   * @param entityId - Entity ID
   * @param balance - Current resonance in cents
   */
  private static async syncResonanceToMatrix(entityId: string, balance: number): Promise<void> {
    try {
      await prisma.userBilling.update({
        where: { userId: entityId },
        data: { creditsBalance: balance }
      });
    } catch (anomaly) {
      logger.error('[BANDWIDTH] Parity synchronization anomaly: Failed to sync resonance to matrix.', {
        entityId,
        balance,
        anomaly: anomaly instanceof Error ? anomaly.message : String(anomaly)
      });
    }
  }

  /**
   * Trigger Stripe Billing
   * 
   * Initiates an external billing event via Stripe for overage.
   * 
   * @param entityId - Entity ID
   * @param amount - Amount to invoice in cents
   */
  private static async triggerStripeBilling(entityId: string, amount: number): Promise<void> {
    logger.info('[BANDWIDTH] Triggering external billing for overage.', { entityId, amount });
    
    try {
      const entity = await prisma.user.findUnique({
        where: { id: entityId },
        include: { billing: true }
      });

      if (!entity) {
        logger.error('[BANDWIDTH] Entity not found for external billing.', { entityId });
        return;
      }

      let customerId = entity.billing?.stripeCustomerId;

      if (!customerId) {
        logger.info('[BANDWIDTH] Creating Stripe customer for entity.', { entityId, email: entity.email });
        
        const customer = await stripe.customers.create({
          email: entity.email || undefined,
          name: entity.email || `Entity ${entityId}`,
          metadata: { entityId },
          description: 'Cognitive Nexus Entity'
        });

        customerId = customer.id;

        await prisma.userBilling.update({
          where: { userId: entityId },
          data: { stripeCustomerId: customerId }
        });

        logger.info('[BANDWIDTH] Stripe customer created.', { entityId, customerId });
      }

      // Calculate number of API calls from amount (at $0.003 per call)
      const apiCalls = Math.round(amount / BandwidthRegulator.LOGISTICS.UNIT_COST_PER_SIGNAL);

      await stripe.invoiceItems.create({
        customer: customerId,
        amount: Math.round(amount), // Ensure integer cents
        currency: 'usd',
        description: `Synaptic Overage - ${apiCalls.toLocaleString()} Cognitive Units @ $0.003/unit (beyond 1M included) - ${new Date().toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })}`,
        metadata: {
          entityId,
          type: 'overage',
          apiCalls: apiCalls.toString(),
          pricePerCall: '0.003',
          timestamp: new Date().toISOString()
        }
      });

      const invoice = await stripe.invoices.create({
        customer: customerId,
        auto_advance: true, // Automatically finalize and attempt payment
        collection_method: 'charge_automatically',
        description: 'Synaptic Resonance Overage'
      });

      await stripe.invoices.finalizeInvoice(invoice.id);
      logger.info('[BANDWIDTH] External billing finalized.', { 
        entityId, 
        invoice: invoice.id,
        amount,
        status: invoice.status,
        hostedInvoiceUrl: invoice.hosted_invoice_url
      });
      
    } catch (anomaly) {
      logger.error('[BANDWIDTH] External billing failure.', {
        entityId,
        amount,
        anomaly: anomaly instanceof Error ? anomaly.message : String(anomaly),
        stack: anomaly instanceof Error ? anomaly.stack : undefined
      });
      // Don't throw - we don't want to block the operation if invoicing fails
      // Just log the error and continue
    }
  }

  /**
   * Calculate Estimated Cognitive Load
   * 
   * Calculates the estimated cost for a cognitive operation.
   * Currently, this is a fixed rate per signal.
   * 
   * @param signalStrength - Estimated signal strength (formerly tokenCount)
   * @param hasEmbedding - Whether operation includes embedding generation
   * @param hasDeepReasoning - Whether operation includes deep reasoning (formerly hasGraphExtraction)
   * @returns Estimated cost in cents
   */
  static calculateEstimatedCost(
    signalStrength: number, // Formerly tokenCount
    hasEmbedding: boolean = false,
    hasDeepReasoning: boolean = false // Formerly hasGraphExtraction
  ): number {
    // NEW PRICING MODEL: Fixed $0.003 per API call
    // Ignore signal strength and just return per-call cost
    return this.LOGISTICS.UNIT_COST_PER_SIGNAL;
    
    // OLD TOKEN-BASED PRICING (commented out):
    // Base cost: $0.50 per 1M tokens (GPT-4o-mini pricing)
    // let cost = (signalStrength / 1_000_000) * 50;
    // 
    // // Embedding cost: ~$0.02 per 1M tokens (text-embedding-3-small)
    // if (hasEmbedding) {
    //   cost += (signalStrength / 1_000_000) * 2;
    // }
    // 
    // // Graph extraction cost: ~3x base cost (structured output)
    // if (hasDeepReasoning) {
    //   cost *= 3;
    // }
    // 
    // // Add 30% profit margin
    // cost *= 1.3;
    // 
    // return Math.ceil(cost); // Round up to nearest cent
  }
}
