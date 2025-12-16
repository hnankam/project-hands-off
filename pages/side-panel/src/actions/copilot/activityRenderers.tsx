/**
 * Activity Message Renderers for CopilotKit V2
 *
 * ReactActivityMessageRenderer implementations for agent state visualization:
 * - task_progress: Plan step progress display (from create_plan/update_plan_step)
 * - agent_state: Graph execution state display
 *
 * Uses Zod schemas for type-safe content validation.
 * Configure via CopilotKitProvider's renderActivityMessages prop.
 */

import React from 'react';
import { z } from 'zod';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { GraphStateCard, convertToGraphAgentState, isGraphSteps, isPlanSteps } from '../../components/graph-state';
import { PlanStateCard } from '../../components/cards';
import type { UnifiedAgentState } from '../../components/graph-state/types';
import { useCopilotAgent } from '../../hooks/copilotkit';

// ============================================================================
// ZOD SCHEMAS FOR ACTIVITY CONTENT
// ============================================================================

/** Schema for graph tool call */
const graphToolCallSchema = z.object({
  tool_name: z.string(),
  args: z.string(),
  result: z.string(), // Required, matching GraphToolCall interface
  status: z.enum(['in_progress', 'completed', 'error']),
  tool_call_id: z.string().optional(),
});

/** Schema for graph step */
const graphStepSchema = z.object({
  node: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'error', 'cancelled', 'waiting']),
  result: z.string(),
  prompt: z.string().optional(),
  streaming_text: z.string().optional(),
  tool_calls: z.array(graphToolCallSchema).optional(),
  timestamp: z.string(),
});

/** Schema for plan step */
const planStepSchema = z.object({
  description: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'deleted']),
});

/** Schema for plan instance */
const planInstanceSchema = z.object({
  plan_id: z.string(),
  name: z.string(),
  status: z.enum(['active', 'paused', 'completed', 'cancelled']),
  steps: z.array(planStepSchema),
  created_at: z.string(),
  updated_at: z.string(),
  metadata: z.record(z.any()).optional(),
});

