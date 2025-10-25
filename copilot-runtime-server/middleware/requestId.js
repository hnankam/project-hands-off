/**
 * Request ID middleware
 */

/**
 * Generate a unique request ID for correlation
 */
export function generateRequestId() {
  return `rt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Middleware to attach request ID to response locals
 */
export function requestIdMiddleware(req, res, next) {
  res.locals.reqId = generateRequestId();
  next();
}

