/**
 * Database initialization script for runtime server
 * - Tests database connection
 * - Applies schema extensions
 * - Seeds runtime-specific data
 */

import { testConnection, initSchemaExtensions, closePool } from '../config/database.js';
import { invalidateCache } from '../config/db-loaders.js';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     Runtime Server Database Initialization                ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    switch (command) {
      case '--test':
        console.log('[1/1] Testing database connection...\n');
        await testConnection();
        break;

      case '--extend':
        console.log('[1/2] Testing database connection...\n');
        await testConnection();
        console.log('\n[2/2] Applying schema extensions...\n');
        await initSchemaExtensions();
        console.log('\n✅ Schema extensions applied successfully');
        break;

      case '--invalidate':
        console.log('[1/1] Invalidating configuration cache...\n');
        invalidateCache();
        console.log('✅ Cache invalidated');
        break;

      default:
        console.log('Available commands:');
        console.log('  --test        Test database connection');
        console.log('  --extend      Apply schema extensions for runtime server');
        console.log('  --invalidate  Invalidate configuration cache');
        console.log('\nExamples:');
        console.log('  node scripts/init-db.js --test');
        console.log('  node scripts/init-db.js --extend');
        break;
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();

