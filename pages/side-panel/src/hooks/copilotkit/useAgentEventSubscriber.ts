/**
 * useAgentEventSubscriber Hook
 * 
 * Robust event subscription system for CopilotKit v1.5+ agents.
 * Provides comprehensive event monitoring with error handling, logging, and state management.
 * 
 * Features:
 * - Subscribe to all agent lifecycle, message, tool, and error events
 * - Automatic error state management with banner display
 * - Configurable event handlers via callbacks
 * - Efficient subscription management with automatic cleanup
 * - Type-safe event handling
 * - Debug logging support
 * 
 * @module useAgentEventSubscriber
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAgent } from '@copilotkit/react-core/v2';
import type {
  RunErrorEvent,
  RunStartedEvent,
  RunFinishedEvent,
  StepStartedEvent,
  StepFinishedEvent,
  ToolCallStartEvent,
  ToolCallEndEvent,
  ToolCallResultEvent,
  StateSnapshotEvent,
  MessagesSnapshotEvent,
  ActivitySnapshotEvent,
  Message,
  State,
  RunAgentInput,
} from '@ag-ui/core';
import { debug } from '@extension/shared';

// AbstractAgent type from @ag-ui/client (type-only, works at runtime)
// Using 'any' as placeholder to avoid linter issues with module resolution
type AbstractAgent = any;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Error information for display
 */
export interface AgentError {
  /** The error object */
  error: Error;
  /** Timestamp when error occurred */
  timestamp: number;
  /** Optional error code */
  code?: string;
  /** Context about what was happening when error occurred */
  context?: string;
}

/**
 * Lifecycle event types
 */
export type LifecyclePhase = 
  | 'idle' 
  | 'initializing' 
  | 'running' 
  | 'completed' 
  | 'failed';

/**
 * Agent lifecycle state
 */
export interface AgentLifecycleState {
  phase: LifecyclePhase;
  runId?: string;
  startTime?: number;
  endTime?: number;
  error?: AgentError;
}

/**
 * Tool execution tracking
 */
export interface ToolExecution {
  toolCallId: string;
  toolName: string;
  startTime: number;
  endTime?: number;
  args?: Record<string, any>;
  result?: string;
  error?: string;
}

/**
 * Configuration for event subscription
 */
export interface AgentEventSubscriberConfig {
  /** Agent ID to subscribe to */
  agentId: string;
  
  /** Enable debug logging */
  debug?: boolean;
  
  /** Auto-dismiss error banner after N milliseconds (0 = no auto-dismiss) */
  errorAutoDismissMs?: number;
  
  /**
   * Which agent updates should trigger React re-renders
   * Default: ['OnRunStatusChanged'] (only re-render when agent starts/stops)
   * 
   * Options:
   * - 'OnRunStatusChanged': Re-render when agent starts/stops running
   * - 'OnStateChanged': Re-render when agent state changes
   * - 'OnMessagesChanged': Re-render on every message update (can be frequent during streaming!)
   * 
   * ⚠️ WARNING: Including 'OnMessagesChanged' will cause re-renders on every message chunk
   * during streaming, which can generate excessive logs and impact performance.
   * Only include it if you need to react to message changes in your component.
   */
  agentUpdates?: ('OnRunStatusChanged' | 'OnStateChanged' | 'OnMessagesChanged')[];
  
  // Lifecycle callbacks
  onRunStarted?: (event: RunStartedEvent, state: State, messages: Message[]) => void;
  onRunFinished?: (event: RunFinishedEvent, state: State, messages: Message[]) => void;
  onRunFailed?: (error: Error, state: State, messages: Message[]) => void;
  
  // Step callbacks (for LangGraph multi-step execution)
  onStepStarted?: (event: StepStartedEvent, state: State) => void;
  onStepFinished?: (event: StepFinishedEvent, state: State) => void;
  
