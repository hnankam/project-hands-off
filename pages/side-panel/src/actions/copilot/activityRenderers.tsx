/**
 * Activity Message Renderers for CopilotKit V2
 *
 * ReactActivityMessageRenderer implementations for agent state visualization:
 * - task_progress: Plan step progress display (from create_plan/update_plan_step)
 * - agent_state: Graph execution state display
 * - aux_agent_message: Auxiliary agent message display (streaming responses)
 *
 * Uses Zod schemas for type-safe content validation.
 * Configure via CopilotKitProvider's renderActivityMessages prop.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { z } from 'zod';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { GraphStateCard, convertToGraphAgentState, isGraphSteps, isPlanSteps } from '../../components/graph-state';
import { PlanStateCard } from '../../components/cards';
import { CustomMarkdownRenderer } from '../../components/chat/CustomMarkdownRenderer';
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
    details: z.string().optional(),
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
// AUXILIARY AGENT MESSAGE SCHEMA
// ============================================================================

/**
 * Schema for aux_agent_message activity content
 * Sent by run_aux_agent_streaming when custom auxiliary agents respond
 * 
 * Backend sends:
 * - Snapshot (TEXT_MESSAGE_START): { agent_key, status: "streaming", text: [] }
 * - Delta (TEXT_MESSAGE_CONTENT): patch with { op: "add", path: "/text/-", value: "chunk" }
 * - Delta (TEXT_MESSAGE_END): patch with { op: "replace", path: "/status", value: "completed" }
 */
const auxAgentMessageContentSchema = z.object({
  agent_key: z.string(),
  status: z.enum(['streaming', 'completed', 'finished', 'error']),
  text: z.array(z.string()), // Array of text chunks, joined for display
  error: z.string().optional(),
});

type AuxAgentMessageContent = z.infer<typeof auxAgentMessageContentSchema>;

// Persist expanded state across remounts (for Virtua virtualization)
const auxAgentExpandedStateCache: Map<string, boolean> = new Map();
// Track if user has manually closed a card
const auxAgentUserClosedCache: Map<string, boolean> = new Map();

// ============================================================================
// AUXILIARY AGENT MESSAGE CARD COMPONENT
// ============================================================================

/**
 * Displays auxiliary agent response with streaming support
 * Layout matches ImageGalleryCard for consistency
 * 
 * Text is an array of chunks that gets joined for display.
 * Backend appends via JSON patch: { op: "add", path: "/text/-", value: "chunk" }
 */
