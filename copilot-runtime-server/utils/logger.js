/**
 * Logging Utilities
 * 
 * Provides structured logging functions with timestamps and request correlation.
 * Respects DEBUG environment variable for development logging.
 * 
 * Features:
 * - Automatic ISO 8601 timestamps
 * - Request ID correlation for tracing
 * - Log level support (debug, info, warn, error)
 * - Conditional debug logging (respects DEBUG flag)
 * - Stack trace logging in debug mode
 * - Structured error logging
 * 
 * @module utils/logger
 */

import { DEBUG } from '../config/index.js';

// ============================================================================
// Timestamp Helper
// ============================================================================

/**
 * Generates ISO 8601 timestamp for log entries
 * @returns {string} Formatted timestamp [YYYY-MM-DDTHH:mm:ss.sssZ]
 * @private
 */
const ts = () => `[${new Date().toISOString()}]`;

// ============================================================================
// Basic Log Functions
// ============================================================================

/**
 * Debug log (only in DEBUG mode)
 * Use for development and troubleshooting information
 * 
 * @param {...any} args - Arguments to log
 * @example
 * log('Processing request', { userId: '123', action: 'create' });
 */
export const log = (...args) => DEBUG && console.log(ts(), ...args);

/**
 * Warning log (always shown)
 * Use for recoverable issues or deprecation warnings
 * 
 * @param {...any} args - Arguments to log
 * @example
 * warn('API key not found, using fallback configuration');
 */
export const warn = (...args) => console.warn(ts(), ...args);

/**
 * Error log (always shown)
 * Use for errors and exceptions
 * 
 * @param {...any} args - Arguments to log
 * @example
 * error('Database connection failed:', err);
 */
export const error = (...args) => console.error(ts(), ...args);

/**
 * Info log (always shown)
 * Use for important runtime information
 * 
 * @param {...any} args - Arguments to log
 * @example
 * info('Server started on port 3001');
 */
export const info = (...args) => console.log(ts(), ...args);

// ============================================================================
// Request-Correlated Logging
// ============================================================================

/**
 * Logs a message with request ID for correlation (debug mode only)
 * Useful for tracing requests through the system
 * 
 * @param {string} reqId - Request ID (e.g., 'rt_1700000000000_abc123')
 * @param {string} message - Log message
 * @param {Object} [details={}] - Optional details object (will be JSON stringified)
 * 
 * @example
 * logRequest('rt_123_abc', 'User authenticated', { userId: '456', role: 'admin' });
 * // Output: [2025-11-23T10:30:00.000Z] [rt_123_abc] User authenticated
 * // Output: [2025-11-23T10:30:00.000Z] [rt_123_abc] Details: { "userId": "456", "role": "admin" }
 */
export function logRequest(reqId, message, details = {}) {
  if (!DEBUG) return;
  
  console.log(ts(), `[${reqId}]`, message);
  
  if (details && typeof details === 'object' && Object.keys(details).length > 0) {
    console.log(ts(), `[${reqId}]`, 'Details:', JSON.stringify(details, null, 2));
  }
}

/**
 * Logs an error with request ID for correlation (always shown)
 * Includes error message and stack trace in debug mode
 * 
 * @param {string} reqId - Request ID (e.g., 'rt_1700000000000_abc123')
 * @param {string} message - Context message describing what failed
 * @param {Error|Object|string} [err] - Error object, error-like object, or error string
 * 
 * @example
 * try {
 *   await riskyOperation();
 * } catch (err) {
 *   logError('rt_123_abc', 'Failed to process request', err);
 * }
 * 
 * // Output: [2025-11-23T10:30:00.000Z] [rt_123_abc] ERROR: Failed to process request
 * // Output: [2025-11-23T10:30:00.000Z] [rt_123_abc] Message: Connection timeout
 * // Output (if DEBUG): [2025-11-23T10:30:00.000Z] [rt_123_abc] Stack: Error: Connection timeout\n    at ...
 */
export function logError(reqId, message, err) {
  console.error(ts(), `[${reqId}]`, 'ERROR:', message);
  
  if (err) {
    // Handle different error formats
    const errorMessage = err?.message || (typeof err === 'string' ? err : String(err));
    console.error(ts(), `[${reqId}]`, 'Message:', errorMessage);
    
    // Log stack trace in debug mode
    if (DEBUG && err?.stack) {
      console.error(ts(), `[${reqId}]`, 'Stack:', err.stack);
    }
  }
}

