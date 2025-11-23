/**
 * Environment configuration and variables
 * Loads and validates environment variables with sensible defaults
 */

import { config } from 'dotenv';

// Load environment variables from .env file
config();

// Helper to parse boolean environment variables
function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

// Server configuration
export const PORT = Number(process.env.PORT) || 3001;
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';
export const IS_DEVELOPMENT = NODE_ENV === 'development';
export const AGENT_BASE_URL = process.env.AGENT_BASE_URL || 'http://localhost:8001';

// Debug flag (default off in production)
export const DEBUG = true; //(NODE_ENV !== 'production' && process.env.DEBUG !== 'false') || process.env.DEBUG === 'true';

// CORS configuration
export const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// Body size limit (in MB) - parse with validation
const bodyLimitInput = Number(process.env.BODY_LIMIT_MB);
export const BODY_LIMIT_MB = (bodyLimitInput > 0 && bodyLimitInput <= 100) ? bodyLimitInput : 30;

// Rate limiting
const rateLimitWindow = Number(process.env.RATE_LIMIT_WINDOW_MS);
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX);
export const RATE_LIMIT_WINDOW_MS = rateLimitWindow > 0 ? rateLimitWindow : 60_000; // 1 minute
export const RATE_LIMIT_MAX = rateLimitMax > 0 ? rateLimitMax : 120; // requests per window per IP

// Request timeouts (with validation)
const requestTimeout = Number(process.env.REQUEST_TIMEOUT_MS);
const headersTimeout = Number(process.env.HEADERS_TIMEOUT_MS);
export const REQUEST_TIMEOUT_MS = requestTimeout > 0 ? requestTimeout : 30_000; // 30 seconds
export const HEADERS_TIMEOUT_MS = headersTimeout > 0 ? headersTimeout : 65_000; // Node default

// Trust proxy (for rate-limit + IPs behind proxies)
export const TRUST_PROXY = parseBoolean(process.env.TRUST_PROXY, false);

// Validation: Log warnings for misconfigured values
if (IS_DEVELOPMENT && DEBUG) {
  if (bodyLimitInput > 100) {
    console.warn(`BODY_LIMIT_MB (${bodyLimitInput}) exceeds maximum (100), using 25 MB`);
  }
  if (HEADERS_TIMEOUT_MS <= REQUEST_TIMEOUT_MS) {
    console.warn(`HEADERS_TIMEOUT_MS (${HEADERS_TIMEOUT_MS}) should be > REQUEST_TIMEOUT_MS (${REQUEST_TIMEOUT_MS})`);
  }
}
