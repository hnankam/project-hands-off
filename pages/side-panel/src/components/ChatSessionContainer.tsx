import React, { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react';
import type { FC, CSSProperties } from 'react';
import { useStorage, useSessionStorageDB, sessionStorageDBWrapper, debug } from '@extension/shared';
import type { SessionMetadata } from '@extension/shared';
import { preferencesStorage } from '@extension/storage';
import { StatusBar } from './StatusBar';
import { ChatInner } from './ChatInner';
import { SelectorsBar } from './SelectorsBar';
import { SettingsModal } from './SettingsModal';
import { UsagePopup } from './UsagePopup';
import type { AgentStepState } from './TaskProgressCard';
import { useContentManager, type ContentState } from './ContentManager';
import { useTabManager } from './TabManager';
import { useMessagePersistence } from '../hooks/useMessagePersistence';
import { usePanelVisibility } from '../hooks/usePanelVisibility';
import { useContentRefresh } from '../hooks/useContentRefresh';
import { useUsageStream, type UsageData } from '../hooks/useUsageStream';
import { useEmbeddingWorker } from '../hooks/useEmbeddingWorker';
import { usePageContentEmbedding } from '../hooks/usePageContentEmbedding';
import { useDOMUpdateEmbedding } from '../hooks/useDOMUpdateEmbedding';
import { useAgentSwitching } from '../hooks/useAgentSwitching';
import { useAutoSave } from '../hooks/useAutoSave';
import { TIMING_CONSTANTS, COPIOLITKIT_CONFIG } from '../constants';
import { ts } from '../utils/logging';
import { useAuth } from '../context/AuthContext';
import { SessionRuntimePortal, useSessionRuntimeState } from '../context/SessionRuntimeContext';

type UsageTotals = {
  request: number;
  response: number;
  total: number;
  requestCount: number;
};

interface ChatSessionContainerProps {
  sessionId: string;
  isLight: boolean;
  publicApiKey: string;
  isActive?: boolean;
  contextMenuMessage?: string | null;
  onMessagesCountChange?: (sessionId: string, count: number) => void;
  onRegisterResetFunction?: (sessionId: string, resetFn: () => void) => void;
  onReady?: (sessionId: string) => void;
  onMessagesLoadingChange?: (sessionId: string, isLoading: boolean) => void;
}

/**
 * ChatSessionContainer Component
 * 
 * Container component that orchestrates all chat session functionality
 * Manages content, tabs, messages, and panel visibility
 * Split from the original ChatSession.tsx for better maintainability
 */
export const ChatSessionContainer: FC<ChatSessionContainerProps> = memo(
  ({
    sessionId,
    isLight,
    publicApiKey,
    isActive = true,
    contextMenuMessage = null,
    onMessagesCountChange,
    onRegisterResetFunction,
    onReady,
    onMessagesLoadingChange,
  }) => {
  // ================================================================================
  // RENDER TRACKING
  // ================================================================================
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  // console.log(`[ChatSessionContainer] 🔄 RENDER #${renderCountRef.current} for session ${sessionId.slice(0, 8)}`, {
  //   isActive,
  //   timestamp: new Date().toISOString(),
  // });

  const { sessions } = useSessionStorageDB();
  const { showAgentCursor, showSuggestions, showThoughtBlocks, agentModeChat } = useStorage(preferencesStorage);
  const { organization, activeTeam } = useAuth();
  const [currentMessages, setCurrentMessages] = useState<any[]>([]);
  const [headlessMessagesCount, setHeadlessMessagesCount] = useState<number>(0);
  const [isCounterReady, setIsCounterReady] = useState<boolean>(false); // Hide counter until stable
  const [isLoading, setIsLoading] = useState(true);
  const [isAgentLoading, setIsAgentLoading] = useState(false);
    const [themeColor, setThemeColor] = useState('#e5e7eb');
  // Track if initial message count has been reported to prevent flickering after skeleton disappears
  const hasReportedInitialCountRef = useRef(false);
  const hydrationReadyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUsagePopupOpen, setIsUsagePopupOpen] = useState(false);
  const runtimeState = useSessionRuntimeState(sessionId);
  
  // Track previous session ID to detect changes
  const prevSessionIdRef = useRef<string | null>(null);
  
  // Reset message count when session changes
  useEffect(() => {
    if (hydrationReadyTimeoutRef.current) {
      clearTimeout(hydrationReadyTimeoutRef.current);
      hydrationReadyTimeoutRef.current = null;
    }

    if (prevSessionIdRef.current && prevSessionIdRef.current !== sessionId) {
      console.log(`[ChatSessionContainer] 🔄 ========== SESSION SWITCHED ==========`);
      console.log(`[ChatSessionContainer] From: ${prevSessionIdRef.current.slice(0, 8)}`);
      console.log(`[ChatSessionContainer] To: ${sessionId.slice(0, 8)}`);
      console.log(`[ChatSessionContainer] Resetting message count and agent state`);
      setHeadlessMessagesCount(0);
      setIsCounterReady(false);
      hasReportedInitialCountRef.current = false;
      setCurrentAgentStepState({
        sessionId,
        steps: [],
      });
      console.log(`[ChatSessionContainer] ✅ Session switch complete`);
    } else if (!prevSessionIdRef.current) {
      console.log(`[ChatSessionContainer] 🎬 ========== INITIAL SESSION MOUNT ==========`);
      console.log(`[ChatSessionContainer] Session ID: ${sessionId.slice(0, 8)}`);
      console.log(`[ChatSessionContainer] isActive: ${isActive}`);
    }
    prevSessionIdRef.current = sessionId;
  }, [sessionId]);
  
    // Note: Embedding state (pageContentEmbeddingRef, isEmbedding, embeddingStatus, dbTotals)
    // is now provided by usePageContentEmbedding hook (see line ~396)
  
  // Get current session to load saved agent/model
  const currentSession = sessions.find(s => s.id === sessionId);
  
  // Initialize with saved values from session, or empty strings (selectors will provide defaults)
  const [selectedAgent, setSelectedAgent] = useState(currentSession?.selectedAgent || '');
  const [selectedModel, setSelectedModel] = useState(currentSession?.selectedModel || '');

  // Track the last loaded session to prevent duplicate loads
  const lastLoadedSessionRef = useRef<string | null>(null);
  const isLoadingRef = useRef<boolean>(false);
  // Track if we're in the middle of loading from DB (shared with useAgentSwitching)
  const isLoadingFromDBRef = useRef<boolean>(false);
  
  // Log only when session actually changes (not on every render)
  useEffect(() => {
    console.log(`[AGENT_MODEL_SYNC] 🎬 Session mounted/switched: ${sessionId}`);
  }, [sessionId]);
  
  useEffect(() => {
    // Only load metadata if this session is actually active
    if (!isActive) {
      console.log(`[AGENT_MODEL_SYNC] ⏭️ Session ${sessionId} is not active, skipping load`);
      return;
    }
    
    let isCancelled = false;
    let enableSavesTimeoutId: NodeJS.Timeout | null = null;
    isLoadingRef.current = true;
    isLoadingFromDBRef.current = true; // Mark that we're loading from DB

    const loadSessionMetadata = async () => {
      console.log(`[AGENT_MODEL_SYNC] 📥 Loading metadata from DB for session ${sessionId}...`);
      try {
        const metadata = await sessionStorageDBWrapper.getSession(sessionId);
        if (!metadata) {
          console.warn(`[AGENT_MODEL_SYNC] ⚠️ No metadata found in DB for session ${sessionId}`);
          isLoadingRef.current = false;
          isLoadingFromDBRef.current = false;
          return;
        }
        if (isCancelled) {
          console.log(`[AGENT_MODEL_SYNC] ❌ Load cancelled for session ${sessionId}`);
          isLoadingRef.current = false;
          isLoadingFromDBRef.current = false;
          return;
        }

        console.log(`[AGENT_MODEL_SYNC] ✅ Loaded metadata from DB for session ${sessionId}:`, {
          dbAgent: metadata.selectedAgent,
          dbModel: metadata.selectedModel,
          currentLocalAgent: selectedAgent,
          currentLocalModel: selectedModel,
        });

        // Apply the loaded agent/model to state
        if (metadata.selectedAgent !== undefined && metadata.selectedAgent !== selectedAgent) {
          console.log(`[AGENT_MODEL_SYNC] 🔄 Updating agent for session ${sessionId}: ${selectedAgent} → ${metadata.selectedAgent}`);
          setSelectedAgent(metadata.selectedAgent);
        } else {
          console.log(`[AGENT_MODEL_SYNC] ⏭️ Agent unchanged for session ${sessionId}: ${metadata.selectedAgent}`);
        }

        if (metadata.selectedModel !== undefined && metadata.selectedModel !== selectedModel) {
          console.log(`[AGENT_MODEL_SYNC] 🔄 Updating model for session ${sessionId}: ${selectedModel} → ${metadata.selectedModel}`);
          setSelectedModel(metadata.selectedModel);
        } else {
          console.log(`[AGENT_MODEL_SYNC] ⏭️ Model unchanged for session ${sessionId}: ${metadata.selectedModel}`);
        }

        // Mark this session as loaded
        lastLoadedSessionRef.current = sessionId;
        // Reset the hasLoadedInitialData flag for the save useEffect
        hasLoadedInitialData.current = false;
        
        // Wait a bit for state updates to settle before allowing saves
        // Use a longer delay to ensure React state updates have propagated
        enableSavesTimeoutId = setTimeout(() => {
          if (!isCancelled) {
            isLoadingRef.current = false;
            isLoadingFromDBRef.current = false; // Clear loading flag
            console.log(`[AGENT_MODEL_SYNC] ✅ Load complete for session ${sessionId}, saves now enabled`);
          }
        }, 200);
      } catch (error) {
        console.error(`[AGENT_MODEL_SYNC] ❌ Failed to load session metadata from DB for session ${sessionId}:`, error);
        isLoadingRef.current = false;
        isLoadingFromDBRef.current = false; // Clear loading flag on error
      }
    };

    loadSessionMetadata();

    return () => {
      console.log(`[AGENT_MODEL_SYNC] 🧹 Cleanup for session ${sessionId}`);
      isCancelled = true;
      // Clear the timeout if it's still pending
      if (enableSavesTimeoutId) {
        clearTimeout(enableSavesTimeoutId);
      }
      isLoadingRef.current = false;
      isLoadingFromDBRef.current = false; // Clear loading flag on cleanup
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, isActive]);

  // This useEffect is now REMOVED - we only load from DB in the first useEffect above
  // The currentSession prop will update from DB notifications, but we shouldn't sync back
  // from it as that creates a feedback loop with our save operation
  
  // Log agent/model state when session becomes active
  useEffect(() => {
    if (isActive) {
      console.log(`[ChatSessionContainer] Session ${sessionId.slice(0, 8)} opened:`, {
        selectedAgent: selectedAgent || '(empty)',
        selectedModel: selectedModel || '(empty)',
        hasOrganization: !!organization?.id,
        hasActiveTeam: !!activeTeam,
        isAgentAndModelSelected: selectedAgent !== '' && selectedModel !== '',
      });
    }
  }, [isActive, sessionId, selectedAgent, selectedModel, organization?.id, activeTeam]);

  // Log when agent/model selections change
  useEffect(() => {
    console.log(`[ChatSessionContainer] Agent/Model state changed for session ${sessionId.slice(0, 8)}:`, {
      selectedAgent: selectedAgent || '(empty)',
      selectedModel: selectedModel || '(empty)',
      isAgentAndModelSelected: selectedAgent !== '' && selectedModel !== '',
    });
  }, [selectedAgent, selectedModel, sessionId]);
  
  // Clear agent and model selections when there's no active team
  useEffect(() => {
    if (!organization?.id || !activeTeam) {
      console.log(`[ChatSessionContainer] Clearing agent/model for session ${sessionId.slice(0, 8)} - no org/team`);
      setSelectedAgent('');
      setSelectedModel('');
    }
  }, [organization?.id, activeTeam, sessionId]);
  
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
          // debug.log(ts(), '[ChatSessionContainer] Panel hidden, clearing content cache');
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
              // debug.log(ts(), '[ChatSessionContainer] User clicked in panel, marking as interactive (no auto-focus)');
          }
          return;
        }
      }
      
      // User clicked inside the panel - mark as interactive
      const wasInactive = !isPanelInteractive;
      
      if (wasInactive) {
        setIsPanelInteractive(true);
          // debug.log(ts(), '[ChatSessionContainer] User clicked in panel, marking as interactive');
        
        // Trigger content refresh when becoming interactive (handles tab changes while panel was inactive)
        if (currentTabId) {
            // debug.log(ts(), '[ChatSessionContainer] Triggering content refresh on interaction');
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
              // debug.log(ts(), '[ChatSessionContainer] ✅ Auto-focused chat input');
          }
        }, TIMING_CONSTANTS.AUTO_FOCUS_DELAY);
      }
    },
    onPanelBlur: () => {
        // debug.log(ts(), '[ChatSessionContainer] Panel lost focus');
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
    isHydrating,
    hydrationCompleted,
  } = useMessagePersistence({
    sessionId,
    isActive,
    isPanelVisible,
    saveMessagesRef,
    restoreMessagesRef,
    resetChatRef,
  });
  const readySignalTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasSignaledReadyRef = useRef(false);

  // Notify parent when messages are loading
  useEffect(() => {
    if (onMessagesLoadingChange) {
      onMessagesLoadingChange(sessionId, isHydrating);
    }
  }, [sessionId, isHydrating, onMessagesLoadingChange]);

  // Handle session ID changes gracefully without full remount
  useEffect(() => {
    const prevSessionId = prevSessionIdRef.current;
    const sessionChanged = prevSessionId && prevSessionId !== sessionId;
    
    if (sessionChanged) {
      console.log(`[ChatSessionContainer] Session changed from ${prevSessionId} to ${sessionId}, handling hydration...`);
      
      const runtimeHasMessages = Boolean(runtimeState?.messagesSignature);
      
      if (isActive) {
        if (runtimeHasMessages) {
          console.log('[ChatSessionContainer] Runtime already has messages, skipping storage reload');
          // Sync stored messages asynchronously to keep metadata accurate
          setTimeout(() => {
            const fn = saveMessagesRef.current;
            if (!fn) {
              return;
            }
            try {
              const data = fn();
              const allMessages = (data?.allMessages ?? []) as any[];
              if (allMessages.length > 0) {
                void saveMessagesToStorage(allMessages as any);
              }
            } catch (error) {
              console.warn('[ChatSessionContainer] Failed to sync runtime messages to storage', error);
            }
          }, 0);
        } else {
          console.log('[ChatSessionContainer] Runtime empty, loading messages from storage');
        handleLoadMessages();
        }
      }
      
      const newSession = sessions.find(s => s.id === sessionId);
      if (newSession) {
        setSelectedAgent(newSession.selectedAgent || '');
        setSelectedModel(newSession.selectedModel || '');
    }
    
    prevSessionIdRef.current = sessionId;
    hasSignaledReadyRef.current = false;
      hasReportedInitialCountRef.current = false;
      setIsCounterReady(false);
    if (readySignalTimeoutRef.current) {
      clearTimeout(readySignalTimeoutRef.current);
      readySignalTimeoutRef.current = null;
    }
    } else if (!prevSessionId) {
      prevSessionIdRef.current = sessionId;
    }
  }, [
    sessionId,
    isActive,
    sessions,
    runtimeState?.messagesSignature,
    handleLoadMessages,
    saveMessagesToStorage,
  ]);

  useEffect(() => {
    const signature = runtimeState?.messagesSignature;
    if (!signature || isCounterReady) {
      return;
    }

    if (!hydrationCompleted) {
      console.log(
        '[ChatSessionContainer] Runtime signature detected but hydration not complete; waiting before marking counter ready',
        { sessionId: sessionId.slice(0, 8), signature },
      );
      return;
    }

    const awaitingCount = Boolean(onMessagesCountChange) && !hasReportedInitialCountRef.current;
    if (awaitingCount) {
      console.log(
        '[ChatSessionContainer] Hydration complete but waiting for message count synchronization before marking ready',
        { sessionId: sessionId.slice(0, 8) },
      );
      return;
    }

    console.log(
      '[ChatSessionContainer] Hydration complete with runtime signature; marking counter ready',
      { sessionId: sessionId.slice(0, 8) },
    );
    setIsCounterReady(true);
  }, [
    runtimeState?.messagesSignature,
    isCounterReady,
    hydrationCompleted,
    onMessagesCountChange,
    sessionId,
  ]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const signature = runtimeState?.messagesSignature;
    if (!signature) {
      return;
    }

    if (hydrationCompleted && hasReportedInitialCountRef.current) {
      console.log(
        '[ChatSessionContainer] Runtime reported messages update after hydration; ensuring skeleton is cleared',
        { sessionId: sessionId.slice(0, 8), signature },
      );
      setIsCounterReady(true);
    }
  }, [
    isActive,
    runtimeState?.messagesSignature,
    hydrationCompleted,
    sessionId,
  ]);

  useEffect(() => {
    if (!onReady || !isActive) {
      if (hydrationReadyTimeoutRef.current) {
        clearTimeout(hydrationReadyTimeoutRef.current);
        hydrationReadyTimeoutRef.current = null;
      }
      return;
    }

    if (hasSignaledReadyRef.current) {
      if (hydrationReadyTimeoutRef.current) {
        clearTimeout(hydrationReadyTimeoutRef.current);
        hydrationReadyTimeoutRef.current = null;
      }
      return;
    }

    const signalReady = (reason: 'counter' | 'hydration') => {
      if (hasSignaledReadyRef.current) {
        return;
      }
      if (hydrationReadyTimeoutRef.current) {
        clearTimeout(hydrationReadyTimeoutRef.current);
        hydrationReadyTimeoutRef.current = null;
      }
      hasSignaledReadyRef.current = true;
      if (reason === 'hydration' && !isCounterReady) {
        setIsCounterReady(true);
      }
      console.log(
        `[ChatSessionContainer] Signaling session ready via ${reason === 'counter' ? 'stable counter' : 'hydration fallback'} for ${sessionId}`,
      );
      onReady(sessionId);
    };

    if (isCounterReady) {
      signalReady('counter');
      return;
    }

    if (hydrationCompleted) {
      if (!hydrationReadyTimeoutRef.current) {
        hydrationReadyTimeoutRef.current = setTimeout(() => {
          hydrationReadyTimeoutRef.current = null;
          signalReady('hydration');
        }, HYDRATION_READY_FALLBACK_DELAY);
      }
    } else if (hydrationReadyTimeoutRef.current) {
      clearTimeout(hydrationReadyTimeoutRef.current);
      hydrationReadyTimeoutRef.current = null;
    }

    return () => {
      if (!hasSignaledReadyRef.current && hydrationReadyTimeoutRef.current && !isCounterReady && !hydrationCompleted) {
        clearTimeout(hydrationReadyTimeoutRef.current);
        hydrationReadyTimeoutRef.current = null;
      }
    };
  }, [onReady, isActive, isCounterReady, hydrationCompleted, sessionId]);

  // Note: Message loading is handled automatically by useMessagePersistence's auto-restore
  // No need to explicitly call handleLoadMessages here as it would cause double renders
  // The auto-restore triggers 500ms after session becomes active, allowing CopilotKit to initialize
  
  // State for stored usage and agent state
  const HYDRATION_READY_FALLBACK_DELAY = 120; // milliseconds
  const DEFAULT_USAGE = useMemo<UsageTotals>(
    () => ({ request: 0, response: 0, total: 0, requestCount: 0 }),
    [],
  );

  const [usageCache, setUsageCache] = useState<Record<string, UsageTotals>>({});
  const [lastUsageCache, setLastUsageCache] = useState<Record<string, UsageData | null>>({});
  const isUsageHydratingRef = useRef<boolean>(false);

  // Derive initial usage for the current session - only recompute when sessionId changes
  // DO NOT include usageCache in deps to avoid infinite loop
  const initialUsage = useMemo(() => {
    if (!sessionId) {
      return DEFAULT_USAGE;
    }
    return usageCache[sessionId] ?? DEFAULT_USAGE;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, DEFAULT_USAGE]);

  const initialLastUsage = useMemo(() => {
    if (!sessionId) {
      return null;
    }
    return lastUsageCache[sessionId] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const {
    lastUsage,
    cumulativeUsage,
    isConnected: isUsageConnected,
    error: usageError,
    resetCumulative,
    setCumulative,
    setLastUsage,
  } = useUsageStream(sessionId, true, 'ws://localhost:8001', initialUsage, initialLastUsage); // Always keep WebSocket open for usage tracking

  const [currentAgentStepState, setCurrentAgentStepState] = useState<AgentStepState>({
    sessionId,
    steps: [],
  });
  
  // Load stored usage stats and agent state for this session
  useEffect(() => {
    if (!sessionId) {
      return;
    }

    let isCancelled = false;
    isUsageHydratingRef.current = true;

    setUsageCache(prev => {
      if (prev[sessionId]) {
        return prev;
      }
      return { ...prev, [sessionId]: DEFAULT_USAGE };
    });

    setLastUsageCache(prev => {
      if (sessionId in prev) {
        return prev;
      }
      return { ...prev, [sessionId]: null };
    });

    setCurrentAgentStepState({ sessionId, steps: [] });

    const loadStoredData = async () => {
      try {
        // Load usage stats
        const storedUsage = await sessionStorageDBWrapper.getUsageStatsAsync(sessionId);
        if (!isCancelled) {
          const normalizedUsage: UsageTotals = storedUsage
            ? {
                request: storedUsage.request ?? 0,
                response: storedUsage.response ?? 0,
                total: storedUsage.total ?? 0,
                requestCount: storedUsage.requestCount ?? 0,
              }
            : DEFAULT_USAGE;

          const normalizedLastUsage: UsageData | null = storedUsage?.lastUsage
            ? {
                session_id: sessionId,
                agent_type: storedUsage.lastUsage.agentType ?? 'unknown',
                model: storedUsage.lastUsage.model ?? 'unknown',
                request_tokens: storedUsage.lastUsage.requestTokens ?? 0,
                response_tokens: storedUsage.lastUsage.responseTokens ?? 0,
                total_tokens:
                  storedUsage.lastUsage.totalTokens ??
                  (storedUsage.lastUsage.requestTokens ?? 0) + (storedUsage.lastUsage.responseTokens ?? 0),
                timestamp: storedUsage.lastUsage.timestamp ?? new Date().toISOString(),
              }
            : null;

          setUsageCache(prev => ({ ...prev, [sessionId]: normalizedUsage }));
          setLastUsageCache(prev => ({ ...prev, [sessionId]: normalizedLastUsage }));
          setCumulative(normalizedUsage);
          setLastUsage(normalizedLastUsage);
        }

        // Load agent state
        const storedState = await sessionStorageDBWrapper.getAgentStepStateAsync(sessionId);
        if (!isCancelled && storedState) {
          setCurrentAgentStepState({
            sessionId,
            steps: storedState.steps ?? [],
          });
        }
      } catch (error) {
        console.error('[ChatSessionContainer] Failed to load stored data:', error);
      } finally {
        if (!isCancelled) {
          isUsageHydratingRef.current = false;
        }
      }
    };

    loadStoredData();

    return () => {
      isCancelled = true;
      isUsageHydratingRef.current = false;
    };
  }, [sessionId, DEFAULT_USAGE, setCumulative, setLastUsage]);
  
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
    if (!sessionId || !cumulativeUsage || isUsageHydratingRef.current) {
      return;
    }

    const lastUsageRecord = lastUsage
      ? {
          requestTokens: lastUsage.request_tokens ?? 0,
          responseTokens: lastUsage.response_tokens ?? 0,
          totalTokens:
            lastUsage.total_tokens ??
            (lastUsage.request_tokens ?? 0) + (lastUsage.response_tokens ?? 0),
          timestamp: lastUsage.timestamp,
          agentType: lastUsage.agent_type,
          model: lastUsage.model,
        }
      : null;

    sessionStorageDBWrapper.updateUsageStats(sessionId, {
      request: cumulativeUsage.request,
      response: cumulativeUsage.response,
      total: cumulativeUsage.total,
      requestCount: cumulativeUsage.requestCount,
      lastUsage: lastUsageRecord,
    });
  }, [sessionId, cumulativeUsage, lastUsage]);

  useEffect(() => {
    if (!sessionId || !cumulativeUsage) {
      return;
    }

    setUsageCache(prev => {
      const existing = prev[sessionId];
      if (
        existing &&
        existing.request === cumulativeUsage.request &&
        existing.response === cumulativeUsage.response &&
        existing.total === cumulativeUsage.total &&
        existing.requestCount === cumulativeUsage.requestCount
      ) {
        return prev;
      }
      return { ...prev, [sessionId]: { ...cumulativeUsage } };
    });
  }, [sessionId, cumulativeUsage]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    setLastUsageCache(prev => {
      const existing = prev[sessionId];
      if (!lastUsage && !existing) {
        return prev;
      }

      if (
        existing &&
        lastUsage &&
        existing.request_tokens === lastUsage.request_tokens &&
        existing.response_tokens === lastUsage.response_tokens &&
        existing.total_tokens === lastUsage.total_tokens &&
        existing.timestamp === lastUsage.timestamp &&
        existing.agent_type === lastUsage.agent_type &&
        existing.model === lastUsage.model
      ) {
        return prev;
      }

      return { ...prev, [sessionId]: lastUsage ?? null };
    });
  }, [sessionId, lastUsage]);
  
  // Save agent step state to storage whenever it changes
  useEffect(() => {
    if (!currentAgentStepState) {
      return;
    }
    if (currentAgentStepState.sessionId && currentAgentStepState.sessionId !== sessionId) {
      return;
    }
    sessionStorageDBWrapper.updateAgentStepState(sessionId, {
      sessionId,
      steps: currentAgentStepState.steps ?? [],
    });
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

    // Live ref that reflects whether embedding work is active right now
    const embeddingActiveRef = useRef<boolean>(false);
    useEffect(() => {
      embeddingActiveRef.current = Boolean(isEmbedding || isEmbeddingProcessing);
    }, [isEmbedding, isEmbeddingProcessing]);

    // DOM update embedding hook - stores incremental DOM changes
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
      isLoadingFromDBRef, // Pass ref to check if change is from DB load
    });

    // Auto-save hook - replaces auto-save effects
    useAutoSave({
      isActive,
      saveMessagesRef,
      saveMessagesToStorage,
    });
  
  // Track if we've completed initial load to prevent saving during mount
  const hasLoadedInitialData = useRef(false);
  
  // Track if this is a user-initiated change vs a load from DB
  const isUserChange = useRef(false);
  
  // Memoize agent/model change handlers
  const handleAgentChange = useCallback((agent: string) => {
    console.log(`[AGENT_MODEL_SYNC] 👤 User changed agent to: ${agent}`);
    isUserChange.current = true; // Mark as user-initiated
    hasLoadedInitialData.current = true; // Ensure saves are enabled for this session
    setSelectedAgent(agent);
  }, []);
  
  const handleModelChange = useCallback((model: string) => {
    console.log(`[AGENT_MODEL_SYNC] 🤖 User changed model to: ${model}`);
    isUserChange.current = true; // Mark as user-initiated
    hasLoadedInitialData.current = true; // Ensure saves are enabled for this session
    setSelectedModel(model);
  }, []);
  
  // Save agent/model selection to storage whenever they change (including when cleared)
  // But skip the initial save during component mount or while loading from DB
  useEffect(() => {
    // Skip saving during initial load - only save user-initiated changes
    if (!hasLoadedInitialData.current) {
      console.log(`[AGENT_MODEL_SYNC] ⏭️ Skipping save during initial load for session ${sessionId}`);
      hasLoadedInitialData.current = true;
      return;
    }
    
    // Skip saving if we're currently loading from DB, UNLESS it's a user-initiated change
    if (isLoadingRef.current && !isUserChange.current) {
      console.log(`[AGENT_MODEL_SYNC] ⏭️ Skipping save while loading for session ${sessionId} (not user change)`);
      return;
    }
    
    console.log(`[AGENT_MODEL_SYNC] 💾 Saving agent/model to DB for session ${sessionId}:`, {
      agent: selectedAgent,
      model: selectedModel,
      isUserChange: isUserChange.current,
      isLoading: isLoadingRef.current,
    });
    
    // Debounce the save operation
    const timeoutId = setTimeout(() => {
      sessionStorageDBWrapper.updateSessionAgentAndModel(sessionId, selectedAgent, selectedModel);
      isUserChange.current = false; // Reset after save
    }, 300); // 300ms debounce
    
    return () => clearTimeout(timeoutId);
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

  /**
   * Enhanced refresh that waits for embeddings to complete
   * Used by the AI agent's refreshPageContent action
   */
  const triggerManualRefreshWithEmbeddingWait = useCallback(async () => {
    debug.log(ts(), '[ChatSessionContainer] Triggering manual refresh with embedding wait...');
    
    // Trigger the refresh
    await triggerManualRefresh();
    
    // Phase 1: wait briefly for embedding to START (content fetch -> effect kicks in)
    const maxStartWait = 3000; // 3s grace period to detect start
    const pollInterval = 100;  // Check every 100ms for fast detection
    let waited = 0;
    while (!embeddingActiveRef.current && waited < maxStartWait) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      waited += pollInterval;
    }

    // Phase 2: once started, wait until it finishes (cap total to 30s)
    const maxFinishWait = 30000;
    const startTime = Date.now();
    while (embeddingActiveRef.current && (Date.now() - startTime) < maxFinishWait) {
      debug.log(ts(), '[ChatSessionContainer] Waiting for embeddings to complete...');
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (embeddingActiveRef.current) {
      debug.log(ts(), '[ChatSessionContainer] ⚠️  Embeddings still processing after timeout');
    } else {
      debug.log(ts(), '[ChatSessionContainer] ✅ Embeddings finished');
    }
  }, [triggerManualRefresh, isEmbedding, isEmbeddingProcessing]);

  
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
      isCounterReady={isCounterReady}
      isEmbedding={isEmbedding}
      embeddingStatus={embeddingStatus}
      usageData={{
        lastUsage,
        cumulativeUsage,
        isConnected: isUsageConnected,
      }}
      onUsageClick={() => setIsUsagePopupOpen(true)}
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
    isCounterReady,
    isEmbedding,
    embeddingStatus,
    lastUsage,
    cumulativeUsage,
    isUsageConnected,
      ],
    );

    // Notify parent whenever headlessMessagesCount changes
    // IMPORTANT: Only report count AFTER hydration completes to prevent flickering from transient zero counts
    useEffect(() => {
      console.log(`📊 [ChatSessionContainer] Message count effect triggered for session ${sessionId}:`, {
        headlessMessagesCount,
        hydrationCompleted,
        hasReportedInitialCount: hasReportedInitialCountRef.current,
        willReport: hydrationCompleted && !hasReportedInitialCountRef.current
      });
      
      if (!onMessagesCountChange) return;
      
      // Only report the count once after hydration is fully complete
      // This prevents reporting transient zero counts during restore
      if (hydrationCompleted && !hasReportedInitialCountRef.current) {
        console.log(`📤 [ChatSessionContainer] Reporting message count to parent: ${headlessMessagesCount} for session ${sessionId}`);
        onMessagesCountChange(sessionId, headlessMessagesCount);
        hasReportedInitialCountRef.current = true;
        
        // Signal that counter is stable - this will trigger skeleton to hide
        setIsCounterReady(true);
        console.log(`✅ [ChatSessionContainer] Counter is stable for session ${sessionId}`);
      } else if (hydrationCompleted && hasReportedInitialCountRef.current) {
        console.warn(`⚠️ [ChatSessionContainer] Message count changed AFTER initial report (BLOCKED): ${headlessMessagesCount} for session ${sessionId}`);
      }
      // After initial report, do NOT update anymore to prevent flickering
    }, [onMessagesCountChange, sessionId, headlessMessagesCount, hydrationCompleted]);

    // Register reset function with parent when available
    useEffect(() => {
      if (onRegisterResetFunction && resetChatRef.current) {
        onRegisterResetFunction(sessionId, resetChatRef.current);
      }
    }, [onRegisterResetFunction, sessionId, resetChatRef.current]);

  const renderChatInner = useCallback(
    () => (
      <ChatInner
        key={`chat-inner-${sessionId}-${activeAgent}-${activeModel}-${showSuggestions ? 'on' : 'off'}-${
          showThoughtBlocks ? 'thought-on' : 'thought-off'
        }`}
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
        showThoughtBlocks={showThoughtBlocks}
        agentModeChat={agentModeChat}
        initialAgentStepState={currentAgentStepState}
        onAgentStepStateChange={setCurrentAgentStepState}
        contextMenuMessage={contextMenuMessage}
        triggerManualRefresh={triggerManualRefreshWithEmbeddingWait}
        isAgentAndModelSelected={selectedAgent !== '' && selectedModel !== ''}
        agentType={activeAgent}
        modelType={activeModel}
        organizationId={organization?.id || undefined}
        teamId={activeTeam || undefined}
      />
    ),
    [
      activeAgent,
      activeModel,
      activeTeam,
      contextMenuMessage,
      currentAgentStepState,
      currentPageContent,
      dbTotals,
      latestDOMUpdate,
      organization?.id,
      saveMessagesToStorage,
      selectedAgent,
      selectedModel,
      sessionId,
      sessionTitle,
      setCurrentMessages,
      setHeadlessMessagesCount,
      setIsAgentLoading,
      setThemeColor,
      showSuggestions,
      showThoughtBlocks,
      agentModeChat,
      themeColor,
      triggerManualRefreshWithEmbeddingWait,
    ],
  );

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
        {/* Agent switching overlay - positioned above everything including skeletons */}
        <div 
          className={`fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-sm transition-all duration-500 ${
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
            opacity: isSwitchingAgent ? 0.3 : isCounterReady ? 1 : 0,
                filter: isSwitchingAgent ? 'blur(2px)' : 'none',
                visibility: isCounterReady ? 'visible' : 'hidden',
              } as CSSProperties
          }
        >
          <SessionRuntimePortal
              sessionId={sessionId}
                agentType={activeAgent}
                modelType={activeModel}
                organizationId={organization?.id || undefined}
                teamId={activeTeam || undefined}
            runtimeUrl={COPIOLITKIT_CONFIG.RUNTIME_URL}
            publicApiKey={COPIOLITKIT_CONFIG.PUBLIC_API_KEY}
            renderContent={renderChatInner}
            />
        </div>

        {/* Agent and Model Selectors with Settings */}
        <SelectorsBar
          isLight={isLight}
          selectedAgent={selectedAgent}
          selectedModel={selectedModel}
          showSuggestions={showSuggestions}
          showThoughtBlocks={showThoughtBlocks}
          onAgentChange={handleAgentChange}
          onModelChange={handleModelChange}
          onShowSuggestionsChange={show => preferencesStorage.setShowSuggestions(show)}
          onShowThoughtBlocksChange={show => preferencesStorage.setShowThoughtBlocks(show)}
          onExpandSettingsClick={() => setIsSettingsOpen(true)}
        />
      </div>
      
      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        isLight={isLight}
        showAgentCursor={showAgentCursor}
        showSuggestions={showSuggestions}
        showThoughtBlocks={showThoughtBlocks}
        agentModeChat={agentModeChat}
        agentType={activeAgent}
        modelType={activeModel}
        organizationId={organization?.id || undefined}
        teamId={activeTeam || undefined}
        onClose={() => setIsSettingsOpen(false)}
          onShowAgentCursorChange={show => preferencesStorage.setShowAgentCursor(show)}
          onShowSuggestionsChange={show => preferencesStorage.setShowSuggestions(show)}
        onShowThoughtBlocksChange={show => preferencesStorage.setShowThoughtBlocks(show)}
        onAgentModeChatChange={enabled => preferencesStorage.setAgentModeChat(enabled)}
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
        sessionId={sessionId}
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
  // Custom comparison function to prevent unnecessary re-renders
  (prevProps, nextProps) => {
    // Only re-render if these specific props change
    return (
      prevProps.sessionId === nextProps.sessionId &&
      prevProps.isLight === nextProps.isLight &&
      prevProps.publicApiKey === nextProps.publicApiKey &&
      prevProps.isActive === nextProps.isActive &&
      prevProps.contextMenuMessage === nextProps.contextMenuMessage
      // Note: We intentionally don't compare callback props as they're stable
    );
  }
);

ChatSessionContainer.displayName = 'ChatSessionContainer';