/** Schema for graph instance */
const graphInstanceSchema = z.object({
  graph_id: z.string(),
  name: z.string(),
  status: z.enum(['active', 'running', 'paused', 'completed', 'cancelled', 'waiting']),
  steps: z.array(graphStepSchema),
  query: z.string(),
  original_query: z.string(),
  result: z.string(),
  query_type: z.string(),
  execution_history: z.array(z.string()),
  intermediate_results: z.record(z.string()),
  streaming_text: z.record(z.string()),
  prompts: z.record(z.string()),
  tool_calls: z.record(z.array(graphToolCallSchema)),
  errors: z.array(z.object({
    node: z.string().optional(),
    error: z.string().optional(),
    timestamp: z.string().optional(),
  })),
  last_error_node: z.string(),
  retry_count: z.number(),
  max_retries: z.number(),
  iteration_count: z.number(),
  max_iterations: z.number(),
  should_continue: z.boolean(),
  next_action: z.string(),
  planned_steps: z.array(z.string()),
  mermaid_diagram: z.string(),
  deferred_tool_requests: z.unknown().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

/** Schema for unified agent state - flat structure with multi-instance support */
export const unifiedAgentStateSchema = z.object({
  // All plan instances, keyed by plan_id
  plans: z.record(planInstanceSchema).optional(),
  // All graph instances, keyed by graph_id
  graphs: z.record(graphInstanceSchema).optional(),
  // Session tracking
  sessionId: z.string().optional(),
  // Deferred tool requests
  deferred_tool_requests: z.unknown().optional(),
});

export type UnifiedAgentStateContent = z.infer<typeof unifiedAgentStateSchema>;

// ============================================================================
// ACTIVITY MESSAGE RENDERER COMPONENT
// ============================================================================

// ============================================================================
// V2 ACTIVITY MESSAGE RENDERER FACTORY
// ============================================================================

interface ActivityRendererDependencies {
  sessionId?: string;
  setDynamicAgentState?: (state: any) => void;
}

/**
 * Schema for task_progress activity content from backend
 * Backend sends: { plans: {[id]: PlanInstance}, sessionId }
 * Using the unified structure with plans dictionary
 */
const taskProgressContentSchema = z.object({
  plans: z.record(planInstanceSchema),
  sessionId: z.string().optional(),
});

type TaskProgressContent = z.infer<typeof taskProgressContentSchema>;

/**
 * Component that renders live plan state from CopilotKit agent
 * This ensures the plan always shows the latest state, not stale activity message content
 * 
 * IMPORTANT: Only renders the SPECIFIC plan for this activity message
 * Each activity message is tied to a single plan via its plan_id
 */
const LivePlanStateCard: React.FC<{
  planId: string; // The specific plan this activity message represents
  sessionId: string;
  setDynamicAgentState?: (state: UnifiedAgentState) => void;
}> = ({ planId, sessionId, setDynamicAgentState }) => {
  // Read live state from CopilotKit agent
  const { state: liveAgentState } = useCopilotAgent<UnifiedAgentState>({
    agentId: 'dynamic_agent',
    initialState: { sessionId, plans: {}, graphs: {} },
  });

  // Extract ONLY the specific plan for this activity message
  const plan = liveAgentState?.plans?.[planId];

  // Don't render if this specific plan doesn't exist
  if (!plan) {
    return null;
  }

  // Create state with only this specific plan
  const planState: UnifiedAgentState = {
    sessionId,
    plans: { [planId]: plan },
    graphs: {},
  };

  return (
    <div
      data-task-progress="true"
      data-plan-id={planId}
      data-session-id={sessionId}
      className="w-full pt-2"
      style={{
        maxWidth: '56rem',
        marginLeft: 'auto',
        marginRight: 'auto',
        paddingLeft: 12,
        paddingRight: 12,
      }}
    >
      <PlanStateCard
        state={planState}
        setState={setDynamicAgentState}
        isCollapsed={false}
        isHistorical={false}
        showControls={true}
      />
    </div>
  );
};

/**
 * Component that renders live graph state from CopilotKit agent
 * This ensures the graph always shows the latest state, not stale activity message content
 * 
 * IMPORTANT: Only renders the SPECIFIC graph for this activity message
 * Each activity message is tied to a single graph via its graph_id
 */
const LiveGraphStateCard: React.FC<{
  graphId: string; // The specific graph this activity message represents
  sessionId: string;
  setDynamicAgentState?: (state: UnifiedAgentState) => void;
}> = ({ graphId, sessionId, setDynamicAgentState }) => {
  const { isLight } = useStorage(themeStorage);
  
  // Read live state from CopilotKit agent
  const { state: liveAgentState } = useCopilotAgent<UnifiedAgentState>({
    agentId: 'dynamic_agent',
    initialState: { sessionId, plans: {}, graphs: {} },
  });

  // Extract ONLY the specific graph for this activity message
  const graph = liveAgentState?.graphs?.[graphId];

  // Don't render if this specific graph doesn't exist
  if (!graph) {
    return null;
  }

  // Convert to GraphAgentState for rendering
  const graphState = convertToGraphAgentState({ graphs: { [graphId]: graph } });
  
  if (!graphState || !graphState.steps || graphState.steps.length === 0) {
    return null;
  }

  return (
    <div
      data-graph-progress="true"
      data-graph-id={graphId}
      data-session-id={sessionId}
      className="w-full pt-2"
      style={{
        maxWidth: '56rem',
        marginLeft: 'auto',
        marginRight: 'auto',
        paddingLeft: 12,
        paddingRight: 12,
      }}
    >
      <GraphStateCard
        state={graphState}
        isCollapsed={false}
        sessionId={sessionId}
      />
    </div>
  );
};

/**
 * Creates V2-compatible ReactActivityMessageRenderer for task progress
 * 
 * Matches the 'task_progress' activityType sent by the backend when
 * create_plan or update_plan_step is called.
 * 
 * Uses the unified structure with plans dictionary for multi-instance support.
 * Each activity message contains exactly ONE plan (backend uses messageId=`plan-{plan_id}`)
 */
export function createTaskProgressActivityRenderer(deps: ActivityRendererDependencies = {}) {
  return {
    activityType: 'task_progress',
    agentId: 'dynamic_agent',
    content: taskProgressContentSchema,
    render: (props: {
      activityType: string;
      content: TaskProgressContent;
      message: unknown;
      agent: unknown;
    }) => {
      // Extract the plan_id from the content
      // Backend sends exactly one plan per activity message
      const planIds = Object.keys(props.content.plans || {});
      if (planIds.length === 0) {
        return null; // No plan in this activity message
      }
      
      const planId = planIds[0]; // Get the first (and only) plan_id
      const sessionId = props.content.sessionId || deps.sessionId || 'unknown';
      
      return (
        <LivePlanStateCard
          planId={planId}
          sessionId={sessionId}
          setDynamicAgentState={deps.setDynamicAgentState}
          />
      );
    },
  };
}

/**
 * Creates V2-compatible ReactActivityMessageRenderer for agent state (graph)
 * 
 * Uses live state from CopilotKit agent to ensure graphs always show current state.
 * Each activity message contains exactly ONE graph (backend uses messageId=`graph-{graph_id}`)
 */
export function createAgentStateActivityRenderer(deps: ActivityRendererDependencies = {}) {
  return {
    // Match 'agent_state' activity type for graph execution
    activityType: 'agent_state',
    agentId: 'dynamic_agent',
    content: unifiedAgentStateSchema,
    render: (props: {
      activityType: string;
      content: UnifiedAgentStateContent;
      message: unknown;
      agent: unknown;
    }) => {
      // Extract the graph_id from the content
      // Backend sends exactly one graph per activity message
      const graphIds = Object.keys(props.content.graphs || {});
      if (graphIds.length === 0) {
        return null; // No graph in this activity message
      }
      
      const graphId = graphIds[0]; // Get the first (and only) graph_id
      const sessionId = props.content.sessionId || deps.sessionId || 'unknown';
      
      return (
        <LiveGraphStateCard
          graphId={graphId}
          sessionId={sessionId}
        setDynamicAgentState={deps.setDynamicAgentState}
      />
      );
    },
  };
}

/**
 * Creates all V2 activity message renderers
 */
export function createActivityMessageRenderers(deps: ActivityRendererDependencies = {}) {
  return [
    createTaskProgressActivityRenderer(deps),  // For task_progress from create_plan/update_plan_step
    createAgentStateActivityRenderer(deps),    // For agent_state from graph execution
  ];
}

