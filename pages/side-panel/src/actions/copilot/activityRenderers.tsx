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

import * as React from 'react';
import { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react';
import { z } from 'zod';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { GraphStateCard, convertToGraphAgentState, isGraphSteps, isPlanSteps } from '../../components/graph-state';
import { PlanStateCard } from '../../components/cards';
import { CustomMarkdownRenderer } from '../../components/chat/CustomMarkdownRenderer';
import { IncrementalMarkdownRenderer } from '../../components/chat/IncrementalMarkdownRenderer';
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
 * - Snapshot (TEXT_MESSAGE_START): { agent_key, status: "streaming", chunks: [] }
 * - Delta (TEXT_MESSAGE_CONTENT): patch with { op: "add", path: "/chunks/-", value: "chunk" }
 * - Delta (TEXT_MESSAGE_END): patch with { op: "replace", path: "/status", value: "completed" }
 * 
 * Using array append ensures CopilotKit persists all chunks in activity state,
 * which survives panel close/reopen. Frontend joins with useMemo for performance.
 */
const auxAgentMessageContentSchema = z.object({
  agent_key: z.string(),
  status: z.enum(['streaming', 'completed', 'finished', 'error']),
  chunks: z.array(z.string()), // Array of text chunks (persists in activity state)
  error: z.string().optional(),
});

type AuxAgentMessageContent = z.infer<typeof auxAgentMessageContentSchema>;

// Persist expanded state across remounts (for Virtua virtualization)
const auxAgentExpandedStateCache: Map<string, boolean> = new Map();
// Track if user has manually closed a card
const auxAgentUserClosedCache: Map<string, boolean> = new Map();

// ============================================================================
// AUTO-SCROLL COMPONENT (matches FileManagementCard behavior)
// ============================================================================

interface AutoScrollDivProps {
  content: string;
  isStreaming: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  threshold?: number;
}

/**
 * Auto-scrolling container that follows streaming content.
 * Scrolls to bottom as content streams, but respects user scrolling up.
 * Uses RAF-based smooth scrolling to prevent flickering.
 */
const AutoScrollDiv: React.FC<AutoScrollDivProps> = memo(({ 
  content, 
  isStreaming, 
  className = '', 
  style,
  children,
  threshold = 50 
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUp = useRef(false);
  const lastContentLength = useRef(0);
  const isAutoScrolling = useRef(false);
  const wasStreamingRef = useRef(false);
  const prevScrollTopRef = useRef(0);
  const scrollRafRef = useRef<number | null>(null);

  // Check if user is near the bottom of the container
  const isNearBottom = useCallback((element: HTMLDivElement): boolean => {
    const { scrollTop, scrollHeight, clientHeight } = element;
    if (scrollHeight <= clientHeight) return true;
    return scrollHeight - scrollTop - clientHeight <= threshold;
  }, [threshold]);

  // Handle scroll events to detect user scrolling up
  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element || !isStreaming) return;
    
    // Skip if this is an auto-scroll we triggered
    if (isAutoScrolling.current) return;

    const currentScrollTop = element.scrollTop;
    const prevScrollTop = prevScrollTopRef.current;
    const nearBottom = isNearBottom(element);
    const scrolledUp = currentScrollTop < prevScrollTop - 5;
    
    prevScrollTopRef.current = currentScrollTop;
    
    // If user scrolled up and not near bottom, disable auto-scroll
    if (scrolledUp && !nearBottom) {
      isUserScrolledUp.current = true;
    } 
    // If user is near bottom (regardless of scroll direction), re-enable auto-scroll
    else if (nearBottom) {
      isUserScrolledUp.current = false;
    }
  }, [isNearBottom, isStreaming]);

  // Scroll to bottom - instant during streaming for smooth following
  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    
    isAutoScrolling.current = true;
    // Use RAF to batch with render for smoother visual
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight - element.clientHeight;
      isAutoScrolling.current = false;
      scrollRafRef.current = null;
    });
  }, []);

  // Auto-scroll when content changes
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const contentGrew = content.length > lastContentLength.current;
    lastContentLength.current = content.length;

    if (contentGrew && !isUserScrolledUp.current && isStreaming) {
      scrollToBottom();
    }
  }, [content, isStreaming, scrollToBottom]);

  // Reset on new streaming session
  useEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = isStreaming;
    
    if (!wasStreaming && isStreaming) {
      isUserScrolledUp.current = false;
      lastContentLength.current = 0;
      prevScrollTopRef.current = 0;
    }
  }, [isStreaming]);
  
  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  return (
    <div ref={scrollRef} onScroll={handleScroll} className={className} style={style}>
      {children}
    </div>
  );
});

