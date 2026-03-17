/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         COGNITIVE NEXUS — SYNAPTIC MEMORY SCHEMATICS         ║
 * ║  Type definitions for the commit, recall, and purge          ║
 * ║  operations within the long-term neural storage matrix.      ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

/**
 * CognitivePriority — Signals the relative importance of incoming data.
 * 
 * Influences how the Cortex Engine scores and weights the synaptic fragment.
 * - `low`    → Background noise, lower retention probability.
 * - `medium` → Standard signal, normal embedding lifecycle.
 * - `high`   → Critical data, elevated importance score, prioritized recall.
 */
export type CognitivePriority = 'low' | 'medium' | 'high';

/**
 * CommitSignalRequest — The data blueprint for committing a new cognitive
 * signal into the long-term synaptic matrix.
 */
export interface CommitSignalRequest {
  /** Session identity sequence */
  sessionId: string;
  /** Raw neural input to be embedded and stored */
  text: string;
  /** Optional contextual tags for filtering and augmentation */
  metadata?: Record<string, unknown>;
  /** Suggested priority for the Cortex scoring engine */
  priorityHint?: CognitivePriority;
}

/**
 * SynapticCommitReceipt — Confirmation returned after a successful commit.
 * 
 * Contains the permanent ID and scoring metadata for the stored fragment.
 */
export interface SynapticCommitReceipt {
  /** Permanent synaptic fragment ID */
  synapticId: string;
  /** Session identity that owns this fragment */
  sessionId: string;
  /** Computed importance score after Cortex evaluation [0.0–1.0] */
  importanceScore: number;
  /** ISO timestamp of ingestion */
  committedAt: string;
}

/**
 * RecallIntentRequest — The query structure for retrieving semantically
 * similar synaptic fragments from the neural matrix.
 */
export interface RecallIntentRequest {
  /** Session identity to scope the recall */
  sessionId: string;
  /** The semantic query signal */
  querySignal: string;
  /** Maximum number of fragments to retrieve (default varies by tier) */
  fragmentLimit?: number;
  /** Minimum semantic similarity threshold [0.0–1.0] */
  minResonance?: number;
  /** Maximum token budget for the returned context */
  maxTokenBudget?: number;
  /** Optional metadata filters */
  metadata?: Record<string, unknown>;
}

/**
 * SynapticFragment — A single recalled memory unit from the matrix.
 * 
 * Combines the raw text, its compressed form, semantic scores, and lifecycle metadata.
 */
export interface SynapticFragment {
  /** Permanent unique identifier */
  id: string;
  /** Original raw text of the committed signal */
  rawText: string;
  /** Compressed/summarized text representation */
  compressedText: string;
  /** Cortex-assigned importance weight [0.0–1.0] */
  importanceScore: number;
  /** Cosine similarity to the query signal [0.0–1.0] */
  semanticResonance: number;
  /** Composite relevance score (importance × resonance) */
  compositeScore?: number;
  /** ISO timestamp of initial commit */
  committedAt: string;
  /** ISO timestamp of last access */
  lastAccessedAt: string;
  /** Optional contextual metadata payload */
  metadata?: Record<string, unknown>;
  /** Flag indicating uncertain or low-confidence embedding */
  weakSignal?: boolean;
}

/**
 * RecallResponse — The full result set from a semantic recall operation.
 */
export interface RecallResponse {
  /** The session identity that was queried */
  sessionId: string;
  /** The original query signal */
  querySignal: string;
  /** Total token cost of the returned fragments */
  tokenFootprint: number;
  /** Ordered array of synaptic fragments by relevance */
  fragments: SynapticFragment[];
}

/**
 * PurgeRequest — The structure for clearing one or more synaptic fragments.
 */
export interface PurgeRequest {
  /** Session identity scope */
  sessionId: string;
  /** Specific fragment IDs to purge; if omitted, clears all session data */
  fragmentIds?: string[];
}

/**
 * SequenceSummary — Metadata overview of a cognitive session.
 */
export interface SequenceSummary {
  /** Session identifier */
  id: string;
  /** ISO timestamp of session creation */
  createdAt: string;
  /** ISO timestamp of last modification */
  updatedAt: string;
  /** Optional external linkage ID */
  externalId?: string | null;
  /** Total number of committed fragments in this session */
  fragmentCount: number;
  /** ISO timestamp of most recent fragment access */
  lastAccessedAt?: string | null;
}

// ─── Backward Compatibility Aliases ───────────────────────────────────────────

/** @deprecated Use `CognitivePriority` */
export type ImportanceHint = CognitivePriority;

/** @deprecated Use `CommitSignalRequest` */
export type StoreMemoryRequest = CommitSignalRequest;

/** @deprecated Use `SynapticCommitReceipt` */
export type StoreMemoryResponse = SynapticCommitReceipt;

/** @deprecated Use `RecallIntentRequest` */
export type RetrieveMemoryRequest = RecallIntentRequest;

/** @deprecated Use `SynapticFragment` */
export type MemoryResult = SynapticFragment;

/** @deprecated Use `RecallResponse` */
export type RetrieveMemoryResponse = RecallResponse;

/** @deprecated Use `PurgeRequest` */
export type ClearMemoryRequest = PurgeRequest;

/** @deprecated Use `SequenceSummary` */
export type SessionSummary = SequenceSummary;