/**
 * Database connection utilities for PostgreSQL (Neon)
 * Connects to the same database as the Python/Pydantic server
 */

import { config } from 'dotenv';
import pg from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
config();

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database connection pool
let pool = null;

/**
 * Build PostgreSQL connection string from environment variables
 */
export function getConnectionString() {
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT || '5432';
  const database = process.env.DB_DATABASE;
  const username = process.env.DB_USERNAME;
  const password = process.env.DB_PASSWORD;
  const otherParams = process.env.DB_OTHER_PARAMS || 'sslmode=require';
  
  if (!host || !database || !username || !password) {
    throw new Error('Database connection parameters not fully configured in .env');
  }
  
  return `postgresql://${username}:${password}@${host}:${port}/${database}?${otherParams}`;
}

/**
 * Get or create database connection pool
 */
export function getPool() {
  if (!pool) {
    const connectionString = getConnectionString();
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }
  
  return pool;
}

/**
 * Get a database client from the pool
 */
export async function getClient() {
  const pool = getPool();
  return await pool.connect();
}

/**
 * Execute a query with automatic client management
 */
export async function query(text, params) {
  const pool = getPool();
  return await pool.query(text, params);
}

/**
 * Test database connection
 */
export async function testConnection() {
  try {
    const result = await query('SELECT NOW() as now, version() as version');
    console.log('✓ Database connection successful');
    console.log('  Time:', result.rows[0].now);
    console.log('  Version:', result.rows[0].version.split(',')[0]);
    return true;
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    return false;
  }
}

/**
 * Initialize database schema extensions for runtime server
 */
export async function initSchemaExtensions() {
  const client = await getClient();
  
  try {
    const schemaPath = join(__dirname, '../../copilotkit-pydantic/database/schema_extensions.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    await client.query('BEGIN');
    await client.query(schema);
    await client.query('COMMIT');
    
    console.log('✓ Schema extensions initialized successfully');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('✗ Schema extensions failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Close database connection pool
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✓ Database connection pool closed');
  }
}

/**
 * Graceful shutdown handler
 */
process.on('SIGINT', async () => {
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closePool();
  process.exit(0);
});

