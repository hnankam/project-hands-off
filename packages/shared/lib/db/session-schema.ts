/**
 * SurrealDB Schema for Session Storage
 * 
 * Separates session metadata from message data to avoid massive writes
 * on simple operations like switching active sessions.
 */

import type { DBWorkerClient } from './db-worker-client.js';
import { debug } from '../utils/debug.js';

/**
 * Initialize session storage schema in SurrealDB
 */
export async function initializeSessionSchema(worker: DBWorkerClient): Promise<void> {
  debug.log('[SessionSchema] Initializing session storage schema...');

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
      DEFINE FIELD IF NOT EXISTS version ON session_messages TYPE number DEFAULT 0;
      DEFINE FIELD IF NOT EXISTS lastModified ON session_messages TYPE option<number>;
      DEFINE INDEX IF NOT EXISTS idx_messages_session ON session_messages FIELDS sessionId;
      DEFINE INDEX IF NOT EXISTS idx_messages_version ON session_messages FIELDS version;

      -- Session Usage Stats Table (separate from metadata for performance)
      DEFINE TABLE IF NOT EXISTS session_usage SCHEMALESS;
      DEFINE FIELD IF NOT EXISTS sessionId ON session_usage TYPE string;
      DEFINE FIELD IF NOT EXISTS request ON session_usage TYPE number;
      DEFINE FIELD IF NOT EXISTS response ON session_usage TYPE number;
      DEFINE FIELD IF NOT EXISTS total ON session_usage TYPE number;
      DEFINE FIELD IF NOT EXISTS requestCount ON session_usage TYPE number;
      DEFINE FIELD IF NOT EXISTS lastUsage ON session_usage TYPE option<object>;
      DEFINE INDEX IF NOT EXISTS idx_usage_session ON session_usage FIELDS sessionId;

      -- Session Agent State Table (includes plan steps and graph state)
      -- Note: graph field is intentionally not type-constrained to allow NULL values from legacy records
      -- The migration below converts NULL to NONE, but we keep it flexible to avoid race conditions
      DEFINE TABLE IF NOT EXISTS session_agent_state SCHEMALESS;
      DEFINE FIELD IF NOT EXISTS sessionId ON session_agent_state TYPE string;
      DEFINE FIELD IF NOT EXISTS steps ON session_agent_state TYPE array;
      DEFINE INDEX IF NOT EXISTS idx_agent_state_session ON session_agent_state FIELDS sessionId;

      -- Current Session Tracker (single record table)
      DEFINE TABLE IF NOT EXISTS current_session SCHEMALESS;
      DEFINE FIELD IF NOT EXISTS sessionId ON current_session TYPE option<string>;
    `);

    debug.log('[SessionSchema] Session storage schema initialized successfully');
  } catch (error) {
    debug.error('[SessionSchema] Failed to initialize schema:', error);
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
  planExpanded?: boolean; // Task progress card expanded state
}

export interface SessionMessages {
  sessionId: string;
  messages: any[]; // CopilotMessage[]
  version?: number; // Optimistic locking version
  lastModified?: number; // Last modification timestamp
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

/** Tool call info for graph steps */
export interface GraphToolCall {
  tool_name: string;
  args: string;
  result?: string;
  status: 'in_progress' | 'completed' | 'error';
  tool_call_id?: string;
}

/** Graph step representing a node execution in the multi-agent graph */
export interface GraphStep {
  node: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error' | 'cancelled' | 'waiting';
  result: string;
  prompt?: string;
  streaming_text?: string;
  tool_calls?: GraphToolCall[];
  timestamp: string;
}

/** Full graph state from backend */
export interface GraphState {
  query: string;
  original_query: string;
  result: string;
  query_type: string;
  execution_history: string[];
  intermediate_results: Record<string, string>;
  streaming_text: Record<string, string>;
  prompts: Record<string, string>;
  tool_calls: Record<string, GraphToolCall[]>;
  errors: Array<{ node?: string; error?: string; timestamp?: string }>;
  last_error_node: string;
  retry_count: number;
  max_retries: number;
  iteration_count: number;
  max_iterations: number;
  should_continue: boolean;
  next_action: string;
  planned_steps?: string[];
  mermaid_diagram?: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'waiting';
  deferred_tool_requests?: unknown;
}

/** Plan step for task progress tracking */
export interface PlanStep {
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'deleted';
}

/** Full agent state including plan steps, graph steps, and graph state */
export interface SessionAgentState {
  sessionId: string;
  /** Plan steps (task progress) - steps with 'description' field */
  steps: PlanStep[];
  /** Graph execution state from multi-agent graph */
  graph?: GraphState;
  /** Graph steps for rendering - steps with 'node' field (derived from graph state) */
  graphSteps?: GraphStep[];
}

