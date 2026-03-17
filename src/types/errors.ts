/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         COGNITIVE NEXUS — ANOMALY CLASSIFICATION MATRIX      ║
 * ║  Defines the structure and hierarchy of synaptic collapse    ║
 * ║  events that propagate through the neural sensory array.     ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

/**
 * AnomalyManifest — The structured description of a synaptic collapse event.
 * 
 * All anomalies within the Cognitive Nexus must conform to this manifest
 * to ensure consistent propagation through the error handling pathways.
 */
export interface AnomalyManifest {
  /** Machine-readable anomaly code (e.g., 'INSUFFICIENT_RESONANCE') */
  code: string;
  /** Human-readable description of the collapse event */
  message: string;
  /** Optional extended diagnostics payload */
  details?: Record<string, unknown>;
  /** HTTP status code for the transmission response */
  status?: number;
}

/**
 * NeuralCollapseError — A structured runtime anomaly originating within the
 * Cognitive Nexus sensory array.
 *
 * Unlike generic `Error` objects, a `NeuralCollapseError` always carries:
 * - A machine-parseable `code` for downstream handling
 * - A `status` code for direct HTTP emission
 * - An optional `details` payload for diagnostic inspection
 */
export class NeuralCollapseError extends Error {
  /** Machine-readable anomaly classification */
  public readonly code: string;
  /** HTTP status code */
  public readonly status: number;
  /** Extended diagnostic payload */
  public readonly details?: Record<string, unknown>;
  /** ISO timestamp of when the anomaly was instantiated */
  public readonly timestamp: string;

  constructor({ code, message, status = 400, details }: AnomalyManifest) {
    super(message);
    this.name = 'NeuralCollapseError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.timestamp = new Date().toISOString();

    // Maintains proper prototype chain in transpiled environments
    Object.setPrototypeOf(this, NeuralCollapseError.prototype);
  }

  /**
   * Factory method to wrap an unknown caught value into a NeuralCollapseError.
   * 
   * Useful in `catch (anomaly)` blocks where the type is unknown.
   */
  static fromAnomaly(anomaly: unknown, fallbackCode = 'UNKNOWN_COLLAPSE'): NeuralCollapseError {
    if (anomaly instanceof NeuralCollapseError) return anomaly;

    const message =
      anomaly instanceof Error
        ? anomaly.message
        : typeof anomaly === 'string'
        ? anomaly
        : 'An unclassified synaptic collapse occurred.';

    return new NeuralCollapseError({ code: fallbackCode, message, status: 500 });
  }

  /** Returns a structured log-safe representation of this anomaly */
  toManifest(): AnomalyManifest {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      details: this.details
    };
  }
}

// ─── Backward Compatibility Alias ─────────────────────────────────────────────

/** @deprecated Use `AnomalyManifest` */
export type ErrorPayload = AnomalyManifest;

/** @deprecated Use `NeuralCollapseError` */
export const ApiError = NeuralCollapseError;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ApiError = NeuralCollapseError;

