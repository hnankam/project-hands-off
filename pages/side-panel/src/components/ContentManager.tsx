import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { debug } from '@extension/shared';
import { TIMING_CONSTANTS, ERROR_MESSAGES } from '../constants';

// ================================================================================
// TYPES & INTERFACES
// ================================================================================

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
  isPanelActive?: boolean;
  isAgentLoading?: boolean;
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

interface CacheEntry {
  content: any;
  timestamp: number;
  tabId: number;
}

// ================================================================================
// HELPER FUNCTIONS
// ================================================================================

/**
 * Log detailed content size and structure information
 */
const logContentDetails = (content: any, source: 'on-demand' | 'broadcast') => {
  const contentString = JSON.stringify(content);
  const totalSizeKB = (contentString.length / 1024).toFixed(2);
  const totalSizeMB = (contentString.length / (1024 * 1024)).toFixed(2);
  
  debug.log( `[ContentManager] Received content size (${source}):`);
  debug.log( `   Total size: ${totalSizeKB} KB (${totalSizeMB} MB)`);
  debug.log( `   URL: ${content.url}`);
  debug.log( `   Title: ${content.title}`);
  
  // Log sizes of individual content sections
  if (content.allDOMContent) {
    // Full HTML content
    if (content.allDOMContent.fullHTML) {
      const htmlSizeKB = (content.allDOMContent.fullHTML.length / 1024).toFixed(2);
      debug.log( `   - fullHTML: ${htmlSizeKB} KB`);
      debug.log( '     Sample:', content.allDOMContent.fullHTML.substring(0, 200));
    }
    
    // Text content
    if (content.textContent) {
      const textSizeKB = (content.textContent.length / 1024).toFixed(2);
      debug.log( `   - textContent: ${textSizeKB} KB`);
      debug.log( '     Sample:', content.textContent.substring(0, 200));
    }
    
    // Form data
    if (content.allDOMContent.allFormData) {
      const formDataSize = (JSON.stringify(content.allDOMContent.allFormData).length / 1024).toFixed(2);
      debug.log( `   - allFormData: ${formDataSize} KB (${content.allDOMContent.allFormData.length} elements)`);
      if (content.allDOMContent.allFormData.length > 0) {
        debug.log( '     First 10 elements:', content.allDOMContent.allFormData.slice(0, 10).map((f: any) => ({
          isUnique: f.isUnique,  // Globally unique - FIRST for console visibility
          selector: f.bestSelector,  // Always globally unique
          type: f.type,
          name: f.name,
          label: f.label,
          foundInShadowDOM: f.foundInShadowDOM,
          shadowPath: f.shadowPath,
          shadowDepth: f.shadowDepth,
          shadowHostSelector: f.shadowHostSelector
        })));
      }
    }
    
    // Clickable elements
    if (content.allDOMContent.clickableElements) {
      const clickableSize = (JSON.stringify(content.allDOMContent.clickableElements).length / 1024).toFixed(2);
      debug.log( `   - clickableElements: ${clickableSize} KB (${content.allDOMContent.clickableElements.length} elements)`);
      if (content.allDOMContent.clickableElements.length > 0) {
        debug.log( '     First 10 elements:', content.allDOMContent.clickableElements.slice(0, 10).map((c: any) => ({
          isUnique: c.isUnique,  // Globally unique - FIRST for console visibility
          selector: c.selector,  // Always globally unique
          tagName: c.tagName,
          text: c.text?.substring(0, 50),
          foundInShadowDOM: c.foundInShadowDOM,
          shadowPath: c.shadowPath,
          shadowDepth: c.shadowDepth,
          shadowHostSelector: c.shadowHostSelector
        })));
      }
    }
    
    // Shadow DOM content
    if (content.allDOMContent.shadowContent && content.allDOMContent.shadowContent.length > 0) {
      const shadowSize = (JSON.stringify(content.allDOMContent.shadowContent).length / 1024).toFixed(2);
      debug.log( `   - shadowContent: ${shadowSize} KB (${content.allDOMContent.shadowContent.length} shadow roots)`);
    }
  }
};

/**
 * Update cache with new content and clean old entries
 */
const updateCache = (
  cache: Map<string, CacheEntry>,
  key: string,
  content: any,
  timestamp: number,
  tabId: number
) => {
  // Update cache
  cache.set(key, { content, timestamp, tabId });
  
  // Clean old cache entries (keep only last MAX_CACHE_SIZE)
  if (cache.size > TIMING_CONSTANTS.MAX_CACHE_SIZE) {
    const entries = Array.from(cache.entries());
    entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
    cache.clear();
    entries.slice(0, TIMING_CONSTANTS.MAX_CACHE_SIZE).forEach(([k, v]) => {
      cache.set(k, v);
    });
  }
};

