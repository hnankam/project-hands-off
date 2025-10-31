/**
 * Initialize Better Auth Database Schema
 * 
 * This script creates all necessary tables for Better Auth with the organization plugin.
 * Run this script to set up the database schema.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getClient } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function initBetterAuthSchema() {
  console.log('🚀 Initializing Better Auth database schema...\n');
  
  const client = await getClient();
  
  try {
    // Read the schema SQL file
    const schemaPath = join(__dirname, 'better-auth-schema.sql');
    const schemaSql = readFileSync(schemaPath, 'utf-8');
    
    // Execute the schema
    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query('COMMIT');
    
    console.log('✅ Better Auth schema initialized successfully!\n');
    console.log('Created tables:');
    console.log('  - users');
    console.log('  - accounts');
    console.log('  - sessions');
    console.log('  - verification_tokens');
    console.log('  - organizations');
    console.log('  - members');
    console.log('  - invitations');
    console.log('  - teams');
    console.log('  - team_members');
    console.log('  - organization_roles');
    console.log('  - user_active_context\n');
    
    // Verify tables were created
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN (
          'users', 'accounts', 'sessions', 'verification_tokens',
          'organizations', 'members', 'invitations', 'teams',
          'team_members', 'organization_roles', 'user_active_context'
        )
      ORDER BY table_name;
    `);
    
    console.log(`✅ Verified ${result.rows.length} Better Auth tables in database\n`);
    
    // Show demo data info
    console.log('📝 Demo data created:');
    console.log('  Email: demo@example.com');
    console.log('  Organization: Demo Organization (demo-org)');
    console.log('  Team: Engineering Team\n');
    
    console.log('🎉 Setup complete! You can now use Better Auth.');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error initializing Better Auth schema:');
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

// Run the initialization
initBetterAuthSchema();

