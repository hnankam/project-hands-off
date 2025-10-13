import { useState, useEffect, useRef } from 'react';
import { debug } from '@extension/shared';

export interface UsePanelVisibilityProps {
  isActive: boolean;
  onVisibilityChange?: (isVisible: boolean) => void;
  onInteractionChange?: (isInteractive: boolean) => void;
  onClickInPanel?: (event?: Event) => void;
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

/**
 * usePanelVisibility Hook
 * 
 * Manages side panel visibility and interaction state
 * - Tracks if panel is visible (Page Visibility API)
 * - Tracks if panel is interactive (user has clicked/typed)
 * - Provides combined "active" state
 * - Sets up event listeners for visibility, clicks, and blur
 */
export const usePanelVisibility = ({
  isActive,
  onVisibilityChange,
  onInteractionChange,
  onClickInPanel,
  onPanelBlur
}: UsePanelVisibilityProps): UsePanelVisibilityReturn => {
  
  // Track if the side panel is visible and if user has clicked inside it
  const [isPanelVisible, setIsPanelVisible] = useState(!document.hidden);
  const [isPanelInteractive, setIsPanelInteractive] = useState(false);
  
  // Combined state: panel is "active" when user has interacted with it
  // Note: For side panels, document.hidden can be true even when visible (Chrome quirk)
  // so we primarily rely on isPanelInteractive for the "active" state
  const isPanelActive = isPanelInteractive;
  
  // Track if panel just opened to trigger initial content fetch
  const panelJustOpenedRef = useRef<boolean>(false);
  
  // Track side panel visibility and user interaction using Page Visibility API + click/blur events
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;
      setIsPanelVisible(isVisible);
      debug.log(`[usePanelVisibility] Side panel visibility changed: ${isVisible ? 'visible' : 'hidden'}`);
      
      if (!isVisible) {
        // When panel becomes hidden, mark as not interactive
        setIsPanelInteractive(false);
        debug.log('[usePanelVisibility] Panel hidden, marking as not interactive');
      } else if (isVisible && isActive) {
        // When panel becomes visible, set flag
        debug.log('[usePanelVisibility] Panel opened, setting refresh flag...');
        panelJustOpenedRef.current = true;
      }
      
      // Call optional callback
      if (onVisibilityChange) {
        onVisibilityChange(isVisible);
      }
    };

    const handleClick = (event?: Event) => {
      // Call optional callback (main logic handled by parent)
      if (onClickInPanel) {
        onClickInPanel(event);
      }
    };

    const handleBlur = () => {
      // Window lost focus - mark as not interactive
      setIsPanelInteractive(false);
      
      // Call optional callback
      if (onPanelBlur) {
        onPanelBlur();
      }
    };

    // Listen for visibility changes (tab switching)
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Listen for clicks anywhere in the document to mark as interactive
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleClick); // Also count keyboard interaction
    
    // Listen for blur on the window (user clicked outside browser or extension)
    window.addEventListener('blur', handleBlur);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleClick);
      window.removeEventListener('blur', handleBlur);
    };
  }, [isActive, onVisibilityChange, onClickInPanel, onPanelBlur]);
  
  // Notify when interaction state changes
  useEffect(() => {
    if (onInteractionChange) {
      onInteractionChange(isPanelInteractive);
    }
  }, [isPanelInteractive, onInteractionChange]);

  return {
    isPanelVisible,
    setIsPanelVisible,
    isPanelInteractive,
    setIsPanelInteractive,
    isPanelActive,
    panelJustOpenedRef
  };
};

