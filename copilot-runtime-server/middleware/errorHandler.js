/**
 * Global error handler middleware
 */

import { DEBUG } from '../config/index.js';
import { logError } from '../utils/logger.js';

/**
 * Global error handler for better debugging
 */
export function errorHandlerMiddleware(err, req, res, next) {
  const reqId = res.locals?.reqId;
  
  logError(reqId, 'Global Error Handler', err);
  
  // Ensure JSON response with explicit content-type so clients relying on it don't crash
  try {
    if (res.headersSent) {
      return next(err);
    }
    const status = err?.status || err?.statusCode || 500;
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.status(status).json({
      error: {
        message: err?.message || 'Internal Server Error',
        code: err?.code || 'INTERNAL_ERROR',
        status,
        requestId: reqId,
      }
    });
  } catch (e) {
    // Fallback to default handler if JSON send fails
    next(err);
  }
}

