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
  
  // Listen to tab changes and update title
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
        
        // Always update ref
        currentTabTitleRef.current = newTitle;
        
        // Increment version to trigger minimal re-render
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

  // Smart tab change handling with content preservation (only for active session)
  useEffect(() => {
    // CRITICAL: Only listen to tab changes when session is active AND panel is interactive
    if (!isActive || !isPanelInteractive) return;
    
    const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      const previousTabId = currentTabId;
      
      // Only process if tab actually changed
      if (previousTabId === activeInfo.tabId) return;
      
      debug.log(`[TabManager] Tab activated (active panel): ${previousTabId} -> ${activeInfo.tabId}`);
      
      // Update tab ID immediately to avoid race conditions
      setCurrentTabId(activeInfo.tabId);
      
      // Trigger content refresh for new tab
      onContentRefresh(activeInfo.tabId);
    };

    const handleTabUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      // Handle URL changes - force auto refresh
      if (tabId === currentTabId && changeInfo.url) {
        debug.log('[TabManager] URL changed for current tab, forcing auto refresh');
        
        // Update tab title immediately if available
        if (changeInfo.title || tab.title) {
          const newTitle = changeInfo.title || tab.title || '';
          currentTabTitleRef.current = newTitle;
          setTabTitleVersion(prev => prev + 1);
        }
        
        // Debounce the refresh to avoid excessive calls
        if (tabChangeTimeoutRef.current) {
          clearTimeout(tabChangeTimeoutRef.current);
        }
        tabChangeTimeoutRef.current = setTimeout(() => {
          onContentRefresh(tabId);
        }, TIMING_CONSTANTS.URL_CHANGE_DELAY);
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
  }, [currentTabId, isActive, isPanelVisible, isPanelInteractive, onContentRefresh]);

  // Get current tab for on-demand content fetching
  const initialTabFetchRef = useRef<boolean>(false);
  const lastPanelVisibleState = useRef<boolean>(isPanelVisible);
  const isFetchingRef = useRef<boolean>(false);
  
  useEffect(() => {
    // Detect when panel transitions from hidden to visible for ANY session
    const panelJustBecameVisible = !lastPanelVisibleState.current && isPanelVisible;
    lastPanelVisibleState.current = isPanelVisible;
    
    // Only run for active session AND when:
    // 1. Panel is interactive (user clicked), OR
    // 2. Panel just opened (needs initial content fetch), OR
    // 3. First time for this session (new session tabs need initial content)
    const isFirstTime = !initialTabFetchRef.current;
    const shouldFetchContent = isPanelInteractive || panelJustBecameVisible || isFirstTime;
    
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
            const tabChanged = currentTabId && currentTabId !== response.tabId;
            
            setCurrentTabId(response.tabId);
            setCurrentTabTitle(response.title || '');
            currentTabTitleRef.current = response.title || '';
            setTabTitleVersion(prev => prev + 1);
            
            // Auto-fetch content in these cases:
            const needsFetch = isFirstTimeGettingTab || needsRefreshAfterPanelOpen || tabChanged;
            
            if (needsFetch) {
              const reason = isFirstTimeGettingTab ? 'first time' : 
                            needsRefreshAfterPanelOpen ? 'panel just opened' : 
                            tabChanged ? 'tab changed' : 'cache stale/missing';
              debug.log(`[TabManager] useEffect: Auto-fetching content (${reason})`);
              
              // Only fetch if not already loading or fetching
              if (!isFetchingRef.current) {
                isFetchingRef.current = true;
                initialTabFetchRef.current = true;
                onContentRefresh(response.tabId);
                isFetchingRef.current = false;
              } else {
                debug.log('[TabManager] useEffect: Skipping fetch - already loading or fetching');
              }
            } else {
              //debug.log('[TabManager] useEffect: Cache is fresh, no fetch needed');
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
  }, [currentTabId, isActive, isPanelVisible, isPanelInteractive, onContentRefresh]);

  return {
    currentTabId,
    currentTabTitle,
    getCurrentTabTitle,
    setCurrentTabId,
    setCurrentTabTitle
  };
};
