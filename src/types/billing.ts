/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║            COGNITIVE NEXUS — RESONANCE TELEMETRY             ║
 * ║   Type definitions for entity context, bandwidth policy,     ║
 * ║   and overflow protocol management within the neural matrix. ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

/**
 * SynapticOrigin — Defines the origin channel of an entity's connection.
 * 
 * - `RAPIDAPI`  → Spectral Link  — Billing routed through the external lattice.
 * - `DIRECT`    → Neural Synapse — Billing routed through the internal resonance pool.
 */
export type SynapticOrigin = 'RAPIDAPI' | 'DIRECT';

/**
 * ResonanceTier — Determines the entity's access level and overflow policy.
 * 
 * - `FREE`   → Dormant Node     — No allocation, limited introspection.
 * - `HOBBY`  → Amateur Neuron   — 100k Cognitive Units/month, hard cap.
 * - `PRO`    → Architect Synapse — 1M Cognitive Units/month, overflow permitted.
 */
export type ResonanceTier = 'FREE' | 'HOBBY' | 'PRO';

/**
 * EntityContext — The full cognitive identity of an active entity.
 * 
 * Carries origin, tier, and resonance pool state for gating and billing decisions.
 */
export interface EntityContext {
  /** Unique entity identifier */
  entityId: string;
  /** Aliased for backward compatibility */
  userId: string;
  /** The channel through which this entity is connected */
  source: SynapticOrigin;
  /** The entity's processing tier */
  tier: ResonanceTier;
  /** Current resonance pool in cents (e.g., 1000 = $10.00) */
  resonancePool: number;
  /** Aliased for backward compatibility */
  balance?: number;
}

/**
 * BandwidthValidation — The result of a pre-operation resonance check.
 * 
 * Indicates whether the entity is permitted to execute a cognitive operation,
 * and whether cerebral background processing is available.
 */
export interface BandwidthValidation {
  /** Whether the operation is permitted */
  permitted: boolean;
  /** Aliased for backward compatibility */
  allowed?: boolean;
  /** Whether background Cortex Engine jobs are enabled */
  enableCerebralProcessing: boolean;
  /** Aliased for backward compatibility */
  allowBackgroundJobs?: boolean;
  /** Human-readable reason for the decision */
  rationale?: string;
  /** Aliased for backward compatibility */
  reason?: string;
  /** Projected cognitive load for this operation */
  projectedLoad: number;
  /** Aliased for backward compatibility */
  estimatedCost?: number;
}

/**
 * OverflowProtocol — Governs what happens when an entity's resonance pool
 * is depleted and the operation would push the balance negative.
 */
export interface OverflowProtocol {
  /** Whether overflow is allowed at all */
  enabled: boolean;
  /** The floor of the resonance pool (negative = debt allowed) */
  maxOverflowLimit: number;
  /** Aliased for backward compatibility */
  maxNegativeBalance?: number;
  /** Whether to automatically trigger external escalation (Stripe invoice) */
  activateAutoEscalation: boolean;
  /** Aliased for backward compatibility */
  triggerInvoice?: boolean;
}

// ─── Backward Compatibility Aliases ───────────────────────────────────────────

/** @deprecated Use `SynapticOrigin` */
export type UserSource = SynapticOrigin;

/** @deprecated Use `ResonanceTier` */
export type UserTier = ResonanceTier;

/** @deprecated Use `EntityContext` */
export type UserContext = EntityContext;

/** @deprecated Use `BandwidthValidation` */
export type AccessCheckResult = BandwidthValidation;

/** @deprecated Use `OverflowProtocol` */
export type OveragePolicy = OverflowProtocol;

