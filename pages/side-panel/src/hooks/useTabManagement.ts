import { useState, useRef, useCallback, useEffect } from 'react';
import { debug } from '@extension/shared';

export interface UseTabManagementProps {
  isActive: boolean;
}

export interface UseTabManagementReturn {
  currentTabId: number | null;
  setCurrentTabId: React.Dispatch<React.SetStateAction<number | null>>;
  currentTabTitle: string;
  setCurrentTabTitle: React.Dispatch<React.SetStateAction<string>>;
  currentTabTitleRef: React.MutableRefObject<string>;
  tabTitleVersion: number;
  setTabTitleVersion: React.Dispatch<React.SetStateAction<number>>;
  getCurrentTabTitle: () => string;
}

/**
 * useTabManagement Hook
 * 
 * Manages current tab tracking and title updates
 * - Tracks current tab ID and title
 * - Listens to tab changes (activation & updates)
 * - Optimizes re-renders using refs and version counter
 * - Only active when session is active
 */
export const useTabManagement = ({
  isActive
}: UseTabManagementProps): UseTabManagementReturn => {
  
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [currentTabTitle, setCurrentTabTitle] = useState<string>('');
  
  // Track tab title in ref to avoid heavy re-renders
  const currentTabTitleRef = useRef<string>('');
  
  // Use a version counter to trigger minimal re-renders when tab title changes
  const [tabTitleVersion, setTabTitleVersion] = useState(0);
  
  // Helper to get the most current tab title
  // tabTitleVersion in the dependency ensures this updates when ref changes
  const getCurrentTabTitle = useCallback(() => {
    return currentTabTitleRef.current || currentTabTitle;
  }, [currentTabTitle, tabTitleVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Listen to tab changes and update title
  // Only active when session is active
  const titleUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
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
          
          debug.log(`[useTabManagement] Tab title updated: ${newTitle} (version: ${tabTitleVersion + 1})`);
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
        
        debug.log(`[useTabManagement] Tab title updated: ${newTitle} (version: ${tabTitleVersion + 1})`);
      }
    };

    chrome.tabs.onActivated.addListener(handleTabActivatedForTitle);
    chrome.tabs.onUpdated.addListener(handleTabUpdatedForTitle);

    return () => {
      chrome.tabs.onActivated.removeListener(handleTabActivatedForTitle);
      chrome.tabs.onUpdated.removeListener(handleTabUpdatedForTitle);
      if (titleUpdateTimeoutRef.current) {
        clearTimeout(titleUpdateTimeoutRef.current);
      }
    };
  }, [currentTabId, isActive, tabTitleVersion]);

  return {
    currentTabId,
    setCurrentTabId,
    currentTabTitle,
    setCurrentTabTitle,
    currentTabTitleRef,
    tabTitleVersion,
    setTabTitleVersion,
    getCurrentTabTitle
  };
};

