#!/usr/bin/env node
/**
 * Load history for a thread (same logic as PostgresAgentRunner.connect → loadAndStreamHistory).
 * Use to debug why history may not load on tab open.
 *
 * Usage:
 *   node scripts/load-history.js <threadId>
 *
 * Run from copilot-runtime-server directory.
 */

import { config } from 'dotenv';
import { getPool, closePool } from '../config/database.js';
import { PostgresAgentRunner } from '../runners/postgres-agent-runner.js';

config();

const THREAD_ID = process.argv[2];
const LIMIT_ARG = process.argv[3]; // optional: --limit N
if (!THREAD_ID) {
  console.log('Usage: node scripts/load-history.js <threadId> [--limit N]');
  process.exit(1);
}

let maxHistoricRuns = parseInt(process.env.AGENT_RUNNER_MAX_HISTORIC_RUNS) || 1000;
if (LIMIT_ARG === '--limit' && process.argv[4]) {
  maxHistoricRuns = parseInt(process.argv[4]) || maxHistoricRuns;
}
const transformErrors = process.env.AGENT_RUNNER_TRANSFORM_ERRORS === 'true';

async function main() {
  const pool = getPool();
  const runner = new PostgresAgentRunner({
    pool,
    maxHistoricRuns,
    transformErrors,
    debug: true,
  });

  console.log(`\n=== Load history for thread ${THREAD_ID} ===`);
  console.log(`maxHistoricRuns=${maxHistoricRuns} (env: ${process.env.AGENT_RUNNER_MAX_HISTORIC_RUNS || 'null'}) transformErrors=${transformErrors}\n`);

  try {
    // Step 1: getHistoricRuns (same as loadAndStreamHistory)
    const historicRuns = await runner.getHistoricRuns(THREAD_ID);
    console.log(`[1] getHistoricRuns: ${historicRuns.length} runs returned`);

    if (historicRuns.length === 0) {
      console.log('\n→ No runs returned. History would not load on connect.');
      console.log('  Check: roots with parent_run_id IS NULL, status completed/stopped, jsonb_array_length(events) > 0');
      return;
    }

    const roots = historicRuns.filter((r) => !r.parentRunId);
    const children = historicRuns.filter((r) => r.parentRunId);
    console.log(`    Roots: ${roots.length} | Children: ${children.length}`);

    // Step 2: filterAndCompleteRuns
    const completeRuns = runner.filterAndCompleteRuns(
      historicRuns,
      THREAD_ID,
      'load-history script',
      transformErrors
    );
    console.log(`[2] filterAndCompleteRuns: ${completeRuns.length} runs after filter`);

    // Step 3: Count events and inspect RUN_STARTED
    let totalEvents = 0;
    const eventTypeCounts = {};
    const runsWithEmptyEvents = [];
    const runStartedPreviews = [];
    for (const run of completeRuns) {
      const events = run.events || [];
      totalEvents += events.length;
      if (events.length === 0) runsWithEmptyEvents.push(run.runId);
      for (const e of events) {
        const t = e.type || 'unknown';
        eventTypeCounts[t] = (eventTypeCounts[t] || 0) + 1;
        if ((e.type === 'RUN_STARTED' || e.type === 'run_started') && e.input?.messages) {
          const msgs = e.input.messages;
          const last = msgs[msgs.length - 1];
          runStartedPreviews.push({
            runId: run.runId.slice(0, 12),
            msgCount: msgs.length,
            lastRole: last?.role,
            lastContentPreview: typeof last?.content === 'string' ? last.content.slice(0, 60) : '[object]',
          });
        }
      }
    }
    console.log(`[3] Total events: ${totalEvents}`);
    console.log('    Event type counts:', JSON.stringify(eventTypeCounts, null, 2));
    if (runsWithEmptyEvents.length > 0) {
      console.log(`    Runs with empty events: ${runsWithEmptyEvents.length}`);
    }
    if (runStartedPreviews.length > 0) {
      console.log('\n    RUN_STARTED input.messages preview (last msg per run):');
      runStartedPreviews.slice(0, 10).forEach((p, i) => {
        console.log(`      ${i + 1}. ${p.runId}... | ${p.msgCount} msgs | last: ${p.lastRole} | "${p.lastContentPreview}${p.lastContentPreview?.length >= 60 ? '...' : ''}"`);
      });
      if (runStartedPreviews.length > 10) {
        console.log(`      ... and ${runStartedPreviews.length - 10} more`);
      }
    }

    // Step 4: getDeletedMessageIds
    const deletedMessageIds = await runner.getDeletedMessageIds(THREAD_ID);
    console.log(`[4] Deleted message IDs: ${deletedMessageIds.size}`);

    // Summary
    const hasRunStarted = Object.keys(eventTypeCounts).some((k) =>
      k.includes('RUN_STARTED') || k === 'run_started'
    );
    const hasTextMessage = Object.keys(eventTypeCounts).some((k) =>
      k.includes('TEXT_MESSAGE') || k === 'text_message_start'
    );
    console.log('\n--- Summary ---');
    console.log(`Runs: ${completeRuns.length} | Events: ${totalEvents}`);
    console.log(`Has RUN_STARTED: ${hasRunStarted} | Has TEXT_MESSAGE: ${hasTextMessage}`);
    console.log(`Would stream to client: ${totalEvents > 0 ? 'YES' : 'NO'}`);
    if (totalEvents > 0 && !hasTextMessage) {
      console.log('\n⚠️  No TEXT_MESSAGE events - history may appear empty in UI.');
      console.log('   Try increasing maxHistoricRuns (e.g. node scripts/load-history.js <threadId> --limit 50)');
    }
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
