import { useRef, useEffect } from 'react';
import { debug } from '@extension/shared';

/**
 * Schedule a callback using requestAnimationFrame with setTimeout fallback.
 * Returns a frame ID that can be cancelled.
 */
const scheduleCallback = (cb: () => void): number => {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(cb);
  }
  // Fallback in environments without RAF
  return setTimeout(cb, 0) as unknown as number;
};

/**
 * Cancel a scheduled callback from scheduleCallback.
 */
const cancelScheduledCallback = (frameId: number): void => {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(frameId);
  } else {
    clearTimeout(frameId);
  }
};

/**
 * useContextMenuPrefill Hook
 * 
 * Handles context menu message prefilling into the chat input field.
 * When a context menu action is triggered (e.g., "Analyze Element"), this hook
 * dispatches a custom event that the CustomInput component listens for.
 * 
 * Features:
 * - Scopes events by sessionId (only active session responds)
 * - Prevents duplicate dispatches using cancelAnimationFrame
 * - Defers event dispatch with requestAnimationFrame to avoid render issues
 * - Tracks used messages to prevent reprocessing
 * - Event includes timestamp for deduplication in receiver
 * 
 * @param sessionId - Current chat session ID for event scoping
 * @param contextMenuMessage - Message from context menu action (null if no action)
 * 
 * @example
 * ```tsx
 * useContextMenuPrefill(sessionId, contextMenuMessage);
 * // When context menu action occurs, input field will be populated
 * ```
 */
export const useContextMenuPrefill = (
  sessionId: string,
  contextMenuMessage: string | null | undefined
) => {
  // Track which messages have already been processed
  const contextMenuUsedRef = useRef<string | null>(null);
  
  // Track pending animation frame to allow cancellation
  const pendingAnimationFrameRef = useRef<number | null>(null);

  /**
   * Effect: Handle context menu messages.
   * Dispatches custom window event when context menu action occurs.
   */
  useEffect(() => {
    // Normalize once and guard
    const normalized = typeof contextMenuMessage === 'string' ? contextMenuMessage.trim() : '';
    if (!normalized) return;
    if (normalized === contextMenuUsedRef.current) return;

    // Cancel any pending animation frame to prevent duplicate dispatches
    if (pendingAnimationFrameRef.current !== null) {
      cancelScheduledCallback(pendingAnimationFrameRef.current);
      pendingAnimationFrameRef.current = null;
    }

    debug.log(
      '[useContextMenuPrefill] Received context menu message:',
      normalized.substring(0, 100)
    );
    
    const timestamp = Date.now();

    // Mark as used IMMEDIATELY to prevent duplicate processing
    contextMenuUsedRef.current = normalized;

    // Use requestAnimationFrame to defer the event dispatch to avoid triggering during render
    // This prevents issues with React's reconciliation and state updates
    pendingAnimationFrameRef.current = scheduleCallback(() => {
      pendingAnimationFrameRef.current = null;
      
      // Dispatch custom event with session scoping
      const event = new CustomEvent('copilot-prefill-text', {
        detail: { 
          text: normalized, 
          timestamp, 
          sessionId 
        },
        bubbles: false, // Don't bubble up DOM tree
        cancelable: false, // Can't be cancelled by listeners
      });
      
      window.dispatchEvent(event);
      debug.log('[useContextMenuPrefill] Dispatched copilot-prefill-text event');
    });

    // Cleanup function: cancel pending animation frame on unmount or change
    return () => {
      if (pendingAnimationFrameRef.current !== null) {
        cancelScheduledCallback(pendingAnimationFrameRef.current);
        pendingAnimationFrameRef.current = null;
      }
    };
  }, [contextMenuMessage, sessionId]);
};

