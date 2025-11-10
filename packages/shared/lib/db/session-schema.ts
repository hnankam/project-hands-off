/**
 * SurrealDB Schema for Session Storage
 * 
 * Separates session metadata from message data to avoid massive writes
 * on simple operations like switching active sessions.
 */

import type { DBWorkerClient } from './db-worker-client.js';

// Debug logging
const DEBUG = true;
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const log = (...args: any[]) => DEBUG && console.log(ts(), ...args);

/**
 * Initialize session storage schema in SurrealDB
 */
export async function initializeSessionSchema(worker: DBWorkerClient): Promise<void> {
  log('[SessionSchema] Initializing session storage schema...');

  try {
    await worker.query(`
      -- Session Metadata Table (lightweight, frequently updated)
      DEFINE TABLE IF NOT EXISTS session_metadata SCHEMALESS;
      DEFINE FIELD IF NOT EXISTS id ON session_metadata TYPE string;
      DEFINE FIELD IF NOT EXISTS title ON session_metadata TYPE string;
      DEFINE FIELD IF NOT EXISTS timestamp ON session_metadata TYPE number;
      DEFINE FIELD IF NOT EXISTS createdAt ON session_metadata TYPE number;
      DEFINE FIELD IF NOT EXISTS userId ON session_metadata TYPE string;
      DEFINE FIELD IF NOT EXISTS isActive ON session_metadata TYPE bool;
      DEFINE FIELD IF NOT EXISTS isOpen ON session_metadata TYPE bool;
      DEFINE FIELD IF NOT EXISTS sessionId ON session_metadata TYPE string;
      DEFINE FIELD IF NOT EXISTS selectedAgent ON session_metadata TYPE option<string>;
      DEFINE FIELD IF NOT EXISTS selectedModel ON session_metadata TYPE option<string>;
      DEFINE INDEX IF NOT EXISTS idx_session_sessionId ON session_metadata FIELDS sessionId;
      DEFINE INDEX IF NOT EXISTS idx_session_userId ON session_metadata FIELDS userId;
      DEFINE INDEX IF NOT EXISTS idx_session_active ON session_metadata FIELDS isActive;
      DEFINE INDEX IF NOT EXISTS idx_session_open ON session_metadata FIELDS isOpen;
      DEFINE INDEX IF NOT EXISTS idx_session_timestamp ON session_metadata FIELDS timestamp;
      DEFINE INDEX IF NOT EXISTS idx_session_createdAt ON session_metadata FIELDS createdAt;

      -- Session Messages Table (heavy data, rarely accessed all at once)
      DEFINE TABLE IF NOT EXISTS session_messages SCHEMALESS;
      DEFINE FIELD IF NOT EXISTS sessionId ON session_messages TYPE string;
      DEFINE FIELD IF NOT EXISTS messages ON session_messages TYPE array;
      DEFINE INDEX IF NOT EXISTS idx_messages_session ON session_messages FIELDS sessionId;

      -- Session Usage Stats Table (separate from metadata for performance)
      DEFINE TABLE IF NOT EXISTS session_usage SCHEMALESS;
      DEFINE FIELD IF NOT EXISTS sessionId ON session_usage TYPE string;
      DEFINE FIELD IF NOT EXISTS request ON session_usage TYPE number;
      DEFINE FIELD IF NOT EXISTS response ON session_usage TYPE number;
      DEFINE FIELD IF NOT EXISTS total ON session_usage TYPE number;
      DEFINE FIELD IF NOT EXISTS requestCount ON session_usage TYPE number;
      DEFINE FIELD IF NOT EXISTS lastUsage ON session_usage TYPE option<object>;
      DEFINE INDEX IF NOT EXISTS idx_usage_session ON session_usage FIELDS sessionId;

      -- Session Agent Step State Table
      DEFINE TABLE IF NOT EXISTS session_agent_state SCHEMALESS;
      DEFINE FIELD IF NOT EXISTS sessionId ON session_agent_state TYPE string;
      DEFINE FIELD IF NOT EXISTS steps ON session_agent_state TYPE array;
      DEFINE INDEX IF NOT EXISTS idx_agent_state_session ON session_agent_state FIELDS sessionId;

      -- Current Session Tracker (single record table)
      DEFINE TABLE IF NOT EXISTS current_session SCHEMALESS;
      DEFINE FIELD IF NOT EXISTS sessionId ON current_session TYPE option<string>;
    `);

    // Clean up any legacy records that may have stored NULL in lastUsage
    await worker.query(`
      UPDATE session_usage SET lastUsage = NONE WHERE type::is::null(lastUsage);
    `);

    // Backfill sessionId for existing records if missing
    await worker.query(`
      UPDATE session_metadata SET sessionId = (
        IF type::is::object(id) THEN id.id ELSE id END
      ) WHERE sessionId = NONE;
    `);

    // Backfill createdAt for existing sessions using their current timestamp
    const sessionsWithoutCreatedAt = await worker.query<any[]>(`
      SELECT * FROM session_metadata WHERE createdAt = NONE;
    `);
    
    if (sessionsWithoutCreatedAt && sessionsWithoutCreatedAt[0]?.length > 0) {
      log('[SessionSchema] Backfilling createdAt for', sessionsWithoutCreatedAt[0].length, 'sessions...');
      for (const session of sessionsWithoutCreatedAt[0]) {
        const sessionId = typeof session.id === 'object' ? session.id.id : session.id;
        const createdAt = session.timestamp || Date.now();
        await worker.query(`
          UPDATE session_metadata SET createdAt = $createdAt WHERE sessionId = $sessionId;
        `, { sessionId, createdAt });
      }
      log('[SessionSchema] ✅ createdAt backfill completed');
    }

    // Migration: Delete sessions without userId (no backward compatibility)
    const sessionsWithoutUserId = await worker.query<any[]>(`
      SELECT * FROM session_metadata WHERE userId = NONE;
    `);
    
    if (sessionsWithoutUserId && sessionsWithoutUserId[0]?.length > 0) {
      log('[SessionSchema] ⚠️  Found', sessionsWithoutUserId[0].length, 'sessions without userId - deleting them (no backward compatibility)');
      await worker.query(`
        DELETE FROM session_metadata WHERE userId = NONE;
      `);
      log('[SessionSchema] ✅ Deleted sessions without userId');
    } else {
      log('[SessionSchema] ℹ️  No sessions without userId found');
    }
 
    log('[SessionSchema] ✅ Session storage schema initialized successfully');
  } catch (error) {
    console.error('[SessionSchema] ❌ Failed to initialize schema:', error);
    throw error;
  }
}

/**
 * Data types matching the old chrome.storage.local structure
 */
export interface SessionMetadata {
  id: string;
  title: string;
  timestamp: number; // Last updated timestamp
  createdAt: number; // Creation timestamp (used for ordering)
  userId: string; // User ID (required - all sessions must belong to a user)
  isActive: boolean;
  isOpen: boolean;
  selectedAgent?: string;
  selectedModel?: string;
}

export interface SessionMessages {
  sessionId: string;
  messages: any[]; // CopilotMessage[]
}

export interface SessionUsageLastRecord {
  requestTokens: number;
  responseTokens: number;
  totalTokens: number;
  timestamp?: string;
  agentType?: string;
  model?: string;
}

export interface SessionUsageStats {
  sessionId: string;
  request: number;
  response: number;
  total: number;
  requestCount: number;
  lastUsage?: SessionUsageLastRecord | null;
}

export interface SessionAgentState {
  sessionId: string;
  steps: Array<{
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'deleted';
  }>;
}

