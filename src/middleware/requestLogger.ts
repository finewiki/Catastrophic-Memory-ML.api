import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/index.js';

/**
 * Sensory Intercept Middleware
 * 
 * Intercepts incoming cognitive data streams (requests) and logs 
 * their metadata for telemetry and performance monitoring.
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const timestamp = Date.now();
  
  res.on('finish', () => {
    const propagationDelay = Date.now() - timestamp;
    
    logger.info('[SENSORY] Stream intercepted', {
      method: req.method,
      pattern: req.originalUrl,
      stability: res.statusCode,
      delayMs: propagationDelay,
      sequenceId: req.body?.sessionId,
      payloadSize: req.body?.text ? String(req.body.text).length : 0
    });
  });

  next();
};
