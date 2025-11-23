/**
 * Global Error Handler Middleware
 * 
 * Catches all uncaught errors in the request pipeline and returns
 * a consistent JSON error response to the client.
 */

import { DEBUG } from '../config/index.js';
import { logError } from '../utils/logger.js';

/**
 * Express error handler middleware (must have 4 parameters)
 * 
 * Provides centralized error handling with:
 * - Consistent JSON error responses
 * - Request ID tracking for debugging
 * - Protection against headers already sent
 * - Graceful fallback if JSON serialization fails
 * 
 * @param {Error} err - The error object
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 */
export function errorHandlerMiddleware(err, req, res, next) {
  const reqId = res.locals?.reqId || 'unknown';
  
  // Log the error with context
  logError(reqId, '[Error Handler]', err);
  
  // If headers already sent, delegate to Express default handler
    if (res.headersSent) {
      return next(err);
    }
  
  // Determine status code
    const status = err?.status || err?.statusCode || 500;
  
  // Prepare error response
  const errorResponse = {
      error: {
        message: err?.message || 'Internal Server Error',
        code: err?.code || 'INTERNAL_ERROR',
        status,
        requestId: reqId,
      }
  };
  
  // Include stack trace in development
  if (DEBUG && err?.stack) {
    errorResponse.error.stack = err.stack;
  }
  
  // Send JSON error response
  try {
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.status(status).json(errorResponse);
  } catch (sendError) {
    // Fallback to Express default handler if JSON serialization fails
    console.error('[Error Handler] Failed to send error response:', sendError.message);
    next(err);
  }
}

