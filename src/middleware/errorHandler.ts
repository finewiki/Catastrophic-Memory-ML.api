import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../types/errors.js';
import { env, logger } from '../config/index.js';

/**
 * Neural Collapse Handler
 * 
 * Catch-all middleware for handling cerebral hemorrhages (errors) within 
 * the sensory array. It sanitizes and formats the error state for 
 * external transmission.
 */
export const errorHandler = (
  anomaly: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) => {
  const isApiAnomaly = anomaly instanceof ApiError;
  const status = isApiAnomaly ? anomaly.status : 500;
  const synapticCode = isApiAnomaly ? anomaly.code : 'NEURAL_COLLAPSE';
  
  const disclosureProtocol = !env.isProduction || isApiAnomaly;

  const manifestation =
    disclosureProtocol
      ? anomaly.message || 'An unexpected synaptic rupture occurred.'
      : 'An unexpected synaptic rupture occurred.';

  logger.error('[NEXUS] Neural collapse detected', {
    pattern: req.path,
    transmission: req.method,
    stability: status,
    code: synapticCode,
    manifestation,
    reconstruction: disclosureProtocol ? anomaly.stack : undefined
  });

  res.status(status).json({
    anomaly: {
      code: synapticCode,
      manifestation,
      stabilizationDetails: isApiAnomaly ? anomaly.details || {} : {}
    }
  });
};

