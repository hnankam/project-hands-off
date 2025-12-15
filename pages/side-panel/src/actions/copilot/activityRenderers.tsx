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
import { TaskProgressCard } from '../../components/cards/TaskProgressCard';
import type { UnifiedAgentState } from '../../components/graph-state/types';

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

  // Extract all plan and graph instances
  const allPlans = Object.values(unifiedState?.plans || {});
  const allGraphs = Object.values(unifiedState?.graphs || {});
  
  // Filter by status - show active, running, and completed
  const activePlans = allPlans.filter(p => 
    p.status === 'active' || p.status === 'completed'
  );
  const activeGraphs = allGraphs.filter(g => 
    g.status === 'active' || g.status === 'running' || g.status === 'completed'
  );
  
  if (activePlans.length === 0 && activeGraphs.length === 0) {
    return null;
  }

  const elements: React.ReactNode[] = [];
  
  // Render active plans
  activePlans.forEach(plan => {
    elements.push(
      <div
        key={`plan-${plan.plan_id}`}
        data-task-progress="true"
        data-plan-id={plan.plan_id}
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
          state={{ plans: { [plan.plan_id]: plan }, sessionId }}
          setState={setDynamicAgentState}
          isCollapsed={false}
          isHistorical={true}
          showControls={false}
        />
      </div>
    );
  });
  
  // Render active graphs
  activeGraphs.forEach(graph => {
    const graphState = convertToGraphAgentState({ graphs: { [graph.graph_id]: graph } });
    if (graphState && graphState.steps && graphState.steps.length > 0) {
      elements.push(
        <div
          key={`graph-${graph.graph_id}`}
          data-graph-progress="true"
          data-graph-id={graph.graph_id}
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
  });
  
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
 * Backend sends: { plans: {[id]: PlanInstance}, sessionId }
 * Using the unified structure with plans dictionary
 */
const taskProgressContentSchema = z.object({
  plans: z.record(planInstanceSchema),
  sessionId: z.string().optional(),
});

type TaskProgressContent = z.infer<typeof taskProgressContentSchema>;

/**
 * Creates V2-compatible ReactActivityMessageRenderer for task progress
 * 
 * Matches the 'task_progress' activityType sent by the backend when
 * create_plan or update_plan_step is called.
 * 
 * Uses the unified structure with plans dictionary for multi-instance support.
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
      // Use the unified structure with plans dictionary directly
      const sessionId = props.content.sessionId || deps.sessionId || 'unknown';
      
      const planState: UnifiedAgentState = {
        plans: props.content.plans,
        sessionId,
      };
      
      return (
        <div
          data-task-progress="true"
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

