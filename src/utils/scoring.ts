/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║       COGNITIVE NEXUS — SYNAPTIC RESONANCE ENGINE               ║
 * ║  Computes composite relevance scores for recalled memory        ║
 * ║  fragments using temporal decay, semantic similarity, and        ║
 * ║  importance weighting across the neural signal space.           ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { env } from '../config/index.js';

// ─── Core Primitives ─────────────────────────────────────────────────────────

/**
 * Clamps a value within a defined range [min, max].
 * Prevents out-of-bound resonance values from corrupting composite scores.
 */
const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

/**
 * Normalizes a raw signal through a sigmoid function centered at 0.5.
 * 
 * Produces smooth, bounded output for noisy input signals.
 * Useful for normalizing length-based or heuristic-based importance scores.
 * 
 * @param x - Raw input signal
 * @param gain - Controls the steepness of the sigmoid curve (default: 10)
 */
export const sigmoidNormalize = (x: number, gain = 10): number =>
  1 / (1 + Math.exp(-gain * (x - 0.5)));

// ─── Temporal Decay ────────────────────────────────────────────────────────────

/**
 * TemporalDecayConfig — Configuration for the half-life decay function.
 */
export interface TemporalDecayConfig {
  /** Age of the memory in milliseconds */
  ageMs: number;
  /** Half-life period in hours (default: 24h) */
  halfLifeHours?: number;
  /**
   * Optional boost factor for very recent signals [0.0–1.0 range added].
   * Applies a linear bonus to signals younger than 1 hour.
   */
  recencyBoost?: boolean;
}

/**
 * computeTemporalDecay — Computes a temporal resonance score using
 * exponential half-life decay.
 * 
 * Formula: `e^(-ln(2) × ageHours / halfLifeHours)`
 * 
 * Key behaviors:
 * - Fresh signals (age ≈ 0)  → score ≈ 1.0 (maximum resonance)
 * - After each half-life     → score halves
 * - After 10× half-life      → score ≈ 0.001 (near-silent)
 * 
 * @param config - Decay configuration
 * @returns Temporal resonance coefficient [0.0–1.0]
 */
export const computeTemporalDecay = ({
  ageMs,
  halfLifeHours = 24,
  recencyBoost = false
}: TemporalDecayConfig): number => {
  const hours = ageMs / (1000 * 60 * 60);
  const decay = Math.exp(-Math.log(2) * (hours / halfLifeHours));

  // Apply a subtle linear recency amplifier for sub-1-hour signals
  if (recencyBoost && hours < 1) {
    const boost = (1 - hours) * 0.05; // Up to +5% for brand-new signals
    return clamp(decay + boost);
  }

  return clamp(decay);
};

/** @deprecated Use `computeTemporalDecay` with `{ ageMs: recencyMs }` */
export const computeRecencyScore = (recencyMs: number, halfLifeHours = 24): number =>
  computeTemporalDecay({ ageMs: recencyMs, halfLifeHours });

// ─── Composite Resonance Scoring ─────────────────────────────────────────────

/**
 * ResonanceInput — The raw telemetry signals fed into the composite scorer.
 */
export interface ResonanceInput {
  /** Semantic similarity to the query signal [0.0–1.0] */
  semanticResonance?: number;
  /** Age of the memory in milliseconds */
  ageMs: number;
  /** Pre-computed importance score from the Cortex Engine [0.0–1.0] */
  importanceScore: number;
  /** Optional override for the temporal half-life period (hours) */
  halfLifeHours?: number;
}

/**
 * SynapticScoreBreakdown — A complete telemetry record of how the final
 * composite resonance score was computed.
 * 
 * Provides full transparency for debugging and tuning the weighting model.
 */
export interface SynapticScoreBreakdown {
  /** The final weighted composite resonance score [0.0–1.0] */
  compositeResonance: number;
  /** Semantic similarity component [0.0–1.0] */
  semanticComponent: number;
  /** Temporal decay component [0.0–1.0] */
  temporalComponent: number;
  /** Importance weight component [0.0–1.0] */
  importanceComponent: number;
  /** The weight vector applied: [similarity, recency, importance] */
  weightVector: [number, number, number];
}

/**
 * computeSynapticResonance — Computes a composite relevance score for a
 * synaptic memory fragment given semantic, temporal, and importance signals.
 * 
 * Uses a configurable weight vector from `env.scoringWeights` to balance
 * the three axes of relevance.
 * 
 * @param input - Raw resonance telemetry signals
 * @returns A full `SynapticScoreBreakdown` with the composite score and components
 */
export const computeSynapticResonance = ({
  semanticResonance = 0,
  ageMs,
  importanceScore,
  halfLifeHours = 24
}: ResonanceInput): SynapticScoreBreakdown => {
  const weights = env.scoringWeights;

  const semanticComponent = clamp(semanticResonance);
  const temporalComponent = computeTemporalDecay({ ageMs, halfLifeHours, recencyBoost: true });
  const importanceComponent = clamp(importanceScore);

  const compositeResonance =
    weights.similarity  * semanticComponent +
    weights.recency     * temporalComponent +
    weights.importance  * importanceComponent;

  return {
    compositeResonance: clamp(compositeResonance),
    semanticComponent,
    temporalComponent,
    importanceComponent,
    weightVector: [weights.similarity, weights.recency, weights.importance]
  };
};

/** @deprecated Use `computeSynapticResonance` */
export const computeFinalScore = ({
  similarity = 0,
  recencyMs,
  importanceScore
}: { similarity?: number; recencyMs: number; importanceScore: number }) => {
  const breakdown = computeSynapticResonance({
    semanticResonance: similarity,
    ageMs: recencyMs,
    importanceScore
  });
  return {
    finalScore: breakdown.compositeResonance,
    recencyScore: breakdown.temporalComponent,
    similarity: breakdown.semanticComponent
  };
};

/** @deprecated Use `ResonanceInput` */
export interface ScoringInput {
  similarity?: number;
  recencyMs: number;
  importanceScore: number;
}

