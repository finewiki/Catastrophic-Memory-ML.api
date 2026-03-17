/**
 * ╔══════════════════════════════════════════════════════╗
 *  NEXUS ENVIRONMENT MANIFEST
 *  Single source of truth for all runtime configuration.
 *  Parsed & validated once at startup — fail-fast on error.
 * ╚══════════════════════════════════════════════════════╝
 */

import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
//  Schema Definition
// ─────────────────────────────────────────────────────────────────────────────

const envSchema = z.object({
  // ── Core ────────────────────────────────────────────────────────────────
  PORT:      z.coerce.number().default(4000),
  NODE_ENV:  z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // ── Database ─────────────────────────────────────────────────────────────
  SUPABASE_URL:             z.string().min(1, 'SUPABASE_URL is required'),
  /** Warn if a DB query exceeds this threshold (milliseconds). */
  SLOW_QUERY_THRESHOLD_MS:  z.coerce.number().default(1500),

  // ── Rate Limiting ─────────────────────────────────────────────────────────
  RATE_LIMIT_WINDOW_MS:    z.coerce.number().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(60),
  CORS_ORIGIN:             z.string().default('*'),

  // ── Embeddings ────────────────────────────────────────────────────────────
  ENABLE_EMBEDDINGS:  z.string().optional(),
  EMBEDDING_PROVIDER: z.enum(['openai', 'ollama']).default('openai'),
  OPENAI_API_KEY:     z.string().optional(),
  OLLAMA_URL:         z.string().url().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL:       z.string().default('nomic-embed-text'),

  // ── Redis — Traditional ────────────────────────────────────────────────────
  REDIS_HOST:     z.string().optional(),
  REDIS_PORT:     z.coerce.number().optional(),
  REDIS_PASSWORD: z.string().optional(),

  // ── Redis — Upstash REST API ───────────────────────────────────────────────
  UPSTASH_REDIS_REST_URL:   z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // ── LLM / Graph Extraction ────────────────────────────────────────────────
  LLM_PROVIDER: z.enum(['openai']).default('openai'),
  LLM_MODEL:    z.string().default('gpt-4o-mini'),

  // ── Cost Guard ────────────────────────────────────────────────────────────
  COST_PER_1K_TOKENS: z.coerce.number().default(0.0001),
  PROFIT_MARGIN:      z.coerce.number().default(1.5),

  // ── Scoring Weights (new keys; legacy SCORING_* also accepted) ────────────
  WEIGHT_SIMILARITY:         z.coerce.number().optional(),
  WEIGHT_RECENCY:            z.coerce.number().optional(),
  WEIGHT_IMPORTANCE:         z.coerce.number().optional(),
  SCORING_WEIGHT_SIMILARITY: z.coerce.number().optional(),
  SCORING_WEIGHT_RECENCY:    z.coerce.number().optional(),
  SCORING_WEIGHT_IMPORTANCE: z.coerce.number().optional(),

  MIN_SIMILARITY_SCORE: z.coerce.number().default(0.5),
  MAX_TEXT_LENGTH:      z.coerce.number().default(4000),
  ADMIN_API_KEY:        z.string().optional(),

  // ── Pruning ───────────────────────────────────────────────────────────────
  PRUNE_MAX_AGE_DAYS:          z.coerce.number().default(90),
  PRUNE_INACTIVE_DAYS:         z.coerce.number().default(30),
  PRUNE_IMPORTANCE_THRESHOLD:  z.coerce.number().default(0.3),

  // ── Consolidation Queue ───────────────────────────────────────────────────
  CONSOLIDATION_CONCURRENCY:     z.coerce.number().default(2),
  CONSOLIDATION_LOCK_DURATION_S: z.coerce.number().default(300),

  // ── Observability ─────────────────────────────────────────────────────────
  SENTRY_DSN: z.string().url().optional(),

  // ── Feature Flags ─────────────────────────────────────────────────────────
  FEATURE_GRAPH_RAG:    z.string().optional(),
  FEATURE_ASYNC_MEMORY: z.string().optional(),
  FEATURE_COST_GUARD:   z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
//  Parse & Fail-Fast
// ─────────────────────────────────────────────────────────────────────────────

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.format();
  throw new Error(
    `[NEXUS] ⚠  Invalid environment manifest:\n${JSON.stringify(formatted, null, 2)}`
  );
}

const raw = parsed.data;

// ─────────────────────────────────────────────────────────────────────────────
//  Weight Resolution & Validation
// ─────────────────────────────────────────────────────────────────────────────

const weights = {
  similarity: raw.WEIGHT_SIMILARITY ?? raw.SCORING_WEIGHT_SIMILARITY ?? 0.5,
  recency:    raw.WEIGHT_RECENCY    ?? raw.SCORING_WEIGHT_RECENCY    ?? 0.2,
  importance: raw.WEIGHT_IMPORTANCE ?? raw.SCORING_WEIGHT_IMPORTANCE ?? 0.3,
};

const weightSum = +(weights.similarity + weights.recency + weights.importance).toFixed(4);

if (Math.abs(weightSum - 1) > 0.0001) {
  // Non-fatal: warn loudly but let the server boot — weights will be auto-normalised below.
  const scale = 1 / weightSum;
  weights.similarity = +(weights.similarity * scale).toFixed(4);
  weights.recency    = +(weights.recency    * scale).toFixed(4);
  weights.importance = +(weights.importance * scale).toFixed(4);
  // eslint-disable-next-line no-console
  console.warn(
    `[NEXUS] ⚠  Scoring weights did not sum to 1 (got ${weightSum}). ` +
    `Auto-normalised → similarity=${weights.similarity}, recency=${weights.recency}, importance=${weights.importance}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Exported Config Object
// ─────────────────────────────────────────────────────────────────────────────

const flag = (value?: string) => value?.toLowerCase() === 'true';

export const env = {
  // ── Core ──────────────────────────────────────────────────────────────────
  port:        raw.PORT,
  databaseUrl: raw.SUPABASE_URL,
  nodeEnv:     raw.NODE_ENV,
  logLevel:    raw.LOG_LEVEL,
  isProduction:  raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',
  isTest:        raw.NODE_ENV === 'test',

  // ── Database ──────────────────────────────────────────────────────────────
  slowQueryThresholdMs: raw.SLOW_QUERY_THRESHOLD_MS,

  // ── Rate Limiting ─────────────────────────────────────────────────────────
  rateLimitWindowMs:    raw.RATE_LIMIT_WINDOW_MS,
  rateLimitMaxRequests: raw.RATE_LIMIT_MAX_REQUESTS,
  corsOrigin:           raw.CORS_ORIGIN,

  // ── Embeddings ────────────────────────────────────────────────────────────
  embeddingsEnabled: flag(raw.ENABLE_EMBEDDINGS),
  embeddingProvider: raw.EMBEDDING_PROVIDER,
  openAiApiKey:      raw.OPENAI_API_KEY,
  ollamaUrl:         raw.OLLAMA_URL,
  ollamaModel:       raw.OLLAMA_MODEL,

  // ── Redis ─────────────────────────────────────────────────────────────────
  redisHost:             raw.REDIS_HOST,
  redisPort:             raw.REDIS_PORT,
  redisPassword:         raw.REDIS_PASSWORD,
  upstashRedisRestUrl:   raw.UPSTASH_REDIS_REST_URL,
  upstashRedisRestToken: raw.UPSTASH_REDIS_REST_TOKEN,

  // ── LLM ───────────────────────────────────────────────────────────────────
  llmProvider: raw.LLM_PROVIDER,
  llmModel:    raw.LLM_MODEL,

  // ── Cost Guard ────────────────────────────────────────────────────────────
  costPer1kTokens: raw.COST_PER_1K_TOKENS,
  profitMargin:    raw.PROFIT_MARGIN,

  // ── Scoring ───────────────────────────────────────────────────────────────
  scoringWeights:     weights,
  minSimilarityScore: raw.MIN_SIMILARITY_SCORE,
  maxTextLength:      raw.MAX_TEXT_LENGTH,

  // ── Admin ─────────────────────────────────────────────────────────────────
  adminApiKey: raw.ADMIN_API_KEY,

  // ── Pruning ───────────────────────────────────────────────────────────────
  prune: {
    maxAgeDays:          raw.PRUNE_MAX_AGE_DAYS,
    inactiveDays:        raw.PRUNE_INACTIVE_DAYS,
    importanceThreshold: raw.PRUNE_IMPORTANCE_THRESHOLD,
  },

  // ── Consolidation ─────────────────────────────────────────────────────────
  consolidation: {
    concurrency:     raw.CONSOLIDATION_CONCURRENCY,
    lockDurationSec: raw.CONSOLIDATION_LOCK_DURATION_S,
  },

  // ── Observability ─────────────────────────────────────────────────────────
  sentryDsn: raw.SENTRY_DSN,

  // ── Feature Flags ─────────────────────────────────────────────────────────
  features: {
    /** Enable Graph RAG (multi-hop semantic reasoning) */
    graphRag:    flag(raw.FEATURE_GRAPH_RAG)    ?? true,
    /** Enable async memory ingestion via the Synaptic Stream queue */
    asyncMemory: flag(raw.FEATURE_ASYNC_MEMORY) ?? true,
    /** Enable per-request cost tracking via HybridCostGuard */
    costGuard:   flag(raw.FEATURE_COST_GUARD)   ?? true,
  },
} as const;

// Export the raw schema type for consumers that need to inspect the shape.
export type EnvConfig = typeof env;
