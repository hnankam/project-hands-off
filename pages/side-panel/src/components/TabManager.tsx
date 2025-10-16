import { useState, useCallback, useRef, useEffect } from 'react';
import { debug } from '@extension/shared';
import { TIMING_CONSTANTS } from '../constants';

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
  getCurrentTabTitle: () => string;
  setCurrentTabId: (id: number | null) => void;
  setCurrentTabTitle: (title: string) => void;
}

/**
 * TabManager Hook
 * 
 * Manages current tab tracking, title updates, and tab change handling
 * Optimizes re-renders using refs and version counter
 * Only active when session is active
 */
export const useTabManager = ({
  isActive,
  isPanelInteractive,
  isPanelVisible,
  onTabChange,
  onContentRefresh
}: TabManagerProps): TabManagerReturn => {
  
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [currentTabTitle, setCurrentTabTitle] = useState<string>('');
  
  // Track tab title in ref to avoid heavy re-renders
  const currentTabTitleRef = useRef<string>('');
  
  // Use a version counter to trigger minimal re-renders when tab title changes
  const [tabTitleVersion, setTabTitleVersion] = useState(0);
  
  // Helper to get the most current tab title
  const getCurrentTabTitle = useCallback(() => {
    return currentTabTitleRef.current || currentTabTitle;
  }, [currentTabTitle, tabTitleVersion]);
  
  // Tab change timeout for debouncing
  const tabChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Update parent when tab changes
  useEffect(() => {
    if (currentTabId) {
      onTabChange(currentTabId, getCurrentTabTitle());
    }
  }, [currentTabId, getCurrentTabTitle, onTabChange]);
  
  // Track when changes happen while visible but not interactive
  const pendingRefreshRef = useRef<boolean>(false);

  // Listen to tab changes and update title (always, regardless of panel visibility)
  // Only active when session is active
  useEffect(() => {
    if (!isActive) return; // Only run for the active session
    
    const handleTabActivatedForTitle = (activeInfo: chrome.tabs.TabActiveInfo) => {
      setCurrentTabId(activeInfo.tabId);
      
      chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (!chrome.runtime.lastError && tab.title) {
          const newTitle = tab.title;
          
          // Always update ref
          currentTabTitleRef.current = newTitle;
          
          // Increment version to trigger minimal re-render (just updates the status bar)
          setTabTitleVersion(prev => prev + 1);
          
          debug.log(`[TabManager] Tab title updated: ${newTitle} (version: ${tabTitleVersion + 1})`);
        }
      });
    };

    const handleTabUpdatedForTitle = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (tabId === currentTabId && changeInfo.title) {
        const newTitle = changeInfo.title;
        currentTabTitleRef.current = newTitle;
        setTabTitleVersion(prev => prev + 1);
        debug.log(`[TabManager] Tab title updated: ${newTitle} (version: ${tabTitleVersion + 1})`);
      }
    };

    chrome.tabs.onActivated.addListener(handleTabActivatedForTitle);
    chrome.tabs.onUpdated.addListener(handleTabUpdatedForTitle);

    return () => {
      chrome.tabs.onActivated.removeListener(handleTabActivatedForTitle);
      chrome.tabs.onUpdated.removeListener(handleTabUpdatedForTitle);
      if (tabChangeTimeoutRef.current) {
        clearTimeout(tabChangeTimeoutRef.current);
      }
    };
  }, [currentTabId, isActive, tabTitleVersion]);

  // Tab and URL change tracking - whenever session is active (even if panel not interactive)
  useEffect(() => {
    // Only track changes when session is active (don't require panel to be visible/interactive)
    if (!isActive) {
      return;
    }
    
    // Only log on initial setup, not on every state change
    // debug.log(`[TabManager] Tab change tracking enabled (interactive: ${isPanelInteractive}, visible: ${isPanelVisible})`);
    
    const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      const previousTabId = currentTabId;
      
      // Only process if tab actually changed
      if (previousTabId === activeInfo.tabId) return;
      
      debug.log(`[TabManager] Tab activated: ${previousTabId} -> ${activeInfo.tabId} (interactive: ${isPanelInteractive})`);
      
      // Update tab ID immediately to avoid race conditions
      setCurrentTabId(activeInfo.tabId);
      
      // ALWAYS mark for pending refresh when tab changes (ensures refresh happens when user clicks back)
      pendingRefreshRef.current = true;
      debug.log('[TabManager] Tab changed - marked for pending refresh');
      
      // If interactive NOW, also refresh immediately (but keep pending flag in case panel becomes inactive)
      if (isPanelInteractive) {
        debug.log('[TabManager] Panel is interactive - refreshing immediately (keeping pending flag)');
        onContentRefresh(activeInfo.tabId);
      }
    };

    const handleTabUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      // Handle URL changes
      if (tabId === currentTabId && changeInfo.url) {
        debug.log(`[TabManager] URL changed for current tab (interactive: ${isPanelInteractive})`);
        
        // Update tab title immediately if available
        if (changeInfo.title || tab.title) {
          const newTitle = changeInfo.title || tab.title || '';
          currentTabTitleRef.current = newTitle;
          setTabTitleVersion(prev => prev + 1);
        }
        
        // ALWAYS mark for pending refresh when URL changes (ensures refresh happens when user clicks back)
        pendingRefreshRef.current = true;
        debug.log('[TabManager] URL changed - marked for pending refresh');
        
        // If interactive NOW, also refresh immediately (but keep pending flag in case panel becomes inactive)
        if (isPanelInteractive) {
          debug.log('[TabManager] Panel is interactive - refreshing immediately (keeping pending flag)');
          // Debounce the refresh to avoid excessive calls
          if (tabChangeTimeoutRef.current) {
            clearTimeout(tabChangeTimeoutRef.current);
          }
          tabChangeTimeoutRef.current = setTimeout(() => {
            onContentRefresh(tabId);
          }, TIMING_CONSTANTS.URL_CHANGE_DELAY);
        }
      }
    };

    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);

    return () => {
      chrome.tabs.onActivated.removeListener(handleTabActivated);
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
      if (tabChangeTimeoutRef.current) {
        clearTimeout(tabChangeTimeoutRef.current);
      }
    };
  }, [currentTabId, isActive, isPanelInteractive, onContentRefresh]);

  // Trigger refresh when panel becomes interactive (if there's a pending refresh)
  const previousIsPanelInteractiveRef = useRef(isPanelInteractive);
  
  useEffect(() => {
    const wasNotInteractive = !previousIsPanelInteractiveRef.current;
    const isNowInteractive = isPanelInteractive;
    const justBecameInteractive = wasNotInteractive && isNowInteractive;
    const justBecameNotInteractive = previousIsPanelInteractiveRef.current && !isNowInteractive;
    
    // ONLY log when state actually changes (not on every render)
    if (justBecameInteractive) {
      debug.log(`[TabManager] ✅ Panel became interactive (pending: ${pendingRefreshRef.current}, tabId: ${currentTabId}, active: ${isActive})`);
    } else if (justBecameNotInteractive) {
      debug.log(`[TabManager] ❌ Panel became NOT interactive (pending: ${pendingRefreshRef.current})`);
    }
    
    // When panel becomes interactive, check for pending refresh
    if (justBecameInteractive && isActive && currentTabId && pendingRefreshRef.current) {
      debug.log('[TabManager] Panel just became interactive and has pending refresh - triggering now');
      onContentRefresh(currentTabId);
      // Clear pending after triggering refresh
      pendingRefreshRef.current = false;
      debug.log('[TabManager] Cleared pending refresh flag after triggering');
    } else if (justBecameInteractive && isActive && currentTabId && !pendingRefreshRef.current) {
      debug.log('[TabManager] Panel became interactive but no pending refresh');
    } else if (justBecameInteractive && (!isActive || !currentTabId)) {
      debug.log(`[TabManager] Panel became interactive but conditions not met (active: ${isActive}, tabId: ${currentTabId})`);
    }
    
    previousIsPanelInteractiveRef.current = isPanelInteractive;
  }, [isPanelInteractive, isActive, currentTabId, onContentRefresh]);

  // Get current tab for on-demand content fetching
  const initialTabFetchRef = useRef<boolean>(false);
  const lastPanelVisibleState = useRef<boolean>(isPanelVisible);
  const isFetchingRef = useRef<boolean>(false);
  
  useEffect(() => {
    // Detect when panel transitions from hidden to visible
    const panelJustBecameVisible = !lastPanelVisibleState.current && isPanelVisible;
    lastPanelVisibleState.current = isPanelVisible;
    
    // Clear pending refresh when panel becomes visible (we'll refresh anyway)
    if (panelJustBecameVisible && pendingRefreshRef.current) {
      debug.log('[TabManager] Panel opened - clearing pending refresh flag (will refresh anyway)');
      pendingRefreshRef.current = false;
    }
    
    // Only run for active session AND when:
    // 1. Panel just became visible (always refresh on open), OR
    // 2. First time for this session (initial content fetch)
    const isFirstTime = !initialTabFetchRef.current;
    const shouldFetchContent = panelJustBecameVisible || isFirstTime;
    
    if (!isActive || !shouldFetchContent) return;
    
    const getCurrentTab = async () => {
      try {
        chrome.runtime.sendMessage({ type: 'getCurrentTab' }, (response) => {
          if (chrome.runtime.lastError) {
            debug.error('Failed to get current tab:', chrome.runtime.lastError);
            return;
          }
          
          if (response?.tabId) {
            debug.log('Got current tab for on-demand content:', response);
            const isFirstTimeGettingTab = !currentTabId && !initialTabFetchRef.current;
            const needsRefreshAfterPanelOpen = panelJustBecameVisible;
            
            setCurrentTabId(response.tabId);
            setCurrentTabTitle(response.title || '');
            currentTabTitleRef.current = response.title || '';
            setTabTitleVersion(prev => prev + 1);
            
            // Auto-fetch content when panel opens or first time
            const needsFetch = isFirstTimeGettingTab || needsRefreshAfterPanelOpen;
            
            if (needsFetch) {
              const reason = isFirstTimeGettingTab ? 'first time' : 'panel just opened';
              debug.log(`[TabManager] Auto-fetching content (${reason})`);
              
              // Only fetch if not already loading or fetching
              if (!isFetchingRef.current) {
                isFetchingRef.current = true;
                initialTabFetchRef.current = true;
                onContentRefresh(response.tabId);
                isFetchingRef.current = false;
              } else {
                debug.log('[TabManager] Skipping fetch - already loading or fetching');
              }
            }
          } else {
            debug.log('No active tab found');
            setCurrentTabId(null);
            setCurrentTabTitle('');
          }
        });
      } catch (error) {
        debug.error('Failed to get current tab:', error);
      }
    };

    getCurrentTab();
  }, [currentTabId, isActive, isPanelVisible, onContentRefresh]);

  return {
    currentTabId,
    currentTabTitle,
    getCurrentTabTitle,
    setCurrentTabId,
    setCurrentTabTitle
  };
};
