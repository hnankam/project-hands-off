#!/usr/bin/env node
/**
 * Diagnose where STATE_SNAPSHOT and STATE_DELTA events are dropped when loading history.
 *
 * When AGENT_RUNNER_MAX_HISTORIC_RUNS is low, initial load returns only the N most recent roots.
 * "Load more" uses getHistoricRunsBefore, which EXCLUDES roots that don't have:
 *   - RUN_STARTED with non-empty input.messages, OR
 *   - TEXT_MESSAGE_START
 *
 * Roots that only have STATE_SNAPSHOT/STATE_DELTA (e.g. plan creation runs) are excluded from
 * load-more, so their state events never reach the client.
 *
 * Usage:
 *   node scripts/diagnose-state-snapshots.js [threadId] [maxHistoricRuns]
 *
 * Example:
 *   node scripts/diagnose-state-snapshots.js session-1773877971331 5
 *
 * Run from copilot-runtime-server directory.
 */

import { config } from 'dotenv';
import { getPool, closePool } from '../config/database.js';

config();

const THREAD_ID = process.argv[2] || 'session-1773877971331';
const MAX_HISTORIC_RUNS = parseInt(process.argv[3], 10) || 5;
const STATUS_LIST = "('completed', 'stopped', 'error')";

function getEventTypes(events) {
  if (!Array.isArray(events)) return [];
  const types = new Set();
  for (const e of events) {
    if (e?.type) types.add(e.type);
  }
  return [...types];
}

function runPassesLoadMoreFilter(events) {
  if (!Array.isArray(events)) return false;
  const hasRunStartedWithMessages = events.some(
    (e) =>
      e?.type === 'RUN_STARTED' &&
      Array.isArray(e?.input?.messages) &&
      e.input.messages.length > 0
  );
  const hasTextMessageStart = events.some((e) => e?.type === 'TEXT_MESSAGE_START');
  return hasRunStartedWithMessages || hasTextMessageStart;
}

function countStateEvents(events) {
  if (!Array.isArray(events)) return { snapshot: 0, delta: 0 };
  let snapshot = 0;
  let delta = 0;
  for (const e of events) {
    if (e?.type === 'STATE_SNAPSHOT') snapshot++;
    if (e?.type === 'STATE_DELTA') delta++;
  }
  return { snapshot, delta };
}

