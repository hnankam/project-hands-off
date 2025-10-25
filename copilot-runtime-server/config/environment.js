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

// API Keys
export const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
export const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
export const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
export const AZURE_OPENAI_BASE_URL = process.env.AZURE_OPENAI_BASE_URL;
export const AZURE_OPENAI_API_VERSION = process.env.AZURE_OPENAI_API_VERSION;
export const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;
export const AWS_REGION = process.env.AWS_REGION;