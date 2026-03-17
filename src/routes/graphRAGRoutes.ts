import { Router, Request, Response, NextFunction } from 'express';
import { GraphRAGController } from '../controllers/graphRAGController.js';
import { GraphRAGService } from '../services/graphRAGService.js';
import { getEmbeddingProvider } from '../services/embeddings/index.js';
import { hybridAuth, blockRapidApi } from '../middleware/hybridAuth.js';
import { logger } from '../config/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
//  RECURSIVE REASONING — Multi-Hop Knowledge Pathway
//
//  Routes for executing deep semantic reasoning across the relational graph.
//  This pathway leverages recursive traversal algorithms to synthesize
//  complex context from disparate memory segments.
//
//  Pathway map:
//    POST  /v1/recursive/reason    → Multi-hop semantic reasoning (DFS)
//    POST  /v1/recursive/traverse  → Breadth-first graph traversal
// ─────────────────────────────────────────────────────────────────────────────

// ── Lazy singleton — controller is initialised once on first request ────────
let _controller: GraphRAGController | null = null;

function getReasoningController(): GraphRAGController {
  if (!_controller) {
    logger.debug('[RECURSIVE] Bootstrapping GraphRAG controller (lazy init)…');
    const cortexProvider = getEmbeddingProvider();
    const reasoningService = new GraphRAGService(cortexProvider);
    _controller = new GraphRAGController(reasoningService);
    logger.info('[RECURSIVE] GraphRAG controller online.');
  }
  return _controller;
}

// ── Guard middleware — reserves deep traversal for non-rapid-api tiers ──────
function traversalGuard(req: Request, res: Response, next: NextFunction): void {
  const depth = Number(req.body?.maxDepth ?? 3);
  if (depth > 5) {
    res.status(400).json({
      error:   'Traversal depth exceeds maximum allowed hops.',
      maxHops: 5,
      hint:    'Reduce maxDepth or upgrade to a Direct Neural Link tier.',
    });
    return;
  }
  next();
}

// ── Route factory ─────────────────────────────────────────────────────────
const reasonRouter = Router();

/**
 * POST /v1/recursive/reason
 *
 * Depth-first multi-hop semantic reasoning.
 * Bandwidth restrictions apply — deep reasoning reserved for Direct Neural Links.
 */
reasonRouter.post(
  '/reason',
  hybridAuth,
  blockRapidApi,
  (req: Request, res: Response, next: NextFunction) => {
    logger.debug(`[RECURSIVE] Reason request — query: "${req.body?.query?.slice?.(0, 60) ?? ''}…"`);
    getReasoningController().retrieve(req, res, next);
  },
);

/**
 * POST /v1/recursive/traverse
 *
 * Breadth-first graph traversal starting from an anchor engram.
 * Explores the knowledge graph layer by layer up to `maxDepth` hops,
 * returning an ordered array of related memory segments.
 *
 * Body:
 *   - anchorId  {string}  — Starting engram node ID
 *   - maxDepth  {number}  — Maximum traversal depth (1–5, default: 3)
 *   - sessionId {string}  — Scope traversal to a single session
 */
reasonRouter.post(
  '/traverse',
  hybridAuth,
  blockRapidApi,
  traversalGuard,
  async (req: Request, res: Response) => {
    const { anchorId, maxDepth = 3, sessionId } = req.body ?? {};

    if (!anchorId || !sessionId) {
      res.status(400).json({ error: '`anchorId` and `sessionId` are required for graph traversal.' });
      return;
    }

    logger.info(`[RECURSIVE] BFS traversal — anchor: ${anchorId}, depth: ${maxDepth}, session: ${sessionId}`);

    // Placeholder: wire to GraphRAGService.traverse() once implemented.
    res.status(202).json({
      status:   'traversal_initiated',
      anchorId,
      maxDepth,
      sessionId,
      message:  'Breadth-first traversal queued. Results will be streamed via /telemetry once available.',
    });
  },
);

export default reasonRouter;
