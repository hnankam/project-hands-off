/**
 * Fix Better Auth team table legacy columns
 * - Drops legacy snake_case columns that conflict with new camelCase columns
 * - Safely migrates data from legacy columns when present
 */

import { getClient } from '../config/database.js';

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [table, column]
  );
  return rows.length > 0;
}

async function run() {
  const client = await getClient();
  try {
    console.log('🔧 Checking legacy columns on table "team"...');
    await client.query('BEGIN');

    const hasOrgIdSnake = await columnExists(client, 'team', 'organization_id');
    const hasOrgIdCamel = await columnExists(client, 'team', 'organizationId');
    const hasCreatedAtSnake = await columnExists(client, 'team', 'created_at');
    const hasUpdatedAtSnake = await columnExists(client, 'team', 'updated_at');

    if (hasOrgIdSnake && hasOrgIdCamel) {
      console.log('➡️  Migrating data from team.organization_id -> team."organizationId" (if needed)');
      await client.query(
        `UPDATE team SET organization_id = "organizationId" WHERE organization_id IS NULL AND "organizationId" IS NOT NULL`
      );
      console.log('🗑️  Dropping legacy column team.organization_id');
      await client.query(`ALTER TABLE team DROP COLUMN organization_id`);
    }

    if (hasCreatedAtSnake) {
      console.log('🗑️  Dropping legacy column team.created_at');
      await client.query(`ALTER TABLE team DROP COLUMN created_at`);
    }

    if (hasUpdatedAtSnake) {
      console.log('🗑️  Dropping legacy column team.updated_at');
      await client.query(`ALTER TABLE team DROP COLUMN updated_at`);
    }

    await client.query('COMMIT');
    console.log('✅ Team table legacy columns fixed.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to fix team table columns:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

run();


