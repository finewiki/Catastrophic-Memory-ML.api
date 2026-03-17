/**
 * ╔══════════════════════════════════════════════════════╗
 *  NEXUS NEURAL LOGGER
 *
 *  • Development  → colourised, human-readable console output
 *  • Production   → structured JSON (log aggregator-friendly)
 *  • Supports scoped `child()` loggers for module-level prefixes
 *  • `time()` / `timeEnd()` pair for lightweight inline profiling
 * ╚══════════════════════════════════════════════════════╝
 */

import { env } from './env.js';

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogMeta extends Record<string, unknown> {}

export interface Logger {
  error(message: string, meta?: LogMeta): void;
  warn (message: string, meta?: LogMeta): void;
  info (message: string, meta?: LogMeta): void;
  debug(message: string, meta?: LogMeta): void;
  /** Create a child logger that automatically prepends `[scope]` to every message. */
  child(scope: string): Logger;
  /** Start a named timer. Returns a `done()` function that logs elapsed ms. */
  time(label: string): () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Level ordering
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn:  1,
  info:  2,
  debug: 3,
};

// ─────────────────────────────────────────────────────────────────────────────
//  ANSI colour helpers (dev only)
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
  blue:   '\x1b[34m',
  grey:   '\x1b[90m',
} as const;

const LEVEL_COLOUR: Record<LogLevel, string> = {
  error: C.red    + C.bold,
  warn:  C.yellow + C.bold,
  info:  C.cyan,
  debug: C.grey,
};

const LEVEL_LABEL: Record<LogLevel, string> = {
  error: 'ERR',
  warn:  'WRN',
  info:  'INF',
  debug: 'DBG',
};

// ─────────────────────────────────────────────────────────────────────────────
//  Core log function
// ─────────────────────────────────────────────────────────────────────────────

const minLevel: LogLevel = (env.logLevel ?? (env.isProduction ? 'info' : 'debug')) as LogLevel;

function emit(
  level:   LogLevel,
  message: string,
  meta:    LogMeta | undefined,
  scope:   string | undefined,
): void {
  if (LEVEL_ORDER[level] > LEVEL_ORDER[minLevel]) return;

  const ts        = new Date().toISOString();
  const scopeTag  = scope ? `[${scope}] ` : '';

  if (env.isProduction) {
    // ── Structured JSON ──────────────────────────────────────────────────
    const payload: Record<string, unknown> = {
      level,
      ts,
      msg: scopeTag + message,
      ...meta,
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload));
  } else {
    // ── Colourised dev output ────────────────────────────────────────────
    const colour   = LEVEL_COLOUR[level];
    const label    = `${colour}${LEVEL_LABEL[level]}${C.reset}`;
    const time     = `${C.dim}${ts.slice(11, 23)}${C.reset}`; // HH:MM:SS.mmm
    const scopePart = scope ? `${C.blue}[${scope}]${C.reset} ` : '';
    const msg      = `${colour}${message}${C.reset}`;
    const metaPart = meta && Object.keys(meta).length
      ? `\n  ${C.dim}${JSON.stringify(meta)}${C.reset}`
      : '';
    // eslint-disable-next-line no-console
    console.log(`${time} ${label} ${scopePart}${msg}${metaPart}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Logger factory
// ─────────────────────────────────────────────────────────────────────────────

function createLogger(scope?: string): Logger {
  return {
    error: (message, meta) => emit('error', message, meta, scope),
    warn:  (message, meta) => emit('warn',  message, meta, scope),
    info:  (message, meta) => emit('info',  message, meta, scope),
    debug: (message, meta) => emit('debug', message, meta, scope),

    child(childScope: string): Logger {
      const combined = scope ? `${scope}:${childScope}` : childScope;
      return createLogger(combined);
    },

    time(label: string): () => void {
      const t0 = Date.now();
      return () => {
        const elapsed = Date.now() - t0;
        emit('debug', `⏱  ${label} — ${elapsed}ms`, undefined, scope);
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Singleton root logger — drop-in replacement for the original
// ─────────────────────────────────────────────────────────────────────────────

export const logger: Logger = createLogger();
