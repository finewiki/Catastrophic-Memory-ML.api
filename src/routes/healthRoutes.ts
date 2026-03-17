import { Router, Request, Response } from 'express';
import { HealthController } from '../controllers/healthController.js';

// ─────────────────────────────────────────────────────────────────────────────
//  PULSE DIAGNOSTICS — Neural Health Pathway
//
//  Endpoints for verifying the operational status, version metadata,
//  and synaptic health of the core Nexus matrix.
//
//  Pathway map:
//    GET  /v1/status        → Shallow liveness check (load-balancer friendly)
//    GET  /v1/status/deep   → Deep health probe (DB + embeddings reachability)
// ─────────────────────────────────────────────────────────────────────────────

/** Build metadata injected at startup so probes are allocation-free. */
const BUILD_METADATA = {
  version:     process.env.npm_package_version ?? '0.0.0',
  environment: process.env.NODE_ENV            ?? 'unknown',
  startedAt:   new Date().toISOString(),
} as const;

export const healthRoutes = (controller: HealthController) => {
  const diagnosticRouter = Router();

  // ── GET /status ─────────────────────────────────────────────────────────
  // Lightweight liveness probe — returns 200 instantly so the load-balancer
  // knows the process is alive without touching downstream systems.
  diagnosticRouter.get(
    '/status',
    (_req: Request, res: Response, next) => {
      // Attach build metadata to the response locals so the controller
      // can optionally include it without being tightly coupled.
      res.locals.buildMeta = BUILD_METADATA;
      next();
    },
    controller.health,
  );

  // ── GET /status/deep ────────────────────────────────────────────────────
  // Full-depth diagnostic probe. Verifies:
  //   • PostgreSQL reachability (via Prisma)
  //   • Embedding provider responsiveness
  //   • Process uptime & memory pressure
  //
  // NOTE: Do NOT use this as a load-balancer health check — it has latency.
  //       Intended for operator dashboards and alerting pipelines.
  diagnosticRouter.get(
    '/status/deep',
    async (_req: Request, res: Response) => {
      const mem = process.memoryUsage();

      // Delegate to HealthController's deep-check when it is available,
      // otherwise surface a structured fallback from this layer.
      const shallow = typeof (controller as any).deepHealth === 'function'
        ? await (controller as any).deepHealth()
        : null;

      res.json({
        probe:           'deep',
        ...BUILD_METADATA,
        uptimeSeconds:   Math.floor(process.uptime()),
        heapUsedMB:      +(mem.heapUsed  / 1_048_576).toFixed(2),
        heapTotalMB:     +(mem.heapTotal / 1_048_576).toFixed(2),
        rssMB:           +(mem.rss       / 1_048_576).toFixed(2),
        subsystems:      shallow ?? {
          database:   'unchecked',
          embeddings: 'unchecked',
        },
        timestamp: new Date().toISOString(),
      });
    },
  );

  return diagnosticRouter;
};
