#!/usr/bin/env node
/**
 * Inspect agent_runs for a given thread to understand run hierarchy and ordering.
 * Usage: node scripts/inspect-thread-runs.js [threadId]
 * Default threadId: session-1772640027815
 *
 * Run from copilot-runtime-server: node scripts/inspect-thread-runs.js
 */

import { config } from 'dotenv';
import { getPool, closePool } from '../config/database.js';

config();

const THREAD_ID = process.argv[2] || 'session-1772640027815';

async function main() {
  const pool = getPool();

  // 1. Basic counts
  const countResult = await pool.query(
    `SELECT 
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE parent_run_id IS NULL) as roots,
       COUNT(*) FILTER (WHERE parent_run_id IS NOT NULL) as children
     FROM agent_runs 
     WHERE thread_id = $1 AND status IN ('completed', 'stopped', 'error')`,
    [THREAD_ID]
  );
  const { total, roots: rootCount, children: childCount } = countResult.rows[0];
  console.log('\n=== Thread Run Summary ===');
  console.log(`Thread: ${THREAD_ID}`);
  console.log(`Total runs: ${total}, Roots: ${rootCount}, Children: ${childCount}`);

  if (Number(total) === 0) {
    console.log('No runs found for this thread.');
    await closePool();
    return;
  }

  // 2. All runs ordered by created_at (chronological)
  const runsResult = await pool.query(
    `SELECT run_id, parent_run_id, status, created_at, events,
            jsonb_array_length(events) as event_count,
            pg_column_size(events) as events_bytes
     FROM agent_runs 
     WHERE thread_id = $1 AND status IN ('completed', 'stopped', 'error')
     ORDER BY created_at ASC`,
    [THREAD_ID]
  );

  console.log('\n=== All Runs (chronological, oldest first) ===');
  const runs = runsResult.rows;
  const runById = new Map(runs.map((r) => [r.run_id, r]));

  // Build parent -> children map
  const childrenByParent = new Map();
  for (const r of runs) {
    const pid = r.parent_run_id || '__root__';
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
    childrenByParent.get(pid).push(r);
  }

  const rootRuns = runs.filter((r) => !r.parent_run_id);
  console.log(`\nRoot runs (${rootRuns.length}):`);
  for (const r of rootRuns) {
    const kids = childrenByParent.get(r.run_id) || [];
    const totalKids = kids.length;
    console.log(
      `  ${r.run_id.slice(0, 8)}... | created: ${r.created_at.toISOString()} | direct children: ${totalKids} | events: ${r.event_count} | bytes: ${(r.events_bytes / 1024).toFixed(1)} KB`
    );
    if (totalKids > 0) {
      const firstChild = kids[0];
      const lastChild = kids[kids.length - 1];
      console.log(
        `    First child: ${firstChild.run_id.slice(0, 8)}... @ ${firstChild.created_at.toISOString()}`
      );
      console.log(
        `    Last child:  ${lastChild.run_id.slice(0, 8)}... @ ${lastChild.created_at.toISOString()}`
      );
    }
  }

  // Show chain structure (root -> child -> grandchild -> ...) for deep trees
  if (rootRuns.length === 1 && Number(childCount) > 1) {
    console.log('\n=== Run chain (first 25 runs, root -> child -> ...) ===');
    let current = rootRuns[0];
    let depth = 0;
    const maxShow = 25;
    while (current && depth < maxShow) {
      const indent = '  '.repeat(depth);
      console.log(
        `${indent}${current.run_id.slice(0, 8)}... | parent: ${(current.parent_run_id || 'null').slice(0, 8)}... | ${current.created_at.toISOString()}`
      );
      const next = childrenByParent.get(current.run_id)?.[0];
      current = next || null;
      depth++;
    }
    if (depth >= maxShow) console.log(`  ... (${runs.length} total runs in chain)`);
  }

  // 3. Simulate getHistoricRunsBefore(beforeMessageId = first message of oldest run)
  // Get first message from agent_messages (oldest by created_at) or from RUN_STARTED event
  let firstMessageId = null;
  const msgResult = await pool.query(
    `SELECT message_id FROM agent_messages 
     WHERE thread_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [THREAD_ID]
  );
  if (msgResult.rows.length > 0) {
    firstMessageId = msgResult.rows[0].message_id;
  }
  if (!firstMessageId && runs[0]?.events) {
    const events = Array.isArray(runs[0].events) ? runs[0].events : [];
    const runStarted = events.find((e) => e?.type === 'RUN_STARTED');
    const msgs = runStarted?.input?.messages || [];
    if (msgs.length > 0) firstMessageId = msgs[0]?.id;
  }

  if (firstMessageId || runs.length > 0) {
    console.log('\n=== Simulating getHistoricRunsBefore (limit=1) ===');
    if (firstMessageId) console.log(`Using beforeMessageId: ${firstMessageId.slice(0, 12)}...`);

    let beforeResult = { rows: [] };
    if (firstMessageId) {
      beforeResult = await pool.query(
        `SELECT ar.created_at FROM agent_runs ar
         INNER JOIN agent_messages am ON am.run_id = ar.run_id
         WHERE am.message_id = $1 AND ar.thread_id = $2`,
        [firstMessageId, THREAD_ID]
      );
    }

    let beforeCreatedAt;
    if (beforeResult.rows.length > 0) {
      beforeCreatedAt = beforeResult.rows[0].created_at;
    } else {
      // Fallback: use oldest run's created_at
      beforeCreatedAt = runs[0].created_at;
    }

    const maxTotalRuns = 20;
    const beforeQuery = `
      WITH RECURSIVE older_roots AS (
        SELECT run_id FROM agent_runs
        WHERE thread_id = $1 AND status IN ('completed', 'stopped', 'error')
          AND parent_run_id IS NULL AND created_at < $2
        ORDER BY created_at DESC LIMIT 1
      ),
      run_chain AS (
        SELECT run_id, parent_run_id, events, created_at FROM agent_runs
        WHERE thread_id = $1 AND status IN ('completed', 'stopped', 'error')
          AND run_id IN (SELECT run_id FROM older_roots)
        UNION ALL
        SELECT ar.run_id, ar.parent_run_id, ar.events, ar.created_at
        FROM agent_runs ar
        INNER JOIN run_chain rc ON ar.parent_run_id = rc.run_id
        WHERE ar.thread_id = $1 AND ar.status IN ('completed', 'stopped', 'error')
      ),
      limited AS (
        SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn FROM run_chain) sub
        WHERE rn <= ${maxTotalRuns}
      )
      SELECT run_id, parent_run_id, created_at FROM limited ORDER BY created_at ASC
    `;
    const beforeRuns = await pool.query(beforeQuery, [THREAD_ID, beforeCreatedAt]);
    console.log(`Would return ${beforeRuns.rows.length} runs from "before" query`);
    if (beforeRuns.rows.length > 0) {
      const last = beforeRuns.rows[beforeRuns.rows.length - 1];
      console.log(`Last run in batch: ${last.run_id.slice(0, 8)}... @ ${last.created_at.toISOString()}`);
    }
  }

  // 4. Simulate getHistoricRunsAfter(afterRunId = last run from first "before" batch)
  if (runs.length > 1) {
    const afterRunId = runs[Math.min(19, runs.length - 1)].run_id; // Simulate cap at 20
    console.log('\n=== Simulating getHistoricRunsAfter ===');
    console.log(`Using afterRunId: ${afterRunId.slice(0, 12)}...`);

    const afterCreatedResult = await pool.query(
      'SELECT created_at FROM agent_runs WHERE run_id = $1 AND thread_id = $2',
      [afterRunId, THREAD_ID]
    );
    if (afterCreatedResult.rows.length > 0) {
      const afterCreatedAt = afterCreatedResult.rows[0].created_at;
      const afterRuns = await pool.query(
        `SELECT run_id, parent_run_id, created_at FROM agent_runs
         WHERE thread_id = $1 AND status IN ('completed', 'stopped', 'error')
           AND created_at > $2
         ORDER BY created_at ASC
         LIMIT 20`,
        [THREAD_ID, afterCreatedAt]
      );
      console.log(`Would return ${afterRuns.rows.length} runs from "after" query`);
      if (afterRuns.rows.length > 0) {
        const first = afterRuns.rows[0];
        const last = afterRuns.rows[afterRuns.rows.length - 1];
        console.log(
          `First: ${first.run_id.slice(0, 8)}... (parent: ${(first.parent_run_id || 'null').slice(0, 8)}...) @ ${first.created_at.toISOString()}`
        );
        console.log(
          `Last:  ${last.run_id.slice(0, 8)}... @ ${last.created_at.toISOString()}`
        );
      }
    }
  }

  // 5. Ordering analysis for insert-position issue
  console.log('\n=== Insert Order Analysis ===');
  console.log(
    'Expected display order (oldest at top): [root, child1, child2, ..., childN, ...newer messages]'
  );
  console.log(
    'First "before" load returns: 1 root + up to 19 children (20 runs). Prepended to top.'
  );
  console.log(
    'Second "after" load returns: next 20 children. Inserted at index prependedCountRef.'
  );
  console.log(
    'If prependedCountRef = length of first batch, "after" messages go AFTER batch1.'
  );
  console.log(
    'Chronologically correct: root, child1..19, child20..39. So insert position is correct.'
  );
  console.log(
    'If user sees "new messages after parent" = children appear below root in view. That is correct.'
  );
  console.log(
    'If user expects "new messages at top" = they may mean: visible top when scroll-up loads more.'
  );

  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
