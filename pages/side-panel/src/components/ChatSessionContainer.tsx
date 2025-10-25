import React, { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react';
import type { FC, CSSProperties } from 'react';
import { CopilotKit } from '@copilotkit/react-core';
import { useStorage, debug } from '@extension/shared';
import { sessionStorage, preferencesStorage } from '@extension/storage';
import { StatusBar } from './StatusBar';
import { ChatInner } from './ChatInner';
import { SelectorsBar } from './SelectorsBar';
import { SettingsModal } from './SettingsModal';
import { UsagePopup } from './UsagePopup';
import { useContentManager, type ContentState } from './ContentManager';
import { useTabManager } from './TabManager';
import { useMessagePersistence } from '../hooks/useMessagePersistence';
import { usePanelVisibility } from '../hooks/usePanelVisibility';
import { useContentRefresh } from '../hooks/useContentRefresh';
import { useUsageStream } from '../hooks/useUsageStream';
import { useEmbeddingWorker } from '../hooks/useEmbeddingWorker';
import { usePageContentEmbedding } from '../hooks/usePageContentEmbedding';
import { useDOMUpdateEmbedding } from '../hooks/useDOMUpdateEmbedding';
import { useAgentSwitching } from '../hooks/useAgentSwitching';
import { useAutoSave } from '../hooks/useAutoSave';
import { TIMING_CONSTANTS, COPIOLITKIT_CONFIG } from '../constants';
import { ts } from '../utils/logging';

interface ChatSessionContainerProps {
  sessionId: string;
  isLight: boolean;
  publicApiKey: string;
  isActive?: boolean;
  contextMenuMessage?: string | null;
  onMessagesCountChange?: (sessionId: string, count: number) => void;
  onRegisterResetFunction?: (sessionId: string, resetFn: () => void) => void;
}

/**
 * ChatSessionContainer Component
 * 
 * Container component that orchestrates all chat session functionality
 * Manages content, tabs, messages, and panel visibility
 * Split from the original ChatSession.tsx for better maintainability
 */
export const ChatSessionContainer: FC<ChatSessionContainerProps> = memo(
  ({ sessionId, isLight, publicApiKey, isActive = true, contextMenuMessage = null, onMessagesCountChange, onRegisterResetFunction }) => {
  const { sessions } = useStorage(sessionStorage);
  const { showAgentCursor, showSuggestions } = useStorage(preferencesStorage);
  const [currentMessages, setCurrentMessages] = useState<any[]>([]);
  const [headlessMessagesCount, setHeadlessMessagesCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isAgentLoading, setIsAgentLoading] = useState(false);
    const [themeColor, setThemeColor] = useState('#e5e7eb');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUsagePopupOpen, setIsUsagePopupOpen] = useState(false);
  
  // Progress bar state
  const [hasProgressBar, setHasProgressBar] = useState(false);
  const [showProgressBar, setShowProgressBar] = useState(true);
  const [toggleProgressBar, setToggleProgressBar] = useState<(() => void) | undefined>(undefined);
  
    // Note: Embedding state (pageContentEmbeddingRef, isEmbedding, embeddingStatus, dbTotals)
    // is now provided by usePageContentEmbedding hook (see line ~396)
  
  // Stable callback for progress bar state changes
  const handleProgressBarStateChange = useCallback((has: boolean, show: boolean, toggle: () => void) => {
    setHasProgressBar(has);
    setShowProgressBar(show);
    setToggleProgressBar(() => toggle);
  }, []);
  
  // Get current session to load saved agent/model
  const currentSession = sessions.find(s => s.id === sessionId);
  
  const [selectedAgent, setSelectedAgent] = useState(currentSession?.selectedAgent || 'general');
    const [selectedModel, setSelectedModel] = useState(currentSession?.selectedModel || 'claude-4.5-haiku');
  
    // Note: Agent switching state (activeAgent, activeModel, isSwitchingAgent, switchingStep)
    // is now provided by useAgentSwitching hook (see line ~420)
  
  // Message data structure returned by saveMessagesRef
  interface MessageData {
    allMessages: any[];
    filteredMessages: any[];
  }
  
  // Refs to access CopilotKit's setMessages from ChatInner
  const saveMessagesRef = useRef<(() => MessageData) | null>(null);
  const restoreMessagesRef = useRef<((messages: any[]) => void) | null>(null);
    const resetChatRef = useRef<(() => void) | null>(null);
  
    // Note: previousAgentRef and previousModelRef are now managed internally by useAgentSwitching hook
  
  // Content state management
  const [contentState, setContentState] = useState<ContentState>({
    current: null,
    previous: null,
    status: 'none',
    lastFetch: 0,
      error: undefined,
  });
  
  const [showStaleIndicator, setShowStaleIndicator] = useState(false);
  const [latestDOMUpdate, setLatestDOMUpdate] = useState<any>(null);
  
  // Tab management
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [currentTabTitle, setCurrentTabTitle] = useState<string>('');
  const getCurrentTabTitle = useCallback(() => currentTabTitle, [currentTabTitle]);
  
  // Content cache ref for refresh operations
  const contentCacheRef = useRef<Map<string, any>>(new Map());
  
  // Content manager
  // Placeholder values; real values provided after usePanelVisibility below
  const {
    contentState: managedContentState,
    showStaleIndicator: managedStaleIndicator,
    latestDOMUpdate: managedDOMUpdate,
    fetchFreshPageContent,
    clearCache,
  } = useContentManager({
    currentTabId,
    isActive,
    isPanelInteractive: false,
    isPanelVisible: false,
    isPanelActive: false,
    isAgentLoading: false,
    onContentStateChange: setContentState,
    onStaleIndicatorChange: setShowStaleIndicator,
    onDOMUpdate: setLatestDOMUpdate,
  });
  
  // Tab manager
  const {
    currentTabId: managedTabId,
    currentTabTitle: managedTabTitle,
    setCurrentTabId: setManagedTabId,
      setCurrentTabTitle: setManagedTabTitle,
  } = useTabManager({
    isActive,
    isPanelInteractive: false, // Will be updated by panel visibility hook
    isPanelVisible: false, // Will be updated by panel visibility hook
    onTabChange: (tabId, title) => {
      setCurrentTabId(tabId);
      setCurrentTabTitle(title);
    },
      onContentRefresh: tabId => {
      fetchFreshPageContent(true, tabId);
      },
  });
  
  // Panel visibility hook (must be called before useMessagePersistence)
  const {
    isPanelVisible,
    setIsPanelVisible,
    isPanelInteractive,
    setIsPanelInteractive,
    isPanelActive,
      panelJustOpenedRef,
  } = usePanelVisibility({
    isActive,
      onVisibilityChange: isVisible => {
      if (!isVisible) {
          debug.log(ts(), '[ChatSessionContainer] Panel hidden, clearing content cache');
        try { clearCache(); } catch {}
      }
    },
      onClickInPanel: event => {
      // Handle click logic for content refresh and interaction
      const target = event?.target as HTMLElement;
      if (target) {
        const shouldSkipFocus = 
          target.closest('button') || 
          target.closest('input') || 
          target.closest('textarea') ||
          target.closest('a') ||
          target.closest('[role="tab"]') ||
          target.closest('[role="button"]') ||
          target.closest('[data-session-id]') ||
          target.closest('.session-tabs-scroll') ||
          target.closest('[contenteditable="true"]') ||
          target.matches('button') ||
          target.matches('input') ||
          target.matches('textarea') ||
          target.matches('[contenteditable="true"]') ||
            (target.className &&
              typeof target.className === 'string' &&
              (target.className.includes('session') || target.className.includes('cursor-pointer')));
          
        if (shouldSkipFocus) {
          if (!isPanelInteractive) {
            setIsPanelInteractive(true);
              debug.log(ts(), '[ChatSessionContainer] User clicked in panel, marking as interactive (no auto-focus)');
          }
          return;
        }
      }
      
      // User clicked inside the panel - mark as interactive
      const wasInactive = !isPanelInteractive;
      
      if (wasInactive) {
        setIsPanelInteractive(true);
          debug.log(ts(), '[ChatSessionContainer] User clicked in panel, marking as interactive');
        
        // Trigger content refresh when becoming interactive (handles tab changes while panel was inactive)
        if (currentTabId) {
            debug.log(ts(), '[ChatSessionContainer] Triggering content refresh on interaction');
          fetchFreshPageContent(false, currentTabId);
        }
        
        // Clear stale indicator if showing
        if (showStaleIndicator) {
          setShowStaleIndicator(false);
        }
        
        // Simple auto-focus attempt
        setTimeout(() => {
          const input = document.querySelector('.copilotKitInput textarea') as HTMLTextAreaElement;
          if (input && input.offsetParent !== null) {
            input.focus();
              debug.log(ts(), '[ChatSessionContainer] ✅ Auto-focused chat input');
          }
        }, TIMING_CONSTANTS.AUTO_FOCUS_DELAY);
      }
    },
    onPanelBlur: () => {
        debug.log(ts(), '[ChatSessionContainer] Panel lost focus');
      },
  });
  
  // Message persistence
  const {
    storedMessages,
    storedFilteredMessagesCount,
    setStoredMessages,
    handleSaveMessages,
    handleLoadMessages,
      saveMessagesToStorage,
  } = useMessagePersistence({
    sessionId,
    isActive,
    isPanelVisible,
    saveMessagesRef,
      restoreMessagesRef,
  });
  
  // Load stored usage stats for this session
  const initialUsage = useMemo(() => {
    const storedUsage = sessionStorage.getUsageStats(sessionId);
    if (storedUsage) {
      return storedUsage;
    }
    return {
      request: 0,
      response: 0,
      total: 0,
      requestCount: 0,
    };
  }, [sessionId]);
  
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
  
  // Usage streaming via WebSocket
  const {
    lastUsage,
    cumulativeUsage,
    isConnected: isUsageConnected,
    error: usageError,
      resetCumulative,
  } = useUsageStream(sessionId, isActive, 'ws://localhost:8001', initialUsage);
  
  // Embedding worker for page content
  const {
    isInitialized: isEmbeddingInitialized,
    isInitializing: isEmbeddingInitializing,
    isProcessing: isEmbeddingProcessing,
    error: embeddingError,
    progress: embeddingProgress,
    initialize,
    embedPageContent,
    embedPageContentForTab,
    embedTexts,
  } = useEmbeddingWorker({
    autoInitialize: false,
    // Progress is logged by the hook itself, no need to log here
  });

    // (Removed obsolete isEmbeddingProcessingRef; hook-driven state is sufficient)
  
  // Save cumulative usage to storage whenever it changes
  useEffect(() => {
    if (cumulativeUsage) {
      sessionStorage.updateUsageStats(sessionId, cumulativeUsage);
    }
  }, [sessionId, cumulativeUsage]);
  
  // Save agent step state to storage whenever it changes
  useEffect(() => {
    if (currentAgentStepState) {
      sessionStorage.updateAgentStepState(sessionId, currentAgentStepState);
    }
  }, [sessionId, currentAgentStepState]);
  
  // Log usage errors if any
  useEffect(() => {
    if (usageError) {
        debug.log(ts(), 'Usage streaming error:', usageError);
    }
  }, [usageError]);
  
  // Log embedding errors if any
  useEffect(() => {
    if (embeddingError) {
        debug.log(ts(), 'Embedding error:', embeddingError);
    }
  }, [embeddingError]);
  
  // Log embedding worker state changes (only major state changes, not every progress update)
  useEffect(() => {
    // Always log initialization state for debugging
      debug.log(ts(), '[ChatSessionContainer] 📊 Embedding worker state:', {
      isInitialized: isEmbeddingInitialized,
      isInitializing: isEmbeddingInitializing,
      hasError: !!embeddingError,
    });

    // Only log when initialization state changes or errors occur
    if (embeddingError) {
        debug.error(ts(), '❌ [ChatSessionContainer] Embedding Error:', embeddingError.message);
    } else if (isEmbeddingInitialized && !isEmbeddingInitializing) {
        debug.log(ts(), '[ChatSessionContainer] ✅ Embedding worker ready and initialized');
    } else if (isEmbeddingInitializing) {
        debug.log(ts(), '[ChatSessionContainer] ⏳ Embedding worker initializing...');
    }
  }, [isEmbeddingInitialized, isEmbeddingInitializing, embeddingError]);
  
  // Derived state for backward compatibility (moved here to avoid "use before declaration" error)
  const currentPageContent = contentState.current || contentState.previous;
  const isContentFetching = contentState.status === 'loading' || contentState.status === 'refreshing';
  
    // ================================================================================
    // CUSTOM HOOKS FOR EMBEDDING, AGENT SWITCHING, AND AUTO-SAVE
    // ================================================================================

    // Page content embedding hook - replaces large embedding effect block
    const {
      pageContentEmbeddingRef,
      isEmbedding,
      embeddingStatus,
      dbTotals,
    } = usePageContentEmbedding({
      currentPageContent,
      isEmbeddingInitialized,
      isEmbeddingProcessing,
      embedPageContentForTab,
      initialize,
                  sessionId,
      currentTabId,
    });

    // DOM update embedding hook - replaces DOM update effect block
    useDOMUpdateEmbedding({
      latestDOMUpdate,
      isEmbeddingInitialized,
      currentPageContent,
      embedTexts,
                  sessionId,
                });

    // Agent switching hook - replaces agent switching state machine
    const {
      activeAgent,
      activeModel,
      isSwitchingAgent,
      switchingStep,
    } = useAgentSwitching({
      selectedAgent,
      selectedModel,
                  sessionId,
      handleSaveMessages,
      handleLoadMessages,
    });

    // Auto-save hook - replaces auto-save effects
    useAutoSave({
      isActive,
      saveMessagesRef,
      saveMessagesToStorage,
    });
  
  // Save agent/model selection to storage whenever they change
  useEffect(() => {
    if (selectedAgent && selectedModel) {
      sessionStorage.updateSessionAgentAndModel(sessionId, selectedAgent, selectedModel);
    }
  }, [selectedAgent, selectedModel, sessionId]);
  
  // Content refresh hook
  const { triggerManualRefresh } = useContentRefresh({
    setCurrentTabId: setManagedTabId,
    setCurrentTabTitle: setManagedTabTitle,
    currentTabTitleRef: { current: managedTabTitle },
    setTabTitleVersion: () => {}, // Not needed in this context
    contentCacheRef,
    fetchFreshPageContent,
    setIsPanelInteractive,
      isPanelInteractive,
      currentTabId,
  });

  
  // Auto-refresh content when panel becomes active (visible or user interacts)
  const previousIsPanelVisibleRef = useRef(isPanelVisible);
  const previousIsPanelInteractiveRef = useRef(isPanelInteractive);
  // Disabled: lastFetchedTabIdRef and lastFetchTimeRef were only used by the disabled useEffect below
  // const lastFetchedTabIdRef = useRef<number | null>(null);
  // const lastFetchTimeRef = useRef<number>(0);
  
  // Update refs without triggering fetch (tracked for potential future use)
  useEffect(() => {
    previousIsPanelVisibleRef.current = isPanelVisible;
    previousIsPanelInteractiveRef.current = isPanelInteractive;
  }, [isPanelVisible, isPanelInteractive]);
  
  // Get the current session
  const sessionTitle = currentSession?.title || 'New Session';
  
  // Initialize loading state
  useEffect(() => {
    setIsLoading(false);
  }, [sessionId]);
  
  
  // Status bar element (compute-only dependencies; avoid embedding refs to prevent rerenders)
    const statusBarElement = useMemo(
      () => (
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
      isEmbedding={isEmbedding}
      embeddingStatus={embeddingStatus}
      usageData={{
        lastUsage,
        cumulativeUsage,
        isConnected: isUsageConnected,
      }}
      onUsageClick={() => setIsUsagePopupOpen(true)}
      hasProgressBar={hasProgressBar}
      showProgressBar={showProgressBar}
      onToggleProgressBar={toggleProgressBar}
    />
      ),
      [
    isLight,
    isPanelInteractive,
    currentTabId,
    isPanelVisible,
    contentState,
    getCurrentTabTitle,
    triggerManualRefresh,
    handleSaveMessages,
    handleLoadMessages,
    showStaleIndicator,
    isContentFetching,
    headlessMessagesCount,
    storedFilteredMessagesCount,
    isEmbedding,
    embeddingStatus,
    lastUsage,
    cumulativeUsage,
    isUsageConnected,
    hasProgressBar,
    showProgressBar,
        toggleProgressBar,
      ],
    );

    // Notify parent whenever headlessMessagesCount changes
    useEffect(() => {
      if (onMessagesCountChange) {
        onMessagesCountChange(sessionId, headlessMessagesCount);
      }
    }, [onMessagesCountChange, sessionId, headlessMessagesCount]);

    // Register reset function with parent when available
    useEffect(() => {
      if (onRegisterResetFunction && resetChatRef.current) {
        onRegisterResetFunction(sessionId, resetChatRef.current);
      }
    }, [onRegisterResetFunction, sessionId, resetChatRef.current]);

  return (
      <div className="flex flex-1 flex-col overflow-hidden">
      {/* Save/Load buttons and Page Status - Fixed at top */}
      {statusBarElement}
      
      {/* Stale content notification banner */}
      {showStaleIndicator && isPanelActive && (
          <div
            className={`flex items-center gap-2 px-2 py-1.5 text-xs ${
          isLight 
                ? 'border-b border-orange-200 bg-orange-50 text-orange-800'
                : 'border-b border-orange-800 bg-orange-900/20 text-orange-300'
            }`}>
            <svg className="h-3 w-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
          </svg>
            <span className="flex-1">Page content changed</span>
          <button
            onClick={triggerManualRefresh}
              className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
              isLight
                  ? 'bg-orange-100 text-orange-900 hover:bg-orange-200'
                  : 'bg-orange-800 text-orange-100 hover:bg-orange-700'
              }`}>
            Refresh
          </button>
        </div>
      )}

      {/* Chat container */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Agent switching overlay */}
        <div 
          className={`absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm transition-all duration-500 ${
              isSwitchingAgent ? 'opacity-100' : 'pointer-events-none opacity-0'
            } ${isLight ? 'bg-white/70' : 'bg-gray-900/70'}`}>
            <div
              className={`flex transform flex-col items-center gap-4 rounded-lg px-8 py-6 transition-transform duration-500 ${
            isSwitchingAgent ? 'scale-100' : 'scale-95'
              } ${isLight ? 'border border-gray-200 bg-white shadow-xl' : 'border border-gray-700 bg-gray-800 shadow-xl'}`}>
              <div className="mb-2 flex items-center gap-2">
                <span className={`text-sm font-medium ${isLight ? 'text-gray-700' : 'text-gray-200'}`}>
                Switching to {selectedAgent} agent
              </span>
            </div>
            
            {/* Step indicators */}
              <div className="flex w-full flex-col gap-3">
              {/* Step 1: Saving messages */}
              <div className="flex items-center gap-3">
                {switchingStep === 1 ? (
                    <svg className="h-4 w-4 flex-shrink-0 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : switchingStep > 1 ? (
                    <svg className="h-4 w-4 flex-shrink-0 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                  </svg>
                ) : (
                    <div
                      className={`h-4 w-4 flex-shrink-0 rounded-full border-2 ${
                    isLight ? 'border-gray-300' : 'border-gray-600'
                      }`}
                    />
                  )}
                  <span
                    className={`text-xs ${
                      switchingStep === 1
                        ? isLight
                          ? 'font-medium text-gray-700'
                          : 'font-medium text-gray-200'
                        : switchingStep > 1
                          ? 'text-green-600'
                          : isLight
                            ? 'text-gray-500'
                            : 'text-gray-400'
                }`}>
                  Saving messages
                </span>
              </div>
              
              {/* Step 2: Switching agent/model */}
              <div className="flex items-center gap-3">
                {switchingStep === 2 ? (
                    <svg className="h-4 w-4 flex-shrink-0 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : switchingStep > 2 ? (
                    <svg className="h-4 w-4 flex-shrink-0 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                  </svg>
                ) : (
                    <div
                      className={`h-4 w-4 flex-shrink-0 rounded-full border-2 ${
                    isLight ? 'border-gray-300' : 'border-gray-600'
                      }`}
                    />
                  )}
                  <span
                    className={`text-xs ${
                      switchingStep === 2
                        ? isLight
                          ? 'font-medium text-gray-700'
                          : 'font-medium text-gray-200'
                        : switchingStep > 2
                          ? 'text-green-600'
                          : isLight
                            ? 'text-gray-500'
                            : 'text-gray-400'
                }`}>
                  Switching to {selectedModel}
                </span>
              </div>
              
              {/* Step 3: Restoring messages */}
              <div className="flex items-center gap-3">
                {switchingStep === 3 ? (
                    <svg className="h-4 w-4 flex-shrink-0 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : switchingStep > 3 ? (
                    <svg className="h-4 w-4 flex-shrink-0 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                  </svg>
                ) : (
                    <div
                      className={`h-4 w-4 flex-shrink-0 rounded-full border-2 ${
                    isLight ? 'border-gray-300' : 'border-gray-600'
                      }`}
                    />
                  )}
                  <span
                    className={`text-xs ${
                      switchingStep === 3
                        ? isLight
                          ? 'font-medium text-gray-700'
                          : 'font-medium text-gray-200'
                        : switchingStep > 3
                          ? 'text-green-600'
                          : isLight
                            ? 'text-gray-500'
                            : 'text-gray-400'
                }`}>
                  Restoring messages
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <div 
            className={`copilot-chat-container flex flex-1 flex-col overflow-hidden ${!isLight ? 'dark' : ''} transition-all duration-500`}
            style={
              {
                '--copilot-kit-primary-color': themeColor,
            opacity: isSwitchingAgent ? 0.3 : 1,
                filter: isSwitchingAgent ? 'blur(2px)' : 'none',
              } as CSSProperties
            }>
          <CopilotKit 
            key={`${sessionId}-${activeAgent}-${activeModel}`}
            runtimeUrl={COPIOLITKIT_CONFIG.RUNTIME_URL}
            agent="dynamic_agent"
            headers={{
              'x-copilot-agent-type': activeAgent,
                'x-copilot-model-type': activeModel,
            }}
            // publicApiKey={COPIOLITKIT_CONFIG.PUBLIC_API_KEY}
            publicLicenseKey={COPIOLITKIT_CONFIG.PUBLIC_API_KEY}
            showDevConsole={false}
            threadId={sessionId}
            transcribeAudioUrl="/api/transcribe"
            textToSpeechUrl="/api/tts"
            onError={errorEvent => {
              // Simple console logging for development
                console.log('CopilotKit Event:', errorEvent);
              }}>
            <ChatInner
              key={`chat-inner-${showSuggestions ? 'on' : 'off'}`}
              sessionId={sessionId}
              sessionTitle={sessionTitle}
              currentPageContent={currentPageContent}
              pageContentEmbedding={pageContentEmbeddingRef.current}
              latestDOMUpdate={latestDOMUpdate}
                dbTotals={dbTotals}
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
              onProgressBarStateChange={handleProgressBarStateChange}
              initialAgentStepState={initialAgentStepState}
              onAgentStepStateChange={setCurrentAgentStepState}
                contextMenuMessage={contextMenuMessage}
                triggerManualRefresh={triggerManualRefresh}
            />
          </CopilotKit>
        </div>

        {/* Agent and Model Selectors with Settings */}
        <SelectorsBar
          isLight={isLight}
          selectedAgent={selectedAgent}
          selectedModel={selectedModel}
          showAgentCursor={showAgentCursor}
          showSuggestions={showSuggestions}
          onAgentChange={setSelectedAgent}
          onModelChange={setSelectedModel}
            onShowAgentCursorChange={show => preferencesStorage.setShowAgentCursor(show)}
            onShowSuggestionsChange={show => preferencesStorage.setShowSuggestions(show)}
          onExpandSettingsClick={() => setIsSettingsOpen(true)}
        />
      </div>
      
      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        isLight={isLight}
        showAgentCursor={showAgentCursor}
        showSuggestions={showSuggestions}
        onClose={() => setIsSettingsOpen(false)}
          onShowAgentCursorChange={show => preferencesStorage.setShowAgentCursor(show)}
          onShowSuggestionsChange={show => preferencesStorage.setShowSuggestions(show)}
      />
      
      {/* Usage Popup */}
      <UsagePopup
        isOpen={isUsagePopupOpen}
        onClose={() => setIsUsagePopupOpen(false)}
        lastUsage={lastUsage}
        cumulativeUsage={cumulativeUsage}
        isConnected={isUsageConnected}
        isLight={isLight}
        onReset={resetCumulative}
      />
      
      {/* Display chat history if available */}
      {storedMessages.length > 0 && (
        <div className="hidden">
          {/* Hidden element to store chat history metadata */}
          <div data-session-id={sessionId} data-message-count={storedMessages.length} />
        </div>
      )}
    </div>
  );
  },
);

ChatSessionContainer.displayName = 'ChatSessionContainer';
