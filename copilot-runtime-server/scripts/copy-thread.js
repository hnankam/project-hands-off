#!/usr/bin/env node
/**
 * Copy all agent runs and messages from a source thread to a new thread ID.
 * Preserves run hierarchy, message order, and event structure.
 * Uses suffix "-bk" for run_id and message_id to avoid UNIQUE constraint violations.
 *
 * Usage:
 *   node scripts/copy-thread.js <sourceThreadId> <targetThreadId>
 *
 * Example:
 *   node scripts/copy-thread.js session-1773712504688 session-1773712504688-original
 *
 * Run from copilot-runtime-server directory.
 */

import { config } from 'dotenv';
import { getPool, closePool } from '../config/database.js';

config();

const SOURCE_THREAD = process.argv[2];
const TARGET_THREAD = process.argv[3];
const SUFFIX = '-bk';

if (!SOURCE_THREAD || !TARGET_THREAD) {
  console.log(`
Usage:
  node scripts/copy-thread.js <sourceThreadId> <targetThreadId>

Example:
  node scripts/copy-thread.js session-1773712504688 session-1773712504688-original
`);
  process.exit(1);
}

function mapId(oldId) {
  if (!oldId) return null;
  return oldId.length + SUFFIX.length <= 255 ? oldId + SUFFIX : oldId.slice(0, 255 - SUFFIX.length) + SUFFIX;
}

/**
 * Recursively replace run_id and message_id values in a JSON structure.
 */
function replaceIdsInValue(val, runIdMap, messageIdMap) {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') {
    return runIdMap.get(val) ?? messageIdMap.get(val) ?? val;
  }
  if (Array.isArray(val)) {
    return val.map((item) => replaceIdsInValue(item, runIdMap, messageIdMap));
  }
  if (typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = replaceIdsInValue(v, runIdMap, messageIdMap);
    }
    return out;
  }
  return val;
}

async function main() {
  const pool = getPool();

  try {
    // 1. Fetch source thread
    const threadResult = await pool.query(
      `SELECT thread_id, organization_id, team_id, user_id, session_id, agent_id, agent_type, model_type, created_at
       FROM agent_threads WHERE thread_id = $1`,
      [SOURCE_THREAD]
    );
    if (threadResult.rows.length === 0) {
      console.error(`Thread ${SOURCE_THREAD} not found.`);
      process.exit(1);
    }
    const thread = threadResult.rows[0];

    // 2. Fetch all runs (ordered by created_at for correct parent-before-child insert)
    const runsResult = await pool.query(
      `SELECT run_id, parent_run_id, status, events, created_at, completed_at
       FROM agent_runs
       WHERE thread_id = $1
       ORDER BY created_at ASC`,
      [SOURCE_THREAD]
    );
    const runs = runsResult.rows;

    // 3. Fetch all messages
    const messagesResult = await pool.query(
      `SELECT message_id, run_id, role, content, metadata, created_at, updated_at
       FROM agent_messages
       WHERE thread_id = $1
       ORDER BY created_at ASC`,
      [SOURCE_THREAD]
    );
    const messages = messagesResult.rows;

    // 4. Fetch deleted messages if any
    const deletedResult = await pool.query(
      `SELECT message_id FROM agent_deleted_messages WHERE thread_id = $1`,
      [SOURCE_THREAD]
    );
    const deletedMessageIds = new Set(deletedResult.rows.map((r) => r.message_id));

    console.log(`\n=== Copy thread ${SOURCE_THREAD} -> ${TARGET_THREAD} ===`);
    console.log(`Runs: ${runs.length}, Messages: ${messages.length}, Deleted: ${deletedMessageIds.size}`);

    if (runs.length === 0) {
      console.log('No runs to copy.');
      await closePool();
      return;
    }

    // 5. Build ID mappings
    const runIdMap = new Map();
    const messageIdMap = new Map();
    for (const r of runs) {
      runIdMap.set(r.run_id, mapId(r.run_id));
      if (r.parent_run_id) runIdMap.set(r.parent_run_id, mapId(r.parent_run_id));
    }
    for (const m of messages) {
      messageIdMap.set(m.message_id, mapId(m.message_id));
    }
    for (const mid of deletedMessageIds) {
      messageIdMap.set(mid, mapId(mid));
    }

    // 6. Insert target thread (without is_running, current_run_id - backup is static)
    await pool.query(
      `INSERT INTO agent_threads
       (thread_id, organization_id, team_id, user_id, session_id, agent_id, agent_type, model_type, is_running, current_run_id, created_at, updated_at, last_accessed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, NULL, $9, NOW(), NOW())
       ON CONFLICT (thread_id) DO UPDATE SET
         organization_id = EXCLUDED.organization_id,
         team_id = EXCLUDED.team_id,
         user_id = EXCLUDED.user_id,
         updated_at = NOW()`,
      [
        TARGET_THREAD,
        thread.organization_id,
        thread.team_id,
        thread.user_id,
        thread.session_id,
        thread.agent_id,
        thread.agent_type,
        thread.model_type,
        thread.created_at,
      ]
    );
    console.log('Inserted agent_threads');

    // 7. Insert runs (in created_at order; parent_run_id uses mapped IDs)
    for (const r of runs) {
      const newRunId = runIdMap.get(r.run_id);
      const newParentRunId = r.parent_run_id ? runIdMap.get(r.parent_run_id) : null;
      const eventsReplaced = replaceIdsInValue(r.events, runIdMap, messageIdMap);

      await pool.query(
        `INSERT INTO agent_runs (run_id, thread_id, parent_run_id, status, events, created_at, completed_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
        [
          newRunId,
          TARGET_THREAD,
          newParentRunId,
          r.status,
          JSON.stringify(eventsReplaced),
          r.created_at,
          r.completed_at,
        ]
      );
    }
    console.log(`Inserted ${runs.length} agent_runs`);

    // 8. Insert messages
    for (const m of messages) {
      const newMessageId = messageIdMap.get(m.message_id);
      const newRunId = m.run_id ? runIdMap.get(m.run_id) : null;

      await pool.query(
        `INSERT INTO agent_messages (message_id, thread_id, run_id, role, content, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (message_id) DO UPDATE SET
           thread_id = EXCLUDED.thread_id,
           run_id = EXCLUDED.run_id,
           content = EXCLUDED.content,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`,
        [
          newMessageId,
          TARGET_THREAD,
          newRunId,
          m.role,
          m.content,
          JSON.stringify(m.metadata || {}),
          m.created_at,
          m.updated_at,
        ]
      );
    }
    console.log(`Inserted ${messages.length} agent_messages`);

    // 9. Insert deleted messages for target thread (mapped message_ids)
    for (const mid of deletedMessageIds) {
      const newMid = messageIdMap.get(mid);
      await pool.query(
        `INSERT INTO agent_deleted_messages (thread_id, message_id, deleted_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (thread_id, message_id) DO NOTHING`,
        [TARGET_THREAD, newMid]
      );
    }
    if (deletedMessageIds.size > 0) {
      console.log(`Inserted ${deletedMessageIds.size} agent_deleted_messages`);
    }

    console.log(`\nDone. Backup thread: ${TARGET_THREAD}`);
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