const AuxAgentMessageCard: React.FC<{
  agentKey: string;
  status: 'streaming' | 'completed' | 'finished' | 'error';
  text: string[]; // Array of text chunks
  error?: string;
  instanceId?: string;
}> = ({ agentKey, status, text, error, instanceId }) => {
  const { isLight } = useStorage(themeStorage);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Join text chunks for display
  const displayText = text.join('');
  
  // Generate a stable cache key
  const cacheKey = instanceId ?? `aux-${agentKey}`;
  
  // Initialize from cache if available
  const [isExpanded, setIsExpanded] = useState(() => {
    return auxAgentExpandedStateCache.get(cacheKey) ?? true;
  });
  
  // Initialize userClosed from cache
  const userClosedRef = useRef(auxAgentUserClosedCache.get(cacheKey) ?? false);
  
  // Sync expanded state to cache whenever it changes
  useEffect(() => {
    auxAgentExpandedStateCache.set(cacheKey, isExpanded);
  }, [cacheKey, isExpanded]);
  
  // Keep streaming cards open unless user manually closes them
  useEffect(() => {
    if (status === 'streaming' && !userClosedRef.current) {
      setIsExpanded(true);
    }
  }, [status]);
  
  // Auto-scroll to bottom when streaming
  useEffect(() => {
    if (status === 'streaming' && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [displayText, status]);
  
  const handleToggle = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    // Track if user is closing a streaming card
    if (!newState && status === 'streaming') {
      userClosedRef.current = true;
      auxAgentUserClosedCache.set(cacheKey, true);
    }
  };
  
  // Format agent key for display (e.g., "databricks_expert" -> "Databricks Expert")
  const formatAgentName = (key: string) => {
    // Remove custom: prefix if present
    const cleanKey = key.replace(/^custom:/, '');
    return cleanKey
      .split(/[_-]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Card styling matching ImageGalleryCard
  const cardBackground = isLight ? 'rgba(249, 250, 251, 0.5)' : 'rgba(21, 28, 36, 0.4)';
  const borderColor = isLight ? 'rgba(229, 231, 235, 0.5)' : 'rgba(55, 65, 81, 0.4)';
  const textColor = isLight ? '#1f2937' : '#f3f4f6';
  const mutedTextColor = isLight ? '#6b7280' : '#9ca3af';
  const chevronColor = isLight ? '#6b7280' : '#6b7280';
  
  // Status colors
  const getStatusColor = () => {
    switch (status) {
      case 'streaming': return isLight ? '#3b82f6' : '#60a5fa';
      case 'error': return isLight ? '#ef4444' : '#f87171';
      default: return isLight ? '#10b981' : '#34d399';
    }
  };
  
  const getStatusBadgeStyle = () => {
    switch (status) {
      case 'streaming':
        return { backgroundColor: isLight ? 'rgba(59, 130, 246, 0.1)' : 'rgba(96, 165, 250, 0.15)', color: isLight ? '#3b82f6' : '#60a5fa' };
      case 'error':
        return { backgroundColor: isLight ? 'rgba(239, 68, 68, 0.1)' : 'rgba(248, 113, 113, 0.15)', color: isLight ? '#ef4444' : '#f87171' };
      default:
        return { backgroundColor: isLight ? 'rgba(16, 185, 129, 0.1)' : 'rgba(52, 211, 153, 0.15)', color: isLight ? '#10b981' : '#34d399' };
    }
  };
  
  const getStatusText = () => {
    switch (status) {
      case 'streaming': return 'Processing...';
      case 'error': return 'Error';
      case 'finished': return 'Complete';
      default: return 'Complete';
    }
  };
  
  // Format character count like file sizes (k, M)
  const formatCharCount = (chars: number): string => {
    if (chars < 1000) return `${chars}`;
    if (chars < 1000000) return `${(chars / 1000).toFixed(1)}k`;
    return `${(chars / 1000000).toFixed(1)}M`;
  };

  const isWorking = status === 'streaming';
  
  // Render content using markdown renderer (like ThinkingBlock)
  const renderedContent = useMemo(() => {
    if (!displayText) return null;
    return <CustomMarkdownRenderer content={displayText} isLight={isLight} />;
  }, [displayText, isLight]);
  
  return (
    <div
      className="aux-agent-gallery rounded-lg border transition-all duration-300 ease-in-out"
      style={{
        backgroundColor: cardBackground,
        borderColor: borderColor,
        marginTop: '0px',
        marginLeft: '0px',
        marginRight: '0px',
        marginBottom: '6px',
      }}
    >
      {/* Header - Accordion Toggle (matches ImageGalleryCard) */}
      <button
        type="button"
        onClick={handleToggle}
        style={{
          width: '100%',
          padding: '6px',
          paddingRight: '0',
          backgroundColor: 'transparent',
          border: 'none',
          borderBottom: isExpanded ? `1px solid ${borderColor}` : 'none',
          cursor: 'pointer',
          transition: 'background-color 0.2s ease, border-bottom 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = isLight ? 'rgba(0, 0, 0, 0.02)' : 'rgba(255, 255, 255, 0.02)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          {/* Expand/Collapse Chevron */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '16px',
              height: '16px',
              flexShrink: 0,
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              style={{ color: chevronColor }}
            >
              <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Agent icon - matches AgentIcon from admin page */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              flexShrink: 0,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: isLight ? '#6b7280' : '#9ca3af' }}
            >
              <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>

          {/* Title - single line */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                fontSize: '12px',
                fontWeight: 350,
                color: textColor,
                flexShrink: 0,
              }}
            >
              {formatAgentName(agentKey)}
            </span>
            {/* Status badge */}
            <span
              className="gallery-prompt"
              style={{
                fontSize: '10px',
                fontWeight: 300,
                padding: '2px 6px',
                borderRadius: '6px',
                flexShrink: 0,
                ...getStatusBadgeStyle(),
              }}
            >
              {getStatusText()}
            </span>
          </div>

          {/* Character count - formatted like file sizes */}
          <div
            className="gallery-count"
            style={{
              fontSize: '11px',
              color: mutedTextColor,
              paddingRight: '12px',
              flexShrink: 0,
            }}
          >
            {displayText.length > 0 ? `${formatCharCount(displayText.length)} chars` : ''}
          </div>
        </div>
      </button>

      {/* Content - Collapsible */}
      <div
        className="gallery-carousel"
        style={{
          maxHeight: isExpanded ? '400px' : '0',
          opacity: isExpanded ? 1 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out',
        }}
      >
        <div
          ref={contentRef}
          style={{
            padding: '8px',
            maxHeight: '380px',
            overflowY: 'auto',
          }}
        >
          {status === 'error' && error ? (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                backgroundColor: isLight ? 'rgba(239, 68, 68, 0.1)' : 'rgba(248, 113, 113, 0.1)',
                border: `1px solid ${isLight ? 'rgba(239, 68, 68, 0.2)' : 'rgba(248, 113, 113, 0.2)'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  style={{ color: isLight ? '#ef4444' : '#f87171', flexShrink: 0, marginTop: '2px' }}
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                <span style={{ fontSize: '13px', color: isLight ? '#b91c1c' : '#fca5a5', lineHeight: 1.5 }}>
                  {error}
                </span>
              </div>
            </div>
          ) : renderedContent ? (
            <div
              className="aux-agent-content"
              style={{
                fontSize: '13px',
                color: textColor,
                lineHeight: 1.6,
              }}
            >
              {renderedContent}
              {isWorking && (
                <span
                  style={{
                    display: 'inline-block',
                    width: '6px',
                    height: '14px',
                    marginLeft: '2px',
                    backgroundColor: getStatusColor(),
                    animation: 'blink 1s step-end infinite',
                  }}
                />
              )}
            </div>
          ) : isWorking ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: mutedTextColor, fontSize: '13px' }}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ animation: 'spin 1s linear infinite' }}
              >
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.75" strokeLinecap="round" />
              </svg>
              <span>Processing...</span>
            </div>
          ) : (
            <span style={{ fontSize: '13px', color: mutedTextColor, fontStyle: 'italic' }}>
              No response
            </span>
          )}
        </div>
      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

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
  const { state: liveAgentState, setState: setLiveAgentState } = useCopilotAgent<UnifiedAgentState>({
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
  
  if (!graphState) {
    return null;
  }

  // Use setDynamicAgentState if provided, otherwise use setLiveAgentState
  const handleSetState = setDynamicAgentState || setLiveAgentState;

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
        setState={handleSetState}
        isCollapsed={false}
        sessionId={sessionId}
        instanceId={graphId}
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
 * Creates V2-compatible ReactActivityMessageRenderer for auxiliary agent messages
 * 
 * Matches the 'aux_agent_message' activityType sent by run_aux_agent_streaming
 * when custom auxiliary agents are invoked via call_agent.
 * 
 * Displays streaming responses from auxiliary agents in a collapsible card.
 */
export function createAuxAgentMessageActivityRenderer(deps: ActivityRendererDependencies = {}) {
  return {
    activityType: 'aux_agent_message',
    agentId: 'dynamic_agent',
    content: auxAgentMessageContentSchema,
    render: (props: {
      activityType: string;
      content: AuxAgentMessageContent;
      message: { id?: string } & Record<string, unknown>;
      agent: unknown;
    }) => {
      const { agent_key, status, text, error } = props.content;
      const messageId = props.message?.id;
      
      return (
        <div
          data-aux-agent-message="true"
          data-agent-key={agent_key}
          data-status={status}
          className="w-full py-2"
          style={{
            maxWidth: '56rem',
            marginLeft: 'auto',
            marginRight: 'auto',
            paddingLeft: 12,
            paddingRight: 12,
          }}
        >
          <AuxAgentMessageCard
            agentKey={agent_key}
            status={status}
            text={text}
            error={error}
            instanceId={messageId}
          />
        </div>
      );
    },
  };
}

/**
 * Creates all V2 activity message renderers
 */
export function createActivityMessageRenderers(deps: ActivityRendererDependencies = {}) {
  return [
    createTaskProgressActivityRenderer(deps),       // For task_progress from create_plan/update_plan_step
    createAgentStateActivityRenderer(deps),         // For agent_state from graph execution
    createAuxAgentMessageActivityRenderer(deps),    // For aux_agent_message from custom auxiliary agents
  ];
}

