import { useState, useRef, useCallback, useEffect } from 'react';
import { FEATURES } from '@extension/platform';
import { debug } from '@extension/shared';

export interface UseTabManagementProps {
  isActive: boolean;
}

export interface UseTabManagementReturn {
  currentTabId: number | null;
  setCurrentTabId: React.Dispatch<React.SetStateAction<number | null>>;
  currentTabTitleRef: React.MutableRefObject<string>;
  tabTitleVersion: number;
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
export const useTabManagement = ({ isActive }: UseTabManagementProps): UseTabManagementReturn => {
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);

  // Track tab title in ref to avoid heavy re-renders
  const currentTabTitleRef = useRef<string>('');

  // Use a version counter to trigger minimal re-renders when tab title changes
  const [tabTitleVersion, setTabTitleVersion] = useState(0);

  // Helper to get the most current tab title
  // tabTitleVersion in the dependency ensures components re-read when title changes
  const getCurrentTabTitle = useCallback(() => {
    return currentTabTitleRef.current;
  }, [tabTitleVersion]);

  // Listen to tab changes and update title
  // Only active when session is active
  useEffect(() => {
    if (!FEATURES.browserTabs() || !isActive) return;

    const handleTabActivatedForTitle = (activeInfo: chrome.tabs.TabActiveInfo) => {
      setCurrentTabId(activeInfo.tabId);

      chrome.tabs.get(activeInfo.tabId, tab => {
        if (!chrome.runtime.lastError && tab.title) {
          const newTitle = tab.title;

          // Always update ref
          currentTabTitleRef.current = newTitle;

          // Increment version to trigger minimal re-render (just updates the status bar)
          setTabTitleVersion(prev => {
            debug.log(`[useTabManagement] Tab title updated: ${newTitle} (version: ${prev + 1})`);
            return prev + 1;
          });
        }
      });
    };

    const handleTabUpdatedForTitle = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (tabId === currentTabId && changeInfo.title) {
        const newTitle = changeInfo.title;

        // Always update ref
        currentTabTitleRef.current = newTitle;

        // Increment version to trigger minimal re-render
        setTabTitleVersion(prev => {
          debug.log(`[useTabManagement] Tab title updated: ${newTitle} (version: ${prev + 1})`);
          return prev + 1;
        });
      }
    };

    chrome.tabs.onActivated.addListener(handleTabActivatedForTitle);
    chrome.tabs.onUpdated.addListener(handleTabUpdatedForTitle);

    return () => {
      chrome.tabs.onActivated.removeListener(handleTabActivatedForTitle);
      chrome.tabs.onUpdated.removeListener(handleTabUpdatedForTitle);
    };
  }, [currentTabId, isActive]);

  return {
    currentTabId,
    setCurrentTabId,
    currentTabTitleRef,
    tabTitleVersion,
    getCurrentTabTitle,
  };
};
