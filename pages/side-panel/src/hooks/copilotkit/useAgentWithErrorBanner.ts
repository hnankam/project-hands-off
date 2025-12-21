/**
 * useAgentWithErrorBanner Hook
 * 
 * Convenience hook that combines agent event subscription with error banner display.
 * This is a higher-level wrapper around useAgentEventSubscriber specifically for
 * showing the ChatErrorDisplay banner on errors.
 * 
 * @module useAgentWithErrorBanner
 */

import { useCallback } from 'react';
import { useAgentEventSubscriber } from './useAgentEventSubscriber';
import type { AgentEventSubscriberConfig } from './useAgentEventSubscriber';
import { debug } from '@extension/shared';

// ============================================================================
// TYPES
// ============================================================================

export interface AgentWithErrorBannerConfig 
  extends Omit<AgentEventSubscriberConfig, 'errorAutoDismissMs' | 'agentUpdates'> {
  /** Auto-dismiss error banner after N milliseconds (default: 15000, 0 = no auto-dismiss) */
  errorBannerAutoDismissMs?: number;
  
  /** Callback to handle retry action from error banner */
  onRetry?: () => void;
  
  /**
   * Which agent updates should trigger React re-renders
   * Default: ['OnRunStatusChanged'] (only re-render when agent starts/stops)
   * 
   * ⚠️ WARNING: Including 'OnMessagesChanged' will cause re-renders on every message chunk
   * during streaming, which generates excessive logs. Only include if necessary.
   */
  agentUpdates?: ('OnRunStatusChanged' | 'OnStateChanged' | 'OnMessagesChanged')[];
}

export interface AgentWithErrorBannerResult {
  /** Current error to display in banner (null if no error) */
  error: Error | null;
  
  /** Function to call when user clicks retry */
  handleRetry: () => void;
  
  /** Function to call when user dismisses error */
  handleDismiss: () => void;
  
  /** Is agent currently running */
  isRunning: boolean;
  
  /** Current lifecycle phase */
  lifecyclePhase: string;
  
  /** Active tool executions (for debugging) */
  activeToolsCount: number;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Convenience hook for agent error banner display
 * 
 * @example
 * ```tsx
 * const { error, handleRetry, handleDismiss, isRunning } = useAgentWithErrorBanner({
 *   agentId: 'dynamic_agent',
 *   errorBannerAutoDismissMs: 15000,
 *   onRetry: () => {
 *     // Reload last message
 *     reloadMessages();
 *   },
 * });
 * 
 * // In render:
 * {error && (
 *   <ChatErrorDisplay
 *     error={error}
 *     retry={handleRetry}
 *     isLight={isLight}
 *     autoDismissMs={15000}
 *   />
 * )}
 * ```
 */
export function useAgentWithErrorBanner(
  config: AgentWithErrorBannerConfig
): AgentWithErrorBannerResult {
  const {
    errorBannerAutoDismissMs = 15000,
    agentUpdates = ['OnRunStatusChanged'], // Default: only re-render on run status changes
    onRetry,
    ...restConfig
  } = config;

  // Subscribe to agent events with error handling
  const {
    error: agentError,
    clearError,
    isRunning,
    lifecycle,
    activeTools,
  } = useAgentEventSubscriber({
    ...restConfig,
    errorAutoDismissMs: errorBannerAutoDismissMs,
    agentUpdates, // Pass through configured updates
    onError: (error) => {
      // SPECIFIC filter for anyio cancel scope errors only
      const errorMsg = error.error.message || '';
      const lowerMsg = errorMsg.toLowerCase();
      
      const isAnyCancelScopeError = 
        (lowerMsg.includes('attempted to exit') && lowerMsg.includes('cancel scope')) ||
        (lowerMsg.includes('exit cancel scope') && lowerMsg.includes('different task'));
      
      if (isAnyCancelScopeError) {
        debug.log('[useAgentWithErrorBanner] ✅ Filtered anyio cancel scope error');
        // Still call user's onError in case they want to handle it
        if (restConfig.onError) {
          restConfig.onError(error);
        }
        return; // Don't log this error to console
      }
      
      // Log all other errors normally
      debug.error('[useAgentWithErrorBanner] Error occurred:', errorMsg);
      // Call user's onError if provided
      if (restConfig.onError) {
        restConfig.onError(error);
      }
    },
  });

  // Handle retry button click
  const handleRetry = useCallback(() => {
    debug.log('[useAgentWithErrorBanner] Retry clicked');
    
    // Clear the error first
    clearError();
    
    // Call user's retry handler if provided
    if (onRetry) {
      try {
        onRetry();
      } catch (err) {
        debug.error('[useAgentWithErrorBanner] Retry handler failed:', err);
      }
    }
  }, [clearError, onRetry]);

  // Handle dismiss button click
  const handleDismiss = useCallback(() => {
    debug.log('[useAgentWithErrorBanner] Error dismissed');
    clearError();
  }, [clearError]);

  return {
    error: agentError?.error || null,
    handleRetry,
    handleDismiss,
    isRunning,
    lifecyclePhase: lifecycle.phase,
    activeToolsCount: activeTools.size,
  };
}

