/**
 * Type definitions for GraphStateCard components
 * 
 * These types define the structure of multi-agent graph execution state
 * as received from the backend and rendered in the UI.
 */

// ========== Graph Execution Types ==========

export interface GraphToolCall {
  tool_name: string;
  args: string;
  result: string;
  status: 'in_progress' | 'completed' | 'error';
}

export interface GraphStep {
  node: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error' | 'cancelled' | 'waiting';
  result: string;
  prompt?: string;  // Prompt sent to the sub-agent
  streaming_text?: string;  // Live streaming text during execution
  tool_calls?: GraphToolCall[];  // Tool calls made during this step
  timestamp: string;
}

// GraphAgentState format - sent during graph execution
export interface GraphAgentState {
  query: string;
  original_query: string;
  current_node: string;
  iteration: number;
  max_iterations: number;
  steps: GraphStep[];
  planned_steps?: string[];  // Planned execution sequence from orchestrator
  mermaid_diagram?: string;  // Mermaid diagram of the graph structure
  final_result: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'waiting';
  graphId?: string;  // Unique ID for this graph execution (for activity updates)
}

// Backend GraphState format (nested inside full AgentState)
export interface BackendGraphState {
  query: string;
  original_query: string;
  result: string;
  query_type: string;
  execution_history: string[];
  intermediate_results: Record<string, string>;
  streaming_text: Record<string, string>;  // Track streaming text per node during execution
  prompts: Record<string, string>;  // Track prompts sent to each node
  tool_calls: Record<string, GraphToolCall[]>;  // Track tool calls per node
  errors: Array<{ node?: string; error?: string; timestamp?: string }>;
  last_error_node: string;
  retry_count: number;
  max_retries: number;
  iteration_count: number;
  max_iterations: number;
  should_continue: boolean;
  next_action: string;
  planned_steps?: string[];  // Planned execution sequence from orchestrator
  mermaid_diagram?: string;  // Mermaid diagram of the graph structure
  status: 'pending' | 'running' | 'completed' | 'error' | 'waiting';  // Graph status
  deferred_tool_requests?: unknown;  // DeferredToolRequests when waiting for user interaction
  current_graph_id?: string;  // Unique ID for this graph execution
}

// Plan step format (from create_plan/update_plan_step)
export interface PlanStep {
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'deleted';
}

// Unified state that matches backend AgentState
// Can receive either flat GraphAgentState or nested { steps, graph } format
export interface UnifiedAgentState {
  // Plan steps (from create_plan)
  steps?: PlanStep[] | GraphStep[];
  // Graph state (nested format from full AgentState)
  graph?: BackendGraphState;
  // GraphAgentState flat fields (when receiving graph execution updates)
  query?: string;
  original_query?: string;
  current_node?: string;
  iteration?: number;
  max_iterations?: number;
  planned_steps?: string[];  // Planned execution sequence from orchestrator
  final_result?: string;
  status?: 'pending' | 'running' | 'completed' | 'error' | 'waiting';
  // Session tracking
  sessionId?: string;
  // Unique IDs for activity message updates
  planId?: string;  // Unique ID for plan (from create_plan)
  graphId?: string;  // Unique ID for graph execution
  // Deferred tool requests for human-in-the-loop
  deferred_tool_requests?: unknown;
}

// ========== Component Props Types ==========

export interface GraphStateCardProps {
  state: GraphAgentState;
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

/** Convert BackendGraphState or UnifiedAgentState to GraphAgentState format for rendering */
export function convertToGraphAgentState(state: UnifiedAgentState): GraphAgentState | null {
  // Case 1: Already in GraphAgentState format (flat structure with graph steps)
  if (state.steps && isGraphSteps(state.steps)) {
    return {
      query: state.query || '',
      original_query: state.original_query || state.query || '',
      current_node: state.current_node || '',
      iteration: state.iteration || 0,
      max_iterations: state.max_iterations || 5,
      steps: state.steps as GraphStep[],
      planned_steps: state.planned_steps,
      mermaid_diagram: (state as GraphAgentState).mermaid_diagram,
      final_result: state.final_result || '',
      status: state.status || 'pending',
    };
  }
  
  // Case 2: Nested graph format from full AgentState
  if (state.graph && state.graph.execution_history && state.graph.execution_history.length > 0) {
    const g = state.graph;
    
    // Build steps from execution_history
    const steps: GraphStep[] = g.execution_history.map((node) => {
      const result = g.intermediate_results?.[node] || '';
      const nodeErrors = g.errors?.filter(e => e.node === node) || [];
      const streaming_text = g.streaming_text?.[node] || '';
      const prompt = g.prompts?.[node] || '';
      const tool_calls = g.tool_calls?.[node] || [];
      
      let status: GraphStep['status'] = 'completed';
      let stepResult = result;
      
      if (nodeErrors.length > 0) {
        status = 'error';
        stepResult = nodeErrors[nodeErrors.length - 1]?.error || 'Unknown error';
      } else if (node.startsWith('Confirmation') && tool_calls.some(tc => tc.status === 'in_progress')) {
        // Confirmation step is waiting for user action
        status = 'waiting';
      }
      
      return {
        node,
        status,
        result: stepResult,
        prompt,
        streaming_text,
        tool_calls,
        timestamp: new Date().toISOString(),
      };
    });
    
    // Determine overall status - prefer backend status if available
    let status: GraphAgentState['status'] = g.status || 'pending';
    if (!g.status) {
      // Fallback to deriving status from state
      if (g.errors && g.errors.length > 0) {
        status = 'error';
      } else if (g.deferred_tool_requests) {
        status = 'waiting';
      } else if (g.result) {
        status = 'completed';
      } else if (g.execution_history.length > 0 || g.next_action) {
        status = 'running';
      }
    }
    
    return {
      query: g.query || '',
      original_query: g.original_query || g.query || '',
      current_node: g.next_action || '',
      iteration: g.iteration_count || 0,
      max_iterations: g.max_iterations || 5,
      steps,
      planned_steps: g.planned_steps,
      mermaid_diagram: g.mermaid_diagram,
      final_result: g.result || '',
      status,
    };
  }
  
  return null;
}

