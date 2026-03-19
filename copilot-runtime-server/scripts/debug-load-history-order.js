#!/usr/bin/env node
/**
 * Debug script for message ordering issues in loaded history.
 *
 * Reproduces the full loadAndStreamHistory pipeline and outputs:
 * - Event sequence (index, type, runId, messageId, timestamps)
 * - RUN_STARTED input.messages per run (role, id, content preview)
 * - Simulated message order (as eventsToMessages would produce)
 * - JSON dump for inspection
 *
 * Usage:
 *   node scripts/debug-load-history-order.js <threadId> [--limit N] [--output file.json]
 *
 * Run from copilot-runtime-server directory.
 */

import { config } from 'dotenv';
import { ReplaySubject } from 'rxjs';
import { getPool, closePool } from '../config/database.js';
import { PostgresAgentRunner } from '../runners/postgres-agent-runner.js';

config();

const THREAD_ID = process.argv[2];
const args = process.argv.slice(3);
let maxHistoricRuns = parseInt(process.env.AGENT_RUNNER_MAX_HISTORIC_RUNS) || 1000;
let outputFile = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit' && args[i + 1]) {
    maxHistoricRuns = parseInt(args[i + 1]) || maxHistoricRuns;
    i++;
  } else if (args[i] === '--output' && args[i + 1]) {
    outputFile = args[i + 1];
    i++;
  }
}

if (!THREAD_ID) {
  console.log('Usage: node scripts/debug-load-history-order.js <threadId> [--limit N] [--output file.json]');
  process.exit(1);
}

const transformErrors = process.env.AGENT_RUNNER_TRANSFORM_ERRORS === 'true';

/** Simulate eventsToMessages from useLoadMoreHistory - produces message order as UI would */
function eventsToMessages(events) {
  const messages = [];
  const messageMap = new Map();

  for (const event of events) {
    const type = event.type;

    if (type === 'RUN_STARTED') {
      const inputMessages = event.input?.messages ?? [];
      for (const msg of inputMessages) {
        if (msg?.id && !messageMap.has(msg.id)) {
          messageMap.set(msg.id, msg);
          messages.push(msg);
        }
      }
      continue;
    }

    if (type === 'TEXT_MESSAGE_START') {
      const messageId = event.messageId;
      const role = event.role || 'assistant';
      if (messageId && !messageMap.has(messageId)) {
        const msg = { id: messageId, role, content: '' };
        messageMap.set(messageId, msg);
        messages.push(msg);
      }
      continue;
    }

    if (type === 'TEXT_MESSAGE_CONTENT') {
      const messageId = event.messageId;
      const delta = event.delta || '';
      const msg = messageMap.get(messageId);
      if (msg) {
        msg.content = (msg.content || '') + delta;
      }
      continue;
    }

    if (type === 'TOOL_CALL_START') {
      const toolCallId = event.toolCallId;
      const toolCallName = event.toolCallName;
      const parentMessageId = event.parentMessageId;
      let assistantMsg = messages.length > 0 ? messages[messages.length - 1] : null;
      if (parentMessageId && messageMap.has(parentMessageId)) {
        assistantMsg = messageMap.get(parentMessageId);
      } else if (!assistantMsg || assistantMsg.role !== 'assistant') {
        assistantMsg = { id: parentMessageId || toolCallId, role: 'assistant', toolCalls: [] };
        messageMap.set(assistantMsg.id, assistantMsg);
        messages.push(assistantMsg);
      }
      assistantMsg.toolCalls = assistantMsg.toolCalls || [];
      assistantMsg.toolCalls.push({ id: toolCallId, type: 'function', function: { name: toolCallName, arguments: '' } });
      continue;
    }

    if (type === 'TOOL_CALL_ARGS') {
      const toolCallId = event.toolCallId;
      const delta = event.delta || '';
      for (const msg of messages) {
        const tc = msg.toolCalls;
        if (tc) {
          const t = tc.find((c) => c.id === toolCallId);
          if (t) {
            t.function.arguments = (t.function.arguments || '') + delta;
            break;
          }
        }
      }
      continue;
    }

    if (type === 'TOOL_CALL_RESULT') {
      const messageId = event.messageId;
      const content = event.content ?? event.result ?? '';
      const role = event.role || 'tool';
      if (messageId && !messageMap.has(messageId)) {
        const msg = { id: messageId, role, toolCallId: event.toolCallId, content };
        messageMap.set(messageId, msg);
        messages.push(msg);
      }
      continue;
    }
  }

  return messages;
}

function contentPreview(content, maxLen = 80) {
  if (content == null) return '[null]';
  const s = typeof content === 'string' ? content : JSON.stringify(content);
  return s.length > maxLen ? s.slice(0, maxLen) + '...' : s;
}