  // Tool callbacks
  onToolCallStarted?: (event: ToolCallStartEvent) => void;
  onToolCallFinished?: (event: ToolCallEndEvent, toolName: string, args: Record<string, any>) => void;
  onToolCallResult?: (event: ToolCallResultEvent) => void;
  
  // State callbacks
  onStateChanged?: (state: State, messages: Message[]) => void;
  onMessagesChanged?: (messages: Message[], state: State) => void;
  
  // Activity callbacks
  onActivityUpdate?: (event: ActivitySnapshotEvent) => void;
  
  // Error callbacks (in addition to built-in error handling)
  onError?: (error: AgentError) => void;
}

/**
 * Return type for the hook
 */
export interface AgentEventSubscriberResult {
  /** The agent instance */
  agent: AbstractAgent | null;
  
  /** Current lifecycle state */
  lifecycle: AgentLifecycleState;
  
  /** Current error (if any) */
  error: AgentError | null;
  
  /** Clear current error */
  clearError: () => void;
  
  /** Active tool executions */
  activeTools: Map<string, ToolExecution>;
  
  /** Is agent currently running */
  isRunning: boolean;
  
  /** Manually trigger error display */
  triggerError: (error: Error, context?: string) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const LOG_PREFIX = '[AgentEventSubscriber]';

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Comprehensive agent event subscription hook
 * 
 * @example
 * ```tsx
 * const { error, clearError, lifecycle, isRunning } = useAgentEventSubscriber({
 *   agentId: 'dynamic_agent',
 *   debug: true,
 *   errorAutoDismissMs: 15000,
 *   onRunStarted: (event) => console.log('Run started:', event.runId),
 *   onRunFailed: (error) => console.error('Run failed:', error),
 * });
 * 
 * // Render error banner
 * {error && (
 *   <ChatErrorDisplay
 *     error={error.error}
 *     retry={handleRetry}
 *     isLight={isLight}
 *     autoDismissMs={15000}
 *   />
 * )}
 * ```
 */
export function useAgentEventSubscriber(
  config: AgentEventSubscriberConfig
): AgentEventSubscriberResult {
  const {
    agentId,
    debug: debugEnabled = false,
    errorAutoDismissMs = 15000,
    agentUpdates = ['OnRunStatusChanged'], // Default: only re-render on run status changes
    onRunStarted,
    onRunFinished,
    onRunFailed,
    onStepStarted,
    onStepFinished,
    onToolCallStarted,
    onToolCallFinished,
    onToolCallResult,
    onStateChanged,
    onMessagesChanged,
    onActivityUpdate,
    onError,
  } = config;

  // ============================================================================
  // STATE
  // ============================================================================

  const [lifecycle, setLifecycle] = useState<AgentLifecycleState>({
    phase: 'idle',
  });

  const [error, setError] = useState<AgentError | null>(null);
  
  const [activeTools, setActiveTools] = useState<Map<string, ToolExecution>>(
    new Map()
  );

  // ============================================================================
  // REFS
  // ============================================================================

  // Refs for callback stability
  const callbacksRef = useRef({
    onRunStarted,
    onRunFinished,
    onRunFailed,
    onStepStarted,
    onStepFinished,
    onToolCallStarted,
    onToolCallFinished,
    onToolCallResult,
    onStateChanged,
    onMessagesChanged,
    onActivityUpdate,
    onError,
  });

  // Keep callbacks ref updated
  useEffect(() => {
    callbacksRef.current = {
      onRunStarted,
      onRunFinished,
      onRunFailed,
      onStepStarted,
      onStepFinished,
      onToolCallStarted,
      onToolCallFinished,
      onToolCallResult,
      onStateChanged,
      onMessagesChanged,
      onActivityUpdate,
      onError,
    };
  }, [
    onRunStarted,
    onRunFinished,
    onRunFailed,
    onStepStarted,
    onStepFinished,
    onToolCallStarted,
    onToolCallFinished,
    onToolCallResult,
    onStateChanged,
    onMessagesChanged,
    onActivityUpdate,
    onError,
  ]);

  // ============================================================================
  // AGENT INSTANCE
  // ============================================================================

  // Use configured updates array (defaults to OnRunStatusChanged only)
  const { agent } = useAgent({
    agentId,
    updates: agentUpdates as any,
  });

  const isRunning = (agent as any)?.isRunning ?? false;

  // ============================================================================
  // HELPERS
  // ============================================================================

  const log = useCallback((...args: any[]) => {
    if (debugEnabled) {
      debug.log(LOG_PREFIX, ...args);
    }
  }, [debugEnabled]);

  const triggerError = useCallback((err: Error, context?: string) => {
    // SPECIFIC filter for anyio cancel scope errors only
    const errorMsg = err.message || '';
    const lowerMsg = errorMsg.toLowerCase();
    
    const isAnyCancelScopeError = 
      (lowerMsg.includes('attempted to exit') && lowerMsg.includes('cancel scope')) ||
      (lowerMsg.includes('exit cancel scope') && lowerMsg.includes('different task'));
    
    if (isAnyCancelScopeError) {
      log('✅ FILTERED anyio cancel scope error (expected from CopilotKit cancellation):', errorMsg);
      return; // Don't propagate - this is expected behavior
    }
    
    // All other errors are logged and propagated
    log('⚠️ Error occurred:', errorMsg, context);
    
    const agentError: AgentError = {
      error: err,
      timestamp: Date.now(),
      context,
    };
    
    setError(agentError);
    setLifecycle(prev => ({ ...prev, phase: 'failed', error: agentError }));
    
    if (callbacksRef.current.onError) {
      callbacksRef.current.onError(agentError);
    }
  }, [log]);

  const clearError = useCallback(() => {
    setError(null);
    setLifecycle(prev => ({ ...prev, error: undefined }));
    log('Error cleared');
  }, [log]);

  // ============================================================================
  // EVENT SUBSCRIPTIONS
  // ============================================================================

  useEffect(() => {
    if (!agent) {
      log('Agent not available, skipping subscription');
      return;
    }

    log('Subscribing to agent events');

    const subscription = agent.subscribe({
      // ========================================================================
      // LIFECYCLE EVENTS
      // ========================================================================

      /**
       * Called when agent run initializes
       */
      onRunInitialized: async ({ messages, state, agent, input }) => {
        log('Run initialized:', input.runId);
        
        setLifecycle({
          phase: 'initializing',
          runId: input.runId,
          startTime: Date.now(),
        });
        
        // Clear previous errors
        setError(null);
      },

      /**
       * Called when agent run fails
       * CRITICAL: This is where we catch and display errors
       */
      onRunFailed: async ({ error, messages, state, agent, input }) => {
        // SPECIFIC filter for anyio cancel scope errors only
        // These occur when CopilotKit cancels slower parallel suggestion requests
        const errorMsg = error.message || '';
        const lowerMsg = errorMsg.toLowerCase();
        
        const isAnyCancelScopeError = 
          (lowerMsg.includes('attempted to exit') && lowerMsg.includes('cancel scope')) ||
          (lowerMsg.includes('exit cancel scope') && lowerMsg.includes('different task'));
        
        if (isAnyCancelScopeError) {
          log('✅ FILTERED anyio cancel scope error (expected from CopilotKit cancellation):', errorMsg);
          return; // Don't propagate - this is expected behavior
        }
        
        log('Run failed:', error.message);
        
        const agentError: AgentError = {
          error,
          timestamp: Date.now(),
          context: 'Agent run failed',
        };
        
        setError(agentError);
        setLifecycle(prev => ({
          ...prev,
          phase: 'failed',
          endTime: Date.now(),
          error: agentError,
        }));
        
        // Call user callback
        if (callbacksRef.current.onRunFailed) {
          callbacksRef.current.onRunFailed(error, state, messages);
        }
        
        if (callbacksRef.current.onError) {
          callbacksRef.current.onError(agentError);
        }
      },

      /**
       * Called when agent run finalizes (success or failure)
       */
      onRunFinalized: async ({ messages, state, agent, input }) => {
        log('Run finalized:', input.runId);
        
        setLifecycle(prev => ({
          ...prev,
          phase: prev.phase === 'failed' ? 'failed' : 'completed',
          endTime: Date.now(),
        }));
        
        // Clear active tools
        setActiveTools(new Map());
      },

      // ========================================================================
      // RUN EVENTS
      // ========================================================================

      /**
       * Called when agent run starts
       */
      onRunStartedEvent: async ({ event, messages, state }) => {
        log('Run started event:', event.runId);
        
        setLifecycle({
          phase: 'running',
          runId: event.runId,
          startTime: Date.now(),
        });
        
        if (callbacksRef.current.onRunStarted) {
          callbacksRef.current.onRunStarted(event, state, messages);
        }
      },

      /**
       * Called when agent run finishes successfully
       */
      onRunFinishedEvent: async ({ event, messages, state, result }) => {
        log('Run finished event:', event.runId, 'Result:', result);
        
        setLifecycle(prev => ({
          ...prev,
          phase: 'completed',
          endTime: Date.now(),
        }));
        
        if (callbacksRef.current.onRunFinished) {
          callbacksRef.current.onRunFinished(event, state, messages);
        }
      },

      /**
       * Called when RUN_ERROR event is received
       * This is more specific than onRunFailed
       */
      onRunErrorEvent: async ({ event, messages, state }) => {
        // SPECIFIC filter for anyio cancel scope errors only
        const errorMsg = event.message || '';
        const lowerMsg = errorMsg.toLowerCase();
        
        const isAnyCancelScopeError = 
          (lowerMsg.includes('attempted to exit') && lowerMsg.includes('cancel scope')) ||
          (lowerMsg.includes('exit cancel scope') && lowerMsg.includes('different task'));
        
        if (isAnyCancelScopeError) {
          log('✅ FILTERED anyio cancel scope error in onRunErrorEvent:', errorMsg);
          return; // Don't propagate - this is expected behavior
        }
        
        log('Run error event:', event.message, 'Code:', event.code);
        
        const error = new Error(event.message);
        error.name = event.code || 'AgentError';
        
        const agentError: AgentError = {
          error,
          timestamp: Date.now(),
          code: event.code,
          context: 'Run error event',
        };
        
        setError(agentError);
        setLifecycle(prev => ({
          ...prev,
          phase: 'failed',
          endTime: Date.now(),
          error: agentError,
        }));
        
        if (callbacksRef.current.onError) {
          callbacksRef.current.onError(agentError);
        }
      },

      // ========================================================================
      // STEP EVENTS (LangGraph)
      // ========================================================================

      onStepStartedEvent: async ({ event, state }) => {
        log('Step started:', event.stepName);
        
        if (callbacksRef.current.onStepStarted) {
          callbacksRef.current.onStepStarted(event, state);
        }
      },

      onStepFinishedEvent: async ({ event, state }) => {
        log('Step finished:', event.stepName);
        
        if (callbacksRef.current.onStepFinished) {
          callbacksRef.current.onStepFinished(event, state);
        }
      },

      // ========================================================================
      // TOOL EVENTS
      // ========================================================================

      onToolCallStartEvent: async ({ event }) => {
        log('Tool call started:', event.toolCallId, event.toolCallName);
        
        setActiveTools(prev => {
          const updated = new Map(prev);
          updated.set(event.toolCallId, {
            toolCallId: event.toolCallId,
            toolName: event.toolCallName,
            startTime: Date.now(),
          });
          return updated;
        });
        
        if (callbacksRef.current.onToolCallStarted) {
          callbacksRef.current.onToolCallStarted(event);
        }
      },

      onToolCallEndEvent: async ({ event, toolCallName, toolCallArgs }) => {
        log('Tool call ended:', event.toolCallId, toolCallName);
        
        setActiveTools(prev => {
          const updated = new Map(prev);
          const existing = updated.get(event.toolCallId);
          if (existing) {
            updated.set(event.toolCallId, {
              ...existing,
              args: toolCallArgs,
              endTime: Date.now(),
            });
          }
          return updated;
        });
        
        if (callbacksRef.current.onToolCallFinished) {
          callbacksRef.current.onToolCallFinished(event, toolCallName, toolCallArgs);
        }
      },

      onToolCallResultEvent: async ({ event, messages, state }) => {
        log('Tool call result:', event.toolCallId);
        
        // Check if this is a tool error
        const toolMessage = messages.find(
          m => m.role === 'tool' && (m as any).toolCallId === event.toolCallId
        );
        
        if (toolMessage && (toolMessage as any).error) {
          log('Tool call failed:', (toolMessage as any).error);
          
          // Update tool execution with error
          setActiveTools(prev => {
            const updated = new Map(prev);
            const existing = updated.get(event.toolCallId);
            if (existing) {
              updated.set(event.toolCallId, {
                ...existing,
                error: (toolMessage as any).error,
                endTime: Date.now(),
              });
            }
            return updated;
          });
          
          // Optionally show error for tool failures
          // (You may want to only show errors for critical tools)
          const error = new Error((toolMessage as any).error);
          error.name = 'ToolError';
          
          const agentError: AgentError = {
            error,
            timestamp: Date.now(),
            context: `Tool ${event.toolCallId} failed`,
          };
          
          // Only show error banner for critical tool failures
          // Comment out if you don't want tool errors to show banners
          // setError(agentError);
        } else {
          // Remove from active tools on success
          setActiveTools(prev => {
            const updated = new Map(prev);
            updated.delete(event.toolCallId);
            return updated;
          });
        }
        
        if (callbacksRef.current.onToolCallResult) {
          callbacksRef.current.onToolCallResult(event);
        }
      },

      // ========================================================================
      // STATE EVENTS
      // ========================================================================

      onStateChanged: async ({ messages, state }) => {
        log('State changed');
        
        if (callbacksRef.current.onStateChanged) {
          callbacksRef.current.onStateChanged(state, messages);
        }
      },

      onMessagesChanged: async ({ messages, state }) => {
        log('Messages changed, count:', messages.length);
        
        if (callbacksRef.current.onMessagesChanged) {
          callbacksRef.current.onMessagesChanged(messages, state);
        }
      },

      // ========================================================================
      // ACTIVITY EVENTS
      // ========================================================================

      onActivitySnapshotEvent: async ({ event, activityMessage, existingMessage }) => {
        log('Activity snapshot:', event.messageId);
        
        if (callbacksRef.current.onActivityUpdate) {
          callbacksRef.current.onActivityUpdate(event);
        }
      },
    });

    log('Agent event subscription active');

    // Cleanup on unmount
    return () => {
      log('Unsubscribing from agent events');
      subscription.unsubscribe();
    };
  }, [agent, log]);

  // ============================================================================
  // AUTO-DISMISS ERROR
  // ============================================================================

  useEffect(() => {
    if (!error || !errorAutoDismissMs || errorAutoDismissMs === 0) {
      return;
    }

    const timer = setTimeout(() => {
      log('Auto-dismissing error after', errorAutoDismissMs, 'ms');
      clearError();
    }, errorAutoDismissMs);

    return () => clearTimeout(timer);
  }, [error, errorAutoDismissMs, clearError, log]);

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    agent: agent as AbstractAgent | null,
    lifecycle,
    error,
    clearError,
    activeTools,
    isRunning,
    triggerError,
  };
}

