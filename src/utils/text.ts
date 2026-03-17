/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║       COGNITIVE NEXUS — NEURAL SIGNAL PROCESSOR                 ║
 * ║  Utilities for normalizing, compressing, and evaluating the      ║
 * ║  semantic weight of raw cognitive signals before embedding.      ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { CognitivePriority } from '../types/memory.js';
import { env } from '../config/index.js';

// ─── Primitive Helpers ────────────────────────────────────────────────────────

/** Clamps a numeric value within [min, max]. */
const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

// ─── Signal Normalization ─────────────────────────────────────────────────────

/**
 * normalizeSignal — Removes excess whitespace and trims the raw input.
 * 
 * Applied as the first step in all signal processing pipelines to ensure
 * clean input before embedding or importance evaluation.
 * 
 * @param rawSignal - The raw text string
 * @returns Normalized, whitespace-collapsed string
 */
export const normalizeSignal = (rawSignal: string): string =>
  rawSignal.trim().replace(/\s+/g, ' ');

/** @deprecated Use `normalizeSignal` */
export const normalizeText = normalizeSignal;

// ─── Signal Compression ────────────────────────────────────────────────────────

/**
 * compressSignal — Reduces a signal to a bounded length by extracting
 * its leading and trailing context, connected by an ellipsis bridge.
 * 
 * Used for storing `compressedText` in the synaptic matrix without
 * exceeding storage budgets.
 * 
 * @param signal  - The raw or normalized text signal
 * @param maxLen  - Maximum character length (default: 220)
 * @returns Compressed signal text
 */
export const compressSignal = (signal: string, maxLen = 220): string => {
  if (signal.length <= maxLen) return signal;
  const half = Math.floor(maxLen / 2);
  return `${signal.slice(0, half).trim()} … ${signal.slice(-half).trim()}`;
};

/** @deprecated Use `compressSignal` */
export const compressText = compressSignal;

// ─── Signal Bandwidth Enforcement ─────────────────────────────────────────────

/**
 * enforceSignalBandwidth — Hard-truncates the signal to the configured
 * maximum input length defined by `env.maxTextLength`.
 * 
 * Prevents overload of the embedding pipeline by ensuring no single
 * signal exceeds the neural ingestion bandwidth.
 * 
 * @param signal - Raw or normalized text signal
 * @returns Truncated text if over limit, otherwise unchanged
 */
export const enforceSignalBandwidth = (signal: string): string =>
  signal.length <= env.maxTextLength ? signal : signal.slice(0, env.maxTextLength);

/** @deprecated Use `enforceSignalBandwidth` */
export const truncateIfNeeded = enforceSignalBandwidth;

// ─── Priority Mapping ─────────────────────────────────────────────────────────

/**
 * Maps a `CognitivePriority` hint to a numeric bias score.
 * 
 * The bias is blended with heuristic signals to produce the final importance weight.
 * - `high`   → 0.9 — Strong retention signal
 * - `medium` → 0.6 — Moderate retention signal
 * - `low`    → 0.3 — Background noise
 * - `none`   → 0.5 — Neutral, let heuristics decide
 */
const priorityBias = (hint?: CognitivePriority): number => {
  switch (hint) {
    case 'high':   return 0.9;
    case 'medium': return 0.6;
    case 'low':    return 0.3;
    default:       return 0.5;
  }
};

// ─── Importance Scoring ───────────────────────────────────────────────────────

/**
 * SignalWeightFactors — Describes the heuristic breakdown of an importance score.
 * 
 * Returned by `computeSignalWeight` for debugging and introspection.
 */
export interface SignalWeightFactors {
  /** Final composite importance score [0.0–1.0] */
  importanceScore: number;
  /** Whether the signal contains numeric data */
  hasQuantitativeData: boolean;
  /** Whether the signal contains monetary references */
  hasMonetarySignal: boolean;
  /** Whether the signal contains temporal markers (dates/days) */
  hasTemporalMarker: boolean;
  /** Whether the signal contains decision/action language */
  hasActionLanguage: boolean;
  /** Whether the signal contains known entities (brands, products, names) */
  hasRecognizedEntities: boolean;
  /** Length-based contribution factor [0.0–1.0] */
  lengthFactor: number;
}

