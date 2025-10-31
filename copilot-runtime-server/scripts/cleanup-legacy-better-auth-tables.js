/**
 * Cleanup legacy Better Auth tables created manually (plural/snake_case)
 * This is SAFE to run repeatedly. It only drops duplicates that Better Auth
 * does not use in v1.4 (singular table names).
 */

import { getClient } from '../config/database.js';

const legacyTables = [
  // Old plural/snake_case tables we created manually earlier
  'users',
  'accounts',
  'sessions',
  'verification_tokens',
  'organizations',
  'members',
  'invitations',
  'teams',
  'team_members',
  'organization_roles',
  'user_active_context',
];

async function tableExists(client, table) {
  const { rows } = await client.query(
    `select 1 from information_schema.tables where table_schema='public' and table_name=$1`,
    [table],
  );
  return rows.length > 0;
}

async function dropTableIfExists(client, table) {
  if (await tableExists(client, table)) {
    console.log(`🗑️  Dropping legacy table: ${table}`);
    await client.query(`drop table if exists "${table}" cascade`);
    return true;
  }
  return false;
}

async function run() {
  const client = await getClient();
  try {
    await client.query('begin');
    let dropped = 0;
    for (const t of legacyTables) {
      if (await dropTableIfExists(client, t)) dropped += 1;
    }
    await client.query('commit');
    console.log(`✅ Cleanup complete. Dropped ${dropped} legacy table(s).`);
  } catch (err) {
    await client.query('rollback');
    console.error('❌ Cleanup failed:', err.message || err);
    process.exit(1);
  } finally {
    client.release();
  }
}

run();


