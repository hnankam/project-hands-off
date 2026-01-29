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
export const PYDANTIC_SERVICE_URL = process.env.PYDANTIC_SERVICE_URL || 'http://localhost:8001';

// Debug flag (default off in production, on in development)
export const DEBUG = (NODE_ENV !== 'production' && process.env.DEBUG !== 'false') || process.env.DEBUG === 'true';

// CORS configuration
export const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// Body size limit (in MB) - parse with validation
const bodyLimitInput = Number(process.env.BODY_LIMIT_MB);
export const BODY_LIMIT_MB = (bodyLimitInput > 0 && bodyLimitInput <= 100) ? bodyLimitInput : 30;

// Request timeouts (with validation)
const requestTimeout = Number(process.env.REQUEST_TIMEOUT_MS);
const headersTimeout = Number(process.env.HEADERS_TIMEOUT_MS);
// Increased timeout for long-running agent executions (5 minutes)
// Agent runs with tool calls, code execution, etc. can take several minutes
export const REQUEST_TIMEOUT_MS = requestTimeout > 0 ? requestTimeout : 300_000; // 5 minutes (was 30s)
export const HEADERS_TIMEOUT_MS = headersTimeout > 0 ? headersTimeout : 310_000; // 5 min + 10s buffer (was 65s)

// Trust proxy (for IPs behind proxies)
export const TRUST_PROXY = parseBoolean(process.env.TRUST_PROXY, false);

// Agent Runner configuration
// transformErrors: false = filter out error runs (default), true = transform RUN_ERROR to RUN_FINISHED (shows failed runs in history)
export const AGENT_RUNNER_TRANSFORM_ERRORS = parseBoolean(process.env.AGENT_RUNNER_TRANSFORM_ERRORS, false);

// Thread cleanup configuration
// disableCleanup: true = disable automatic thread cleanup (default), false = enable cleanup
export const AGENT_RUNNER_DISABLE_CLEANUP = parseBoolean(process.env.AGENT_RUNNER_DISABLE_CLEANUP, true);

// Thread TTL in milliseconds (default: 24 hours = 86400000ms)
// Only used if cleanup is enabled
const threadTTLInput = Number(process.env.AGENT_RUNNER_THREAD_TTL);
export const AGENT_RUNNER_THREAD_TTL = threadTTLInput > 0 ? threadTTLInput : 86400000; // 24 hours

// Cleanup interval in milliseconds (default: 1 hour = 3600000ms)
// Only used if cleanup is enabled
const cleanupIntervalInput = Number(process.env.AGENT_RUNNER_CLEANUP_INTERVAL);
export const AGENT_RUNNER_CLEANUP_INTERVAL = cleanupIntervalInput > 0 ? cleanupIntervalInput : 3600000; // 1 hour

// Validation: Log warnings for misconfigured values
if (IS_DEVELOPMENT && DEBUG) {
  if (bodyLimitInput > 100) {
    console.warn(`BODY_LIMIT_MB (${bodyLimitInput}) exceeds maximum (100), using 25 MB`);
  }
  if (HEADERS_TIMEOUT_MS <= REQUEST_TIMEOUT_MS) {
    console.warn(`HEADERS_TIMEOUT_MS (${HEADERS_TIMEOUT_MS}) should be > REQUEST_TIMEOUT_MS (${REQUEST_TIMEOUT_MS})`);
  }
}
