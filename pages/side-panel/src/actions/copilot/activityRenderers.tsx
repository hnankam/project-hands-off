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
import { TaskProgressCard, type AgentStepState } from '../../components/cards/TaskProgressCard';

// ============================================================================
// ZOD SCHEMAS FOR ACTIVITY CONTENT
// ============================================================================

/** Schema for graph tool call */
const graphToolCallSchema = z.object({
  tool_name: z.string(),
  args: z.string(),
  result: z.string().optional(),
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

/** Schema for backend graph state (nested format) */
const backendGraphStateSchema = z.object({
  query: z.string().optional(),
  original_query: z.string().optional(),
  result: z.string().optional(),
  query_type: z.string().optional(),
  execution_history: z.array(z.string()).optional(),
  intermediate_results: z.record(z.string()).optional(),
  streaming_text: z.record(z.string()).optional(),
  prompts: z.record(z.string()).optional(),
  tool_calls: z.record(z.array(graphToolCallSchema)).optional(),
  errors: z.array(z.object({
    node: z.string().optional(),
    error: z.string().optional(),
    timestamp: z.string().optional(),
  })).optional(),
  last_error_node: z.string().optional(),
  retry_count: z.number().optional(),
  max_retries: z.number().optional(),
  iteration_count: z.number().optional(),
  max_iterations: z.number().optional(),
  should_continue: z.boolean().optional(),
  next_action: z.string().optional(),
  planned_steps: z.array(z.string()).optional(),
  mermaid_diagram: z.string().optional(),
  status: z.enum(['pending', 'running', 'completed', 'error', 'waiting']).optional(),
  deferred_tool_requests: z.unknown().optional(),
  current_graph_id: z.string().optional(),
});

/** Schema for unified agent state */
export const unifiedAgentStateSchema = z.object({
  // Plan steps or graph steps
  steps: z.array(z.union([planStepSchema, graphStepSchema])).optional(),
  // Nested graph state
  graph: backendGraphStateSchema.optional(),
  // Flat graph fields
  query: z.string().optional(),
  original_query: z.string().optional(),
  current_node: z.string().optional(),
  iteration: z.number().optional(),
  max_iterations: z.number().optional(),
  planned_steps: z.array(z.string()).optional(),
  mermaid_diagram: z.string().optional(),
  final_result: z.string().optional(),
  status: z.enum(['pending', 'running', 'completed', 'error', 'waiting']).optional(),
  sessionId: z.string().optional(),
  // Unique IDs for activity message updates
  planId: z.string().optional(),
  graphId: z.string().optional(),
  deferred_tool_requests: z.unknown().optional(),
});

export type UnifiedAgentStateContent = z.infer<typeof unifiedAgentStateSchema>;

// ============================================================================
// ACTIVITY MESSAGE RENDERER COMPONENT
// ============================================================================

interface AgentStateActivityProps {
  activityType: string;
  content: UnifiedAgentStateContent;
  message: unknown; // ActivityMessage from V2
  agent: unknown; // AbstractAgent from V2
  // Additional context passed through
  sessionId?: string;
  setDynamicAgentState?: (state: any) => void;
}

/**
 * Component that renders agent state (graph steps or plan steps)
 */
export const AgentStateActivityRenderer: React.FC<AgentStateActivityProps> = ({
  content: unifiedState,
  sessionId: propSessionId,
  setDynamicAgentState,
}) => {
  // Read theme directly from storage for live updates
  const { isLight } = useStorage(themeStorage);
  
  // Use sessionId from props or from content
  const sessionId = propSessionId || unifiedState?.sessionId || 'unknown';

  // Check if we have any meaningful state to render
  const hasSteps = unifiedState?.steps && unifiedState.steps.length > 0;
  const hasGraph = unifiedState?.graph && (
    (unifiedState.graph.execution_history?.length ?? 0) > 0 || 
    unifiedState.graph.next_action ||
    unifiedState.graph.result
  );
  
  if (!hasSteps && !hasGraph) {
    return null;
  }

  const elements: React.ReactNode[] = [];
  const steps = unifiedState?.steps || [];
  
  // Case 1: Graph execution state
  if ((hasSteps && isGraphSteps(steps)) || hasGraph) {
    const graphState = convertToGraphAgentState(unifiedState as any);
    if (graphState && graphState.steps.length > 0) {
      elements.push(
        <div
          key="graph-progress"
          data-graph-progress="true"
          data-session-id={sessionId}
          data-timestamp={Date.now()}
          className="w-full pt-2"
          style={{
            maxWidth: '56rem',
            marginLeft: 'auto',
            marginRight: 'auto',
            paddingLeft: 12,
            paddingRight: 12,
          }}>
          <GraphStateCard
            state={graphState}
            isCollapsed={false}
            sessionId={sessionId}
          />
        </div>
      );
    }
  }
  
  // Case 2: Plan steps (have 'description' field)
  if (hasSteps && isPlanSteps(steps)) {
    const planState: AgentStepState = {
      steps: steps,
      sessionId: unifiedState.sessionId || sessionId,
    };
    
    if (planState.sessionId === sessionId) {
      elements.push(
        <div
          key="task-progress"
          data-task-progress="true"
          data-session-id={sessionId}
          data-timestamp={Date.now()}
          className="w-full pt-2"
          style={{
            maxWidth: '56rem',
            marginLeft: 'auto',
            marginRight: 'auto',
            paddingLeft: 12,
            paddingRight: 12,
            ['--copilot-kit-input-background-color' as string]: 'transparent',
            ['--copilot-kit-separator-color' as string]: isLight ? '#e5e7eb' : '#374151',
            ['--copilot-kit-border-color' as string]: isLight ? '#e5e7eb' : '#374151',
            ['--task-progress-rendered-border-color' as string]: isLight ? 'rgba(229, 231, 235, 0.7)' : '#374151',
          }}>
          <TaskProgressCard
            state={planState}
            setState={setDynamicAgentState}
            isCollapsed={true}
            isHistorical={true}
            showControls={false}
          />
        </div>
      );
    }
  }
  
  if (elements.length === 0) {
    return null;
  }
  
  return <>{elements}</>;
};

// ============================================================================
// V2 ACTIVITY MESSAGE RENDERER FACTORY
// ============================================================================

interface ActivityRendererDependencies {
  sessionId?: string;
  setDynamicAgentState?: (state: any) => void;
}

/**
 * Schema for task_progress activity content from backend
 * Backend sends: { steps: [{description, status}], sessionId }
 */
const taskProgressContentSchema = z.object({
  steps: z.array(z.object({
    description: z.string(),
    status: z.string(), // 'pending', 'running', 'completed', 'failed', 'deleted'
  })),
  sessionId: z.string().optional(),
});

type TaskProgressContent = z.infer<typeof taskProgressContentSchema>;

/**
 * Creates V2-compatible ReactActivityMessageRenderer for task progress
 * 
 * Matches the 'task_progress' activityType sent by the backend when
 * create_plan or update_plan_step is called.
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
      const planState: AgentStepState = {
        steps: props.content.steps.map(s => ({
          description: s.description,
          status: s.status as 'pending' | 'running' | 'completed' | 'failed' | 'deleted',
        })),
        sessionId: props.content.sessionId || deps.sessionId || 'unknown',
      };
      
      return (
        <div
          data-task-progress="true"
          data-session-id={planState.sessionId}
          className="w-full pt-2"
          style={{
            maxWidth: '56rem',
            marginLeft: 'auto',
            marginRight: 'auto',
            paddingLeft: 12,
            paddingRight: 12,
          }}
        >
          <TaskProgressCard
            state={planState}
            setState={deps.setDynamicAgentState}
            isCollapsed={false}
            isHistorical={false}
            showControls={true}
          />
        </div>
      );
    },
  };
}

/**
 * Creates V2-compatible ReactActivityMessageRenderer for agent state (graph)
 * 
 * Note: Since activity renderers are set at the provider level and
 * session-specific props aren't available there, this creates a basic
 * renderer that works without session context.
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
    }) => (
      <AgentStateActivityRenderer
        activityType={props.activityType}
        content={props.content}
        message={props.message}
        agent={props.agent}
        sessionId={deps.sessionId}
        setDynamicAgentState={deps.setDynamicAgentState}
      />
    ),
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

