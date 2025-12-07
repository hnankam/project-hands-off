/**
 * ================================================================================
 * TabManager Component
 * ================================================================================
 * 
 * Manages current tab tracking, title updates, and tab change handling.
 * Optimizes re-renders using refs and version counter.
 * Only active when session is active.
 * 
 * Key Features:
 * - Tab activation and URL change detection
 * - Pending refresh tracking for inactive panels
 * - Debounced URL change refresh
 * - Title updates with minimal re-renders
 * - Initial content fetch on first load
 * 
 * @module TabManager
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { debug } from '@extension/shared';
import { TIMING_CONSTANTS } from '../../constants';

// ================================================================================
// TYPES & INTERFACES
// ================================================================================

export interface TabManagerProps {
  isActive: boolean;
  isPanelInteractive: boolean;
  isPanelVisible: boolean;
  onTabChange: (tabId: number | null, title: string) => void;
  onContentRefresh: (tabId: number) => void;
}

export interface TabManagerReturn {
  currentTabId: number | null;
  currentTabTitle: string;
  currentTabUrl: string | null;
  getCurrentTabTitle: () => string;
  setCurrentTabId: (id: number | null) => void;
  setCurrentTabTitle: (title: string) => void;
}

// ================================================================================
// MAIN HOOK
// ================================================================================

/**
 * TabManager Hook
 * 
 * @param props - Configuration for tab management
 * @returns Tab state and setters
 */
