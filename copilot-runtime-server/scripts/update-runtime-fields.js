/**
 * Update database models with runtime-specific fields
 * Adds endpoint, forced_model, bedrock_model_id, deployment_name
 */

import { query, closePool } from '../config/database.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load runtime models configuration from JSON file
function loadRuntimeModelsConfig() {
  const configPath = join(__dirname, '../config/models.json');
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}

async function updateRuntimeFields() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     Update Database with Runtime-Specific Fields         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    const config = loadRuntimeModelsConfig();
    let updated = 0;
    let skipped = 0;

    console.log(`Found ${config.models.length} models in configuration\n`);

    for (const model of config.models) {
      try {
        const result = await query(`
          UPDATE models
          SET 
            endpoint = $1,
            forced_model = $2,
            bedrock_model_id = $3,
            deployment_name = $4
          WHERE model_key = $5
        `, [
          model.endpoint || model.key,
          model.forced_model || null,
          model.bedrock_model_id || null,
          model.deployment_name || null,
          model.key
        ]);

        if (result.rowCount > 0) {
          console.log(`  ✓ Updated ${model.key}`);
          if (model.forced_model) {
            console.log(`    → forced_model: ${model.forced_model}`);
          }
          if (model.bedrock_model_id) {
            console.log(`    → bedrock_model_id: ${model.bedrock_model_id}`);
          }
          if (model.deployment_name) {
            console.log(`    → deployment_name: ${model.deployment_name}`);
          }
          updated++;
        } else {
          console.log(`  ⊗ Skipped ${model.key} (not found in database)`);
          skipped++;
        }
      } catch (error) {
        console.error(`  ✗ Error updating ${model.key}:`, error.message);
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`✅ Update complete! ${updated} models updated, ${skipped} skipped`);
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Update failed:', error.message);
    process.exit(1);
  } finally {
    await closePool();
  }
}

updateRuntimeFields();

