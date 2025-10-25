import { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react';
import React from 'react';
import type { FC, CSSProperties } from 'react';
import { CopilotKit } from '@copilotkit/react-core';
import { useStorage, debug } from '@extension/shared';
import { sessionStorage, preferencesStorage } from '@extension/storage';
import { StatusBar } from './components/StatusBar';
import { ChatInner } from './components/ChatInner';
import { useContentRefresh } from './hooks/useContentRefresh';
import { useMessagePersistence } from './hooks/useMessagePersistence';
import { useTabManagement } from './hooks/useTabManagement';
import { usePanelVisibility } from './hooks/usePanelVisibility';

interface ChatSessionProps {
  sessionId: string;
  isLight: boolean;
  publicApiKey: string;
  isActive?: boolean; // Add prop to indicate if this session is active
}

export const ChatSession: FC<ChatSessionProps> = ({ sessionId, isLight, publicApiKey, isActive = true }) => {
  const { sessions } = useStorage(sessionStorage);
  const { showSuggestions } = useStorage(preferencesStorage);
  const [currentMessages, setCurrentMessages] = useState<any[]>([]);
  const [headlessMessagesCount, setHeadlessMessagesCount] = useState<number>(0); // Track messages from useCopilotChatHeadless_c
  const [isLoading, setIsLoading] = useState(true);
  const [isAgentLoading, setIsAgentLoading] = useState(false); // Track if agent is processing
  const [themeColor, setThemeColor] = useState("#E5E7EB");
  
  // Message data structure returned by saveMessagesRef
  interface MessageData {
    allMessages: any[];
    filteredMessages: any[];
  }
  
  // Refs to access CopilotKit's setMessages from ChatInner
  const saveMessagesRef = useRef<(() => MessageData) | null>(null);
  const restoreMessagesRef = useRef<((messages: any[]) => void) | null>(null);
  const resetChatRef = useRef<(() => void) | null>(null);
  
  // OPTIMIZATION: Use tab management hook to consolidate tab tracking logic
  const {
    currentTabId,
    setCurrentTabId,
    currentTabTitle,
    setCurrentTabTitle,
    currentTabTitleRef,
    tabTitleVersion,
    setTabTitleVersion,
    getCurrentTabTitle
  } = useTabManagement({ isActive });
  
  // OPTIMIZATION: Use panel visibility hook first (needed by message persistence)
  const {
    isPanelVisible,
    setIsPanelVisible,
    isPanelInteractive,
    setIsPanelInteractive,
    isPanelActive,
    panelJustOpenedRef
  } = usePanelVisibility({
    isActive,
    onVisibilityChange: (isVisible) => handleVisibilityChangeCallback.current?.(isVisible),
    onClickInPanel: (event) => handleClickInPanelCallback.current?.(event)
  });
  
  // OPTIMIZATION: Use message persistence hook to consolidate save/load logic
  const {
    storedMessages,
    storedFilteredMessagesCount,
    setStoredMessages,
    handleSaveMessages,
    handleLoadMessages,
    saveMessagesToStorage
  } = useMessagePersistence({
    sessionId,
    isActive,
    isPanelVisible,
    saveMessagesRef,
    restoreMessagesRef
  });
  
  // Load stored agent step state for this session
  const initialAgentStepState = useMemo(() => {
    const storedState = sessionStorage.getAgentStepState(sessionId);
    if (storedState) {
      return storedState;
    }
    return {
      steps: [],
    };
  }, [sessionId]);
  
  // Track current agent step state
  const [currentAgentStepState, setCurrentAgentStepState] = useState(initialAgentStepState);
  
  // Save agent step state to storage whenever it changes
  useEffect(() => {
    if (currentAgentStepState) {
      sessionStorage.updateAgentStepState(sessionId, currentAgentStepState);
    }
  }, [sessionId, currentAgentStepState]);
  
  // Forward declarations for callbacks (defined below after dependencies)
  const handleVisibilityChangeCallback = useRef<((isVisible: boolean) => void) | null>(null);
  const handleClickInPanelCallback = useRef<((event?: Event) => void) | null>(null);
  
  // Track if content is stale and user should refresh
  const [showStaleIndicator, setShowStaleIndicator] = useState(false);
  
  // Track latest incremental DOM update (for real-time updates during multi-step actions)
  const [latestDOMUpdate, setLatestDOMUpdate] = useState<any>(null);
  
  // Enhanced content state management to prevent flickering
  const [contentState, setContentState] = useState<{
    current: any;
    previous: any;
    status: 'none' | 'loading' | 'refreshing' | 'ready' | 'error';
    lastFetch: number;
    error?: string;
  }>({
    current: null,
    previous: null,
    status: 'none',
    lastFetch: 0,
    error: undefined
  });
  
  // Content cache to prevent unnecessary refetches
  const contentCacheRef = useRef<Map<string, { content: any; timestamp: number; tabId: number }>>(new Map());
  
  // Track last content timestamp received via direct response (to avoid duplicate processing from broadcast)
  const lastDirectResponseTimestampRef = useRef<number | null>(null);
  
  // Helper function to check if content is fresh (less than 30 seconds old)
  const isContentFresh = useCallback((timestamp: number) => {
    return Date.now() - timestamp < 30000; // 30 seconds
  }, []);
  
  // Derived state for backward compatibility and cleaner access
  const currentPageContent = contentState.current || contentState.previous;
  const isContentFetching = contentState.status === 'loading' || contentState.status === 'refreshing';
  
  // Track auto-refresh timer for inactive panel
  const autoRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Monitor for actual DOM changes on the current tab
  useEffect(() => {
    if (!isActive) return;
    
    const handleMessage = (message: any) => {
      if (message.type === 'contentBecameStale' && message.tabId === currentTabId) {
        // Show indicator immediately
        debug.log('[ChatSession] Content became stale (auto-refresh SCHEDULED)');
        setShowStaleIndicator(true);

        // Capture the incremental DOM update if available
        if (message.domUpdate) {
          debug.log('[ChatSession] Received incremental DOM update:', message.domUpdate.summary);
          setLatestDOMUpdate(message.domUpdate);
        }

        // Always invalidate cache for this tab so the next fetch is fresh
        const cacheKey = `${message.tabId}`;
        contentCacheRef.current.delete(cacheKey);

        // If panel is active OR assistant is streaming, refresh immediately
        if (isPanelActive || isAgentLoading) {
          debug.log('[ChatSession] Immediate auto-refresh (panel active or assistant streaming)');
          fetchFreshPageContent(true, message.tabId);
          setShowStaleIndicator(false);
          // Clear any pending timer
          if (autoRefreshTimerRef.current) {
            clearTimeout(autoRefreshTimerRef.current);
            autoRefreshTimerRef.current = null;
          }
          return;
        }

        // Panel inactive: wait for user interaction; do not schedule background refresh
        if (autoRefreshTimerRef.current) {
          clearTimeout(autoRefreshTimerRef.current);
          autoRefreshTimerRef.current = null;
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
  }, [currentTabId, isActive, isPanelActive, isAgentLoading]);
  // TODO: Implement proper message persistence using CopilotKit's persistence API
  // See: https://docs.copilotkit.ai/langgraph/persistence/message-persistence
  // Current approach: Keep all chat sessions mounted but hidden to preserve state
  // Future: Use CopilotKit's built-in persistence layer for better memory management
  
  // Get the current session
  const currentSession = sessions.find(s => s.id === sessionId);
  const sessionTitle = currentSession?.title || 'New Session';

  // Function to fetch fresh page content with intelligent caching and stale-while-revalidate pattern
  const fetchFreshPageContent = useCallback(async (force = false, tabIdOverride?: number) => {
    const tabId = tabIdOverride || currentTabId;
    
    if (!tabId) {
      debug.log('[ChatSession] No tab ID available');
      return;
    }
    
    // Check cache first (unless forced)
    if (!force) {
      const cacheKey = `${tabId}`;
      const cached = contentCacheRef.current.get(cacheKey);
      
      if (cached && isContentFresh(cached.timestamp)) {
        debug.log('[ChatSession] Using fresh cached content');
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
      if (isContentFetching) {
        debug.log('[ChatSession] Already fetching content');
        return;
      }
    } else {
      // When forced, always proceed regardless of current fetching state
      debug.log('[ChatSession] Force refresh requested - bypassing cache and fetching checks');
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
    
    debug.log(`[ChatSession] ${newStatus === 'refreshing' ? 'Refreshing' : 'Loading'} page content...`);

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
        debug.log('[ChatSession] Content loaded:', response.content);
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
        if (contentCacheRef.current.size > 5) {
          const entries = Array.from(contentCacheRef.current.entries());
          entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
          contentCacheRef.current.clear();
          entries.slice(0, 5).forEach(([key, value]) => {
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
        debug.log('[ChatSession] Failed to load content:', response?.error);
        setContentState(prev => ({
          ...prev,
          status: prev.current ? 'ready' : 'error', // Keep existing content if available
          error: response?.error || 'Failed to load content'
        }));
      }
    } catch (error) {
      debug.error('[ChatSession] Error fetching fresh page content:', error);
      setContentState(prev => ({
        ...prev,
        status: prev.current ? 'ready' : 'error', // Keep existing content if available
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }));
    }
  }, [currentTabId, isContentFetching, contentState.current, isContentFresh]);

  // OPTIMIZATION: Use consolidated refresh hook to eliminate code duplication
  const { triggerManualRefresh } = useContentRefresh({
    setCurrentTabId,
    setCurrentTabTitle,
    currentTabTitleRef,
    setTabTitleVersion,
    contentCacheRef,
    fetchFreshPageContent,
    setIsPanelInteractive,
    isPanelInteractive
  });

  // Manual load function using CopilotKit API

  // PERFORMANCE OPTIMIZATION: Debounced save to reduce storage operations during rapid changes
  const debouncedSaveRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedSave = useCallback((messagesToSave: any[]) => {
    // Clear any pending save
    if (debouncedSaveRef.current) {
      clearTimeout(debouncedSaveRef.current);
    }
    
    // Schedule new save after 500ms of inactivity
    debouncedSaveRef.current = setTimeout(() => {
      saveMessagesToStorage(messagesToSave);
      debouncedSaveRef.current = null;
    }, 500);
  }, [saveMessagesToStorage]);

  // Auto-save when session becomes inactive (user switches sessions)
  const previousIsActiveRef = useRef(isActive);
  
  useEffect(() => {
    const wasActive = previousIsActiveRef.current;
    const isBecomingInactive = wasActive && !isActive;
    
    // Auto-save when session transitions from active to inactive
    if (isBecomingInactive && saveMessagesRef.current) {
      const messageData = saveMessagesRef.current();
      const allMessages = messageData.allMessages || [];
      if (allMessages && allMessages.length > 0) {
        // Use debounced save to avoid excessive storage operations
        debouncedSave(allMessages);
      }
    }
    
    previousIsActiveRef.current = isActive;
  }, [isActive, debouncedSave]);

  // Auto-save when panel is closing (listen for custom event from SidePanel)
  useEffect(() => {
    const handlePanelClosing = () => {
      if (saveMessagesRef.current) {
        const messageData = saveMessagesRef.current();
        const allMessages = messageData.allMessages || [];
        if (allMessages && allMessages.length > 0) {
          // Cancel any pending debounced save
          if (debouncedSaveRef.current) {
            clearTimeout(debouncedSaveRef.current);
            debouncedSaveRef.current = null;
          }
          // Save immediately on panel close (no debounce)
          saveMessagesToStorage(allMessages);
        }
      }
    };

    window.addEventListener('panelClosing', handlePanelClosing as EventListener);
    
    return () => {
      window.removeEventListener('panelClosing', handlePanelClosing as EventListener);
    };
  }, [saveMessagesToStorage]);

  // Define visibility change callback for content-specific logic
  handleVisibilityChangeCallback.current = (isVisible: boolean) => {
      if (!isVisible) {
      // When panel becomes hidden, clear cache so content is fresh when panel reopens
      debug.log('[ChatSession] Panel hidden, clearing content cache');
        contentCacheRef.current.clear();
      }
    // Panel opened flag is now managed by usePanelVisibility hook
    };

  // Define click handler callback for content-specific logic
  // Note: Basic state management is handled by usePanelVisibility hook
  handleClickInPanelCallback.current = (event?: Event) => {
      // Check if click target is an element that should NOT trigger auto-focus
      const target = event?.target as HTMLElement;
      if (target) {
        // Don't auto-focus if clicking on:
        // - Session tabs or navigation (data-session-id attribute)
        // - Session tabs container (class contains 'session')
        // - Buttons (save, load, refresh, etc.)
        // - Input fields or textareas (already focused)
        // - Links
        // - Any element with contenteditable
        const shouldSkipFocus = 
          target.closest('button') || 
          target.closest('input') || 
          target.closest('textarea') ||
          target.closest('a') ||
          target.closest('[role="tab"]') ||
          target.closest('[role="button"]') ||
          target.closest('[data-session-id]') || // Session tabs
          target.closest('.session-tabs-scroll') || // Session tabs container
          target.closest('[contenteditable="true"]') || // Editable content
          target.matches('button') ||
          target.matches('input') ||
          target.matches('textarea') ||
          target.matches('[contenteditable="true"]') ||
          // Check if clicking on session tab by class name
          (target.className && typeof target.className === 'string' && 
           (target.className.includes('session') || 
            target.className.includes('cursor-pointer')));
          
        if (shouldSkipFocus) {
          // debug.log('[ChatSession] Click on interactive element, skipping auto-focus', {
          //   element: target.tagName,
          //   classes: target.className,
          //   closest: {
          //     button: !!target.closest('button'),
          //     sessionId: !!target.closest('[data-session-id]'),
          //     sessionTabs: !!target.closest('.session-tabs-scroll')
          //   }
          // });
          // Still mark as interactive, but don't auto-focus
          if (!isPanelInteractive) {
            setIsPanelInteractive(true);
            debug.log('[ChatSession] User clicked in panel, marking as interactive (no auto-focus)');
          }
          return;
        }
      }
      
      // User clicked inside the panel - mark as interactive
      const wasInactive = !isPanelInteractive;
      
      if (wasInactive) {
        setIsPanelInteractive(true);
        debug.log('[ChatSession] User clicked in panel, marking as interactive');
        
        // Cancel any pending auto-refresh timer
        if (autoRefreshTimerRef.current) {
          clearTimeout(autoRefreshTimerRef.current);
          autoRefreshTimerRef.current = null;
          debug.log('[ChatSession] Cancelled auto-refresh timer (user clicked)');
        }
        
        // Clear stale indicator if showing
        if (showStaleIndicator) {
          setShowStaleIndicator(false);
        }
        
        // CACHE INVALIDATION: Only invalidate cache if stale
        // Don't trigger fetch here - let useEffect handle it to avoid race conditions
        if (currentTabId) {
          const cacheKey = `${currentTabId}`;
          const cached = contentCacheRef.current.get(cacheKey);
          
          // If cache is stale, clear it so useEffect knows to fetch fresh content
          if (!cached || !isContentFresh(cached.timestamp)) {
            contentCacheRef.current.delete(cacheKey);
            debug.log('[ChatSession] Click: Cache invalidated - stale content. useEffect will fetch fresh content.');
          } else {
            debug.log('[ChatSession] Click: Cache is fresh (<30s old), no invalidation needed');
          }
        }
        // Let the useEffect handle all content fetching when isPanelInteractive becomes true
      }
        
      // PERFORMANCE FIX: Simplified auto-focus (removed aggressive polling and MutationObserver)
      // Old approach: 8 polling attempts (1.6s) + MutationObserver (3s) = 4.6s of overhead
      // New approach: Single attempt with minimal delay
      if (wasInactive) {
        // Simple, non-blocking focus attempt
          setTimeout(() => {
          // Try the most common selector first
          const input = document.querySelector('.copilotKitInput textarea') as HTMLTextAreaElement;
              if (input && input.offsetParent !== null) {
                input.focus();
            debug.log('[ChatSession] ✅ Auto-focused chat input');
          }
          // If that fails, user can click the input themselves (better UX than freezing)
        }, 100); // Single 100ms delay instead of 1.6s of polling
      }
      
      // REMOVED: Duplicate fetch logic (Lines 484-505)
      // Content refresh is now handled by cache freshness check above (Lines 447-465)
      // This prevents double/triple refresh when panel becomes interactive
  }; // End of click handler callback assignment
  // Note: Event listeners are managed by usePanelVisibility hook

  // Initialize loading state
  // Note: Message loading is now handled by useMessagePersistence hook
  useEffect(() => {
        setIsLoading(false);
  }, [sessionId]);

  // Smart content management when switching sessions or when session becomes active
  const previousSessionId = useRef<string | null>(null);
  const previousIsActive = useRef<boolean>(false);
  
  useEffect(() => {
    const sessionChanged = sessionId && previousSessionId.current && previousSessionId.current !== sessionId;
    const becameActive = isActive && !previousIsActive.current && currentTabId;
    const needsRefreshAfterPanelOpen = panelJustOpenedRef.current && isActive;
    
    if ((sessionChanged || becameActive || needsRefreshAfterPanelOpen) && currentTabId) {
      const reason = sessionChanged ? 'Session switched' : 
                    becameActive ? 'Session became active' :
                    'Panel reopened';
      debug.log(`[ChatSession] ${reason}, forcing content refresh`);
      
      // If panel just opened, force refresh with current tab (cache was cleared)
      if (needsRefreshAfterPanelOpen) {
        debug.log('[ChatSession] Forcing refresh after panel reopen for session:', sessionId);
        panelJustOpenedRef.current = false; // Reset flag
        
        // Get current tab first, then fetch content
        chrome.runtime.sendMessage({ type: 'getCurrentTab' }, (response) => {
          if (response?.tabId) {
            debug.log('[ChatSession] Panel reopen - updating to current tab:', response.tabId, response.title);
            setCurrentTabId(response.tabId);
            setCurrentTabTitle(response.title || '');
            currentTabTitleRef.current = response.title || '';
            setTabTitleVersion(prev => prev + 1);
            
            setTimeout(() => {
              fetchFreshPageContent(true, response.tabId); // Force refresh with new tab ID
            }, 100);
          }
        });
        
        previousSessionId.current = sessionId;
        previousIsActive.current = isActive;
        return;
      }
      
      // ALWAYS force refresh when session becomes active, regardless of cache
      if (becameActive) {
        debug.log('[ChatSession] Session became active, forcing fresh content');
        
        // Clear stale indicator if it was showing
        if (showStaleIndicator) {
          setShowStaleIndicator(false);
          debug.log('[ChatSession] Cleared stale indicator, refreshing content');
        }
        
        // CACHE INVALIDATION: Clear cache when session becomes active (tab switched)
        // This ensures agent always has fresh content when switching sessions
        if (currentTabId) {
          const cacheKey = `${currentTabId}`;
          contentCacheRef.current.delete(cacheKey);
          debug.log('[ChatSession] Cache invalidated - session became active (tab switched)');
        }
        
        setTimeout(() => {
          fetchFreshPageContent(true, currentTabId); // Force refresh when session becomes active
        }, 100);
        
        previousSessionId.current = sessionId;
        previousIsActive.current = isActive;
        return;
      }
      
      // For session switches, check cache first to avoid flickering
      if (sessionChanged) {
        // CACHE INVALIDATION: Clear cache when switching sessions
        // This ensures agent always has fresh content when switching between sessions
        const cacheKey = `${currentTabId}`;
        contentCacheRef.current.delete(cacheKey);
        debug.log('[ChatSession] Cache invalidated - session switched');
        
        // Force refresh immediately to get fresh content
        debug.log('[ChatSession] Session switched, forcing refresh');
          setTimeout(() => {
            fetchFreshPageContent(true, currentTabId); // Force refresh
          }, 100);
      }
    }
    
    previousSessionId.current = sessionId;
    previousIsActive.current = isActive;
  }, [sessionId, currentTabId, isActive, isContentFresh, showStaleIndicator, fetchFreshPageContent]);

  // Get current tab for on-demand content fetching (runs for ALL sessions when panel is visible)
  const initialTabFetchRef = useRef<boolean>(false);
  const lastPanelVisibleState = useRef<boolean>(isPanelVisible);
  const isFetchingRef = useRef<boolean>(false); // Prevent duplicate fetches from racing handlers
  
  useEffect(() => {
    // Detect when panel transitions from hidden to visible for ANY session
    const panelJustBecameVisible = !lastPanelVisibleState.current && isPanelVisible;
    if (panelJustBecameVisible) {
      debug.log('[ChatSession] Panel became visible, setting refresh flag for session:', sessionId);
      panelJustOpenedRef.current = true;
    }
    lastPanelVisibleState.current = isPanelVisible;
    
    // Only run for active session AND when:
    // 1. Panel is interactive (user clicked), OR
    // 2. Panel just opened (needs initial content fetch), OR
    // 3. First time for this session (new session tabs need initial content)
    // This prevents content extraction when panel is just visible but not being used
    const isFirstTime = !initialTabFetchRef.current;
    const shouldFetchContent = isPanelInteractive || panelJustOpenedRef.current || isFirstTime;
    debug.log('[ChatSession] useEffect check:', { isActive, isPanelInteractive, panelJustOpened: panelJustOpenedRef.current, isFirstTime, shouldFetchContent });
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
            const needsRefreshAfterPanelOpen = panelJustOpenedRef.current;
            const tabChanged = currentTabId && currentTabId !== response.tabId;
            
            setCurrentTabId(response.tabId);
            setCurrentTabTitle(response.title || '');
            currentTabTitleRef.current = response.title || '';
            setTabTitleVersion(prev => prev + 1);
            
            // Auto-fetch content in these cases:
            // 1. First time getting tab for this session (includes new session tabs)
            // 2. Panel was just opened (existing session needs refresh)
            // 3. Tab changed while panel was visible
            // 4. Panel became interactive and cache is missing/stale
            const cacheKey = `${response.tabId}`;
            const cached = contentCacheRef.current.get(cacheKey);
            const cacheIsFresh = cached && isContentFresh(cached.timestamp);
            const needsFetch = isFirstTimeGettingTab || needsRefreshAfterPanelOpen || tabChanged || !cacheIsFresh;
            
            if (needsFetch) {
              const reason = isFirstTimeGettingTab ? 'first time' : 
                            needsRefreshAfterPanelOpen ? 'panel just opened' : 
                            tabChanged ? 'tab changed' :
                            'cache stale/missing';
              debug.log(`[ChatSession] useEffect: Auto-fetching content (${reason})`);
              
              panelJustOpenedRef.current = false; // Reset flag
              
              // Only fetch if not already loading or fetching
              if (contentState.status !== 'loading' && !isFetchingRef.current) {
                isFetchingRef.current = true;
                // Set initialTabFetchRef ONLY after we actually start fetching
                initialTabFetchRef.current = true;
                // PERFORMANCE: Removed 300ms delay for instant content fetch
                fetchFreshPageContent(true).finally(() => {
                  isFetchingRef.current = false;
                }); // Force refresh
              } else {
                debug.log('[ChatSession] useEffect: Skipping fetch - already loading or fetching');
              }
            } else {
              debug.log('[ChatSession] useEffect: Cache is fresh, no fetch needed');
              panelJustOpenedRef.current = false; // Reset flag even if not fetching
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

    // Listen for URL changes and page content updates
    const handleMessage = (message: any) => {
      if (message.type === 'urlChanged') {
        if (message.tabId === currentTabId) {
          debug.log('[ChatSession] URL changed, forcing auto refresh');
          
          // Clear cache for this tab since URL changed
          const cacheKey = `${message.tabId}`;
          contentCacheRef.current.delete(cacheKey);
          
          // Get fresh tab info including title
          chrome.runtime.sendMessage({ type: 'getCurrentTab' }, (response) => {
            if (response?.tabId === message.tabId && response.title) {
              currentTabTitleRef.current = response.title;
              setTabTitleVersion(prev => prev + 1);
            }
          });
          
          // PERFORMANCE: Removed 300ms delay for instant content fetch on URL change
            fetchFreshPageContent(true, message.tabId); // Force refresh for URL change
        }
      } else if (message.type === 'pageContentUpdated') {
        if (message.tabId === currentTabId && message.data) {
          debug.log('[ChatSession] Received page content update from background');
          
          // Skip if we just received this content via direct response
          // This prevents duplicate processing when both direct response and broadcast message arrive
          if (lastDirectResponseTimestampRef.current === message.data.timestamp) {
            debug.log('[ChatSession] Skipping broadcast - already processed via direct response');
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
          // This prevents duplicate updates when both direct response and broadcast message arrive
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
            debug.log('[ChatSession] Skipping duplicate content update (same timestamp)');
          }
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [currentTabId, isActive, isPanelVisible, isPanelInteractive]); // Need isPanelInteractive to trigger when user clicks


  // Smart tab change handling with content preservation (only for active session)
  const tabChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    // CRITICAL: Only listen to tab changes when session is active AND panel is interactive
    // This prevents unnecessary refreshes when user switches tabs while panel is inactive
    // (the cache freshness check on click will handle refresh when panel becomes active)
    if (!isActive || !isPanelInteractive) return;
    
    const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      const previousTabId = currentTabId;
      
      // Only process if tab actually changed
      if (previousTabId === activeInfo.tabId) return;
      
      debug.log(`[ChatSession] Tab activated (active panel): ${previousTabId} -> ${activeInfo.tabId}`);
      
      // Update tab ID immediately to avoid race conditions
      setCurrentTabId(activeInfo.tabId);
      
      // Check cache first for immediate content display
      const cacheKey = `${activeInfo.tabId}`;
      const cached = contentCacheRef.current.get(cacheKey);
      
      if (cached && isContentFresh(cached.timestamp)) {
        // Use cached content immediately to prevent flickering
        debug.log('[ChatSession] Using cached content for tab switch');
        setContentState(prev => ({
          current: cached.content,
          previous: prev.current,
          status: 'ready',
          lastFetch: cached.timestamp,
          error: undefined
        }));
      } else {
        // Content is stale or missing, refresh in background
        if (tabChangeTimeoutRef.current) {
          clearTimeout(tabChangeTimeoutRef.current);
        }
        tabChangeTimeoutRef.current = setTimeout(() => {
          fetchFreshPageContent(false, activeInfo.tabId); // Pass the new tab ID explicitly
        }, 200); // Shorter delay for better UX
      }
    };

    const handleTabUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      // Handle URL changes - force auto refresh
      if (tabId === currentTabId && changeInfo.url) {
        debug.log('[ChatSession] URL changed for current tab, forcing auto refresh');
        
        // Clear cache for this tab since URL changed
        const cacheKey = `${tabId}`;
        contentCacheRef.current.delete(cacheKey);
        
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
          fetchFreshPageContent(true, tabId); // FORCE refresh for URL changes
        }, 500); // Moderate debounce for URL changes
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
  }, [currentTabId, isActive, isPanelVisible, isPanelInteractive, isContentFresh]); // Run when panel is visible or interactive


  // OPTIMIZATION: Use extracted StatusBar component (eliminates ~200 lines of JSX)
  const statusBarElement = (
    <StatusBar
      isLight={isLight}
      isPanelInteractive={isPanelInteractive}
      currentTabId={currentTabId}
      isPanelVisible={isPanelVisible}
      contentState={contentState}
      getCurrentTabTitle={getCurrentTabTitle}
      onRefreshClick={triggerManualRefresh}
      onSaveClick={handleSaveMessages}
      onLoadClick={handleLoadMessages}
      showStaleIndicator={showStaleIndicator}
      isContentFetching={isContentFetching}
      headlessMessagesCount={headlessMessagesCount}
      storedMessagesCount={storedFilteredMessagesCount}
    />
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      
      {/* Save/Load buttons and Page Status - Fixed at top */}
      {statusBarElement}
      
      {/* Stale content notification banner */}
      {showStaleIndicator && isPanelActive && (
        <div className={`px-2 py-1.5 text-xs flex items-center gap-2 ${
          isLight 
            ? 'bg-orange-50 text-orange-800 border-b border-orange-200' 
            : 'bg-orange-900/20 text-orange-300 border-b border-orange-800'
        }`}>
          <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span className="flex-1">
            Page content changed
          </span>
          <button
            onClick={triggerManualRefresh}
            className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
              isLight
                ? 'bg-orange-100 hover:bg-orange-200 text-orange-900'
                : 'bg-orange-800 hover:bg-orange-700 text-orange-100'
            }`}
          >
            Refresh
          </button>
        </div>
      )}

      {/* Chat container */}
      <div 
        className={`flex-1 copilot-chat-container ${!isLight ? 'dark' : ''}`}
        style={{ 
          "--copilot-kit-primary-color": themeColor
        } as CSSProperties}
      >
        <CopilotKit 
          key={sessionId}
          runtimeUrl="http://localhost:3001/api/copilotkit/google-flash-lite-25"
          // publicApiKey="ck_pub_c94e406d9327510d0463f3dbe3c1f2e8"
          // agent="de_agent"
          publicLicenseKey="ck_pub_c94e406d9327510d0463f3dbe3c1f2e8"
          threadId={sessionId}
          transcribeAudioUrl="/api/transcribe"
          textToSpeechUrl="/api/tts"
        >
          <ChatInner
            sessionId={sessionId}
            sessionTitle={sessionTitle}
            currentPageContent={currentPageContent}
            latestDOMUpdate={latestDOMUpdate}
            themeColor={themeColor}
            setThemeColor={setThemeColor}
            setCurrentMessages={setCurrentMessages}
            saveMessagesToStorage={saveMessagesToStorage}
            setHeadlessMessagesCount={setHeadlessMessagesCount}
            saveMessagesRef={saveMessagesRef}
            restoreMessagesRef={restoreMessagesRef}
            resetChatRef={resetChatRef}
            setIsAgentLoading={setIsAgentLoading}
            showSuggestions={showSuggestions}
            initialAgentStepState={initialAgentStepState}
            onAgentStepStateChange={setCurrentAgentStepState}
          />
        </CopilotKit>
      </div>
      
      {/* Display chat history if available */}
      {storedMessages.length > 0 && (
        <div className="hidden">
          {/* Hidden element to store chat history metadata */}
          <div data-session-id={sessionId} data-message-count={storedMessages.length} />
        </div>
      )}
    </div>
  );
};

