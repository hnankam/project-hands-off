/**
 * Utilities Module - Barrel Export
 * 
 * Provides a centralized export point for all utility functions.
 * This barrel export simplifies imports throughout the codebase.
 * 
 * Available Utilities:
 * - logger.js: Structured logging with timestamps and request correlation
 * - route-helpers.js: Shared utilities for route handlers (auth, validation, HTTP)
 * 
 * @module utils
 * 
 * @example
 * // Import all utilities
 * import { log, logError, sanitizeJSON, ensureAuthenticated } from '../utils/index.js';
 * 
 * @example
 * // Import specific utilities
 * import { log } from '../utils/logger.js';
 * import { sanitizeJSON } from '../utils/route-helpers.js';
 */

export * from './logger.js';
export * from './route-helpers.js';

