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
import { TIMING_CONSTANTS, COPIOLITKIT_CONFIG } from '../constants';

interface ChatSessionContainerProps {
  sessionId: string;
  isLight: boolean;
  publicApiKey: string;
  isActive?: boolean;
}

/**
 * ChatSessionContainer Component
 * 
 * Container component that orchestrates all chat session functionality
 * Manages content, tabs, messages, and panel visibility
 * Split from the original ChatSession.tsx for better maintainability
 */
export const ChatSessionContainer: FC<ChatSessionContainerProps> = memo(({ 
  sessionId, 
  isLight, 
  publicApiKey, 
  isActive = true 
}) => {
  const { sessions } = useStorage(sessionStorage);
  const { showAgentCursor, showSuggestions } = useStorage(preferencesStorage);
  const [currentMessages, setCurrentMessages] = useState<any[]>([]);
  const [headlessMessagesCount, setHeadlessMessagesCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [themeColor, setThemeColor] = useState("#e5e7eb");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUsagePopupOpen, setIsUsagePopupOpen] = useState(false);
  
  // Progress bar state
  const [hasProgressBar, setHasProgressBar] = useState(false);
  const [showProgressBar, setShowProgressBar] = useState(true);
  const [toggleProgressBar, setToggleProgressBar] = useState<(() => void) | undefined>(undefined);
  
  // Stable callback for progress bar state changes
  const handleProgressBarStateChange = useCallback((has: boolean, show: boolean, toggle: () => void) => {
    setHasProgressBar(has);
    setShowProgressBar(show);
    setToggleProgressBar(() => toggle);
  }, []);
  
  // Get current session to load saved agent/model
  const currentSession = sessions.find(s => s.id === sessionId);
  
  const [selectedAgent, setSelectedAgent] = useState(currentSession?.selectedAgent || 'general');
  const [selectedModel, setSelectedModel] = useState(currentSession?.selectedModel || 'gemini-2.5-flash-lite');
  const [isSwitchingAgent, setIsSwitchingAgent] = useState(false);
  const [switchingStep, setSwitchingStep] = useState<1 | 2 | 3>(1);
  const [shouldLoadMessagesAfterSwitch, setShouldLoadMessagesAfterSwitch] = useState(false);
  
  // Track the actual agent/model being used by CopilotKit (lags behind selection during switch)
  const [activeAgent, setActiveAgent] = useState(currentSession?.selectedAgent || 'general');
  const [activeModel, setActiveModel] = useState(currentSession?.selectedModel || 'gemini-2.5-flash-lite');
  
  // Message data structure returned by saveMessagesRef
  interface MessageData {
    allMessages: any[];
    filteredMessages: any[];
  }
  
  // Refs to access CopilotKit's setMessages from ChatInner
  const saveMessagesRef = useRef<(() => MessageData) | null>(null);
  const restoreMessagesRef = useRef<((messages: any[]) => void) | null>(null);
  
  // Track when agent/model changes to save and restore messages
  const previousAgentRef = useRef(selectedAgent);
  const previousModelRef = useRef(selectedModel);
  
  // Content state management
  const [contentState, setContentState] = useState<ContentState>({
    current: null,
    previous: null,
    status: 'none',
    lastFetch: 0,
    error: undefined
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
  const {
    contentState: managedContentState,
    showStaleIndicator: managedStaleIndicator,
    latestDOMUpdate: managedDOMUpdate,
    fetchFreshPageContent,
    clearCache
  } = useContentManager({
    currentTabId,
    isActive,
    isPanelInteractive: false, // Will be updated by panel visibility hook
    isPanelVisible: false, // Will be updated by panel visibility hook
    onContentStateChange: setContentState,
    onStaleIndicatorChange: setShowStaleIndicator,
    onDOMUpdate: setLatestDOMUpdate
  });
  
  // Tab manager
  const {
    currentTabId: managedTabId,
    currentTabTitle: managedTabTitle,
    getCurrentTabTitle: managedGetCurrentTabTitle,
    setCurrentTabId: setManagedTabId,
    setCurrentTabTitle: setManagedTabTitle
  } = useTabManager({
    isActive,
    isPanelInteractive: false, // Will be updated by panel visibility hook
    isPanelVisible: false, // Will be updated by panel visibility hook
    onTabChange: (tabId, title) => {
      setCurrentTabId(tabId);
      setCurrentTabTitle(title);
    },
    onContentRefresh: (tabId) => {
      fetchFreshPageContent(true, tabId);
    }
  });
  
  // Panel visibility hook (must be called before useMessagePersistence)
  const {
    isPanelVisible,
    setIsPanelVisible,
    isPanelInteractive,
    setIsPanelInteractive,
    isPanelActive,
    panelJustOpenedRef
  } = usePanelVisibility({
    isActive,
    onVisibilityChange: (isVisible) => {
      if (!isVisible) {
        debug.log('[ChatSessionContainer] Panel hidden, clearing content cache');
        clearCache();
      }
    },
    onClickInPanel: (event) => {
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
          (target.className && typeof target.className === 'string' && 
           (target.className.includes('session') || 
            target.className.includes('cursor-pointer')));
          
        if (shouldSkipFocus) {
          if (!isPanelInteractive) {
            setIsPanelInteractive(true);
            debug.log('[ChatSessionContainer] User clicked in panel, marking as interactive (no auto-focus)');
          }
          return;
        }
      }
      
      // User clicked inside the panel - mark as interactive
      const wasInactive = !isPanelInteractive;
      
      if (wasInactive) {
        setIsPanelInteractive(true);
        debug.log('[ChatSessionContainer] User clicked in panel, marking as interactive');
        
        // Clear stale indicator if showing
        if (showStaleIndicator) {
          setShowStaleIndicator(false);
        }
        
        // Simple auto-focus attempt
        setTimeout(() => {
          const input = document.querySelector('.copilotKitInput textarea') as HTMLTextAreaElement;
          if (input && input.offsetParent !== null) {
            input.focus();
            debug.log('[ChatSessionContainer] ✅ Auto-focused chat input');
          }
        }, TIMING_CONSTANTS.AUTO_FOCUS_DELAY);
      }
    },
    onPanelBlur: () => {
      debug.log('[ChatSessionContainer] Panel lost focus');
    }
  });
  
  // Message persistence
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
    resetCumulative
  } = useUsageStream(sessionId, isActive, 'ws://localhost:8001', initialUsage);
  
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
      console.warn('Usage streaming error:', usageError);
    }
  }, [usageError]);
  
  // Save agent/model selection to storage whenever they change
  useEffect(() => {
    if (selectedAgent && selectedModel) {
      sessionStorage.updateSessionAgentAndModel(sessionId, selectedAgent, selectedModel);
    }
  }, [selectedAgent, selectedModel, sessionId]);
  
  // Agent switching logic - placed after handleSaveMessages/handleLoadMessages are defined
  useEffect(() => {
    const agentChanged = previousAgentRef.current !== selectedAgent;
    const modelChanged = previousModelRef.current !== selectedModel;
    
    if ((agentChanged || modelChanged)) {
      console.log('[ChatSessionContainer] Agent/Model change detected');
      
      // Step 1: Saving messages (BEFORE changing the key)
      setSwitchingStep(1);
      setIsSwitchingAgent(true);
      
      setTimeout(() => {
        console.log('[ChatSessionContainer] Step 1: Saving messages');
        handleSaveMessages().then(() => {
          console.log('[ChatSessionContainer] Messages saved, now switching agent/model');
          
          // Step 2: NOW update the active agent/model (this will remount CopilotKit)
          setTimeout(() => {
            console.log('[ChatSessionContainer] Step 2: Switching agent/model');
            setSwitchingStep(2);
            setActiveAgent(selectedAgent);
            setActiveModel(selectedModel);
            setShouldLoadMessagesAfterSwitch(true);
          }, 200);
        });
      }, 200);
    }
    
    previousAgentRef.current = selectedAgent;
    previousModelRef.current = selectedModel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent, selectedModel]);
  
  // Handle step 2 -> step 3 transition (after CopilotKit remounts)
  useEffect(() => {
    if (switchingStep !== 2 || !shouldLoadMessagesAfterSwitch) {
      return;
    }
    
    // Wait for CopilotKit to fully remount
    const timer = setTimeout(() => {
      console.log('[ChatSessionContainer] Step 3: Restoring messages');
      setSwitchingStep(3);
      
      // Restore messages
      setTimeout(() => {
        handleLoadMessages();
        
        // Set to step 4 (> 3) to show all steps as complete with green checkmarks
        setTimeout(() => {
          console.log('[ChatSessionContainer] All steps complete');
          setSwitchingStep(4 as any); // Set to 4 so all steps show green checkmarks
          
          // End switching after showing completion
          setTimeout(() => {
            console.log('[ChatSessionContainer] Switch complete, closing overlay');
            setIsSwitchingAgent(false);
            setShouldLoadMessagesAfterSwitch(false);
            
            // Reset step AFTER the overlay fade-out transition completes (500ms as per CSS)
            setTimeout(() => {
              setSwitchingStep(1); // Reset for next time
            }, 550); // Wait for the 500ms transition + buffer
          }, 400); // Give time to see all green checkmarks
        }, 300);
      }, 200);
    }, 800); // Wait for CopilotKit to mount
    
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [switchingStep, shouldLoadMessagesAfterSwitch]);
  
  // Content refresh hook
  const { triggerManualRefresh } = useContentRefresh({
    setCurrentTabId: setManagedTabId,
    setCurrentTabTitle: setManagedTabTitle,
    currentTabTitleRef: { current: managedTabTitle },
    setTabTitleVersion: () => {}, // Not needed in this context
    contentCacheRef,
    fetchFreshPageContent,
    setIsPanelInteractive,
    isPanelInteractive
  });
  
  // Auto-refresh content when panel becomes active (visible or user interacts)
  const previousIsPanelVisibleRef = useRef(isPanelVisible);
  const previousIsPanelInteractiveRef = useRef(isPanelInteractive);
  // Disabled: lastFetchedTabIdRef and lastFetchTimeRef were only used by the disabled useEffect below
  // const lastFetchedTabIdRef = useRef<number | null>(null);
  // const lastFetchTimeRef = useRef<number>(0);
  
  // DISABLED: This useEffect was causing duplicate content fetches
  // ChatSession.tsx already handles content fetching for panel state changes
  // Keeping this would cause double fetches when panel becomes active
  /*
  useEffect(() => {
    const wasHidden = !previousIsPanelVisibleRef.current;
    const isNowVisible = isPanelVisible;
    const wasNotInteractive = !previousIsPanelInteractiveRef.current;
    const isNowInteractive = isPanelInteractive;
    
    // User returned to the panel - either by making it visible or by clicking in it
    const userReturnedToPanel = (wasHidden && isNowVisible) || (wasNotInteractive && isNowInteractive);
    
    if (userReturnedToPanel && isActive && currentTabId) {
      // Check if content is stale before fetching
      const tabChanged = lastFetchedTabIdRef.current !== currentTabId;
      const timeSinceLastFetch = Date.now() - lastFetchTimeRef.current;
      const isStale = timeSinceLastFetch > TIMING_CONSTANTS.CACHE_TTL;
      
      if (tabChanged || isStale) {
        const reason = tabChanged ? 'tab changed' : 'content is stale';
        debug.log(`[ChatSessionContainer] Panel became active, fetching current tab content (${reason})...`);
        fetchFreshPageContent(false, currentTabId);
        lastFetchedTabIdRef.current = currentTabId;
        lastFetchTimeRef.current = Date.now();
      } else {
        debug.log('[ChatSessionContainer] Panel became active, but content is still fresh');
      }
    }
    
    previousIsPanelVisibleRef.current = isPanelVisible;
    previousIsPanelInteractiveRef.current = isPanelInteractive;
  }, [isPanelVisible, isPanelInteractive, isActive, currentTabId, fetchFreshPageContent]);
  */
  
  // Update refs without triggering fetch (tracked for potential future use)
  useEffect(() => {
    previousIsPanelVisibleRef.current = isPanelVisible;
    previousIsPanelInteractiveRef.current = isPanelInteractive;
  }, [isPanelVisible, isPanelInteractive]);
  
  // Get the current session
  const sessionTitle = currentSession?.title || 'New Session';
  
  // Derived state for backward compatibility
  const currentPageContent = contentState.current || contentState.previous;
  const isContentFetching = contentState.status === 'loading' || contentState.status === 'refreshing';
  
  // Initialize loading state
  useEffect(() => {
    setIsLoading(false);
  }, [sessionId]);
  
  // Auto-save when session becomes inactive
  const previousIsActiveRef = useRef(isActive);
  const debouncedSaveRef = useRef<NodeJS.Timeout | null>(null);
  
  const debouncedSave = useCallback((messagesToSave: any[]) => {
    if (debouncedSaveRef.current) {
      clearTimeout(debouncedSaveRef.current);
    }
    
    debouncedSaveRef.current = setTimeout(() => {
      saveMessagesToStorage(messagesToSave);
      debouncedSaveRef.current = null;
    }, TIMING_CONSTANTS.DEBOUNCE_DELAY);
  }, [saveMessagesToStorage]);
  
  useEffect(() => {
    const wasActive = previousIsActiveRef.current;
    const isBecomingInactive = wasActive && !isActive;
    
    if (isBecomingInactive && saveMessagesRef.current) {
      const messageData = saveMessagesRef.current();
      const allMessages = messageData.allMessages || [];
      if (allMessages && allMessages.length > 0) {
        debouncedSave(allMessages);
      }
    }
    
    previousIsActiveRef.current = isActive;
  }, [isActive, debouncedSave]);
  
  // Auto-save when panel is closing
  useEffect(() => {
    const handlePanelClosing = () => {
      if (saveMessagesRef.current) {
        const messageData = saveMessagesRef.current();
        const allMessages = messageData.allMessages || [];
        if (allMessages && allMessages.length > 0) {
          if (debouncedSaveRef.current) {
            clearTimeout(debouncedSaveRef.current);
            debouncedSaveRef.current = null;
          }
          saveMessagesToStorage(allMessages);
        }
      }
    };

    window.addEventListener('panelClosing', handlePanelClosing as EventListener);
    
    return () => {
      window.removeEventListener('panelClosing', handlePanelClosing as EventListener);
    };
  }, [saveMessagesToStorage]);
  
  // Status bar element
  const statusBarElement = useMemo(() => (
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
  ), [
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
    lastUsage,
    cumulativeUsage,
    isUsageConnected,
    hasProgressBar,
    showProgressBar,
    toggleProgressBar
  ]);

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
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Agent switching overlay */}
        <div 
          className={`absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm transition-all duration-500 ${
            isSwitchingAgent ? 'opacity-100' : 'opacity-0 pointer-events-none'
          } ${isLight ? 'bg-white/70' : 'bg-gray-900/70'}`}
        >
          <div className={`flex flex-col items-center gap-4 px-8 py-6 rounded-lg transform transition-transform duration-500 ${
            isSwitchingAgent ? 'scale-100' : 'scale-95'
          } ${isLight ? 'bg-white shadow-xl border border-gray-200' : 'bg-gray-800 shadow-xl border border-gray-700'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-sm font-medium ${
                isLight ? 'text-gray-700' : 'text-gray-200'
              }`}>
                Switching to {selectedAgent} agent
              </span>
            </div>
            
            {/* Step indicators */}
            <div className="flex flex-col gap-3 w-full">
              {/* Step 1: Saving messages */}
              <div className="flex items-center gap-3">
                {switchingStep === 1 ? (
                  <svg className="animate-spin h-4 w-4 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : switchingStep > 1 ? (
                  <svg className="h-4 w-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <div className={`h-4 w-4 rounded-full border-2 flex-shrink-0 ${
                    isLight ? 'border-gray-300' : 'border-gray-600'
                  }`} />
                )}
                <span className={`text-xs ${
                  switchingStep === 1 ? (isLight ? 'text-gray-700 font-medium' : 'text-gray-200 font-medium') : 
                  switchingStep > 1 ? 'text-green-600' :
                  (isLight ? 'text-gray-500' : 'text-gray-400')
                }`}>
                  Saving messages
                </span>
              </div>
              
              {/* Step 2: Switching agent/model */}
              <div className="flex items-center gap-3">
                {switchingStep === 2 ? (
                  <svg className="animate-spin h-4 w-4 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : switchingStep > 2 ? (
                  <svg className="h-4 w-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <div className={`h-4 w-4 rounded-full border-2 flex-shrink-0 ${
                    isLight ? 'border-gray-300' : 'border-gray-600'
                  }`} />
                )}
                <span className={`text-xs ${
                  switchingStep === 2 ? (isLight ? 'text-gray-700 font-medium' : 'text-gray-200 font-medium') : 
                  switchingStep > 2 ? 'text-green-600' :
                  (isLight ? 'text-gray-500' : 'text-gray-400')
                }`}>
                  Switching to {selectedModel}
                </span>
              </div>
              
              {/* Step 3: Restoring messages */}
              <div className="flex items-center gap-3">
                {switchingStep === 3 ? (
                  <svg className="animate-spin h-4 w-4 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : switchingStep > 3 ? (
                  <svg className="h-4 w-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <div className={`h-4 w-4 rounded-full border-2 flex-shrink-0 ${
                    isLight ? 'border-gray-300' : 'border-gray-600'
                  }`} />
                )}
                <span className={`text-xs ${
                  switchingStep === 3 ? (isLight ? 'text-gray-700 font-medium' : 'text-gray-200 font-medium') : 
                  switchingStep > 3 ? 'text-green-600' :
                  (isLight ? 'text-gray-500' : 'text-gray-400')
                }`}>
                  Restoring messages
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <div 
          className={`flex-1 copilot-chat-container flex flex-col overflow-hidden ${!isLight ? 'dark' : ''} transition-all duration-500`}
          style={{ 
            "--copilot-kit-primary-color": themeColor,
            opacity: isSwitchingAgent ? 0.3 : 1,
            filter: isSwitchingAgent ? 'blur(2px)' : 'none'
          } as CSSProperties}
        >
          <CopilotKit 
            key={`${sessionId}-${activeAgent}-${activeModel}`}
            runtimeUrl={COPIOLITKIT_CONFIG.RUNTIME_URL}
            agent="dynamic_agent"
            headers={{
              'x-copilot-agent-type': activeAgent,
              'x-copilot-model-type': activeModel
            }}
            // publicApiKey={COPIOLITKIT_CONFIG.PUBLIC_API_KEY}
            publicLicenseKey={COPIOLITKIT_CONFIG.PUBLIC_API_KEY}
            showDevConsole={false}
            threadId={sessionId}
            transcribeAudioUrl="/api/transcribe"
            textToSpeechUrl="/api/tts"
            onError={(errorEvent) => {
              // Simple console logging for development
              console.log("CopilotKit Event:", errorEvent);
            }}
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
              setIsAgentLoading={setIsAgentLoading}
              showSuggestions={showSuggestions}
              onProgressBarStateChange={handleProgressBarStateChange}
              initialAgentStepState={initialAgentStepState}
              onAgentStepStateChange={setCurrentAgentStepState}
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
          onShowAgentCursorChange={(show) => preferencesStorage.setShowAgentCursor(show)}
          onShowSuggestionsChange={(show) => preferencesStorage.setShowSuggestions(show)}
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
        onShowAgentCursorChange={(show) => preferencesStorage.setShowAgentCursor(show)}
        onShowSuggestionsChange={(show) => preferencesStorage.setShowSuggestions(show)}
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
});

ChatSessionContainer.displayName = 'ChatSessionContainer';
