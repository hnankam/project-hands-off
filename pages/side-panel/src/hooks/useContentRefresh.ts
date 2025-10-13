import { useCallback } from 'react';
import { debug } from '@extension/shared';

interface UseContentRefreshProps {
  setCurrentTabId: (id: number | null) => void;
  setCurrentTabTitle: (title: string) => void;
  currentTabTitleRef: React.MutableRefObject<string>;
  setTabTitleVersion: React.Dispatch<React.SetStateAction<number>>;
  contentCacheRef: React.MutableRefObject<Map<string, any>>;
  fetchFreshPageContent: (force: boolean, tabId?: number) => Promise<void>;
  setIsPanelInteractive?: (interactive: boolean) => void;
  isPanelInteractive?: boolean;
}

/**
 * Custom hook to consolidate refresh logic used in multiple places
 * This eliminates code duplication and makes refresh behavior consistent
 */
export const useContentRefresh = ({
  setCurrentTabId,
  setCurrentTabTitle,
  currentTabTitleRef,
  setTabTitleVersion,
  contentCacheRef,
  fetchFreshPageContent,
  setIsPanelInteractive,
  isPanelInteractive
}: UseContentRefreshProps) => {
  
  /**
   * Trigger a manual content refresh
   * This fetches the current tab and forces a fresh content load
   */
  const triggerManualRefresh = useCallback(async () => {
    debug.log('[useContentRefresh] Manual refresh requested');
    
    // Mark panel as interactive if needed
    if (setIsPanelInteractive && !isPanelInteractive) {
      setIsPanelInteractive(true);
      debug.log('[useContentRefresh] Marking panel as interactive');
    }
    
    // Get the current tab
    try {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ type: 'getCurrentTab' }, (response) => {
          resolve(response);
        });
      });
      
      if (response?.tabId) {
        debug.log('[useContentRefresh] Got current tab:', response.tabId, response.title);
        
        // Update tab state
        setCurrentTabId(response.tabId);
        setCurrentTabTitle(response.title || '');
        currentTabTitleRef.current = response.title || '';
        setTabTitleVersion(prev => prev + 1); // Force UI update
        
        // Clear cache to force fresh fetch
        const cacheKey = `${response.tabId}`;
        contentCacheRef.current.delete(cacheKey);
        
        // Fetch fresh content immediately (no delay!)
        await fetchFreshPageContent(true, response.tabId);
      } else {
        debug.error('[useContentRefresh] No tab found');
      }
    } catch (error) {
      debug.error('[useContentRefresh] Error:', error);
    }
  }, [
    setCurrentTabId,
    setCurrentTabTitle,
    currentTabTitleRef,
    setTabTitleVersion,
    contentCacheRef,
    fetchFreshPageContent,
    setIsPanelInteractive,
    isPanelInteractive
  ]);
  
  return {
    triggerManualRefresh
  };
};