async function main() {
  const pool = getPool();
  const runner = new PostgresAgentRunner({
    pool,
    maxHistoricRuns,
    transformErrors,
    debug: false, // Reduce noise for debug output
  });

  console.log(`\n=== Debug load history order for thread ${THREAD_ID} ===`);
  console.log(`maxHistoricRuns=${maxHistoricRuns} transformErrors=${transformErrors}\n`);

  const collectedEvents = [];
  const connectionSubject = new ReplaySubject(Infinity);
  connectionSubject.subscribe({
    next: (evt) => collectedEvents.push(evt),
    error: (err) => console.error('Stream error:', err),
    complete: () => {},
  });

  try {
    await runner.loadAndStreamHistory(THREAD_ID, connectionSubject);
    connectionSubject.complete();
  } catch (err) {
    console.error('loadAndStreamHistory failed:', err);
    await closePool();
    process.exit(1);
  }

  console.log(`[1] Collected ${collectedEvents.length} events from loadAndStreamHistory\n`);

  // Build runId -> createdAt map from DB for ordering context
  const historicRuns = await runner.getHistoricRuns(THREAD_ID);
  const runIdToCreatedAt = new Map();
  for (const r of historicRuns) {
    runIdToCreatedAt.set(r.runId, r.createdAt);
  }

  // Event sequence table
  console.log('--- EVENT SEQUENCE (order as streamed to client) ---\n');
  const eventRows = [];
  for (let i = 0; i < collectedEvents.length; i++) {
    const e = collectedEvents[i];
    const type = e.type || 'unknown';
    const runId = (e.runId || '').slice(0, 12);
    const createdAt = runIdToCreatedAt.get(e.runId);
    const row = {
      idx: i,
      type,
      runId: runId || '-',
      createdAt: createdAt != null ? new Date(createdAt).toISOString() : '-',
      messageId: (e.messageId || '').slice(0, 12) || '-',
      toolCallId: (e.toolCallId || '').slice(0, 12) || '-',
    };

    if (type === 'RUN_STARTED' && e.input?.messages) {
      const msgs = e.input.messages;
      row.inputMsgCount = msgs.length;
      row.inputMessages = msgs.map((m, j) => ({
        j,
        id: (m?.id || '').slice(0, 12),
        role: m?.role || '?',
        contentPreview: contentPreview(m?.content, 50),
      }));
    }

    eventRows.push(row);
    const line = `  ${String(i).padStart(4)} | ${type.padEnd(22)} | run=${runId} | msgId=${row.messageId} | ${row.createdAt}`;
    console.log(line);
    if (row.inputMessages) {
      for (const m of row.inputMessages) {
        console.log(`       └ input[${m.j}] ${m.role} id=${m.id} "${m.contentPreview}"`);
      }
    }
  }

  // Simulated message order
  const messages = eventsToMessages(collectedEvents);
  console.log('\n--- SIMULATED MESSAGE ORDER (eventsToMessages) ---\n');
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const content = contentPreview(m.content, 60);
    console.log(`  ${String(i).padStart(3)} | ${(m.role || '?').padEnd(9)} | id=${(m.id || '').slice(0, 12)} | ${content}`);
  }

  // Check for ordering anomalies: user messages that appear after assistant messages they should precede
  console.log('\n--- ORDERING ANALYSIS ---\n');
  const userIndices = [];
  const assistantIndices = [];
  for (let i = 0; i < messages.length; i++) {
    const r = messages[i].role;
    if (r === 'user') userIndices.push(i);
    else if (r === 'assistant') assistantIndices.push(i);
  }

  if (userIndices.length > 0 && assistantIndices.length > 0) {
    const lastUserIdx = Math.max(...userIndices);
    const firstAssistantAfterLastUser = assistantIndices.find((a) => a > lastUserIdx);
    if (firstAssistantAfterLastUser != null) {
      const userMsg = messages[lastUserIdx];
      const assistMsg = messages[firstAssistantAfterLastUser];
      console.log(`  Last user message at index ${lastUserIdx}: "${contentPreview(userMsg.content, 50)}"`);
      console.log(`  Assistant message after it at index ${firstAssistantAfterLastUser}: "${contentPreview(assistMsg.content, 50)}"`);
      console.log('  → This ordering is expected (user then assistant).');
    }

    // Flag: any user message that comes after an assistant message when it should precede?
    for (const ui of userIndices) {
      const userContent = contentPreview(messages[ui].content, 40);
      const assistantsBefore = assistantIndices.filter((a) => a < ui);
      if (assistantsBefore.length > 0) {
        console.log(`\n  ⚠️  User msg at index ${ui} ("${userContent}") has ${assistantsBefore.length} assistant msg(s) BEFORE it.`);
        console.log('      If this user message triggered those assistants, order may be wrong.');
      }
    }
  }

  // JSON output
  const debugOutput = {
    threadId: THREAD_ID,
    eventCount: collectedEvents.length,
    messageCount: messages.length,
    eventSequence: eventRows,
    messageOrder: messages.map((m) => ({
      id: m.id,
      role: m.role,
      contentPreview: contentPreview(m.content, 100),
    })),
    runs: historicRuns.map((r) => ({
      runId: r.runId.slice(0, 12),
      parentRunId: r.parentRunId?.slice(0, 12) ?? null,
      createdAt: new Date(r.createdAt).toISOString(),
      eventCount: (r.events || []).length,
    })),
  };

  if (outputFile) {
    const fs = await import('fs');
    fs.writeFileSync(outputFile, JSON.stringify(debugOutput, null, 2), 'utf8');
    console.log(`\n  JSON written to ${outputFile}`);
  }

  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