export const useTabManager = ({
  isActive,
  isPanelInteractive,
  isPanelVisible,
  onTabChange,
  onContentRefresh
}: TabManagerProps): TabManagerReturn => {
  
  // ================================================================================
  // STATE & REFS
  // ================================================================================
  
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [currentTabTitle, setCurrentTabTitle] = useState<string>('');
  const [currentTabUrl, setCurrentTabUrl] = useState<string | null>(null);
  const [tabTitleVersion, setTabTitleVersion] = useState(0);
  
  // Track tab title in ref to avoid heavy re-renders
  const currentTabTitleRef = useRef<string>('');
  
  // Track state transitions
  const previousIsPanelInteractiveRef = useRef(isPanelInteractive);
  const lastPanelVisibleState = useRef<boolean>(isPanelVisible);
  
  // Track pending operations
  const pendingRefreshRef = useRef<boolean>(false);
  const initialTabFetchRef = useRef<boolean>(false);
  const isFetchingRef = useRef<boolean>(false);
  const tabChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // ================================================================================
  // HELPER FUNCTIONS
  // ================================================================================
  
  /**
   * Get the most current tab title from ref or state
   */
  const getCurrentTabTitle = useCallback(() => {
    return currentTabTitleRef.current || currentTabTitle;
  }, [currentTabTitle, tabTitleVersion]);
  
  /**
   * Update tab title in both ref and trigger re-render
   */
  const updateTabTitle = useCallback((newTitle: string) => {
    currentTabTitleRef.current = newTitle;
    setTabTitleVersion(prev => prev + 1);
    debug.log( `[TabManager] Tab title updated: ${newTitle} (v${tabTitleVersion + 1})`);
  }, [tabTitleVersion]);
  
  /**
   * Clear any pending debounced refresh
   */
  const clearPendingTimeout = useCallback(() => {
    if (tabChangeTimeoutRef.current) {
      clearTimeout(tabChangeTimeoutRef.current);
      tabChangeTimeoutRef.current = null;
    }
  }, []);
  
  // ================================================================================
  // PARENT NOTIFICATIONS
  // ================================================================================
  
  // Notify parent when tab changes
  useEffect(() => {
    if (currentTabId) {
      onTabChange(currentTabId, getCurrentTabTitle());
    }
  }, [currentTabId, getCurrentTabTitle, onTabChange]);
  
  // ================================================================================
  // TAB CHANGE LISTENERS
  // ================================================================================
  
  // Consolidated tab change tracking - handles both title updates and content refresh
  useEffect(() => {
    if (!isActive) return;
    
    // debug.log( '[TabManager] Tab change tracking enabled');
    
    /**
     * Handle tab activation (user switches tabs)
     */
    const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      const previousTabId = currentTabId;
      
      // Only process if tab actually changed
      if (previousTabId === activeInfo.tabId) return;
      
      // debug.log( `[TabManager] Tab activated: ${previousTabId} -> ${activeInfo.tabId} (interactive: ${isPanelInteractive})`);
      
      // Update tab ID immediately
      setCurrentTabId(activeInfo.tabId);
      
      // Get and update tab info (title and URL)
      chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (!chrome.runtime.lastError) {
          if (tab.title) {
            updateTabTitle(tab.title);
          }
          setCurrentTabUrl(tab.url || null);
        }
      });
      
      // Mark for pending refresh (ensures refresh happens when user clicks back)
      pendingRefreshRef.current = true;
      // debug.log( '[TabManager] Marked for pending refresh');
      
      // If interactive now, refresh immediately (but keep pending flag)
      if (isPanelInteractive) {
        // debug.log( '[TabManager] Panel interactive - refreshing immediately');
        onContentRefresh(activeInfo.tabId);
      }
    };
    
    /**
     * Handle tab updates (URL changes, title changes, etc.)
     */
    const handleTabUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      // Update title if changed
      if (tabId === currentTabId && changeInfo.title) {
        updateTabTitle(changeInfo.title);
      }
      
      // Handle URL changes
      if (tabId === currentTabId && changeInfo.url) {
        // debug.log( `[TabManager] URL changed (interactive: ${isPanelInteractive})`);
        
        // Update URL for restricted page detection
        setCurrentTabUrl(changeInfo.url);
        
        // Update title if available
        if (changeInfo.title || tab.title) {
          updateTabTitle(changeInfo.title || tab.title || '');
        }
        
        // Mark for pending refresh
        pendingRefreshRef.current = true;
        // debug.log( '[TabManager] URL changed - marked for pending refresh');
        
        // If interactive now, refresh with debounce
        if (isPanelInteractive) {
          // debug.log( '[TabManager] Panel interactive - refreshing (debounced)');
          clearPendingTimeout();
          tabChangeTimeoutRef.current = setTimeout(() => {
            onContentRefresh(tabId);
          }, TIMING_CONSTANTS.URL_CHANGE_DELAY);
        }
      }
    };
    
    // Register listeners
    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);
    
    // Cleanup
    return () => {
      chrome.tabs.onActivated.removeListener(handleTabActivated);
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
      clearPendingTimeout();
    };
  }, [currentTabId, isActive, isPanelInteractive, onContentRefresh, updateTabTitle, clearPendingTimeout]);
  
  // ================================================================================
  // PANEL INTERACTIVITY TRACKING
  // ================================================================================
  
  // Trigger pending refresh when panel becomes interactive
  useEffect(() => {
    const wasNotInteractive = !previousIsPanelInteractiveRef.current;
    const isNowInteractive = isPanelInteractive;
    const justBecameInteractive = wasNotInteractive && isNowInteractive;
    const justBecameNotInteractive = previousIsPanelInteractiveRef.current && !isNowInteractive;
    
    // Log state changes
    if (justBecameInteractive) {
      // debug.log( `[TabManager] Panel became interactive (pending: ${pendingRefreshRef.current}, tabId: ${currentTabId})`);
    } else if (justBecameNotInteractive) {
      // debug.log( `[TabManager] Panel became NOT interactive (pending: ${pendingRefreshRef.current})`);
    }
    
    // When panel becomes interactive, check for pending refresh
    if (justBecameInteractive && isActive && currentTabId && pendingRefreshRef.current) {
      // debug.log( '[TabManager] Triggering pending refresh');
      onContentRefresh(currentTabId);
      pendingRefreshRef.current = false;
      // debug.log( '[TabManager] Cleared pending refresh flag');
    } else if (justBecameInteractive && isActive && currentTabId && !pendingRefreshRef.current) {
      // debug.log( '[TabManager] Panel interactive but no pending refresh');
    }
    
    previousIsPanelInteractiveRef.current = isPanelInteractive;
  }, [isPanelInteractive, isActive, currentTabId, onContentRefresh]);
  
  // ================================================================================
  // INITIAL TAB FETCH & PANEL VISIBILITY
  // ================================================================================
  
  // Get current tab for initial fetch or when panel opens
  useEffect(() => {
    // Detect panel visibility transitions
    const panelJustBecameVisible = !lastPanelVisibleState.current && isPanelVisible;
    lastPanelVisibleState.current = isPanelVisible;
    
    // Clear pending refresh when panel becomes visible (we'll refresh anyway)
    if (panelJustBecameVisible && pendingRefreshRef.current) {
      debug.log( '[TabManager] Panel opened - clearing pending refresh (will refresh anyway)');
      pendingRefreshRef.current = false;
    }
    
    // Only run for active session when panel opens or first time
    const isFirstTime = !initialTabFetchRef.current;
    const shouldFetchContent = panelJustBecameVisible || isFirstTime;
    
    if (!isActive || !shouldFetchContent) return;
    
    /**
     * Get current tab info from Chrome API
     */
    const getCurrentTab = async () => {
      try {
        chrome.runtime.sendMessage({ type: 'getCurrentTab' }, (response) => {
          if (chrome.runtime.lastError) {
            // debug.error( '[TabManager] Failed to get current tab:', chrome.runtime.lastError);
            return;
          }
          
          if (response?.tabId) {
            // debug.log( '[TabManager] Got current tab:', response);
            const isFirstTimeGettingTab = !currentTabId && !initialTabFetchRef.current;
            const needsRefreshAfterPanelOpen = panelJustBecameVisible;
            
            // Update tab info (including URL for restricted page detection)
            setCurrentTabId(response.tabId);
            setCurrentTabTitle(response.title || '');
            setCurrentTabUrl(response.url || null);
            updateTabTitle(response.title || '');
            
            // Auto-fetch content when needed
            const needsFetch = isFirstTimeGettingTab || needsRefreshAfterPanelOpen;
            
            if (needsFetch && !isFetchingRef.current) {
              const reason = isFirstTimeGettingTab ? 'first time' : 'panel opened';
              // debug.log( `[TabManager] Auto-fetching content (${reason})`);
              
              isFetchingRef.current = true;
              initialTabFetchRef.current = true;
              onContentRefresh(response.tabId);
              isFetchingRef.current = false;
            } else if (needsFetch && isFetchingRef.current) {
              // debug.log( '[TabManager] Skipping fetch - already fetching');
            }
          } else {
            // debug.log( '[TabManager] No active tab found');
            setCurrentTabId(null);
            setCurrentTabTitle('');
          }
        });
      } catch (error) {
        // debug.error( '[TabManager] Failed to get current tab:', error);
      }
    };

    getCurrentTab();
  }, [isActive, isPanelVisible, currentTabId, onContentRefresh, updateTabTitle]);
  
  // ================================================================================
  // RETURN API
  // ================================================================================
  
  return {
    currentTabId,
    currentTabTitle,
    currentTabUrl,
    getCurrentTabTitle,
    setCurrentTabId,
    setCurrentTabTitle
  };
};
