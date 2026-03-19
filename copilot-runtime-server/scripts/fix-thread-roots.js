#!/usr/bin/env node
/**
 * Fix thread run hierarchy: promote runs that should be roots (user-initiated)
 * but were incorrectly stored as children.
 *
 * Usage:
 *   node scripts/fix-thread-roots.js <threadId> --analyze
 *     Show all runs with RUN_STARTED summary; suggest possible roots
 *
 *   node scripts/fix-thread-roots.js <threadId> --promote <runId1>,<runId2>,...
 *     Set parent_run_id = NULL for the given run IDs (make them roots)
 *
 *   node scripts/fix-thread-roots.js <threadId> --promote-all-children
 *     WARNING: Promotes ALL current children to roots. Use only if the entire
 *     thread has a single root with many children that should all be roots.
 *
 * Run from copilot-runtime-server directory.
 */

import { config } from 'dotenv';
import { getPool, closePool } from '../config/database.js';

config();

const THREAD_ID = process.argv[2];
const MODE = process.argv[3]; // --analyze | --promote | --promote-all-children
const ARG = process.argv[4];  // for --promote: comma-separated run IDs

if (!THREAD_ID || !MODE) {
  console.log(`
Usage:
  node scripts/fix-thread-roots.js <threadId> --analyze
  node scripts/fix-thread-roots.js <threadId> --promote <runId1>,<runId2>,...
  node scripts/fix-thread-roots.js <threadId> --promote-all-children
`);
  process.exit(1);
}

function getInitiatingMessage(events) {
  if (!Array.isArray(events)) return null;
  const runStarted = events.find((e) => e.type === 'RUN_STARTED' || e.type === 'run_started');
  const messages = runStarted?.input?.messages;
  if (!Array.isArray(messages) || messages.length === 0) return null;
  const last = messages[messages.length - 1];
  return {
    role: last.role || 'unknown',
    contentPreview: typeof last.content === 'string' ? last.content.slice(0, 80) : '[object]',
  };
}

async function analyze(pool) {
  const result = await pool.query(
    `SELECT run_id, parent_run_id, created_at, events
     FROM agent_runs
     WHERE thread_id = $1 AND status IN ('completed', 'stopped', 'error')
     ORDER BY created_at ASC`,
    [THREAD_ID]
  );

  const runs = result.rows;
  const roots = runs.filter((r) => !r.parent_run_id);
  const children = runs.filter((r) => r.parent_run_id);

  console.log(`\n=== Thread ${THREAD_ID} ===`);
  console.log(`Total: ${runs.length} | Roots: ${roots.length} | Children: ${children.length}\n`);

  console.log('All runs (chronological):');
  console.log('-'.repeat(100));
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    const init = getInitiatingMessage(r.events);
    const role = init?.role ?? '?';
    const preview = init?.contentPreview ?? 'no RUN_STARTED';
    const parent = r.parent_run_id ? r.parent_run_id.slice(0, 8) + '...' : 'null (root)';
    console.log(
      `${(i + 1).toString().padStart(3)}. ${r.run_id.slice(0, 12)}... | parent: ${parent.padEnd(14)} | ${r.created_at.toISOString()} | last msg: ${role} | "${preview}${preview.length >= 80 ? '...' : ''}"`
    );
  }

  console.log('\nPossible roots (runs where last RUN_STARTED message is from user):');
  const possibleRoots = children.filter((r) => {
    const init = getInitiatingMessage(r.events);
    return init?.role === 'user';
  });
  if (possibleRoots.length === 0) {
    console.log('  (none found - all children have assistant/tool as last message)');
  } else {
    for (const r of possibleRoots) {
      const init = getInitiatingMessage(r.events);
      console.log(`  ${r.run_id} | ${r.created_at.toISOString()} | "${init?.contentPreview}"`);
    }
    console.log(`\nTo promote these: node scripts/fix-thread-roots.js ${THREAD_ID} --promote ${possibleRoots.map((r) => r.run_id).join(',')}`);
  }
}

async function promote(pool, runIds) {
  if (runIds.length === 0) {
    console.log('No run IDs provided.');
    return;
  }

  const placeholders = runIds.map((_, i) => `$${i + 2}`).join(', ');
  const result = await pool.query(
    `UPDATE agent_runs
     SET parent_run_id = NULL
     WHERE thread_id = $1 AND run_id IN (${placeholders})
     RETURNING run_id`,
    [THREAD_ID, ...runIds]
  );

  console.log(`\nPromoted ${result.rowCount} run(s) to roots:`);
  for (const row of result.rows) {
    console.log(`  ${row.run_id}`);
  }
}

async function promoteAllChildren(pool) {
  const result = await pool.query(
    `UPDATE agent_runs
     SET parent_run_id = NULL
     WHERE thread_id = $1 AND parent_run_id IS NOT NULL
     RETURNING run_id`,
    [THREAD_ID]
  );

  console.log(`\nPromoted ${result.rowCount} child run(s) to roots.`);
}

async function main() {
  const pool = getPool();

  try {
    if (MODE === '--analyze') {
      await analyze(pool);
    } else if (MODE === '--promote') {
      if (!ARG) {
        console.log('Error: --promote requires comma-separated run IDs');
        process.exit(1);
      }
      const runIds = ARG.split(',').map((s) => s.trim()).filter(Boolean);
      await promote(pool, runIds);
    } else if (MODE === '--promote-all-children') {
      const countResult = await pool.query(
        `SELECT COUNT(*) as n FROM agent_runs WHERE thread_id = $1 AND parent_run_id IS NOT NULL`,
        [THREAD_ID]
      );
      const n = Number(countResult.rows[0].n);
      console.log(`This will promote ${n} child run(s) to roots.`);
      await promoteAllChildren(pool);
    } else {
      console.log(`Unknown mode: ${MODE}`);
      process.exit(1);
    }
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