async function main() {
  const pool = getPool();

  console.log('\n=== State Snapshot Diagnostic ===');
  console.log(`Thread: ${THREAD_ID}`);
  console.log(`maxHistoricRuns (simulated): ${MAX_HISTORIC_RUNS}`);
  console.log('');

  // 1. Fetch all runs
  const runsResult = await pool.query(
    `SELECT run_id, parent_run_id, status, events, created_at
     FROM agent_runs
     WHERE thread_id = $1 AND status IN ${STATUS_LIST}
     ORDER BY created_at ASC`,
    [THREAD_ID]
  );

  const runs = runsResult.rows;
  if (runs.length === 0) {
    console.log('No runs found for this thread.');
    await closePool();
    return;
  }

  const rootRuns = runs.filter((r) => !r.parent_run_id);
  const runById = new Map(runs.map((r) => [r.run_id, r]));

  // 2. Find runs with STATE_SNAPSHOT or STATE_DELTA
  const runsWithState = [];
  for (const r of runs) {
    const { snapshot, delta } = countStateEvents(r.events);
    if (snapshot > 0 || delta > 0) {
      const passesFilter = runPassesLoadMoreFilter(r.events);
      const isRoot = !r.parent_run_id;
      runsWithState.push({
        runId: r.run_id,
        parentRunId: r.parent_run_id,
        isRoot,
        created_at: r.created_at,
        snapshot,
        delta,
        passesLoadMoreFilter: passesFilter,
        eventTypes: getEventTypes(r.events),
      });
    }
  }

  console.log('=== Runs with STATE_SNAPSHOT or STATE_DELTA ===');
  if (runsWithState.length === 0) {
    console.log('None found. No state events in this thread.');
    await closePool();
    return;
  }

  for (const r of runsWithState) {
    const filterStatus = r.passesLoadMoreFilter ? 'PASSES' : 'EXCLUDED';
    console.log(
      `  ${r.runId.slice(0, 8)}... | root=${r.isRoot} | STATE_SNAPSHOT=${r.snapshot} STATE_DELTA=${r.delta} | load-more filter: ${filterStatus}`
    );
    if (!r.passesLoadMoreFilter) {
      console.log(`    -> Excluded: run has neither RUN_STARTED with messages nor TEXT_MESSAGE_START`);
      console.log(`    -> Event types: ${r.eventTypes.join(', ')}`);
    }
  }

  // 3. Simulate initial load (getHistoricRuns with maxHistoricRuns)
  const recentRootsQuery = `
    SELECT run_id FROM agent_runs
    WHERE thread_id = $1 AND status IN ${STATUS_LIST}
      AND parent_run_id IS NULL
      AND jsonb_array_length(events) > 0
    ORDER BY created_at DESC
    LIMIT $2
  `;
  const recentRootsResult = await pool.query(recentRootsQuery, [THREAD_ID, MAX_HISTORIC_RUNS]);
  const initialRootIds = new Set(recentRootsResult.rows.map((r) => r.run_id));

  // Get full subtree of initial load (roots + all descendants)
  const initialRunIds = new Set();
  const stack = [...initialRootIds];
  while (stack.length > 0) {
    const rid = stack.pop();
    if (initialRunIds.has(rid)) continue;
    initialRunIds.add(rid);
    for (const r of runs) {
      if (r.parent_run_id === rid) stack.push(r.run_id);
    }
  }

  console.log('\n=== Initial Load (getHistoricRuns, limit=' + MAX_HISTORIC_RUNS + ') ===');
  console.log(`Roots included: ${initialRootIds.size}`);
  console.log(`Total runs (with subtrees): ${initialRunIds.size}`);

  const stateRunsInInitial = runsWithState.filter((r) => initialRunIds.has(r.runId));
  const stateRunsNotInInitial = runsWithState.filter((r) => !initialRunIds.has(r.runId));

  console.log(`Runs with state events in initial load: ${stateRunsInInitial.length}`);
  console.log(`Runs with state events NOT in initial load: ${stateRunsNotInInitial.length}`);

  // 4. Simulate load-more: getHistoricRunsBefore with beforeRunId = oldest run from initial load
  const oldestInitialRun = runs.find((r) => initialRunIds.has(r.run_id));
  if (!oldestInitialRun) {
    await closePool();
    return;
  }

  const beforeCreatedAt = oldestInitialRun.created_at;
  const loadMoreRootsQuery = `
    WITH RECURSIVE older_roots AS (
      SELECT ar.run_id
      FROM agent_runs ar
      WHERE ar.thread_id = $1 AND ar.status IN ${STATUS_LIST}
        AND ar.parent_run_id IS NULL
        AND ar.created_at < $2
        AND (
          EXISTS (SELECT 1 FROM jsonb_array_elements(ar.events) evt
            WHERE evt->>'type' = 'RUN_STARTED' AND jsonb_typeof(evt->'input'->'messages') = 'array'
            AND jsonb_array_length(evt->'input'->'messages') > 0)
          OR EXISTS (SELECT 1 FROM jsonb_array_elements(ar.events) evt
            WHERE evt->>'type' = 'TEXT_MESSAGE_START')
        )
      ORDER BY ar.created_at DESC
      LIMIT $3
    ),
    run_chain AS (
      SELECT run_id, parent_run_id FROM agent_runs
      WHERE thread_id = $1 AND status IN ${STATUS_LIST}
        AND run_id IN (SELECT run_id FROM older_roots)
      UNION ALL
      SELECT ar.run_id, ar.parent_run_id
      FROM agent_runs ar
      INNER JOIN run_chain rc ON ar.parent_run_id = rc.run_id
      WHERE ar.thread_id = $1 AND ar.status IN ${STATUS_LIST}
    )
    SELECT run_id, parent_run_id FROM run_chain ORDER BY run_id
  `;
  const loadMoreResult = await pool.query(loadMoreRootsQuery, [
    THREAD_ID,
    beforeCreatedAt,
    MAX_HISTORIC_RUNS,
  ]);
  const loadMoreRunIds = new Set(loadMoreResult.rows.map((r) => r.run_id));

  // Helper: get root run for any run
  const getRootRun = (runId) => {
    let r = runById.get(runId);
    while (r?.parent_run_id) r = runById.get(r.parent_run_id);
    return r;
  };

  console.log('\n=== Load More (getHistoricRunsBefore, limit=' + MAX_HISTORIC_RUNS + ') ===');
  console.log(`beforeRunId (oldest from initial): ${oldestInitialRun.run_id.slice(0, 8)}...`);
  console.log(`Runs returned by load-more: ${loadMoreRunIds.size}`);

  if (stateRunsNotInInitial.length > 0) {
    console.log('\n  Runs with state events that require "load more":');
    for (const r of stateRunsNotInInitial) {
      const rootRun = getRootRun(r.runId);
      const wouldBeInLoadMore = rootRun ? loadMoreRunIds.has(rootRun.run_id) : false;
      console.log(
        `    ${r.runId.slice(0, 8)}... | would appear in load-more: ${wouldBeInLoadMore ? 'YES' : 'NO'} ${!wouldBeInLoadMore && r.isRoot ? '(root excluded by filter)' : ''}`
      );
    }
  }

  const stateRunsInLoadMore = runsWithState.filter((r) => loadMoreRunIds.has(r.runId));
  const stateRunsExcludedFromLoadMore = runsWithState.filter(
    (r) => !initialRunIds.has(r.runId) && !loadMoreRunIds.has(r.runId)
  );

  console.log(`Runs with state events in load-more: ${stateRunsInLoadMore.length}`);
  console.log(`Runs with state events EXCLUDED from load-more (never loaded): ${stateRunsExcludedFromLoadMore.length}`);

  if (stateRunsExcludedFromLoadMore.length > 0) {
    console.log('\n  *** DROPPED: Runs with state events that are NEVER loaded ***');
    for (const r of stateRunsExcludedFromLoadMore) {
      console.log(`    ${r.runId.slice(0, 8)}... | root=${r.isRoot} | passes filter=${r.passesLoadMoreFilter}`);
      if (r.isRoot && !r.passesLoadMoreFilter) {
        console.log(`    -> Root excluded by getHistoricRunsBefore filter (no RUN_STARTED with messages, no TEXT_MESSAGE_START)`);
      } else if (!r.isRoot) {
        const root = (() => {
          let curr = runById.get(r.parentRunId);
          while (curr?.parent_run_id) curr = runById.get(curr.parent_run_id);
          return curr;
        })();
        const rootPasses = root ? runPassesLoadMoreFilter(root.events) : false;
        console.log(`    -> Child of root ${root?.run_id?.slice(0, 8)}... which passes filter: ${rootPasses}`);
      }
    }
  }

  // 5. Check specific run if provided (4th arg or TARGET_RUN_ID env)
  const TARGET_RUN = process.argv[4] || process.env.TARGET_RUN_ID || 'ec58f35e-91a8-429d-971b-61e3fed71e52';
  const targetRun = runs.find((r) => r.run_id === TARGET_RUN || r.run_id.startsWith(TARGET_RUN.slice(0, 8)));
  if (targetRun) {
    console.log('\n=== Target Run: ' + targetRun.run_id + ' ===');
    const { snapshot, delta } = countStateEvents(targetRun.events);
    console.log(`STATE_SNAPSHOT count: ${snapshot}, STATE_DELTA count: ${delta}`);
    console.log(`In initial load: ${initialRunIds.has(targetRun.run_id)}`);
    console.log(`In load-more: ${loadMoreRunIds.has(targetRun.run_id)}`);
    console.log(`Passes load-more filter: ${runPassesLoadMoreFilter(targetRun.events)}`);
    console.log(`Event types: ${getEventTypes(targetRun.events).join(', ')}`);
  }

  console.log('\n=== Summary ===');
  console.log('1. INITIAL LOAD (tab open): getHistoricRuns returns only the N most recent roots.');
  console.log('   Runs older than that (e.g. ec58f35e with plan STATE_SNAPSHOT) are NOT loaded.');
  console.log('   If the user never clicks "load more", those state events are never replayed.');
  console.log('');
  console.log('2. LOAD MORE: getHistoricRunsBefore EXCLUDES roots that have neither:');
  console.log('   - RUN_STARTED with non-empty input.messages');
  console.log('   - TEXT_MESSAGE_START');
  console.log('   Roots that only have STATE_SNAPSHOT/STATE_DELTA would be excluded from load-more.');
  console.log('');
  console.log('3. When AGENT_RUNNER_MAX_HISTORIC_RUNS is high: initial load includes more roots,');
  console.log('   so runs with state events are included without needing load-more.');

  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
