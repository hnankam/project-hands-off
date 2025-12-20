/**
 * Database Cleanup Script
 * 
 * Fixes:
 * 1. Removes UUID-based threads (keep only session-based)
 * 2. Fixes runs stuck in "running" status
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

async function cleanup() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('\n🧹 Database Cleanup Starting...\n');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    // 1. Fix runs stuck in "running" status
    const fixedRuns = await client.query(`
      UPDATE agent_runs
      SET 
        status = 'completed',
        completed_at = NOW()
      WHERE status = 'running'
        AND created_at < NOW() - INTERVAL '5 minutes'
      RETURNING run_id, thread_id
    `);
    
    console.log(`✅ Fixed ${fixedRuns.rows.length} stuck runs:\n`);
    fixedRuns.rows.forEach(r => {
      console.log(`   - Run ${r.run_id.substring(0, 8)}... on thread ${r.thread_id}`);
    });
    console.log();
    
    // 2. Identify UUID-based threads
    const uuidThreads = await client.query(`
      SELECT thread_id, created_at,
        (SELECT COUNT(*) FROM agent_runs WHERE thread_id = agent_threads.thread_id) as run_count
      FROM agent_threads
      WHERE thread_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ORDER BY created_at DESC
    `);
    
    if (uuidThreads.rows.length > 0) {
      console.log(`🗑️  Removing ${uuidThreads.rows.length} UUID-based threads:\n`);
      uuidThreads.rows.forEach(t => {
        console.log(`   - ${t.thread_id} (${t.run_count} runs)`);
      });
      console.log();
      
      // Delete runs first (foreign key constraint)
      const deletedRuns = await client.query(`
        DELETE FROM agent_runs
        WHERE thread_id IN (
          SELECT thread_id FROM agent_threads
          WHERE thread_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
        RETURNING run_id
      `);
      
      // Delete threads
      const deletedThreads = await client.query(`
        DELETE FROM agent_threads
        WHERE thread_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        RETURNING thread_id
      `);
      
      console.log(`✅ Deleted ${deletedRuns.rows.length} runs from UUID threads`);
      console.log(`✅ Deleted ${deletedThreads.rows.length} UUID threads\n`);
    } else {
      console.log('✅ No UUID threads found\n');
    }
    
    // 3. Show final state
    const finalThreads = await client.query(`
      SELECT 
        thread_id,
        is_running,
        (SELECT COUNT(*) FROM agent_runs WHERE thread_id = agent_threads.thread_id) as run_count,
        (SELECT COUNT(*) FROM agent_runs WHERE thread_id = agent_threads.thread_id AND status = 'completed') as completed_runs
      FROM agent_threads
      ORDER BY created_at DESC
    `);
    
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('📊 Final Database State:\n');
    finalThreads.rows.forEach((t, i) => {
      console.log(`${i + 1}. ${t.thread_id}`);
      console.log(`   Total runs: ${t.run_count}, Completed: ${t.completed_runs}, Running: ${t.is_running}`);
    });
    
    await client.query('COMMIT');
    console.log('\n✅ Cleanup completed successfully!\n');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Cleanup failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

cleanup().catch(error => {
  console.error(error);
  process.exit(1);
});

