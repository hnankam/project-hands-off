/**
 * Utility to fix corrupted OAuth connections
 * Run this to mark corrupted connections as invalid so users can reconnect
 * 
 * Usage: node copilot-runtime-server/utils/fix-corrupted-connections.js
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../../.env') });

async function fixCorruptedConnections() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Checking for corrupted OAuth connections...\n');

    // Get all active OAuth connections
    const { rows } = await pool.query(`
      SELECT id, user_id, service_name, connection_name, updated_at
      FROM workspace_connections
      WHERE service_name IN ('gmail', 'slack')
      AND status = 'active'
      ORDER BY updated_at DESC
    `);

    console.log(`Found ${rows.length} OAuth connection(s)\n`);

    if (rows.length === 0) {
      console.log('No OAuth connections found. Nothing to fix.');
      return;
    }

    // Show connections
    console.log('OAuth Connections:');
    console.log('==================');
    rows.forEach((conn, index) => {
      console.log(`${index + 1}. ${conn.service_name.toUpperCase()} - ${conn.connection_name}`);
      console.log(`   ID: ${conn.id}`);
      console.log(`   User ID: ${conn.user_id}`);
      console.log(`   Last Updated: ${conn.updated_at}`);
      console.log('');
    });

    // Mark all as invalid to force reconnection
    console.log('\nMarking connections as invalid (will require reconnection)...');
    
    const updateResult = await pool.query(`
      UPDATE workspace_connections
      SET status = 'invalid',
          updated_at = CURRENT_TIMESTAMP
      WHERE service_name IN ('gmail', 'slack')
      AND status = 'active'
    `);

    console.log(`✅ Marked ${updateResult.rowCount} connection(s) as invalid\n`);
    console.log('Next steps:');
    console.log('1. Restart your server');
    console.log('2. Go to the app and disconnect the Gmail connection');
    console.log('3. Reconnect Gmail with fresh OAuth flow');
    console.log('4. The new connection will be stored in the correct format\n');

  } catch (error) {
    console.error('Error fixing connections:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

fixCorruptedConnections()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });

