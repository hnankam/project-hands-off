/**
 * Type definitions for agent state components
 * 
 * These types define the unified structure for agent state that matches
 * the backend AgentState model, eliminating duplication between plan steps
 * and graph execution state.
 */

// ========== Shared Types ==========

export interface GraphToolCall {
  tool_name: string;
  args: string;
  result: string;
  status: 'in_progress' | 'completed' | 'error';
}

// ========== Step Types ==========

/** Plan step format (from create_plan/update_plan_step) */
export interface PlanStep {
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'deleted';
}

// ========== Plan Instance ==========

/**
 * Single plan instance - fully self-contained
 * Multiple plans can be active simultaneously
 */
export interface PlanInstance {
  plan_id: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  steps: PlanStep[];
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

/** Graph step format (from multi-agent graph execution) */
export interface GraphStep {
  node: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error' | 'cancelled' | 'waiting';
  result: string;
  prompt?: string;  // Prompt sent to the sub-agent
  streaming_text?: string;  // Live streaming text during execution
  tool_calls?: GraphToolCall[];  // Tool calls made during this step
  timestamp: string;
}

// ========== Graph Instance ==========

/**
 * Single graph execution instance - fully self-contained
 * Multiple graphs can be active simultaneously
 * Matches backend GraphInstance model exactly
 */
export interface GraphInstance {
  graph_id: string;
  name: string;
  status: 'active' | 'running' | 'paused' | 'completed' | 'cancelled' | 'waiting';
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

// ========== Unified Agent State ==========

/**
 * Unified agent state with flat structure for multi-instance support.
 * Matches backend AgentState model exactly.
 * 
 * Key Features:
 * - Flat structure: plans and graphs are dictionaries at root level
 * - Multi-active: Multiple plans/graphs can be active simultaneously
 * - Named instances: Each has a human-readable name + unique ID
 * - Status-based: No active pointers needed
 * 
 * Multiple plans and graphs can coexist and be active within a session.
 * Users can reference instances by name (e.g., @"Build House Plan").
 */
export interface UnifiedAgentState {
  /** All plan instances, keyed by plan_id */
  plans?: Record<string, PlanInstance>;
  
  /** All graph instances, keyed by graph_id */
  graphs?: Record<string, GraphInstance>;
  
  /** Session identifier for scoping */
  sessionId?: string;
  
  /** Session-level deferred tool requests */
  deferred_tool_requests?: unknown;
}

// ========== View Models (for rendering) ==========

/**
 * GraphAgentState - View model for rendering graph execution
 * This is a flattened format derived from UnifiedAgentState.graph
 * for easier rendering in components
 */
export interface GraphAgentState {
  query: string;
  original_query: string;
  current_node: string;
  iteration: number;
  max_iterations: number;
  steps: GraphStep[];
  planned_steps?: string[];
  mermaid_diagram?: string;
  final_result: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'waiting';
  graphId?: string;
  name?: string;
}

// ========== Component Props Types ==========

export interface GraphStateCardProps {
  state: GraphAgentState;
  setState?: (state: UnifiedAgentState) => void;
  isCollapsed?: boolean;
  sessionId?: string;
  instanceId?: string; // unique ID to persist expanded state across remounts
}

// ========== Type Guards ==========

/** Check if steps are GraphStep[] (have 'node' field) */
export function isGraphSteps(steps: unknown[]): steps is GraphStep[] {
  if (!steps || steps.length === 0) return false;
  const first = steps[0] as Record<string, unknown>;
  return 'node' in first;
}

/** Check if steps are PlanStep[] (have 'description' field) */
export function isPlanSteps(steps: unknown[]): steps is PlanStep[] {
  if (!steps || steps.length === 0) return false;
  const first = steps[0] as Record<string, unknown>;
  return 'description' in first;
}

// ========== State Conversion ==========

/**
 * Convert UnifiedAgentState to GraphAgentState (view model) for rendering.
 * This function flattens the nested graph state into a render-friendly format.
 * 
 * Now uses graph.steps directly instead of deriving from execution_history.
 */
export function convertToGraphAgentState(state: UnifiedAgentState): GraphAgentState | null {
  // Check if we have graphs to convert
  if (!state.graphs) return null;
  
  // Get the first/most recent active, running, waiting, or completed graph
  const graphs = Object.values(state.graphs);
  const activeGraphs = graphs.filter(g => g.status === 'active' || g.status === 'running' || g.status === 'waiting' || g.status === 'completed');
  const g = activeGraphs.length > 0 ? activeGraphs[0] : graphs[0];
      
  if (!g) {
    return null;
      }
      
  // Map status: 'active' -> 'pending' (not yet running), 'running' stays 'running'
  // Check for errors in the errors array since GraphInstance doesn't have 'error' status
  const hasErrors = g.errors && g.errors.length > 0;
  const mappedStatus: GraphAgentState['status'] = 
    hasErrors ? 'error' :
    g.status === 'active' ? 'pending' :
    g.status === 'running' ? 'running' :
    g.status === 'waiting' ? 'waiting' :
    g.status === 'completed' ? 'completed' :
    g.status === 'cancelled' ? 'completed' : // Treat cancelled as completed for display
    g.status === 'paused' ? 'pending' : // Treat paused as pending
    'pending'; // Default to pending
      
      return {
    query: g.query,
    original_query: g.original_query,
    current_node: g.next_action,
    iteration: g.iteration_count,
    max_iterations: g.max_iterations,
    steps: g.steps || [], // Ensure steps is always an array
      planned_steps: g.planned_steps,
      mermaid_diagram: g.mermaid_diagram,
    final_result: g.result,
    status: mappedStatus,
    graphId: g.graph_id,
    name: g.name,
    };
}

