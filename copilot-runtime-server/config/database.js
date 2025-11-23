/**
 * Database connection utilities for PostgreSQL (Neon)
 * Connects to the same database as the Python/Pydantic server
 */

import { config } from 'dotenv';
import pg from 'pg';

// Load environment variables
config();

const { Pool } = pg;

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
      max: 20, // Increased for better concurrency
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      // Additional recommended settings
      allowExitOnIdle: false,
      statement_timeout: 10000, // 10 second statement timeout
    });
    
    pool.on('error', (err) => {
      console.error('Unexpected error on idle database client:', err.message);
    });
    
    pool.on('connect', () => {
      // Uncomment for debugging connection events
      // console.log('Database client connected to pool');
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
    await query('SELECT NOW() as now, version() as version');
    return true;
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    return false;
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
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`\n${signal} received, closing database connections...`);
  try {
  await closePool();
  process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

