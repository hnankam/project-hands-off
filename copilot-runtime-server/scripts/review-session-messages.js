#!/usr/bin/env node
/**
 * Review user messages and thread runs for a given session ID.
 * Usage: node scripts/review-session-messages.js [sessionId]
 *
 * Run from copilot-runtime-server: node scripts/review-session-messages.js session-1773877971331
 */

import { config } from 'dotenv';
import { getPool, closePool } from '../config/database.js';

config();

const SESSION_ID = process.argv[2] || 'session-1773877971331';

function truncate(str, len = 120) {
  if (!str) return '(empty)';
  const s = String(str);
  return s.length > len ? s.slice(0, len) + '…' : s;
}

async function main() {
  const pool = getPool();

  // 1. Find threads for this session — try session_id first, then thread_id
  let threadResult = await pool.query(
    `SELECT thread_id, user_id, is_running, created_at, updated_at, metadata
     FROM agent_threads WHERE session_id = $1 ORDER BY created_at ASC`,
    [SESSION_ID]
  );

  if (threadResult.rows.length === 0) {
    // Fallback: session value may be stored as the thread_id itself
    threadResult = await pool.query(
      `SELECT thread_id, user_id, is_running, created_at, updated_at, metadata
       FROM agent_threads WHERE thread_id = $1 ORDER BY created_at ASC`,
      [SESSION_ID]
    );
    if (threadResult.rows.length > 0) {
      console.log(`(Found as thread_id rather than session_id)`);
    }
  }

  console.log(`\n=== Session: ${SESSION_ID} ===`);
  console.log(`Threads found: ${threadResult.rows.length}`);

  if (threadResult.rows.length === 0) {
    console.log('No threads found for this session.');
    await closePool();
    return;
  }

  for (const thread of threadResult.rows) {
    const threadId = thread.thread_id;
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`Thread: ${threadId}`);
    console.log(
      `  user_id: ${thread.user_id}  is_running: ${thread.is_running}  created: ${thread.created_at?.toISOString()}`
    );
    if (thread.metadata?.title) console.log(`  title: ${thread.metadata.title}`);

    // 2. Run summary
    const runCount = await pool.query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE parent_run_id IS NULL) as roots,
         COUNT(*) FILTER (WHERE parent_run_id IS NOT NULL) as children,
         COUNT(*) FILTER (WHERE status = 'running') as running,
         COUNT(*) FILTER (WHERE status = 'completed') as completed,
         COUNT(*) FILTER (WHERE status = 'stopped') as stopped,
         COUNT(*) FILTER (WHERE status = 'error') as error_count
       FROM agent_runs WHERE thread_id = $1`,
      [threadId]
    );
    const rc = runCount.rows[0];
    console.log(
      `\nRuns: total=${rc.total}  roots=${rc.roots}  children=${rc.children}  running=${rc.running}  completed=${rc.completed}  stopped=${rc.stopped}  error=${rc.error_count}`
    );

    // 3. User messages from agent_messages table
    const msgResult = await pool.query(
      `SELECT message_id, run_id, role, content, created_at
       FROM agent_messages
       WHERE thread_id = $1 AND role = 'user'
       ORDER BY created_at ASC`,
      [threadId]
    );
    console.log(`\nUser messages in agent_messages: ${msgResult.rows.length}`);
    for (let i = 0; i < msgResult.rows.length; i++) {
      const m = msgResult.rows[i];
      console.log(
        `  [${i + 1}] ${m.created_at?.toISOString()} | run: ${(m.run_id || 'null').slice(0, 12)}… | ${truncate(m.content)}`
      );
    }

    // 4. User messages extracted from RUN_STARTED events (embedded in runs)
    const runsResult = await pool.query(
      `SELECT run_id, parent_run_id, status, created_at, events
       FROM agent_runs WHERE thread_id = $1 ORDER BY created_at ASC`,
      [threadId]
    );

    const userMsgsFromRuns = [];
    for (const run of runsResult.rows) {
      const events = Array.isArray(run.events) ? run.events : [];
      const runStarted = events.find((e) => e?.type === 'RUN_STARTED');
      if (!runStarted) continue;
      const inputMsgs = runStarted?.input?.messages || [];
      for (const msg of inputMsgs) {
        if (msg?.role === 'user') {
          const text = Array.isArray(msg.content)
            ? msg.content.map((c) => c?.text || '').join('')
            : msg.content || '';
          userMsgsFromRuns.push({
            runId: run.run_id,
            runCreatedAt: run.created_at,
            msgId: msg.id,
            text,
          });
        }
      }
    }

    // Deduplicate by msgId (same message appears in many RUN_STARTED inputs)
    const seenIds = new Set();
    const uniqueUserMsgs = [];
    for (const m of userMsgsFromRuns) {
      const key = m.msgId || m.text;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        uniqueUserMsgs.push(m);
      }
    }

    console.log(`\nUnique user messages from RUN_STARTED events: ${uniqueUserMsgs.length}`);
    for (let i = 0; i < uniqueUserMsgs.length; i++) {
      const m = uniqueUserMsgs[i];
      console.log(
        `  [${i + 1}] run: ${m.runId.slice(0, 12)}… | id: ${(m.msgId || 'n/a').slice(0, 12)}… | ${truncate(m.text)}`
      );
    }

    // 5. All runs with first user message from each RUN_STARTED
    console.log(`\nAll runs (${runsResult.rows.length}) with triggering user message:`);
    for (const run of runsResult.rows) {
      const events = Array.isArray(run.events) ? run.events : [];
      const runStarted = events.find((e) => e?.type === 'RUN_STARTED');
      const inputMsgs = runStarted?.input?.messages || [];
      const lastUserMsg = [...inputMsgs].reverse().find((m) => m?.role === 'user');
      const textMsgEvents = events.filter(
        (e) =>
          e?.type === 'TEXT_MESSAGE_START' ||
          e?.type === 'TEXT_MESSAGE_CONTENT' ||
          e?.type === 'TEXT_MESSAGE_END'
      );
      const hasAssistantReply = textMsgEvents.length > 0;

      const prefix = run.parent_run_id ? '    child' : 'root';
      console.log(
        `  ${prefix} | ${run.run_id.slice(0, 12)}… | ${run.status} | events: ${events.length} | ${run.created_at?.toISOString()}`
      );
      if (!run.parent_run_id) {
        if (lastUserMsg) {
          const text = Array.isArray(lastUserMsg.content)
            ? lastUserMsg.content.map((c) => c?.text || '').join('')
            : lastUserMsg.content || '';
          console.log(`         user msg: ${truncate(text, 100)}`);
        } else {
          console.log(`         (no user message in RUN_STARTED)`);
        }
      }
    }

    // 6. Deleted messages
    const deletedResult = await pool.query(
      `SELECT COUNT(*) as cnt FROM agent_deleted_messages WHERE thread_id = $1`,
      [threadId]
    );
    console.log(`\nDeleted messages tracked: ${deletedResult.rows[0].cnt}`);
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log('Done.');
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
