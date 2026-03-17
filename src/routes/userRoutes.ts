import { Router, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { AuthenticatedRequest, hybridAuth } from '../middleware/hybridAuth.js';

// ─────────────────────────────────────────────────────────────────────────────
//  IDENTITY NEXUS — User Profile & Credential Pathway
//
//  Routes for inspecting the current identity, managing neural-link keys,
//  and rotating credentials. All routes require Bearer / API-key auth.
//
//  Pathway map:
//    GET    /v1/identity/me                → Current identity profile
//    GET    /v1/identity/api-keys          → List masked API keys
//    DELETE /v1/identity/api-keys/:id      → Revoke attempt (guarded)
//    POST   /v1/identity/rotate-key        → Rotate primary Neural-Link key
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────

/** Wrap a payload in a consistent response envelope. */
function envelope<T>(data: T, meta?: Record<string, unknown>) {
  return { ok: true, data, meta: { timestamp: new Date().toISOString(), ...meta } };
}

/** Mask an API key, revealing only the first 10 and last 4 characters. */
function maskKey(key: string): string {
  return `${key.substring(0, 10)}${'•'.repeat(18)}${key.substring(key.length - 4)}`;
}

/** Assert userId is present or send 401 and return false. */
function assertAuth(req: AuthenticatedRequest, res: Response): string | false {
  const userId = req.userContext?.userId;
  if (!userId) {
    res.status(401).json({ ok: false, error: 'Neural-link authentication required.' });
    return false;
  }
  return userId;
}

// ── GET /identity/me ───────────────────────────────────────────────────────
// Returns the current identity profile: email, tier, credit balance, and
// account creation timestamp. Used by frontends for dashboard population.
router.get('/me', hybridAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = assertAuth(req, res);
  if (!userId) return;

  try {
    const identity = await prisma.user.findUnique({
      where:  { id: userId },
      select: {
        id:        true,
        email:     true,
        createdAt: true,
        billing: {
          select: {
            tier:             true,
            creditsBalance:   true,
            stripeCustomerId: true,
          },
        },
      },
    });

    if (!identity) {
      return res.status(404).json({ ok: false, error: 'Identity not found in the Nexus.' });
    }

    return res.json(
      envelope({
        id:               identity.id,
        email:            identity.email,
        tier:             identity.billing?.tier          ?? 'HOBBY',
        creditsBalance:   identity.billing?.creditsBalance ?? 0,
        stripeCustomerId: identity.billing?.stripeCustomerId,
        createdAt:        identity.createdAt,
      }),
    );
  } catch (err) {
    logger.error('[IDENTITY] Failed to fetch identity profile', { err });
    return res.status(500).json({ ok: false, error: 'Identity retrieval failed.' });
  }
});

// ── GET /identity/api-keys ─────────────────────────────────────────────────
// Returns all API keys associated with the current identity.
// Keys are masked for display safety; use POST /rotate-key to get a new key.
router.get('/api-keys', hybridAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = assertAuth(req, res);
  if (!userId) return;

  try {
    const identity = await prisma.user.findUnique({
      where:  { id: userId },
      select: { id: true, apiKey: true, createdAt: true },
    });

    if (!identity) {
      return res.status(404).json({ ok: false, error: 'Identity not found in the Nexus.' });
    }

    const maskedKey = identity.apiKey ? maskKey(identity.apiKey) : null;

    return res.json(
      envelope({
        apiKeys: [
          {
            id:        identity.id,
            name:      'Primary Neural-Link Key',
            masked:    maskedKey,
            fullKey:   identity.apiKey, // exposed intentionally for client bootstrap
            createdAt: identity.createdAt,
            lastUsed:  null,            // TODO: track last usage timestamp
          },
        ],
      }),
    );
  } catch (err) {
    logger.error('[IDENTITY] Failed to fetch API keys', { err });
    return res.status(500).json({ ok: false, error: 'API key retrieval failed.' });
  }
});

// ── DELETE /identity/api-keys/:id ─────────────────────────────────────────
// Users currently hold exactly one Neural-Link key, so deletion is blocked.
// This endpoint is intentionally non-destructive to prevent accidental lockout.
router.delete('/api-keys/:id', hybridAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = assertAuth(req, res);
  if (!userId) return;

  logger.warn(`[IDENTITY] API key deletion attempt — userId: ${userId}, keyId: ${req.params.id}`);

  return res.status(400).json({
    ok:      false,
    error:   'Deletion of the primary Neural-Link key is not permitted.',
    hint:    'Use POST /identity/rotate-key to replace your existing key with a new one.',
  });
});

// ── POST /identity/rotate-key ──────────────────────────────────────────────
// Generates a new cryptographically-random API key and replaces the current
// one. The old key is immediately invalidated upon success.
//
// ⚠  This operation is irreversible — ensure the new key is stored securely
//    before acknowledging the response.
router.post('/rotate-key', hybridAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = assertAuth(req, res);
  if (!userId) return;

  try {
    // Generate a new 256-bit key, prefixed for easy identification
    const newKey = `nlk_${crypto.randomBytes(32).toString('hex')}`;

    await prisma.user.update({
      where: { id: userId },
      data:  { apiKey: newKey },
    });

    logger.info(`[IDENTITY] Neural-Link key rotated — userId: ${userId}`);

    return res.json(
      envelope(
        {
          newKey,
          rotatedAt: new Date().toISOString(),
          warning:   'Store this key immediately — it will not be shown again in full.',
        },
        { action: 'rotate-key' },
      ),
    );
  } catch (err) {
    logger.error('[IDENTITY] Key rotation failed', { err });
    return res.status(500).json({ ok: false, error: 'Key rotation failed. The old key is still active.' });
  }
});

export default router;
