import { Request, Response, NextFunction } from 'express';
import { env } from '../config/index.js';
import { ApiError } from '../types/errors.js';

/**
 * Bandwidth Throttle Middleware
 * 
 * Regulates the flow of cognitive intent (requests) to prevent 
 * synaptic overload of the core matrix.
 */

type SynapticCounter = { count: number; windowStart: number };
const neuralBuckets = new Map<string, SynapticCounter>();

export const rateLimiter = (req: Request, _res: Response, next: NextFunction) => {
  const currentTime = Date.now();
  const windowThreshold = currentTime - env.rateLimitWindowMs;
  
  // Identify the source of the intent
  const identityKey = req.ip ?? req.socket.remoteAddress ?? 'unidentified_entity';
  const synapticEntry = neuralBuckets.get(identityKey) || { count: 0, windowStart: currentTime };

  // Reset bucket if the window has evolved
  if (synapticEntry.windowStart < windowThreshold) {
    synapticEntry.count = 0;
    synapticEntry.windowStart = currentTime;
  }

  synapticEntry.count += 1;
  neuralBuckets.set(identityKey, synapticEntry);

  // Enforce bandwidth restrictions
  if (synapticEntry.count > env.rateLimitMaxRequests) {
    next(
      new ApiError({
        code: 'SYNAPTIC_OVERLOAD',
        status: 429,
        message: 'Bandwidth threshold exceeded. Please throttle your cognitive intent.'
      })
    );
    return;
  }

  next();
};
