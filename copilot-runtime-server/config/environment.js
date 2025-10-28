/**
 * Environment configuration and variables
 */

import { config } from 'dotenv';

// Load environment variables from .env file
config();

// Server configuration
export const PORT = Number(process.env.PORT || 3001);
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const AGENT_BASE_URL = process.env.AGENT_BASE_URL || 'http://localhost:8001';

// Debug flag (default off in production)
export const DEBUG = (NODE_ENV !== 'production' && process.env.DEBUG !== 'false') || process.env.DEBUG === 'true';

// CORS configuration
export const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// Body size limit (in MB)
export const BODY_LIMIT_MB = Number(process.env.BODY_LIMIT_MB || 25);

// Rate limiting
export const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000); // 1 minute
export const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 120); // requests per window per IP

// Request timeouts
export const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 30_000);
export const HEADERS_TIMEOUT_MS = Number(process.env.HEADERS_TIMEOUT_MS || 65_000); // Node default

// Trust proxy (for rate-limit + IPs behind proxies)
export const TRUST_PROXY = (process.env.TRUST_PROXY || 'false') === 'true';

// ============================================================================
// Note: API keys and provider credentials are now stored in the database
// and loaded via config/loader.js from the 'providers' table.
// 
// The following legacy environment variables are no longer used:
// - GOOGLE_API_KEY (now in providers.credentials.api_key for 'google')
// - AZURE_OPENAI_API_KEY (now in providers.credentials.api_key for 'azure_openai')
// - AWS_ACCESS_KEY_ID (now in providers.credentials.aws_access_key_id for 'anthropic_bedrock')
// - AWS_SECRET_ACCESS_KEY (now in providers.credentials.aws_secret_access_key for 'anthropic_bedrock')
// - AWS_REGION (now in providers.credentials.aws_region for 'anthropic_bedrock')
// ============================================================================