/**
 * computeSignalWeight — Estimates the cognitive importance of a neural input
 * signal using multi-factor heuristic analysis.
 * 
 * Factors analyzed:
 * - **Length**     — Longer signals tend to carry more structured information
 * - **Numerics**   — Numbers suggest specifics, facts, measurements
 * - **Monetary**   — Currency markers signal high-value decisions
 * - **Temporal**   — Dates and relative time markers suggest planning context
 * - **Action**     — Decision verbs signal important semantic intent
 * - **Entities**   — Named people, brands, products carry semantic weight
 * - **Priority hint** — Direct user-provided priority override
 * 
 * @param signal - The normalized text signal
 * @param priorityHint - Optional user-supplied priority bias
 * @returns Full `SignalWeightFactors` including the final importance score
 */
export const computeSignalWeight = (
  signal: string,
  priorityHint?: CognitivePriority
): SignalWeightFactors => {
  const normalized = normalizeSignal(signal);

  // Length-based factor: signal breadth indicates informational density
  const lengthFactor = clamp(normalized.length / Math.min(env.maxTextLength, 800));

  // Quantitative data: numbers suggest facts and precision
  const hasQuantitativeData = /\d{2,}/.test(normalized);

  // Monetary signals: currency markers indicate decision-relevant data
  const hasMonetarySignal = /(\$|€|£|¥|kr|sek|usd|eur)\s?\d+/i.test(normalized);

  // Temporal markers: dates and relative time indicate planning context
  const hasTemporalMarker =
    /(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|yesterday|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(
      normalized
    );

  // Action language: decision verbs indicate intent and high-stakes operations
  const hasActionLanguage =
    /(bought|purchased|decided|planned|scheduled|deadline|deliver|ordered|signed|contract|agreed|confirmed|rejected|approved)/i.test(
      normalized
    );

  // Recognized entities: known brands, tech names, proper-noun pairs
  const hasRecognizedEntities =
    /(iphone|samsung|pixel|macbook|tesla|gpt|chatgpt|azure|aws|google|microsoft|apple|openai|anthropic|nvidia)/i.test(
      normalized
    ) || /([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)/.test(signal);

  // Compose the heuristic base score from all factors
  const heuristicBase =
    0.2 +
    lengthFactor             * 0.22 +
    (hasQuantitativeData ? 0.08 : 0) +
    (hasMonetarySignal   ? 0.10 : 0) +
    (hasTemporalMarker   ? 0.08 : 0) +
    (hasActionLanguage   ? 0.15 : 0) +
    (hasRecognizedEntities ? 0.12 : 0);

  // Blend heuristic with the priority bias using geometric mean
  const importanceScore = clamp((heuristicBase + priorityBias(priorityHint)) / 2);

  return {
    importanceScore,
    hasQuantitativeData,
    hasMonetarySignal,
    hasTemporalMarker,
    hasActionLanguage,
    hasRecognizedEntities,
    lengthFactor
  };
};

/** @deprecated Use `computeSignalWeight(text, hint).importanceScore` */
export const computeImportanceScore = (
  text: string,
  hint?: CognitivePriority
): number => computeSignalWeight(text, hint).importanceScore;

// ─── Semantic Fingerprint ──────────────────────────────────────────────────────

/**
 * extractSemanticFingerprint — Extracts a compact list of candidate
 * high-signal tokens from the input for lightweight indexing or tagging.
 * 
 * Targets: capitalized proper-noun sequences, numeric values with units,
 * and currency amounts — the most semantically dense parts of any signal.
 * 
 * @param signal - Input text
 * @returns Array of extracted high-signal fragments
 */
export const extractSemanticFingerprint = (signal: string): string[] => {
  const matches: string[] = [];

  // Proper noun sequences (Person names, product names)
  const properNouns = signal.match(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+\b/g) || [];
  matches.push(...properNouns);

  // Numeric values with optional unit suffixes
  const numerics = signal.match(/\b\d[\d,]*(?:\.\d+)?(?:\s?(?:USD|EUR|GBP|k|M|B|ms|mb|gb))?\b/gi) || [];
  matches.push(...numerics);

  // Deduplicate and filter short noise tokens
  return [...new Set(matches)].filter(m => m.length > 2);
};

// ─── Token Budget Estimator ────────────────────────────────────────────────────

/**
 * estimateTokenCount — Approximates the number of LLM tokens in a signal
 * using the standard 4-chars-per-token heuristic.
 * 
 * Useful for pre-flight bandwidth estimation before embedding API calls.
 * 
 * @param signal - Input text
 * @returns Estimated token count
 */
export const estimateTokenCount = (signal: string): number =>
  Math.ceil(signal.length / 4);

