import { useCallback } from 'react';
import { debug } from '@extension/shared';

interface UseContentRefreshProps {
  setCurrentTabId: (id: number | null) => void;
  setCurrentTabTitle: (title: string) => void;
  currentTabTitle: string;
  setTabTitleVersion?: React.Dispatch<React.SetStateAction<number>>;
  /** Content cache ref for clearing cache on refresh */
  contentCacheRef: React.MutableRefObject<Map<string, unknown>>;
  fetchFreshPageContent: (force: boolean, tabId?: number) => Promise<void>;
  setIsPanelInteractive?: (interactive: boolean) => void;
  isPanelInteractive?: boolean;
  currentTabId?: number | null;
}

/**
 * Custom hook to consolidate refresh logic used in multiple places.
 * Eliminates code duplication and makes refresh behavior consistent.
 */
export const useContentRefresh = ({
  setCurrentTabId,
  setCurrentTabTitle,
  currentTabTitle,
  setTabTitleVersion,
  contentCacheRef,
  fetchFreshPageContent,
  setIsPanelInteractive,
  isPanelInteractive,
  currentTabId
}: UseContentRefreshProps) => {
  
  /**
   * Query current tab via extension messaging.
   * Returns tab ID and title, or null values if unavailable.
   */
  const getCurrentTab = useCallback(async (): Promise<{ tabId: number | null; title: string | null }> => {
    try {
      const response = await new Promise<any>((resolve) => {
        try {
          chrome.runtime.sendMessage({ type: 'getCurrentTab' }, (res) => resolve(res));
        } catch (err) {
          debug.warn('[useContentRefresh] sendMessage failed:', err);
          resolve(null);
        }
      });
      if (response && typeof response.tabId === 'number') {
        return { tabId: response.tabId, title: typeof response.title === 'string' ? response.title : '' };
      }
      return { tabId: null, title: null };
    } catch (error) {
      debug.error('[useContentRefresh] getCurrentTab error:', error);
      return { tabId: null, title: null };
    }
  }, []);

  /**
   * Trigger a manual content refresh.
   * Fetches the current tab and forces a fresh content load.
   */
  const triggerManualRefresh = useCallback(async () => {
    debug.log('[useContentRefresh] Manual refresh requested');
    
    // Mark panel as interactive if needed
    if (setIsPanelInteractive && !isPanelInteractive) {
      setIsPanelInteractive(true);
      debug.log('[useContentRefresh] Marking panel as interactive');
    }
    
    // Get the tab to refresh - prefer the tracked currentTabId, fallback to querying
    try {
      let tabId: number | null = null;
      let title: string | null = null;
      
      if (currentTabId != null) {
        // Use the tracked tab ID (doesn't change when agent opens new tabs)
        tabId = currentTabId;
        title = currentTabTitle || null;
        debug.log('[useContentRefresh] Using tracked tab:', tabId, title);
      } else {
        // Fallback: query for current active tab
        const result = await getCurrentTab();
        tabId = result.tabId;
        title = result.title;
        debug.log('[useContentRefresh] Queried for active tab:', tabId, title);
      }
      
      if (tabId != null) {
        // Update tab state
        const safeTitle = title || '';
        setCurrentTabId(tabId);
        setCurrentTabTitle(safeTitle);
        setTabTitleVersion?.(prev => prev + 1); // Force UI update (if provided)
        
        // Clear cache to force fresh fetch
        contentCacheRef.current.delete(String(tabId));
        
        // Fetch fresh content immediately (no delay!)
        await fetchFreshPageContent(true, tabId);
      } else {
        debug.error('[useContentRefresh] No tab found');
      }
    } catch (error) {
      debug.error('[useContentRefresh] Error:', error);
    }
  }, [
    setCurrentTabId,
    setCurrentTabTitle,
    currentTabTitle,
    setTabTitleVersion,
    contentCacheRef,
    fetchFreshPageContent,
    setIsPanelInteractive,
    isPanelInteractive,
    currentTabId,
    getCurrentTab
  ]);
  
  return {
    triggerManualRefresh
  };
};