AutoScrollDiv.displayName = 'AutoScrollDiv';

// ============================================================================
// AUXILIARY AGENT MESSAGE CARD COMPONENT
// ============================================================================

/**
 * Displays auxiliary agent response with streaming support
 * Layout matches ImageGalleryCard for consistency
 * 
 * Uses chunks array which CopilotKit persists in activity state.
 * This survives panel close/reopen since CopilotKit replays the full state.
 * 
 * Performance optimizations:
 * - Incremental chunk processing: O(1) per new chunk
 * - Raw text during streaming: No markdown rendering overhead
 * - Markdown on completion: Full formatting when done
 * - Memoized to prevent unnecessary re-renders that cause flickering
 */
const AuxAgentMessageCard: React.FC<{
  agentKey: string;
  status: 'streaming' | 'completed' | 'finished' | 'error';
  chunks: string[]; // Array of text chunks from activity state
  error?: string;
  instanceId?: string;
}> = memo(({ agentKey, status, chunks, error, instanceId }) => {
  const { isLight } = useStorage(themeStorage);
  
  // Generate a stable cache key
  const cacheKey = instanceId ?? `aux-${agentKey}`;
  
  // Track processed chunks count and accumulated text
  const processedCountRef = useRef(0);
  const accumulatedTextRef = useRef('');
  const rafPendingRef = useRef(false);
  
  // Initialize displayText - on mount, join all existing chunks once
  const [displayText, setDisplayText] = useState(() => {
    const text = chunks.join('');
    accumulatedTextRef.current = text;
    processedCountRef.current = chunks.length;
    return text;
  });
  
  const isWorking = status === 'streaming';
  
  // Incrementally process only NEW chunks (O(1) per new chunk)
  useEffect(() => {
    if (chunks.length > processedCountRef.current) {
      // Append new chunks to accumulated text
      const newChunks = chunks.slice(processedCountRef.current);
      accumulatedTextRef.current += newChunks.join('');
      processedCountRef.current = chunks.length;
      
      // Batch renders with RAF for smooth 60fps
      if (!rafPendingRef.current) {
        rafPendingRef.current = true;
        requestAnimationFrame(() => {
          setDisplayText(accumulatedTextRef.current);
          rafPendingRef.current = false;
        });
      }
    }
  }, [chunks.length]);
  
  // Ensure final content is set when streaming completes
  useEffect(() => {
    if (!isWorking && accumulatedTextRef.current) {
      setDisplayText(accumulatedTextRef.current);
    }
  }, [isWorking]);
  
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
  
  // Status colors (for badges)
  const getStatusColor = () => {
    switch (status) {
      case 'streaming': return isLight ? '#3b82f6' : '#60a5fa';
      case 'error': return isLight ? '#ef4444' : '#f87171';
      default: return isLight ? '#10b981' : '#34d399';
    }
  };
  
  // Cursor color matches CustomCursor.tsx (gray, not blue)
  const cursorColor = isLight ? '#374151' : '#d1d5db';
  
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
  
  // Render content using incremental markdown renderer for O(1) per-update performance
  // Uses block-level memoization: only re-renders modified/new blocks
  const renderedContent = useMemo(() => {
    if (!displayText) return null;
    return (
      <IncrementalMarkdownRenderer 
        content={displayText} 
        isLight={isLight} 
        isStreaming={isWorking}
      />
    );
  }, [displayText, isLight, isWorking]);
  
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

          {/* Character count - formatted like file sizes (shows full text length) */}
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

      {/* Content - Collapsible with smart auto-scroll */}
      <div
        style={{
          maxHeight: isExpanded ? '1000px' : '0',
          opacity: isExpanded ? 1 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out',
        }}
      >
        <div className="gallery-content" style={{ padding: '8px' }}>
          <AutoScrollDiv
            content={displayText}
            isStreaming={isWorking}
            style={{
              maxHeight: '400px',
              overflow: 'auto',
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
                      backgroundColor: cursorColor,
                      animation: 'blink 1s step-end infinite',
                      verticalAlign: 'middle',
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
          </AutoScrollDiv>
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
});

AuxAgentMessageCard.displayName = 'AuxAgentMessageCard';

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
      const { agent_key, status, chunks, error } = props.content;
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
            chunks={chunks}
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

