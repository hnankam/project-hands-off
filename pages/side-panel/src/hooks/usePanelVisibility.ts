import { useState, useEffect, useRef, useCallback } from 'react';
import { debug } from '@extension/shared';

// ============================================================================
// TYPES
// ============================================================================

export interface UsePanelVisibilityProps {
  isActive: boolean;
  onVisibilityChange?: (isVisible: boolean) => void;
  onInteractionChange?: (isInteractive: boolean) => void;
  onClickInPanel?: (event: Event) => void;
  onPanelBlur?: () => void;
}

export interface UsePanelVisibilityReturn {
  isPanelVisible: boolean;
  setIsPanelVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isPanelInteractive: boolean;
  setIsPanelInteractive: React.Dispatch<React.SetStateAction<boolean>>;
  isPanelActive: boolean;
  panelJustOpenedRef: React.MutableRefObject<boolean>;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * usePanelVisibility Hook
 * 
 * Manages side panel visibility and interaction state.
 * 
 * Features:
 * - Tracks if panel is visible (Page Visibility API)
 * - Tracks if panel is interactive (user has clicked/typed)
 * - Provides combined "active" state
 * - Sets up event listeners for visibility, clicks, and blur
 * - Uses refs for callbacks to prevent excessive re-renders
 * 
 * Chrome Extension Quirk:
 * For side panels, document.hidden can be true even when visible,
 * so we primarily rely on isPanelInteractive for the "active" state.
 * 
 * @param props - Hook configuration
 * @returns Panel visibility state and controls
 * 
 * @example
 * ```tsx
 * const {
 *   isPanelVisible,
 *   isPanelInteractive,
 *   isPanelActive,
 *   panelJustOpenedRef
 * } = usePanelVisibility({
 *   isActive: true,
 *   onVisibilityChange: (visible) => console.log('Visible:', visible),
 * });
 * ```
 */
export const usePanelVisibility = ({
  isActive,
  onVisibilityChange,
  onInteractionChange,
  onClickInPanel,
  onPanelBlur
}: UsePanelVisibilityProps): UsePanelVisibilityReturn => {
  
  // ============================================================================
  // STATE
  // ============================================================================
  
  // Track if the side panel is visible and if user has clicked inside it
  const [isPanelVisible, setIsPanelVisible] = useState(!document.hidden);
  const [isPanelInteractive, setIsPanelInteractive] = useState(false);
  
  // Combined state: panel is "active" when user has interacted with it
  // Note: For side panels, document.hidden can be true even when visible (Chrome quirk)
  // so we primarily rely on isPanelInteractive for the "active" state
  const isPanelActive = isPanelInteractive;
  
  // ============================================================================
  // REFS
  // ============================================================================
  
  // Track if panel just opened to trigger initial content fetch
  const panelJustOpenedRef = useRef<boolean>(false);
  
  // Refs for callbacks to prevent effect re-runs when callbacks change
  const onVisibilityChangeRef = useRef(onVisibilityChange);
  const onInteractionChangeRef = useRef(onInteractionChange);
  const onClickInPanelRef = useRef(onClickInPanel);
  const onPanelBlurRef = useRef(onPanelBlur);
  
  // Keep callback refs in sync
  useEffect(() => {
    onVisibilityChangeRef.current = onVisibilityChange;
    onInteractionChangeRef.current = onInteractionChange;
    onClickInPanelRef.current = onClickInPanel;
    onPanelBlurRef.current = onPanelBlur;
  }, [onVisibilityChange, onInteractionChange, onClickInPanel, onPanelBlur]);
  
  // ============================================================================
  // CALLBACKS
  // ============================================================================
  
  /**
   * Handle visibility changes (Page Visibility API).
   * Tracks when panel becomes visible/hidden.
   */
  const handleVisibilityChange = useCallback(() => {
    const isVisible = !document.hidden;
    setIsPanelVisible(isVisible);
    debug.log(`[usePanelVisibility] Panel visibility: ${isVisible ? 'visible' : 'hidden'}`);
    
    if (!isVisible) {
      // When panel becomes hidden, mark as not interactive
      setIsPanelInteractive(false);
      debug.log('[usePanelVisibility] Panel hidden, marked as not interactive');
    } else {
      // When panel becomes visible, set refresh flag
      debug.log('[usePanelVisibility] Panel opened, setting refresh flag');
      panelJustOpenedRef.current = true;
    }
    
    // Call optional callback
    if (onVisibilityChangeRef.current) {
      onVisibilityChangeRef.current(isVisible);
    }
  }, []);

  /**
   * Handle click events to mark panel as interactive.
   */
  const handleClick = useCallback((event: Event) => {
    // Call optional callback (main logic handled by parent)
    if (onClickInPanelRef.current) {
      onClickInPanelRef.current(event);
    }
  }, []);

  /**
   * Handle window blur to mark panel as not interactive.
   */
  const handleBlur = useCallback(() => {
    // Window lost focus - mark as not interactive
    setIsPanelInteractive(false);
    
    // Call optional callback
    if (onPanelBlurRef.current) {
      onPanelBlurRef.current();
    }
  }, []);

  // ============================================================================
  // EFFECTS
  // ============================================================================
  
  /**
   * Setup event listeners for visibility and interaction tracking.
   * Only active when session is active.
   */
  useEffect(() => {
    // If this session is not active, don't attach any listeners.
    // Also ensure state is consistent and inert.
    if (!isActive) {
      setIsPanelVisible(false);
      setIsPanelInteractive(false);
      return;
    }

    // Listen for visibility changes (tab switching, window minimize/restore)
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Listen for clicks anywhere in the document to mark as interactive
    document.addEventListener('click', handleClick);
    
    // Also count keyboard interaction
    document.addEventListener('keydown', handleClick);
    
    // Listen for blur on the window (user clicked outside browser or extension)
    window.addEventListener('blur', handleBlur);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleClick);
      window.removeEventListener('blur', handleBlur);
    };
  }, [isActive, handleVisibilityChange, handleClick, handleBlur]);
  
  /**
   * Notify when interaction state changes.
   */
  useEffect(() => {
    if (onInteractionChangeRef.current) {
      onInteractionChangeRef.current(isPanelInteractive);
    }
  }, [isPanelInteractive]);

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    isPanelVisible,
    setIsPanelVisible,
    isPanelInteractive,
    setIsPanelInteractive,
    isPanelActive,
    panelJustOpenedRef
  };
};
