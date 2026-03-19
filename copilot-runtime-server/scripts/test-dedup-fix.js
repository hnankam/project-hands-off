#!/usr/bin/env node
/**
 * test-dedup-fix.js
 *
 * Tests that loadAndStreamHistory deduplication produces the correct number of
 * user messages for a given thread/session.
 *
 * Usage:
 *   node scripts/test-dedup-fix.js <threadId-or-sessionId>
 *
 * Reports:
 *  - Per-run breakdown of input.messages
 *  - WITHOUT dedup: total user messages (old behaviour)
 *  - WITH dedup:    total user messages (new behaviour)
 */

import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const id = process.argv[2];
if (!id) {
  console.error('Usage: node scripts/test-dedup-fix.js <threadId-or-sessionId>');
  process.exit(1);
}

// Build connection string from individual env vars (matches postgres-agent-runner.js)
function buildConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const {
    DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE, DB_OTHER_PARAMS,
  } = process.env;
  const base = `postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_DATABASE}`;
  return DB_OTHER_PARAMS ? `${base}?${DB_OTHER_PARAMS}` : base;
}

const pool = new Pool({
  connectionString: buildConnectionString(),
  ssl: { rejectUnauthorized: false },
});

async function resolveThreadId(input) {
  // Try as thread_id first
  let res = await pool.query(
    `SELECT thread_id FROM agent_threads WHERE thread_id = $1 LIMIT 1`,
    [input]
  );
  if (res.rows.length > 0) return res.rows[0].thread_id;

  // Try as session_id
  res = await pool.query(
    `SELECT thread_id FROM agent_threads WHERE session_id = $1 LIMIT 1`,
    [input]
  );
  if (res.rows.length > 0) return res.rows[0].thread_id;

  throw new Error(`No thread found for id: ${input}`);
}

async function getRuns(threadId) {
  const res = await pool.query(
    `WITH RECURSIVE run_chain AS (
       SELECT run_id, parent_run_id, events, created_at
       FROM agent_runs
       WHERE thread_id = $1
         AND status IN ('completed', 'stopped')
         AND parent_run_id IS NULL
       UNION ALL
       SELECT ar.run_id, ar.parent_run_id, ar.events, ar.created_at
       FROM agent_runs ar
       INNER JOIN run_chain rc ON ar.parent_run_id = rc.run_id
       WHERE ar.thread_id = $1
         AND ar.status IN ('completed', 'stopped')
     )
     SELECT * FROM run_chain ORDER BY created_at ASC`,
    [threadId]
  );
  return res.rows;
}

async function main() {
  const threadId = await resolveThreadId(id);
  console.log(`\nThread: ${threadId}`);

  const runs = await getRuns(threadId);
  console.log(`Runs (ASC order): ${runs.length}\n`);

  // Collect all RUN_STARTED input.messages per run
  const runData = runs.map(run => {
    const events = run.events || [];
    const runStarted = events.find(e => e.type === 'RUN_STARTED');
    const inputMsgs = runStarted?.input?.messages ?? [];
    return {
      runId: run.run_id.slice(0, 8),
      messages: inputMsgs,
    };
  });

  // ── WITHOUT dedup (old behaviour) ──────────────────────────────────────────
  const withoutDedup = [];
  for (const { runId, messages } of runData) {
    for (const msg of messages) {
      if (msg?.id) withoutDedup.push({ id: msg.id, role: msg.role, runId });
    }
  }
  const withoutDedupUsers = withoutDedup.filter(m => m.role === 'user');

  // ── WITH dedup (new behaviour) ──────────────────────────────────────────────
  const seenIds = new Set();
  const withDedup = [];
  for (const { runId, messages } of runData) {
    for (const msg of messages) {
      if (msg?.id && !seenIds.has(msg.id)) {
        seenIds.add(msg.id);
        withDedup.push({ id: msg.id, role: msg.role, runId });
      }
    }
  }
  const withDedupUsers = withDedup.filter(m => m.role === 'user');

  // ── Per-run breakdown ───────────────────────────────────────────────────────
  console.log('Per-run input.messages:');
  for (const { runId, messages } of runData) {
    const userMsgs = messages.filter(m => m?.role === 'user');
    console.log(
      `  run ${runId}: ${messages.length} total, ${userMsgs.length} user` +
      (userMsgs.length > 0 ? ` [${userMsgs.map(m => m.id?.slice(0, 8)).join(', ')}]` : '')
    );
  }

  // ── Find duplicate IDs ──────────────────────────────────────────────────────
  const idCount = new Map();
  for (const m of withoutDedupUsers) {
    idCount.set(m.id, (idCount.get(m.id) || 0) + 1);
  }
  const duplicates = [...idCount.entries()].filter(([, count]) => count > 1);

  console.log('\n── Results ────────────────────────────────────────────────────');
  console.log(`WITHOUT dedup : ${withoutDedupUsers.length} user messages (${withoutDedup.length} total)`);
  console.log(`WITH dedup    : ${withDedupUsers.length} user messages (${withDedup.length} total)`);

  if (duplicates.length > 0) {
    console.log(`\nDuplicate user message IDs (${duplicates.length}):`);
    for (const [msgId, count] of duplicates) {
      const runs = withoutDedupUsers.filter(m => m.id === msgId).map(m => m.runId);
      console.log(`  ${msgId.slice(0, 8)} — seen ${count}× in runs [${runs.join(', ')}]`);
    }
  } else {
    console.log('\nNo duplicate user message IDs found.');
  }

  const fixed = withoutDedupUsers.length - withDedupUsers.length;
  if (fixed > 0) {
    console.log(`\n✓ Fix removes ${fixed} duplicate user message(s)`);
  } else {
    console.log('\n✓ No duplicates to remove');
  }

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