// ================================================================================
// MAIN HOOK
// ================================================================================

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
  isPanelActive = false,
  isAgentLoading = false,
  onContentStateChange,
  onStaleIndicatorChange,
  onDOMUpdate
}: ContentManagerProps): ContentManagerReturn => {
  
  // ================================================================================
  // STATE
  // ================================================================================
  
  const [contentState, setContentState] = useState<ContentState>({
    current: null,
    previous: null,
    status: 'none',
    lastFetch: 0,
    error: undefined
  });
  
  const [showStaleIndicator, setShowStaleIndicator] = useState(false);
  const [latestDOMUpdate, setLatestDOMUpdate] = useState<any>(null);
  
  // ================================================================================
  // REFS
  // ================================================================================
  
  // Refs for stable access to latest state without triggering re-renders
  const contentStateRef = useRef<ContentState>(contentState);
  const currentTabIdRef = useRef<number | null>(currentTabId);
  
  // Update refs when state changes (no re-render trigger)
  useEffect(() => {
    contentStateRef.current = contentState;
  }, [contentState]);
  
  useEffect(() => {
    currentTabIdRef.current = currentTabId;
  }, [currentTabId]);
  
  // Content cache to prevent unnecessary refetches
  const contentCacheRef = useRef<Map<string, CacheEntry>>(new Map());
  
  // Track last content timestamp received via direct response
  const lastDirectResponseTimestampRef = useRef<number | null>(null);
  
  // Auto-refresh timer for inactive panel (currently unused but kept for future)
  const autoRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // ================================================================================
  // HELPER FUNCTIONS
  // ================================================================================
  
  /**
   * Check if content is fresh based on CACHE_TTL
   */
  const isContentFresh = useCallback((timestamp: number) => {
    return Date.now() - timestamp < TIMING_CONSTANTS.CACHE_TTL;
  }, []);
  
  /**
   * Clear all cached content
   */
  const clearCache = useCallback(() => {
    contentCacheRef.current.clear();
    debug.log( '[ContentManager] Cache cleared');
  }, []);
  
  // ================================================================================
  // EFFECTS - PARENT COMPONENT UPDATES
  // ================================================================================
  
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
  
  // ================================================================================
  // CONTENT FETCHING
  // ================================================================================
  
  /**
   * Fetch fresh page content with intelligent caching
   * @param force - Force refresh bypassing cache
   * @param tabIdOverride - Override current tab ID
   */
  const fetchFreshPageContent = useCallback(async (force = false, tabIdOverride?: number) => {
    const tabId = tabIdOverride || currentTabId;
    
    if (!tabId) {
      debug.log( '[ContentManager] No tab ID available');
      return;
    }
    
    // Check cache first (unless forced)
    if (!force) {
      const cacheKey = `${tabId}`;
      const cached = contentCacheRef.current.get(cacheKey);
      
      if (cached && isContentFresh(cached.timestamp)) {
        debug.log( '[ContentManager] Using fresh cached content');
        setContentState(prev => ({
          current: cached.content,
          previous: prev.current,
          status: 'ready',
          lastFetch: cached.timestamp,
          error: undefined
        }));
        return;
      }
      
      // Skip if already fetching (only when not forced) - use ref for stable check
      const currentStatus = contentStateRef.current.status;
      if (currentStatus === 'loading' || currentStatus === 'refreshing') {
        debug.log( '[ContentManager] Already fetching content');
        return;
      }
    } else {
      debug.log( '[ContentManager] Force refresh requested - bypassing cache and fetching checks');
    }

    // Determine if this is a refresh (has existing content) or initial load - use ref
    const hasExistingContent = contentStateRef.current.current !== null;
    const newStatus = hasExistingContent ? 'refreshing' : 'loading';
    
    // Update state to show loading/refreshing without clearing existing content
    setContentState(prev => ({
      ...prev,
      status: newStatus,
      lastFetch: Date.now(),
      error: undefined
    }));
    
    debug.log( `[ContentManager] ${newStatus === 'refreshing' ? 'Refreshing' : 'Loading'} page content...`);

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
        debug.log( '[ContentManager] Content loaded:', response.content);
        
        // Log detailed content information
        logContentDetails(response.content, 'on-demand');
        
        const timestamp = response.content.timestamp || Date.now();
        
        // Track this timestamp to avoid duplicate processing from broadcast
        lastDirectResponseTimestampRef.current = timestamp;
        
        // Update cache
        updateCache(contentCacheRef.current, `${tabId}`, response.content, timestamp, tabId);
        
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
        debug.log( '[ContentManager] Failed to load content:', response?.error);
        setContentState(prev => ({
          ...prev,
          status: prev.current ? 'ready' : 'error', // Keep existing content if available
          error: response?.error || ERROR_MESSAGES.CONTENT_FETCH_FAILED
        }));
      }
    } catch (error) {
      debug.error( '[ContentManager] Error fetching fresh page content:', error);
      setContentState(prev => ({
        ...prev,
        status: prev.current ? 'ready' : 'error', // Keep existing content if available
        error: error instanceof Error ? error.message : ERROR_MESSAGES.CONTENT_FETCH_FAILED
      }));
    }
  }, [currentTabId, isContentFresh]); // Reduced dependencies using refs

  // ================================================================================
  // MESSAGE HANDLING
  // ================================================================================
  
  /**
   * Handle content became stale message
   */
  const handleContentBecameStale = useCallback((message: any) => {
    // Use ref for stable comparison
    if (message.tabId !== currentTabIdRef.current) return;
    
    // Show indicator immediately
    debug.log( '[ContentManager] Content became stale');
    setShowStaleIndicator(true);
      
    // Capture the incremental DOM update if available
    if (message.domUpdate) {
      debug.log( '[ContentManager] Received incremental DOM update:', message.domUpdate);
      setLatestDOMUpdate(message.domUpdate);
    }

    // Invalidate cache for this tab so the next fetch is fresh
    const cacheKey = `${message.tabId}`;
    contentCacheRef.current.delete(cacheKey);

    // Check if fetch already in-flight
    const status = contentStateRef.current.status;
    if (status === 'loading' || status === 'refreshing') {
      debug.log( '[ContentManager] Skipping auto-refresh – fetch already in progress');
      return;
    }

    // Only refresh immediately if assistant is streaming (not just panel active)
    if (isAgentLoading) {
      debug.log( '[ContentManager] Immediate auto-refresh (assistant streaming)');
      void fetchFreshPageContent(true, message.tabId);
      setShowStaleIndicator(false);
      // Clear any pending timer
      if (autoRefreshTimerRef.current) {
        clearTimeout(autoRefreshTimerRef.current);
        autoRefreshTimerRef.current = null;
      }
      return;
    }

    // Panel active but agent not streaming: show stale indicator, no auto-refresh
    // User can manually refresh if needed
    if (autoRefreshTimerRef.current) {
      clearTimeout(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
    }
  }, [isPanelActive, isAgentLoading, fetchFreshPageContent]); // Stable
  
  /**
   * Handle page content updated message
   */
  const handlePageContentUpdated = useCallback((message: any) => {
    // Use ref for stable comparison
    if (message.tabId !== currentTabIdRef.current || !message.data) return;
    
    debug.log( '[ContentManager] Received page content update from background');
    
    // Skip if we just received this content via direct response
    if (lastDirectResponseTimestampRef.current === message.data.timestamp) {
      debug.log( '[ContentManager] Skipping broadcast - already processed via direct response');
      return;
    }
    
    // Log detailed content information
    logContentDetails(message.data, 'broadcast');
    
    const timestamp = Date.now();
    
    // Update cache
    updateCache(contentCacheRef.current, `${message.tabId}`, message.data, timestamp, message.tabId);
    
    // Only update state if we don't already have this exact content - use ref
    const isDifferentContent = contentStateRef.current.current?.timestamp !== message.data.timestamp;
    if (isDifferentContent) {
      setContentState(prev => ({
        current: message.data,
        previous: prev.current,
        status: 'ready',
        lastFetch: timestamp,
        error: undefined
      }));
    } else {
      debug.log( '[ContentManager] Skipping duplicate content update (same timestamp)');
    }
  }, []); // Stable - uses refs

  // ================================================================================
  // EFFECTS - MESSAGE LISTENERS
  // ================================================================================
  
  /**
   * Monitor for DOM changes and stale content (stable handlers = stable listener)
   */
  useEffect(() => {
    if (!isActive) return;
    
    const handleMessage = (message: any) => {
      if (message.type === 'contentBecameStale') {
        handleContentBecameStale(message);
      } else if (message.type === 'pageContentUpdated') {
        handlePageContentUpdated(message);
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
  }, [isActive, handleContentBecameStale, handlePageContentUpdated]); // Stable handlers now

  // ================================================================================
  // RETURN
  // ================================================================================

  // Memoize return object for stable reference
  return useMemo(() => ({
    contentState,
    showStaleIndicator,
    latestDOMUpdate,
    fetchFreshPageContent,
    clearCache
  }), [contentState, showStaleIndicator, latestDOMUpdate, fetchFreshPageContent, clearCache]);
};
