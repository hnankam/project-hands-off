import { useRef, useEffect } from 'react';
import { debug } from '@extension/shared';

// Timestamp helper for consistent logging
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

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
  // Track prefill data (not currently used but kept for potential future needs)
  const inputPrefillRef = useRef<{ text: string; timestamp: number } | null>(null);
  
  // Track which messages have already been processed
  const contextMenuUsedRef = useRef<string | null>(null);
  
  // Track pending animation frame to allow cancellation
  const pendingAnimationFrameRef = useRef<number | null>(null);

  /**
   * Effect: Handle context menu messages
   * Dispatches custom window event when context menu action occurs
   */
  useEffect(() => {
    // Normalize once and guard
    const normalized = typeof contextMenuMessage === 'string' ? contextMenuMessage.trim() : '';
    if (!normalized) return;
    if (normalized === contextMenuUsedRef.current) return;

    // Cancel any pending animation frame to prevent duplicate dispatches
    if (pendingAnimationFrameRef.current !== null) {
      // Use the available cancel method (raf or timeout fallback)
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(pendingAnimationFrameRef.current as number);
      } else {
        clearTimeout(pendingAnimationFrameRef.current as unknown as number);
      }
      pendingAnimationFrameRef.current = null;
    }

    debug.log(
      ts(),
      '[useContextMenuPrefill] Received context menu message, setting prefill ref:',
      normalized.substring(0, 100)
    );
    const timestamp = Date.now();
    inputPrefillRef.current = { text: normalized, timestamp };

    // Mark as used IMMEDIATELY to prevent duplicate processing
    contextMenuUsedRef.current = normalized;

    // Use requestAnimationFrame to defer the event dispatch to avoid triggering during render
    // This prevents issues with React's reconciliation and state updates
    const schedule = (cb: () => void): number => {
      if (typeof requestAnimationFrame === 'function') {
        return requestAnimationFrame(() => cb());
      }
      // Fallback in environments without RAF
      return setTimeout(() => cb(), 0) as unknown as number;
    };

    pendingAnimationFrameRef.current = schedule(() => {
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
      debug.log(ts(), '[useContextMenuPrefill] Dispatched copilot-prefill-text event');
    });

    // Cleanup function: cancel pending animation frame on unmount or change
    return () => {
      if (pendingAnimationFrameRef.current !== null) {
        if (typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(pendingAnimationFrameRef.current as number);
        } else {
          clearTimeout(pendingAnimationFrameRef.current as unknown as number);
        }
        pendingAnimationFrameRef.current = null;
      }
    };
  }, [contextMenuMessage, sessionId]);

  // Hook doesn't return anything currently
  // Could return refs or state if needed in future
  return {
    // Expose for debugging or advanced use cases
    inputPrefillRef,
    contextMenuUsedRef,
  };
};

