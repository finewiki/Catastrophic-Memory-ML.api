import { Request, Response, NextFunction } from 'express';
import { env } from '../config';
import { ApiError } from '../types/errors';

export const adminAuth = (req: Request, _res: Response, next: NextFunction) => {
  const providedKey = req.headers['x-api-key'] as string | undefined;
  if (!env.adminApiKey) {
    next(
      new ApiError({
        code: 'ADMIN_AUTH_NOT_CONFIGURED',
        status: 500,
        message: 'Admin API key not configured'
      })
    );
    return;
  }

  if (providedKey !== env.adminApiKey) {
    next(
      new ApiError({
        code: 'UNAUTHORIZED',
        status: 401,
        message: 'Invalid admin API key'
      })
    );
    return;
  }

  next();
};
