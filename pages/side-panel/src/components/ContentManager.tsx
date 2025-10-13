import { useState, useCallback, useRef, useEffect } from 'react';
import { debug } from '@extension/shared';
import { TIMING_CONSTANTS, ERROR_MESSAGES } from '../constants';

export interface ContentState {
  current: any;
  previous: any;
  status: 'none' | 'loading' | 'refreshing' | 'ready' | 'error';
  lastFetch: number;
  error?: string;
}

export interface ContentManagerProps {
  currentTabId: number | null;
  isActive: boolean;
  isPanelInteractive: boolean;
  isPanelVisible: boolean;
  onContentStateChange: (state: ContentState) => void;
  onStaleIndicatorChange: (show: boolean) => void;
  onDOMUpdate: (update: any) => void;
}

export interface ContentManagerReturn {
  contentState: ContentState;
  showStaleIndicator: boolean;
  latestDOMUpdate: any;
  fetchFreshPageContent: (force?: boolean, tabIdOverride?: number) => Promise<void>;
  clearCache: () => void;
}

/**
 * ContentManager Hook
 * 
 * Manages page content fetching, caching, and state management
 * Handles content freshness, DOM updates, and stale indicators
 */
export const useContentManager = ({
  currentTabId,
  isActive,
  isPanelInteractive,
  isPanelVisible,
  onContentStateChange,
  onStaleIndicatorChange,
  onDOMUpdate
}: ContentManagerProps): ContentManagerReturn => {
  
  const [contentState, setContentState] = useState<ContentState>({
    current: null,
    previous: null,
    status: 'none',
    lastFetch: 0,
    error: undefined
  });
  
  const [showStaleIndicator, setShowStaleIndicator] = useState(false);
  const [latestDOMUpdate, setLatestDOMUpdate] = useState<any>(null);
  
  // Content cache to prevent unnecessary refetches
  const contentCacheRef = useRef<Map<string, { content: any; timestamp: number; tabId: number }>>(new Map());
  
  // Track last content timestamp received via direct response
  const lastDirectResponseTimestampRef = useRef<number | null>(null);
  
  // Auto-refresh timer for inactive panel
  const autoRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Helper function to check if content is fresh
  const isContentFresh = useCallback((timestamp: number) => {
    return Date.now() - timestamp < TIMING_CONSTANTS.CACHE_TTL;
  }, []);
  
  // Update parent component when content state changes
  useEffect(() => {
    onContentStateChange(contentState);
  }, [contentState, onContentStateChange]);
  
  // Update parent component when stale indicator changes
  useEffect(() => {
    onStaleIndicatorChange(showStaleIndicator);
  }, [showStaleIndicator, onStaleIndicatorChange]);
  
  // Update parent component when DOM update changes
  useEffect(() => {
    onDOMUpdate(latestDOMUpdate);
  }, [latestDOMUpdate, onDOMUpdate]);
  
  // Clear cache function
  const clearCache = useCallback(() => {
    contentCacheRef.current.clear();
    debug.log('[ContentManager] Cache cleared');
  }, []);
  
  // Function to fetch fresh page content with intelligent caching
  const fetchFreshPageContent = useCallback(async (force = false, tabIdOverride?: number) => {
    const tabId = tabIdOverride || currentTabId;
    
    if (!tabId) {
      debug.log('[ContentManager] No tab ID available');
      return;
    }
    
    // Check cache first (unless forced)
    if (!force) {
      const cacheKey = `${tabId}`;
      const cached = contentCacheRef.current.get(cacheKey);
      
      if (cached && isContentFresh(cached.timestamp)) {
        debug.log('[ContentManager] Using fresh cached content');
        setContentState(prev => ({
          current: cached.content,
          previous: prev.current,
          status: 'ready',
          lastFetch: cached.timestamp,
          error: undefined
        }));
        return;
      }
      
      // Skip if already fetching (only when not forced)
      if (contentState.status === 'loading' || contentState.status === 'refreshing') {
        debug.log('[ContentManager] Already fetching content');
        return;
      }
    } else {
      debug.log('[ContentManager] Force refresh requested - bypassing cache and fetching checks');
    }

    // Determine if this is a refresh (has existing content) or initial load
    const hasExistingContent = contentState.current !== null;
    const newStatus = hasExistingContent ? 'refreshing' : 'loading';
    
    // Update state to show loading/refreshing without clearing existing content
    setContentState(prev => ({
      ...prev,
      status: newStatus,
      lastFetch: Date.now(),
      error: undefined
    }));
    
    debug.log(`[ContentManager] ${newStatus === 'refreshing' ? 'Refreshing' : 'Loading'} page content...`);

    try {
      const response = await new Promise<any>((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'getPageContentOnDemand',
          tabId: tabId
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(response);
        });
      });

      if (response?.success && response?.content) {
        debug.log('[ContentManager] Content loaded:', response.content);
        const timestamp = response.content.timestamp || Date.now();
        
        // Track this timestamp to avoid duplicate processing from broadcast
        lastDirectResponseTimestampRef.current = timestamp;
        
        // Update cache
        contentCacheRef.current.set(`${tabId}`, {
          content: response.content,
          timestamp,
          tabId: tabId
        });
        
        // Clean old cache entries (keep only last 5)
        if (contentCacheRef.current.size > TIMING_CONSTANTS.MAX_CACHE_SIZE) {
          const entries = Array.from(contentCacheRef.current.entries());
          entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
          contentCacheRef.current.clear();
          entries.slice(0, TIMING_CONSTANTS.MAX_CACHE_SIZE).forEach(([key, value]) => {
            contentCacheRef.current.set(key, value);
          });
        }
        
        setContentState(prev => ({
          current: response.content,
          previous: prev.current, // Keep previous content as fallback
          status: 'ready',
          lastFetch: timestamp,
          error: undefined
        }));
        
        // Clear stale indicator when fresh content is loaded
        setShowStaleIndicator(false);
      } else {
        debug.log('[ContentManager] Failed to load content:', response?.error);
        setContentState(prev => ({
          ...prev,
          status: prev.current ? 'ready' : 'error', // Keep existing content if available
          error: response?.error || ERROR_MESSAGES.CONTENT_FETCH_FAILED
        }));
      }
    } catch (error) {
      debug.error('[ContentManager] Error fetching fresh page content:', error);
      setContentState(prev => ({
        ...prev,
        status: prev.current ? 'ready' : 'error', // Keep existing content if available
        error: error instanceof Error ? error.message : ERROR_MESSAGES.CONTENT_FETCH_FAILED
      }));
    }
  }, [currentTabId, contentState.status, contentState.current, isContentFresh]);

  // Monitor for DOM changes and stale content
  useEffect(() => {
    if (!isActive) return;
    
    const handleMessage = (message: any) => {
      if (message.type === 'contentBecameStale' && message.tabId === currentTabId) {
        // Show indicator immediately
        debug.log('[ContentManager] Content became stale (auto-refresh DISABLED)');
        setShowStaleIndicator(true);
          
        // Capture the incremental DOM update if available
        if (message.domUpdate) {
          debug.log('[ContentManager] Received incremental DOM update:', message.domUpdate.summary);
          setLatestDOMUpdate(message.domUpdate);
        }
      } else if (message.type === 'pageContentUpdated') {
        if (message.tabId === currentTabId && message.data) {
          debug.log('[ContentManager] Received page content update from background');
          
          // Skip if we just received this content via direct response
          if (lastDirectResponseTimestampRef.current === message.data.timestamp) {
            debug.log('[ContentManager] Skipping broadcast - already processed via direct response');
            return;
          }
          
          const timestamp = Date.now();
          
          // Update cache
          const cacheKey = `${message.tabId}`;
          contentCacheRef.current.set(cacheKey, {
            content: message.data,
            timestamp,
            tabId: message.tabId
          });
          
          // Only update state if we don't already have this exact content
          const isDifferentContent = contentState.current?.timestamp !== message.data.timestamp;
          if (isDifferentContent) {
            setContentState(prev => ({
              current: message.data,
              previous: prev.current,
              status: 'ready',
              lastFetch: timestamp,
              error: undefined
            }));
          } else {
            debug.log('[ContentManager] Skipping duplicate content update (same timestamp)');
          }
        }
      }
    };
    
    chrome.runtime.onMessage.addListener(handleMessage);
    
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      // Clear timer on cleanup
      if (autoRefreshTimerRef.current) {
        clearTimeout(autoRefreshTimerRef.current);
        autoRefreshTimerRef.current = null;
      }
    };
  }, [currentTabId, isActive, contentState.current]);

  return {
    contentState,
    showStaleIndicator,
    latestDOMUpdate,
    fetchFreshPageContent,
    clearCache
  };
};
