/**
 * debug-load-history.mjs
 *
 * Directly queries the database to inspect the events stored for a thread,
 * replicating what the server's getHistoryEventsBefore / getHistoryEventsAfter
 * functions do — without going through HTTP auth.
 *
 * Usage:
 *   node scripts/debug-load-history.mjs [threadId]
 *
 * Example:
 *   node scripts/debug-load-history.mjs session-1772640027815
 */

import pg from 'pg';
import { createRequire } from 'module';

// ─── Config ──────────────────────────────────────────────────────────────────
const THREAD_ID = process.argv[2] || 'session-1772640027815';

const pool = new pg.Pool({
  host:     'ep-billowing-surf-aatf87vk-pooler.westus3.azure.neon.tech',
  port:     5432,
  database: 'handsoff_db',
  user:     'neondb_owner',
  password: 'npg_IJl5XdnPE6FW',
  ssl:      { rejectUnauthorized: false },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function analyseEvents(events, label) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`RUN: ${label}  (${events.length} events total)`);
  console.log('─'.repeat(70));

  const counts = {};
  for (const e of events) counts[e.type] = (counts[e.type] || 0) + 1;
  console.log('\nEvent type counts:');
  for (const [t, c] of Object.entries(counts))
    console.log(`  ${t.padEnd(30)} ${c}`);

  const runStarts = events.filter(e => e.type === 'RUN_STARTED');
  console.log(`\nRUN_STARTED (${runStarts.length}): field inventory`);
  for (const e of runStarts) {
    console.log('  keys     :', Object.keys(e).join(', '));
    console.log('  runId    :', e.runId    ?? '(missing)');
    console.log('  run_id   :', e.run_id   ?? '(missing)');
    console.log('  id       :', e.id       ?? '(missing)');
    console.log('  threadId :', e.threadId ?? '(missing)');
  }

  const truncated = events.filter(e => e.truncated === true);
  console.log(`\nTRUNCATED events (${truncated.length}):`);
  for (const e of truncated)
    console.log(' ', JSON.stringify(e));

  console.log('\nFirst 40 events (idx | type | runId field):');
  for (const [i, e] of events.slice(0, 40).entries()) {
    const rid = e.runId !== undefined ? String(e.runId)
              : e.run_id !== undefined ? `run_id=${e.run_id}`
              : '(no runId field)';
    console.log(`  [${String(i).padStart(2)}]  ${e.type.padEnd(28)}  ${rid}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`DEBUG LOAD HISTORY  thread: ${THREAD_ID}`);
  console.log('═'.repeat(70));

  try {
    // 1. List all runs for this thread, newest first
    const runsResult = await pool.query(
      `SELECT run_id, created_at, jsonb_array_length(events) AS event_count
       FROM agent_runs
       WHERE thread_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [THREAD_ID]
    );

    console.log(`\nRuns for thread (newest first, max 20):`);
    console.log(`  ${'run_id'.padEnd(40)}  ${'created_at'.padEnd(30)}  events`);
    for (const r of runsResult.rows)
      console.log(`  ${String(r.run_id).padEnd(40)}  ${String(r.created_at).padEnd(30)}  ${r.event_count}`);

    if (runsResult.rows.length === 0) {
      console.log('  (no runs found for this thread)');
      return;
    }

    // 2. Inspect oldest run (last in sorted list) — this is what load-more loads
    const oldestRun = runsResult.rows[runsResult.rows.length - 1];
    console.log(`\n→ Inspecting oldest run: ${oldestRun.run_id}`);

    const eventsResult = await pool.query(
      `SELECT events FROM agent_runs WHERE run_id = $1`,
      [oldestRun.run_id]
    );

    if (eventsResult.rows.length === 0) {
      console.log('  (no events found)');
      return;
    }

    analyseEvents(eventsResult.rows[0].events || [], oldestRun.run_id);

    // 3. Also inspect the second-oldest if there are multiple runs
    if (runsResult.rows.length > 1) {
      const secondOldest = runsResult.rows[runsResult.rows.length - 2];
      console.log(`\n→ Inspecting second-oldest run: ${secondOldest.run_id}`);
      const eventsResult2 = await pool.query(
        `SELECT events FROM agent_runs WHERE run_id = $1`,
        [secondOldest.run_id]
      );
      if (eventsResult2.rows.length > 0)
        analyseEvents(eventsResult2.rows[0].events || [], secondOldest.run_id);
    }

  } finally {
    await pool.end();
    console.log(`\n${'═'.repeat(70)}\nDone.\n`);
  }
})();
