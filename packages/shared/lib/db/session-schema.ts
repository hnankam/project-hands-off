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
      -- Note: Uses nested structure with plans and graphs objects
      -- Each plan/graph instance is self-contained with its own steps array
      DEFINE TABLE IF NOT EXISTS session_agent_state SCHEMALESS;
      DEFINE FIELD IF NOT EXISTS sessionId ON session_agent_state TYPE string;
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
  selectedPageURLs?: string[]; // Selected context page URLs
  selectedNoteIds?: string[]; // Selected workspace note IDs
  selectedCredentialIds?: string[]; // Selected workspace credential IDs
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
  result: string;
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

/** Single graph execution instance - fully self-contained */
export interface GraphInstance {
  graph_id: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled' | 'waiting';
  steps: GraphStep[];
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
  planned_steps: string[];
  mermaid_diagram: string;
  deferred_tool_requests?: unknown;
  created_at: string;
  updated_at: string;
}

/** Plan step for task progress tracking */
export interface PlanStep {
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'deleted';
}

/** Single plan instance - fully self-contained */
export interface PlanInstance {
  plan_id: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  steps: PlanStep[];
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

/**
 * Unified agent state - flat structure with multi-instance support.
 * Matches backend AgentState model exactly.
 * 
 * Multiple plans and graphs can be active simultaneously.
 * Each instance is self-contained with its own name, status, and metadata.
 */
export interface SessionAgentState {
  sessionId: string;
  /** All plan instances, keyed by plan_id */
  plans?: Record<string, PlanInstance>;
  /** All graph instances, keyed by graph_id */
  graphs?: Record<string, GraphInstance>;
  /** Session-level deferred tool requests */
  deferred_tool_requests?: unknown;
}

