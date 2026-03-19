#!/usr/bin/env node
/**
 * Diagnose why tool-call-only assistant messages don't render between consecutive user messages.
 *
 * For each run in a session this script answers:
 *   1. What event types are present (TEXT_MESSAGE_START? TOOL_CALL_START? TOOL_CALL_RESULT?)
 *   2. For every TOOL_CALL_START – does a matching TOOL_CALL_RESULT exist?
 *   3. What does buildDeletedToolCallIds mark as filtered (incomplete / deleted)?
 *   4. What does the RUN_STARTED input.messages look like for this run?
 *   5. After stripping (oldest run keeps full input, rest stripped to last msg) – what survives?
 *
 * Usage (from copilot-runtime-server/):
 *   node scripts/debug-tool-call-history.js session-1773704032333
 */

import { config } from 'dotenv';
import { getPool, closePool } from '../config/database.js';

config();

const SESSION_ID = process.argv[2] || 'session-1773704032333';
const HISTORY_WINDOW = parseInt(process.argv[3] || '10', 10); // runs to include in initial load

function truncate(str, len = 100) {
  if (str == null) return '(null)';
  const s = String(str);
  return s.length > len ? s.slice(0, len) + '…' : s;
}

function eventSummary(events) {
  const counts = {};
  for (const e of events) {
    counts[e.type] = (counts[e.type] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([k, v]) => `${k}×${v}`)
    .join('  ');
}

async function main() {
  const pool = getPool();

  // ── Find thread ──────────────────────────────────────────────────────────────
  let threadResult = await pool.query(
    `SELECT thread_id FROM agent_threads WHERE session_id = $1 ORDER BY created_at ASC`,
    [SESSION_ID]
  );
  if (threadResult.rows.length === 0) {
    threadResult = await pool.query(
      `SELECT thread_id FROM agent_threads WHERE thread_id = $1 ORDER BY created_at ASC`,
      [SESSION_ID]
    );
    if (threadResult.rows.length > 0) console.log('(matched as thread_id directly)');
  }

  if (threadResult.rows.length === 0) {
    console.error(`No thread found for session: ${SESSION_ID}`);
    await closePool();
    return;
  }

  const threadId = threadResult.rows[0].thread_id;
  console.log(`\nSession : ${SESSION_ID}`);
  console.log(`Thread  : ${threadId}`);

  // ── Fetch all complete runs ordered by creation time ─────────────────────────
  const runsResult = await pool.query(
    `SELECT run_id, parent_run_id, status, created_at, events
     FROM agent_runs
     WHERE thread_id = $1 AND status IN ('completed','stopped','error')
     ORDER BY created_at ASC`,
    [threadId]
  );

  const allRuns = runsResult.rows.map((r) => ({
    runId: r.run_id,
    parentRunId: r.parent_run_id,
    status: r.status,
    createdAt: r.created_at,
    events: Array.isArray(r.events) ? r.events : [],
  }));

  const rootRuns = allRuns.filter((r) => !r.parentRunId);
  console.log(`\nAll complete runs: ${allRuns.length}  (root: ${rootRuns.length})\n`);

  // ── Deleted message IDs ───────────────────────────────────────────────────────
  const delResult = await pool.query(
    `SELECT message_id FROM agent_deleted_messages WHERE thread_id = $1`,
    [threadId]
  );
  const deletedMessageIds = new Set(delResult.rows.map((r) => r.message_id));
  console.log(`Deleted message IDs: ${deletedMessageIds.size}`);

  // ── Per-run analysis ──────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(80));
  console.log('PER-RUN ANALYSIS');
  console.log('═'.repeat(80));

  for (let ri = 0; ri < allRuns.length; ri++) {
    const run = allRuns[ri];
    const events = run.events;

    // Event type overview
    const hasText = events.some((e) => e.type === 'TEXT_MESSAGE_START' || e.type === 'TEXT_MESSAGE_CONTENT');
    const toolCallStarts = events.filter((e) => e.type === 'TOOL_CALL_START');
    const toolCallResults = events.filter((e) => e.type === 'TOOL_CALL_RESULT');
    const runStarted = events.find((e) => e.type === 'RUN_STARTED');
    const inputMessages = runStarted?.input?.messages ?? [];

    console.log(`\n[${ri + 1}/${allRuns.length}] Run: ${run.runId}`);
    console.log(`  status: ${run.status}  parent: ${run.parentRunId || 'none'}  created: ${run.createdAt?.toISOString()}`);
    console.log(`  events: ${eventSummary(events)}`);
    console.log(`  hasText: ${hasText}   toolCallStarts: ${toolCallStarts.length}   toolCallResults: ${toolCallResults.length}`);

    // Input messages
    console.log(`  RUN_STARTED input.messages (${inputMessages.length}):`);
    for (const msg of inputMessages) {
      const content = Array.isArray(msg.content)
        ? msg.content.map((c) => c?.text || c?.type || '').join(' ')
        : msg.content;
      const tcLen = Array.isArray(msg.toolCalls) ? msg.toolCalls.length : 0;
      console.log(`    role=${msg.role}  id=${(msg.id || 'n/a').slice(0, 20)}…  toolCalls=${tcLen}  content="${truncate(content, 60)}"`);
    }

    // Tool call detail
    if (toolCallStarts.length > 0) {
      const resultMap = new Map(toolCallResults.map((e) => [e.toolCallId, e]));
      console.log(`  Tool calls:`);
      for (const tc of toolCallStarts) {
        const result = resultMap.get(tc.toolCallId);
        const hasResult = !!result;
        const resultMsgDeleted = result?.messageId && deletedMessageIds.has(result.messageId);
        const parentMsgId = tc.parentMessageId || '(none)';
        console.log(
          `    toolCallId=${tc.toolCallId?.slice(0, 16)}…  name=${tc.toolCallName || '?'}` +
          `  parentMsgId=${parentMsgId.slice(0, 20)}…  hasResult=${hasResult}  resultMsgDeleted=${resultMsgDeleted}`
        );
      }
    }
  }

  // ── Simulate buildDeletedToolCallIds ─────────────────────────────────────────
  console.log('\n' + '═'.repeat(80));
  console.log('SIMULATED buildDeletedToolCallIds (filterIncomplete=true)');
  console.log('═'.repeat(80));

  // Build toolCallIdToMessageId (matches server logic)
  const toolCallIdToMessageId = new Map();
  for (const run of allRuns) {
    const events = run.events;
    const runStarted = events.find((e) => e.type === 'RUN_STARTED');
    const inputMessages = runStarted?.input?.messages ?? [];
    let runInitiatingMessageId = null;
    if (inputMessages.length > 0) {
      runInitiatingMessageId = inputMessages[inputMessages.length - 1].id;
    }
    if (!runInitiatingMessageId) {
      const textStart = events.find((e) => e.type === 'TEXT_MESSAGE_START' && e.messageId);
      if (textStart) runInitiatingMessageId = textStart.messageId;
    }

    for (const event of events) {
      if (event.type === 'TOOL_CALL_START' && event.toolCallId) {
        if (runInitiatingMessageId) {
          toolCallIdToMessageId.set(event.toolCallId, runInitiatingMessageId);
        }
      }
      if (event.type === 'TOOL_CALL_RESULT' && event.toolCallId && event.messageId) {
        if (!toolCallIdToMessageId.has(event.toolCallId)) {
          toolCallIdToMessageId.set(event.toolCallId, event.messageId);
        }
      }
    }
  }

  // Build toolCallIdToResultMessageId
  const toolCallIdToResultMessageId = new Map();
  for (const run of allRuns) {
    for (const event of run.events) {
      if (event.type === 'TOOL_CALL_RESULT' && event.toolCallId && event.messageId) {
        toolCallIdToResultMessageId.set(event.toolCallId, event.messageId);
      }
    }
  }

  // Compute filtered set (filterIncomplete=false — matches the fix applied to the server)
  const filteredToolCallIds = new Set();
  for (const [toolCallId, messageId] of toolCallIdToMessageId.entries()) {
    if (deletedMessageIds.has(messageId)) {
      filteredToolCallIds.add(toolCallId); // initiating message deleted
    }
  }
  for (const [toolCallId] of toolCallIdToMessageId.entries()) {
    if (toolCallIdToResultMessageId.has(toolCallId)) {
      const resultMsgId = toolCallIdToResultMessageId.get(toolCallId);
      if (resultMsgId && deletedMessageIds.has(resultMsgId)) {
        filteredToolCallIds.add(toolCallId); // result message deleted
      }
    }
    // NOTE: incomplete tool calls (no TOOL_CALL_RESULT) are NOT filtered
    // because frontend tools (searchPageContent etc.) never persist their results
  }

  console.log(`\nTotal TOOL_CALL_START events across all runs: ${toolCallIdToMessageId.size}`);
  console.log(`Tool calls WITH TOOL_CALL_RESULT             : ${toolCallIdToResultMessageId.size}`);
  console.log(`Tool calls WITHOUT TOOL_CALL_RESULT (incomplete): ${[...toolCallIdToMessageId.keys()].filter(id => !toolCallIdToResultMessageId.has(id)).length}`);
  console.log(`FILTERED tool call IDs (would be deleted)    : ${filteredToolCallIds.size}`);

  if (filteredToolCallIds.size > 0) {
    console.log('\nFiltered tool calls:');
    for (const id of filteredToolCallIds) {
      const initiatingMsg = toolCallIdToMessageId.get(id);
      const hasResult = toolCallIdToResultMessageId.has(id);
      const reason = deletedMessageIds.has(initiatingMsg || '')
        ? 'initiating-msg-deleted'
        : !hasResult
        ? 'incomplete (no TOOL_CALL_RESULT)'
        : 'result-msg-deleted';
      console.log(`  ${id?.slice(0, 20)}…  reason: ${reason}  initiating: ${(initiatingMsg || 'n/a').slice(0, 20)}…`);
    }
  }

  // ── Simulate loadAndStreamHistory window ─────────────────────────────────────
  console.log('\n' + '═'.repeat(80));
  console.log(`SIMULATED loadAndStreamHistory (window of last ${HISTORY_WINDOW} root runs)`);
  console.log('═'.repeat(80));

  const windowRuns = rootRuns.slice(-HISTORY_WINDOW);
  const oldestRunId = windowRuns[0]?.runId;
  console.log(`\nOldest run in window (keeps full input): ${oldestRunId}`);
  console.log(`Runs in window: ${windowRuns.length}\n`);

  for (let wi = 0; wi < windowRuns.length; wi++) {
    const run = windowRuns[wi];
    const events = run.events;
    const runStarted = events.find((e) => e.type === 'RUN_STARTED');
    const inputMessages = runStarted?.input?.messages ?? [];

    const toolStarts = events.filter((e) => e.type === 'TOOL_CALL_START');
    const notFilteredToolStarts = toolStarts.filter((e) => !filteredToolCallIds.has(e.toolCallId));
    const hasText = events.some((e) => e.type === 'TEXT_MESSAGE_START' || e.type === 'TEXT_MESSAGE_CONTENT');

    const isOldest = run.runId === oldestRunId;
    const msgsAfterStrip = isOldest
      ? inputMessages
      : inputMessages.length > 1
      ? [inputMessages[inputMessages.length - 1]]
      : inputMessages;

    console.log(`  [${wi + 1}] ${run.runId.slice(0, 16)}…`);
    console.log(`    oldest=${isOldest}  hasText=${hasText}  toolStarts=${toolStarts.length}  NOT-filtered=${notFilteredToolStarts.length}`);
    console.log(`    input msgs after strip (${msgsAfterStrip.length}):`);
    for (const msg of msgsAfterStrip) {
      const content = Array.isArray(msg.content)
        ? msg.content.map((c) => c?.text || c?.type || '').join(' ')
        : msg.content;
      const tcLen = Array.isArray(msg.toolCalls) ? msg.toolCalls.length : 0;
      console.log(`      role=${msg.role}  id=${(msg.id || '').slice(0, 20)}…  toolCalls=${tcLen}  content="${truncate(content, 50)}"`);
    }

    if (notFilteredToolStarts.length > 0) {
      console.log(`    Non-filtered tool calls that WILL emit TOOL_CALL_START:`);
      for (const tc of notFilteredToolStarts) {
        console.log(`      ${tc.toolCallName || '?'}  id=${tc.toolCallId?.slice(0, 16)}…  parentMsgId=${(tc.parentMessageId || 'none').slice(0, 20)}…`);
      }
    } else if (toolStarts.length > 0) {
      console.log(`    ⚠️  ALL ${toolStarts.length} tool call(s) are FILTERED OUT – assistant msg will have empty toolCalls!`);
    }
  }

  // ── Summary of what the frontend will receive ─────────────────────────────────
  console.log('\n' + '═'.repeat(80));
  console.log('FRONTEND MESSAGE RECONSTRUCTION (what AG-UI state will look like)');
  console.log('═'.repeat(80));
  console.log('\nMessages created from RUN_STARTED input (after strip+dedup):');

  const seenIds = new Set();
  const reconstructedMessages = [];

  for (const run of windowRuns) {
    const events = run.events;
    const runStarted = events.find((e) => e.type === 'RUN_STARTED');
    const inputMessages = runStarted?.input?.messages ?? [];
    const isOldest = run.runId === oldestRunId;
    const msgsToUse = isOldest
      ? inputMessages
      : inputMessages.length > 1
      ? [inputMessages[inputMessages.length - 1]]
      : inputMessages;

    for (const msg of msgsToUse) {
      if (msg.id && !seenIds.has(msg.id)) {
        seenIds.add(msg.id);
        reconstructedMessages.push({ ...msg, _source: 'input' });
      }
    }

    // Add assistant messages from non-filtered TOOL_CALL_START events
    const toolStarts = events.filter((e) => e.type === 'TOOL_CALL_START' && !filteredToolCallIds.has(e.toolCallId));
    for (const tc of toolStarts) {
      const parentId = tc.parentMessageId || tc.toolCallId;
      if (!seenIds.has(parentId)) {
        seenIds.add(parentId);
        reconstructedMessages.push({
          id: parentId,
          role: 'assistant',
          content: null,
          toolCalls: [tc.toolCallId],
          _source: 'tool_call_start',
        });
      }
    }
  }

  let prevRole = null;
  for (const msg of reconstructedMessages) {
    const gap = prevRole === 'user' && msg.role === 'user' ? ' ← ⚠️  CONSECUTIVE USER MSGS (no assistant between)' : '';
    const tcLen = Array.isArray(msg.toolCalls) ? msg.toolCalls.length : 0;
    console.log(
      `  ${msg.role.padEnd(10)} id=${(msg.id || '').slice(0, 20)}…  toolCalls=${tcLen}  src=${msg._source}${gap}`
    );
    prevRole = msg.role;
  }

  console.log('\n' + '═'.repeat(80));
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
