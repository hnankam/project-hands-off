import * as React from 'react';
import { useEffect, useState, useCallback, useRef, useMemo, memo, startTransition } from 'react';
import type { FC, CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useStorage, sessionStorageDBWrapper, debug, type SessionMetadata } from '@extension/shared';
import { preferencesStorage } from '@extension/storage';
import { StatusBar, type MoreOptionsMenuProps } from '../layout/StatusBar';
import { ChatInner } from './ChatInner';
import { SelectorsBar } from '../selectors/SelectorsBar';
import { SettingsModal } from '../modals/SettingsModal';
import { UsagePopup } from '../menus/UsagePopup';
import { ConfigPanel } from '../panels/ConfigPanel';
import type { AgentStepState } from '../cards';
import { useContentManager, type ContentState } from '../layout/ContentManager';
import { useTabManager } from '../layout/TabManager';
import { useMessagePersistence } from '../../hooks/useMessagePersistence';
import { usePanelVisibility } from '../../hooks/usePanelVisibility';
import { useContentRefresh } from '../../hooks/useContentRefresh';
import { useUsageStream, type UsageData } from '../../hooks/useUsageStream';
import { useSessionData, type UsageTotals } from '../../hooks/useSessionData';
import { useEmbeddingWorker } from '../../hooks/useEmbeddingWorker';
import { usePageContentEmbedding } from '../../hooks/usePageContentEmbedding';
import { useDOMUpdateEmbedding } from '../../hooks/useDOMUpdateEmbedding';
import { useAgentSwitching } from '../../hooks/useAgentSwitching';
import { useEnabledFrontendTools } from '../../hooks/useEnabledFrontendTools';
import { TIMING_CONSTANTS, COPIOLITKIT_CONFIG, ABLY_CONFIG } from '../../constants';
import { ts } from '../../utils/logging';
import { useAuth } from '../../context/AuthContext';
import { ExploreAccordionProvider } from '../../context/ExploreAccordionContext';
import { useMultiPageMetadata } from '../../hooks/useMultiPageMetadata';
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';
import { CopilotKitProvider, useCopilotChat, useCopilotAgent, SharedAgentProvider } from '../../hooks/copilotkit';
import { createAllToolRenderers } from '../../actions/copilot/builtinToolActions';
import { createActivityMessageRenderers } from '../../actions/copilot/activityRenderers';
import type { UnifiedAgentState } from '../graph-state/types';

// Helper for text clipping (used by backend tool renderers)
const clipText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

/** Read config panel state from localStorage (matches SessionsPage pattern for reliable restore) */
function getConfigPanelFromLocalStorage(sessionId: string): { open: boolean; tab: 'context' | 'plans' | 'graphs' | 'sub-agents' } | null {
  try {
    const stored = localStorage.getItem(`configPanel_${sessionId}`);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed.open === 'boolean' && ['context', 'plans', 'graphs', 'sub-agents'].includes(parsed.tab)) {
      return { open: parsed.open, tab: parsed.tab as 'context' | 'plans' | 'graphs' | 'sub-agents' };
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

/**
 * Wrapper component for the config panel (plans, graphs, and other containers).
 * Syncs updates back to CopilotKit agent state.
 * Must be rendered inside CopilotKitProvider.
 */
const ConfigPanelWrapper: FC<{
  isLight: boolean;
  showConfigPanel: boolean;
  activeTab: 'context' | 'plans' | 'graphs' | 'sub-agents';
  onTabChange: (tab: 'context' | 'plans' | 'graphs' | 'sub-agents') => void;
  agentPlans: Record<string, any>;
  agentGraphs: Record<string, any>;
  sessionId: string;
  onCloseConfig: () => void;
  onPlansUpdate: (plans: Record<string, any>) => void;
  onGraphsUpdate: (graphs: Record<string, any>) => void;
  onWidthChange: (width: number) => void;
  initialPanelWidth?: number;
  chatFontSize?: 'small' | 'medium' | 'large';
  /** When provided, render ConfigPanel into this portal (same parent as content column, like SessionsPanel) */
  portalRef?: React.RefObject<HTMLDivElement | null>;
}> = ({
  isLight,
  showConfigPanel,
  activeTab,
  onTabChange,
  agentPlans,
  agentGraphs,
  sessionId,
  onCloseConfig,
  onPlansUpdate,
  onGraphsUpdate,
  onWidthChange,
  initialPanelWidth = 384,
  chatFontSize = 'medium',
  portalRef,
}) => {
  // Detect container size for responsive behavior
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSmallView, setIsSmallView] = useState(false);
  const SMALL_VIEW_THRESHOLD = 600; // Switch to overlay mode below this width

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const checkSize = () => {
      const width = container.offsetWidth || container.clientWidth;
      setIsSmallView(width < SMALL_VIEW_THRESHOLD);
    };

    // Initial check
    checkSize();

    // Use ResizeObserver for efficient size tracking
    const resizeObserver = new ResizeObserver(() => {
      checkSize();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Get agent setState to sync panel updates back to CopilotKit
  const { state: currentAgentState, setState: setAgentState } = useCopilotAgent<UnifiedAgentState>({
    agentId: 'dynamic_agent',
    initialState: { sessionId, plans: {}, graphs: {} },
  });

  // Enhanced handlers that sync to both local state and CopilotKit agent state
  // Use plain objects instead of functional updaters to avoid DataCloneError
  const handlePlansUpdate = useCallback((updatedPlans: Record<string, any>) => {
    // Update local state
    onPlansUpdate(updatedPlans);
    
    // Sync back to CopilotKit agent state
    if (setAgentState) {
      setAgentState({
        ...(currentAgentState || {}),
        sessionId: currentAgentState?.sessionId || sessionId,
        plans: updatedPlans,
        graphs: currentAgentState?.graphs || {},
      });
    }
  }, [onPlansUpdate, setAgentState, currentAgentState, sessionId]);

  const handleGraphsUpdate = useCallback((updatedGraphs: Record<string, any>) => {
    // Update local state
    onGraphsUpdate(updatedGraphs);
    
    // Sync back to CopilotKit agent state
    if (setAgentState) {
      setAgentState({
        ...(currentAgentState || {}),
        sessionId: currentAgentState?.sessionId || sessionId,
        plans: currentAgentState?.plans || {},
        graphs: updatedGraphs,
      });
    }
  }, [onGraphsUpdate, setAgentState, currentAgentState, sessionId]);

  const panelContent = (
    <div
      ref={containerRef}
      className="absolute top-0 bottom-0 right-0 z-50"
      style={{ pointerEvents: 'none', width: '100%', height: '100%' }}
    >
      <ConfigPanel
        isLight={isLight}
        isOpen={showConfigPanel}
        onClose={onCloseConfig}
        activeTab={activeTab}
        onTabChange={onTabChange}
        plans={agentPlans}
        graphs={agentGraphs}
        sessionId={sessionId}
        onPlansUpdate={handlePlansUpdate}
        onGraphsUpdate={handleGraphsUpdate}
        onWidthChange={onWidthChange}
        initialWidth={initialPanelWidth}
        isSmallView={isSmallView}
        chatFontSize={chatFontSize}
      />
    </div>
  );

  // Render into portal when available (same parent as content column, like SessionsPanel - pushes footer)
  if (portalRef?.current) {
    return createPortal(panelContent, portalRef.current);
  }
  return panelContent;
};

/**
 * Helper component that syncs agent state (plans/graphs) to a ref AND triggers parent re-render.
 * Must be rendered inside CopilotKitProvider.
 */
const AgentStateSync: FC<{
  sessionId: string;
  agentStateRef: React.MutableRefObject<{ plans?: Record<string, any>; graphs?: Record<string, any> }>;
  onStateChange?: (plans: Record<string, any>, graphs: Record<string, any>) => void;
}> = ({ sessionId, agentStateRef, onStateChange }) => {
  // Read live state from CopilotKit agent
  // Use useCopilotAgent which supports SharedAgentProvider context
  const { state: liveAgentState } = useCopilotAgent<UnifiedAgentState>({
    agentId: 'dynamic_agent',
    initialState: { sessionId, plans: {}, graphs: {} },
  });

  // Track last synced state to prevent unnecessary updates
  // Store the actual content, not just keys, to detect content changes
  const lastSyncedPlansRef = useRef<string>('');
  const lastSyncedGraphsRef = useRef<string>('');
  
  // Reset synced refs when session changes
  useEffect(() => {
    lastSyncedPlansRef.current = '';
    lastSyncedGraphsRef.current = '';
  }, [sessionId]);
  
  // Sync to ref whenever it changes AND notify parent
  useEffect(() => {
    if (liveAgentState) {
      const plans = liveAgentState.plans || {};
      const graphs = liveAgentState.graphs || {};
      
      // Create content signatures to detect actual changes (including nested updates)
      const plansSignature = JSON.stringify(plans);
      const graphsSignature = JSON.stringify(graphs);
      
      // Check if either plans or graphs actually changed
      const plansChanged = plansSignature !== lastSyncedPlansRef.current;
      const graphsChanged = graphsSignature !== lastSyncedGraphsRef.current;
      
      // Only update if data actually changed
      if (!plansChanged && !graphsChanged) {
        return;
      }
      
      // Update refs with new signatures
      if (plansChanged) {
        lastSyncedPlansRef.current = plansSignature;
      }
      if (graphsChanged) {
        lastSyncedGraphsRef.current = graphsSignature;
      }
      
      agentStateRef.current = {
        plans,
        graphs,
      };

      const planIds = Object.keys(plans);
      debug.log('[SessionPlans] AgentStateSync syncing to parent:', {
        sessionId: sessionId.slice(0, 8),
        plansCount: planIds.length,
        planIds,
      });
      
      // Notify parent with the actual data to trigger re-render
      onStateChange?.(plans, graphs);
    }
  }, [liveAgentState, agentStateRef, sessionId, onStateChange]);

  return null;
};

/**
 * Helper component that syncs messages signature and streaming state from CopilotKit to parent.
 * Also handles session switching by resetting CopilotKit state when sessionId changes.
 * Must be rendered inside CopilotKitProvider.
 */

// Custom comparison function to ensure ChatInnerWithSignatureSync re-renders when renderChatInner changes
const chatInnerWithSignatureSyncCompare = (prevProps: any, nextProps: any) => {
  // Always re-render if renderChatInner function reference changes
  if (prevProps.renderChatInner !== nextProps.renderChatInner) {
    return false; // false means props changed, should re-render
  }
  
  // Check if sessionId changed
  if (prevProps.sessionId !== nextProps.sessionId) {
    return false;
  }
  
  // For other props, use default shallow comparison
  return (
    prevProps.onSignatureChange === nextProps.onSignatureChange &&
    prevProps.onStreamingChange === nextProps.onStreamingChange &&
    prevProps.agentStateRef === nextProps.agentStateRef
  );
};

const ChatInnerWithSignatureSyncComponent = ({ sessionId, onSignatureChange, onStreamingChange, renderChatInner, agentStateRef }: {
  sessionId: string;
  onSignatureChange: (signature: string) => void;
  onStreamingChange: (isStreaming: boolean) => void;
  renderChatInner: () => React.ReactNode;
  agentStateRef: React.MutableRefObject<{ plans?: Record<string, any>; graphs?: Record<string, any> }>;
}) => {
  const { messages, isLoading, reset } = useCopilotChat();
  const prevSessionIdRef = useRef(sessionId);
  // CRITICAL FIX: Stable signature ref to prevent infinite loops
  // Using Date.now() in catch block creates new value every millisecond → infinite re-renders
  const lastSignatureRef = useRef<string>('');

  // Handle session switch - reset CopilotKit messages when session changes
  // This allows CopilotKitProvider to remain stable (no key change) while still
  // clearing messages on session switch
  useEffect(() => {
    if (prevSessionIdRef.current !== sessionId) {
      prevSessionIdRef.current = sessionId;
      // Reset CopilotKit's internal message state
      reset();
    }
  }, [sessionId, reset]);

  // Sync streaming state to parent
  useEffect(() => {
    onStreamingChange(isLoading);
  }, [isLoading, onStreamingChange]);

  // Compute and sync messages signature
  useEffect(() => {
    try {
      const signature = JSON.stringify(
        messages.map(message => ({
          id: (message as any)?.id ?? null,
          role: (message as any)?.role ?? null,
          hash: typeof (message as any)?.content === 'string' 
            ? (message as any).content.length 
            : JSON.stringify((message as any)?.content ?? '').length,
        })),
      );
      lastSignatureRef.current = signature;
      onSignatureChange(signature);
    } catch (error) {
      // CRITICAL FIX: Use stable fallback without Date.now() to prevent infinite loops
      // If signature computation fails, only update if the fallback actually changed
      const fallback = `error:${messages.length}`;
      if (lastSignatureRef.current !== fallback) {
        debug.warn('[ChatInnerWithSignatureSync] Failed to compute signature:', error);
        lastSignatureRef.current = fallback;
        onSignatureChange(fallback);
      }
    }
  }, [messages, onSignatureChange]);

  const chatInnerElement = renderChatInner();

  return chatInnerElement;
};

const ChatInnerWithSignatureSync = memo(ChatInnerWithSignatureSyncComponent, chatInnerWithSignatureSyncCompare);
ChatInnerWithSignatureSync.displayName = 'ChatInnerWithSignatureSync';

interface ChatSessionContainerProps {
  sessionId: string;
  isLight: boolean;
  publicApiKey: string;
  initialMetadata?: SessionMetadata | null;
  isActive?: boolean;
  contextMenuMessage?: string | null;
  onMessagesCountChange?: (sessionId: string, count: number) => void;
  onRegisterResetFunction?: (sessionId: string, resetFn: () => void) => void;
  onRegisterOpenSettings?: (sessionId: string, openFn: () => void) => void;
  onRegisterConfigPanel?: (sessionId: string, state: { isOpen: boolean; width: number; toggle: () => void }) => void;
  onRegisterGetMessagesFunction?: (sessionId: string, fn: () => any[]) => void;
  onReady?: (sessionId: string) => void;
  onMessagesLoadingChange?: (sessionId: string, isLoading: boolean) => void;
  /** Portal ref for ConfigPanel - when provided, ConfigPanel renders as sibling of content column (like SessionsPanel) */
  configPanelPortalRef?: React.RefObject<HTMLDivElement | null>;
  /** Override initial config panel open when switching sessions (preserves panel state) */
  configPanelOpenOverride?: boolean;
  /** More options menu for status bar (session actions) - only shown for active session */
  moreOptionsMenu?: MoreOptionsMenuProps;
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
    initialMetadata = null,
    isActive = true,
    contextMenuMessage = null,
    onMessagesCountChange,
    onRegisterResetFunction,
    onRegisterOpenSettings,
    onRegisterConfigPanel,
    onRegisterGetMessagesFunction,
    onReady,
    onMessagesLoadingChange,
    configPanelPortalRef,
    configPanelOpenOverride,
    moreOptionsMenu,
  }) => {
    // Removed: const { sessions } = useSessionStorageDB();
    // This was causing unnecessary re-renders on every session update.
    // Agent/model loading is now handled by useSessionData hook.
    const { showSuggestions, showThoughtBlocks, agentModeChat, chatFontSize } = useStorage(preferencesStorage);
    const { user, organization, member, activeTeam } = useAuth();
    const [userMessagesCount, setUserMessagesCount] = useState<number>(0);
    const [assistantMessagesCount, setAssistantMessagesCount] = useState<number>(0);
    const [isCounterReady, setIsCounterReady] = useState<boolean>(false); // Hide counter until stable
    const [isLoading, setIsLoading] = useState(true);
    const [isAgentLoading, setIsAgentLoading] = useState(false);
    const [themeColor, setThemeColor] = useState('#374151'); // gray-700 for better visibility
    // Track if initial message count has been reported to prevent flickering after skeleton disappears
    const hasReportedInitialCountRef = useRef(false);
    const lastReportedCountRef = useRef<number>(0);
    const initialReportTimeRef = useRef<number>(0);
    const hydrationReadyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isUsagePopupOpen, setIsUsagePopupOpen] = useState(false);
    
    // Track messages signature for hydration (replaces useSessionRuntimeState)
    const [messagesSignature, setMessagesSignature] = useState<string>('');
    const messagesSignatureRef = useRef<string>('');
    
    // Track streaming state from CopilotKit (synced from ChatInnerWithSignatureSync)
    const [copilotIsStreaming, setCopilotIsStreaming] = useState<boolean>(false);

    // Track previous session ID to detect changes
    const prevSessionIdRef = useRef<string | null>(null);

    // Reset message count when session changes
    useEffect(() => {
      if (hydrationReadyTimeoutRef.current) {
        clearTimeout(hydrationReadyTimeoutRef.current);
        hydrationReadyTimeoutRef.current = null;
      }

      if (prevSessionIdRef.current && prevSessionIdRef.current !== sessionId) {
        // OPTIMIZATION: Batch state updates using startTransition to reduce re-renders
        startTransition(() => {
          setUserMessagesCount(0);
          setAssistantMessagesCount(0);
          setIsCounterReady(false);
          hasReportedInitialCountRef.current = false;
          setCurrentAgentStepState({
            sessionId,
            plans: {},
            graphs: {},
          });
        });
      }
      prevSessionIdRef.current = sessionId;
    }, [sessionId]);

    // Note: Embedding state (pageContentEmbeddingRef, isEmbedding, embeddingStatus, dbTotals)
    // is now provided by usePageContentEmbedding hook (see line ~396)

    // ================================================================================
    // SESSION DATA MANAGEMENT (Consolidates metadata, usage, agent state loading)
    // ================================================================================
    const {
      selectedAgent,
      setSelectedAgent: setSelectedAgentInternal,
      selectedModel,
      setSelectedModel: setSelectedModelInternal,
      initialSelectedPageURLs,
      initialSelectedNoteIds,
      initialSelectedCredentialIds,
      initialUsage,
      initialLastUsage,
      isUsageHydrating,
      currentAgentStepState,
      setCurrentAgentStepState: setCurrentAgentStepStateInternal,
      isLoadingMetadata,
      isLoadingFromDB,
      persistUsageStats,
    } = useSessionData(sessionId, isActive, initialMetadata, configPanelOpenOverride);

    // Ref to hold the setDynamicAgentState from ChatInner (via useAgentStateManagement)
    // This allows activity renderers to update the CopilotKit agent state directly
    const setDynamicAgentStateRef = useRef<((state: AgentStepState) => void) | null>(null);

    // Handler for when ChatInner's agent state changes (via onAgentStepStateChange)
    // This only updates the container's local state for persistence - it does NOT call setDynamicAgentState
    const handleAgentStepStateChange = useCallback(
      (state: AgentStepState) => {
        setCurrentAgentStepStateInternal(state);
      },
      [setCurrentAgentStepStateInternal],
    );

    // Handler for when activity renderers (PlanStateCard) want to update state
    // This calls setDynamicAgentState directly to update CopilotKit state
    const setCurrentAgentStepState = useCallback(
      (state: AgentStepState) => {
        if (setDynamicAgentStateRef.current) {
          // Use the CopilotKit agent state setter from ChatInner
          setDynamicAgentStateRef.current(state);
        } else {
          // Fallback to container state (used during initial hydration)
          setCurrentAgentStepStateInternal(state);
        }
      },
      [setCurrentAgentStepStateInternal],
    );

    // Wrap setters to maintain existing API
    const setSelectedAgent = useCallback(
      (agent: string) => {
        setSelectedAgentInternal(agent);
      },
      [setSelectedAgentInternal],
    );

    const setSelectedModel = useCallback(
      (model: string) => {
        setSelectedModelInternal(model);
      },
      [setSelectedModelInternal],
    );

    // Log when agent/model selections change
    // Clear agent and model selections when there's no active team
    useEffect(() => {
      if (!organization?.id || !activeTeam) {
        setSelectedAgentInternal('');
        setSelectedModelInternal('');
      }
    }, [organization?.id, activeTeam, sessionId, setSelectedAgentInternal, setSelectedModelInternal]);

    // Agent switching is handled by useAgentSwitching hook

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

    // Multi-page context: Selected pages for agent context
    // Initialize with persisted values from session storage
    const [selectedPageURLs, setSelectedPageURLsState] = useState<string[]>(initialSelectedPageURLs);
    const selectedPageURLsRef = useRef(selectedPageURLs);
    selectedPageURLsRef.current = selectedPageURLs;
    
    // Sync selectedPageURLs when session changes or initialSelectedPageURLs is loaded
    useEffect(() => {
      setSelectedPageURLsState(initialSelectedPageURLs);
    }, [sessionId, initialSelectedPageURLs]);
    
    const setSelectedPageURLs = useCallback((newSelection: string[] | ((prev: string[]) => string[])) => {
      setSelectedPageURLsState(newSelection);
    }, []);

    // Workspace context: Selected notes and credentials for agent context
    const [selectedNotes, setSelectedNotesState] = useState<any[]>([]);
    const selectedNotesRef = useRef(selectedNotes);
    selectedNotesRef.current = selectedNotes;
    
    const [selectedCredentials, setSelectedCredentialsState] = useState<any[]>([]);
    const selectedCredentialsRef = useRef(selectedCredentials);
    selectedCredentialsRef.current = selectedCredentials;
    
    const setSelectedNotes = useCallback((newSelection: any[] | ((prev: any[]) => any[])) => {
      setSelectedNotesState(newSelection);
    }, []);
    
    const setSelectedCredentials = useCallback((newSelection: any[] | ((prev: any[]) => any[])) => {
      setSelectedCredentialsState(newSelection);
    }, []);

    // Config panel (plans, graphs, and other containers) - restored per session
    // Initialize from localStorage directly (matches SessionsPage pattern for reliable restore on reopen)
    const [showConfigPanel, setShowConfigPanel] = useState(() => {
      const stored = getConfigPanelFromLocalStorage(sessionId);
      return stored?.open ?? false;
    });
    const [configPanelTab, setConfigPanelTab] = useState<'context' | 'plans' | 'graphs' | 'sub-agents'>(() => {
      const stored = getConfigPanelFromLocalStorage(sessionId);
      return stored?.tab ?? 'context';
    });

    // Sync config panel state when session changes (read from localStorage for new session)
    // Use || not ?? so when configPanelOpenOverride is false we fall through to stored?.open
    useEffect(() => {
      const stored = getConfigPanelFromLocalStorage(sessionId);
      setShowConfigPanel(configPanelOpenOverride || (stored?.open ?? false));
      setConfigPanelTab(stored?.tab ?? 'context');
    }, [sessionId, configPanelOpenOverride]);
    
    // Load persisted panel width from localStorage
    const getPersistedPanelWidth = useCallback(() => {
      try {
        const saved = localStorage.getItem('panel-width');
        if (saved) {
          const width = parseInt(saved, 10);
          if (!isNaN(width) && width >= 300 && width <= 800) {
            return width;
          }
        }
      } catch (error) {
        console.error('[ChatSessionContainer] Failed to load panel width:', error);
      }
      return 384; // Default width
    }, []);
    
    const [panelWidth, setPanelWidth] = useState(getPersistedPanelWidth); // Track actual panel width for dynamic resizing
    
    // Detect viewport size for responsive behavior (before panel margin is applied)
    const chatWrapperRef = useRef<HTMLDivElement | null>(null);
    const [isSmallChatView, setIsSmallChatView] = useState(() => {
      // Initial check using window width
      if (typeof window !== 'undefined') {
        return window.innerWidth < 600;
      }
      return false;
    });
    const SMALL_VIEW_THRESHOLD = 600; // Switch to overlay mode below this width
    
    useEffect(() => {
      const wrapper = chatWrapperRef.current;
      
      const checkSize = () => {
        // Check wrapper width first (most accurate), then parent, then window
        let width = window.innerWidth;
        
        if (wrapper) {
          const wrapperWidth = wrapper.offsetWidth || wrapper.clientWidth;
          if (wrapperWidth > 0) {
            width = wrapperWidth;
          } else {
            // Try parent container
            const parent = wrapper.parentElement;
            if (parent) {
              const parentWidth = parent.offsetWidth || parent.clientWidth;
              if (parentWidth > 0) {
                width = parentWidth;
              }
            }
          }
        }
        
        const isSmall = width < SMALL_VIEW_THRESHOLD;
        setIsSmallChatView(isSmall);
      };

      // Initial check with a small delay to ensure DOM is ready
      const timeoutId = setTimeout(checkSize, 0);
      
      // Use ResizeObserver for wrapper if available
      if (wrapper) {
        const resizeObserver = new ResizeObserver(() => {
          checkSize();
        });
        resizeObserver.observe(wrapper);
        
        // Also listen to window resize as fallback
        window.addEventListener('resize', checkSize);
        
        return () => {
          clearTimeout(timeoutId);
          resizeObserver.disconnect();
          window.removeEventListener('resize', checkSize);
        };
      } else {
        // Fallback to window resize only
        window.addEventListener('resize', checkSize);
        return () => {
          clearTimeout(timeoutId);
          window.removeEventListener('resize', checkSize);
        };
      }
    }, []);
    
    // Persist panel width to localStorage
    const handlePanelWidthChange = useCallback((width: number) => {
      setPanelWidth(width);
      try {
        localStorage.setItem('panel-width', width.toString());
      } catch (error) {
        console.error('[ChatSessionContainer] Failed to save panel width:', error);
      }
    }, []);
    
    // Handle config panel toggle
    const handleConfigClick = useCallback((e?: React.MouseEvent) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      setShowConfigPanel((prev) => !prev);
    }, []);

    // Persist config panel state immediately on change (matches SessionsPage - no debounce)
    const isConfigPanelHydrated = useRef(false);
    useEffect(() => {
      if (!isConfigPanelHydrated.current) {
        isConfigPanelHydrated.current = true;
        return;
      }
      try {
        localStorage.setItem(
          `configPanel_${sessionId}`,
          JSON.stringify({ open: showConfigPanel, tab: configPanelTab })
        );
      } catch (e) {
        console.error('[ChatSessionContainer] Failed to persist config panel to localStorage', e);
      }
      sessionStorageDBWrapper.updateSessionConfigPanel(sessionId, showConfigPanel, configPanelTab);
    }, [showConfigPanel, configPanelTab, sessionId]);
    useEffect(() => () => {
      isConfigPanelHydrated.current = false;
    }, [sessionId]);
    
    // State for agent plans/graphs - must be state (not ref) so React re-renders panels when it changes
    const [agentPlans, setAgentPlans] = useState<Record<string, any>>({});
    const [agentGraphs, setAgentGraphs] = useState<Record<string, any>>({});
    const dynamicAgentStateRef = useRef<{ plans?: Record<string, any>; graphs?: Record<string, any> }>({ plans: {}, graphs: {} });
    
    const sessionIdRefForLog = useRef(sessionId);
    sessionIdRefForLog.current = sessionId;
    // Memoized callback to prevent infinite loops - only updates when sessionId changes
    const handleAgentStateChange = useCallback((plans: Record<string, any>, graphs: Record<string, any>) => {
      const planIds = Object.keys(plans ?? {});
      debug.log('[SessionPlans] ChatSessionContainer handleAgentStateChange:', {
        sessionId: sessionIdRefForLog.current?.slice(0, 8),
        plansCount: planIds.length,
        planIds,
      });
      // Update state with new object references to trigger re-renders
      setAgentPlans({ ...plans }); // Create new object reference
      setAgentGraphs({ ...graphs }); // Create new object reference
    }, []); // Empty deps - only create once per component mount


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
      currentTabUrl: managedTabUrl,
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
          try {
            clearCache();
          } catch {}
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
            }
            return;
          }
        }

        // User clicked inside the panel - mark as interactive
        const wasInactive = !isPanelInteractive;

        if (wasInactive) {
          setIsPanelInteractive(true);

          // Trigger content refresh when becoming interactive (handles tab changes while panel was inactive)
          if (currentTabId) {
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
            }
          }, TIMING_CONSTANTS.AUTO_FOCUS_DELAY);
        }
      },
      onPanelBlur: () => {
      },
    });

    // Message persistence
    const {
      hydrationCompleted,
    } = useMessagePersistence({
      sessionId,
      isActive,
      isPanelVisible,
      resetChatRef,
    });
    const readySignalTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const hasSignaledReadyRef = useRef(false);

    // Notify parent when UI readiness changes (replaces isHydrating)
    useEffect(() => {
      if (onMessagesLoadingChange) {
        // Invert hydrationCompleted: loading = !ready
        onMessagesLoadingChange(sessionId, !hydrationCompleted);
      }
    }, [sessionId, hydrationCompleted, onMessagesLoadingChange]);

    // Handle session ID changes gracefully without full remount
    useEffect(() => {
      const prevSessionId = prevSessionIdRef.current;
      const sessionChanged = prevSessionId && prevSessionId !== sessionId;

      if (sessionChanged) {
        debug.log(
          `[ChatSessionContainer] Session changed from ${prevSessionId} to ${sessionId}, handling hydration...`,
        );

        const runtimeHasMessages = Boolean(messagesSignatureRef.current);

        // With CopilotKit v1.50, messages are automatically loaded from server
        // No manual loading/saving needed

        // Removed: Duplicate agent/model loading from sessions array
        // This is now handled by useSessionData hook which loads from IndexedDB
        // const newSession = sessions.find(s => s.id === sessionId);
        // if (newSession) {
        //   setSelectedAgent(newSession.selectedAgent || '');
        //   setSelectedModel(newSession.selectedModel || '');
        // }

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
      // Removed: sessions (no longer needed, reduces re-renders)
      messagesSignature,
    ]);

    useEffect(() => {
      if (!isActive) {
        return;
      }

      const signature = messagesSignature;
      if (!signature) {
        return;
      }

      if (hydrationCompleted && hasReportedInitialCountRef.current) {
        setIsCounterReady(true);
      }
    }, [isActive, messagesSignature, hydrationCompleted, sessionId]);

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
      // If session is already ready, skip the signal check
      // This allows re-signaling when switching between mounted sessions
      if (hasSignaledReadyRef.current && reason === 'hydration' && hasReportedInitialCountRef.current) {
        onReady?.(sessionId);
        return;
      }

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
        debug.log(
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
          // If we are already ready and just became active, signal immediately (0ms)
          // Otherwise use the fallback delay for cold mounts
          const delay = hasReportedInitialCountRef.current ? 0 : HYDRATION_READY_FALLBACK_DELAY;
          hydrationReadyTimeoutRef.current = setTimeout(() => {
            hydrationReadyTimeoutRef.current = null;
            signalReady('hydration');
          }, delay);
        }
      } else if (hydrationReadyTimeoutRef.current) {
        clearTimeout(hydrationReadyTimeoutRef.current);
        hydrationReadyTimeoutRef.current = null;
      }

      return () => {
        if (
          !hasSignaledReadyRef.current &&
          hydrationReadyTimeoutRef.current &&
          !isCounterReady &&
          !hydrationCompleted
        ) {
          clearTimeout(hydrationReadyTimeoutRef.current);
          hydrationReadyTimeoutRef.current = null;
        }
      };
    }, [onReady, isActive, isCounterReady, hydrationCompleted, sessionId]);

    // Note: Message loading is handled automatically by useMessagePersistence's auto-restore
    // No need to explicitly call handleLoadMessages here as it would cause double renders
    // The auto-restore triggers 50ms after session becomes active, allowing CopilotKit to initialize
    const HYDRATION_READY_FALLBACK_DELAY = 50; // milliseconds - reduced from 80ms for faster ready signal

    // ================================================================================
    // USAGE TRACKING (Uses data from useSessionData hook)
    // ================================================================================
    const {
      lastUsage,
      cumulativeUsage,
      isConnected: isUsageConnected,
      error: usageError,
      resetCumulative,
      setCumulative,
      setLastUsage,
    } = useUsageStream(
      sessionId,
      true,
      ABLY_CONFIG.API_KEY,
      initialUsage,
      initialLastUsage,
    );

    // Ref for backward compatibility
    const isUsageHydratingRef = useRef(isUsageHydrating);

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

    // Save cumulative usage to storage whenever it changes
    // Now handled by useSessionData hook
    useEffect(() => {
      if (cumulativeUsage) {
        persistUsageStats(cumulativeUsage, lastUsage);
      }
    }, [cumulativeUsage, lastUsage, persistUsageStats]);

    // Save agent step state to storage whenever it changes
    // Skip saving during hydration to prevent overwriting DB data with empty state
    useEffect(() => {
      if (!currentAgentStepState) {
        return;
      }
      if (currentAgentStepState.sessionId && currentAgentStepState.sessionId !== sessionId) {
        return;
      }
      // Don't save during initial hydration - wait for DB load to complete
      if (isUsageHydrating) {
        return;
      }
      // Save plan and graph state to storage
      sessionStorageDBWrapper.updateAgentStepState(sessionId, {
        sessionId,
        plans: currentAgentStepState.plans || {},
        graphs: currentAgentStepState.graphs || {},
        deferred_tool_requests: currentAgentStepState.deferred_tool_requests,
      } as any);
    }, [sessionId, currentAgentStepState, isUsageHydrating]);

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


    // Derived state for backward compatibility (moved here to avoid "use before declaration" error)
    const currentPageContent = contentState.current || contentState.previous;
    const isContentFetching = contentState.status === 'loading' || contentState.status === 'refreshing';

    // ================================================================================
    // CUSTOM HOOKS FOR EMBEDDING, AGENT SWITCHING, AND AUTO-SAVE
    // ================================================================================

    // Page content embedding hook - replaces large embedding effect block
    const { pageContentEmbeddingRef, isEmbedding, embeddingStatus, dbTotals } = usePageContentEmbedding({
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

    // Multi-page metadata for shared contexts display
    const multiPageMetadata = useMultiPageMetadata({
      selectedPageURLs,
      currentPageURL: currentPageContent?.url || null,
      currentPageContent,
      pageContentEmbedding: pageContentEmbeddingRef.current,
      currentPageTotals: dbTotals,
      enableLogging: false,
    });

    // Workspace context for shared contexts display
    const { context: workspaceContext } = useWorkspaceContext();

    // Prepare shared contexts data for SettingsModal
    const sharedContexts = useMemo(() => ({
      multiPageMetadata,
      userContext: user ? {
        user: {
          name: user.name,
          email: user.email,
        },
        organization: organization ? {
          name: organization.name,
        } : null,
      } : null,
      workspaceContext: workspaceContext ? {
        files: {
          count: workspaceContext.file_count,
          recent: workspaceContext.recent_files.map((f: any) => ({
            id: f.id,
            name: f.file_name,
            type: f.file_type,
          })),
        },
        notes: {
          count: workspaceContext.note_count,
          recent: workspaceContext.recent_notes.map((n: any) => ({
            id: n.id,
            title: n.title,
          })),
        },
        storage_used: workspaceContext.total_size,
      } : null,
      selectedNotes,
      selectedCredentials,
    }), [multiPageMetadata, user, organization, member, workspaceContext, selectedNotes, selectedCredentials]);

    // Track the previous page URL to detect actual navigation changes
    const previousPageURLRef = useRef<string | null>(null);
    
    // Auto-add current page to selection only when user NAVIGATES to a new page
    // (not when they manually deselect - that should be respected)
    useEffect(() => {
      const currentURL = currentPageContent?.url;
      const previousURL = previousPageURLRef.current;
      
      // Only auto-add if the URL actually changed (user navigated to a new page)
      if (currentURL && currentURL !== previousURL) {
        previousPageURLRef.current = currentURL;
        
        // Add the new page to selection if not already there
        if (!selectedPageURLs.includes(currentURL)) {
          setSelectedPageURLs(prev => {
            if (!prev.includes(currentURL)) {
              return [...prev, currentURL];
            }
            return prev;
          });
        }
      }
    }, [currentPageContent?.url]); // Removed selectedPageURLs from deps - we don't want to re-run when selection changes

    // Agent switching hook - manages agent/model transitions without remounting
    const { activeAgent, activeModel } = useAgentSwitching({
      selectedAgent,
      selectedModel,
      sessionId,
    });

    // Compute mount decision once per render
    const hasValidSelection = useMemo(() => 
      selectedAgent && selectedModel && selectedAgent !== '' && selectedModel !== '',
      [selectedAgent, selectedModel]
    );
    const shouldShowLoading = useMemo(() => 
      isLoadingMetadata || !hasValidSelection,
      [isLoadingMetadata, hasValidSelection]
    );

    // Enabled frontend tools hook - fetches which frontend tools are enabled for this agent
    const { enabledFrontendTools, isLoading: isLoadingFrontendTools } = useEnabledFrontendTools({
      agentType: activeAgent,
      modelType: activeModel,
      organizationId: organization?.id,
      teamId: activeTeam || undefined,
    });

    // Track if this is a user-initiated change - ONLY save when user explicitly changes agent/model
    // This ref is set to true ONLY by handleAgentChange/handleModelChange handlers
    const isUserInitiatedChange = useRef(false);

    // Reset user-initiated flag on session change to prevent carryover
    useEffect(() => {
      // Reset flag when session changes - new session should never inherit old flag
      isUserInitiatedChange.current = false;
    }, [sessionId]);

    // Memoize agent/model change handlers
    const handleAgentChange = useCallback((agent: string) => {
      isUserInitiatedChange.current = true; // Mark as user-initiated
      setSelectedAgent(agent);
    }, []);

    const handleModelChange = useCallback((model: string) => {
      isUserInitiatedChange.current = true; // Mark as user-initiated
      setSelectedModel(model);
    }, []);

    // Save agent/model selection to storage ONLY when user explicitly changes via UI
    // This prevents saving DB-loaded values back to DB (which was causing contamination)
    useEffect(() => {
      // ONLY save if this was a user-initiated change
      // DB loads, session switches, and initial mounts should NEVER trigger saves
      if (!isUserInitiatedChange.current) {
        return;
      }

      // Debounce the save operation
      const timeoutId = setTimeout(() => {
        sessionStorageDBWrapper.updateSessionAgentAndModel(sessionId, selectedAgent, selectedModel);
        isUserInitiatedChange.current = false; // Reset after save
      }, 300); // 300ms debounce

      return () => clearTimeout(timeoutId);
    }, [selectedAgent, selectedModel, sessionId]);

    // Persist selected page URLs (context selector) when they change
    // Use a ref to track if this is the initial load to avoid saving hydrated data
    const isPageURLsHydrated = useRef(false);
    useEffect(() => {
      // Skip saving on initial hydration (when initialSelectedPageURLs loads)
      if (!isPageURLsHydrated.current) {
        isPageURLsHydrated.current = true;
        return;
      }
      
      // Debounce the save operation
      const timeoutId = setTimeout(() => {
        sessionStorageDBWrapper.updateSessionPageURLs(sessionId, selectedPageURLs);
      }, 500); // 500ms debounce

      return () => clearTimeout(timeoutId);
    }, [selectedPageURLs, sessionId]);

    // Reset hydration flag when session changes
    useEffect(() => {
      isPageURLsHydrated.current = false;
    }, [sessionId]);

    // Persist selected workspace items (notes and credentials) when they change
    // Use a ref to track if this is the initial load to avoid saving hydrated data
    const isWorkspaceItemsHydrated = useRef(false);
    useEffect(() => {
      // Skip saving on initial hydration
      if (!isWorkspaceItemsHydrated.current) {
        isWorkspaceItemsHydrated.current = true;
        return;
      }
      
      // Extract IDs from full objects
      const noteIds = selectedNotes.map((note: any) => note.id).filter(Boolean);
      const credentialIds = selectedCredentials.map((cred: any) => cred.id).filter(Boolean);
      
      // Debounce the save operation
      const timeoutId = setTimeout(() => {
        sessionStorageDBWrapper.updateSessionWorkspaceItems(sessionId, noteIds, credentialIds);
      }, 500); // 500ms debounce

      return () => clearTimeout(timeoutId);
    }, [selectedNotes, selectedCredentials, sessionId]);

    // Reset workspace items hydration flag when session changes
    useEffect(() => {
      isWorkspaceItemsHydrated.current = false;
    }, [sessionId]);

    // Content refresh hook
    const { triggerManualRefresh } = useContentRefresh({
      setCurrentTabId: setManagedTabId,
      setCurrentTabTitle: setManagedTabTitle,
      currentTabTitle: managedTabTitle,
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
      // Trigger the refresh
      await triggerManualRefresh();

      // Phase 1: wait briefly for embedding to START (content fetch -> effect kicks in)
      const maxStartWait = 3000; // 3s grace period to detect start
      const pollInterval = 100; // Check every 100ms for fast detection
      let waited = 0;
      while (!embeddingActiveRef.current && waited < maxStartWait) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        waited += pollInterval;
      }

      // Phase 2: once started, wait until it finishes (cap total to 30s)
      const maxFinishWait = 30000;
      const startTime = Date.now();
      while (embeddingActiveRef.current && Date.now() - startTime < maxFinishWait) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }, [triggerManualRefresh]);

    // Auto-refresh content when panel becomes active (visible or user interacts)
    const previousIsPanelVisibleRef = useRef(isPanelVisible);
    const previousIsPanelInteractiveRef = useRef(isPanelInteractive);

    // Update refs without triggering fetch (tracked for potential future use)
    useEffect(() => {
      previousIsPanelVisibleRef.current = isPanelVisible;
      previousIsPanelInteractiveRef.current = isPanelInteractive;
    }, [isPanelVisible, isPanelInteractive]);

    // OPTIMIZATION: Removed unnecessary setIsLoading effect (always false)
    // Loading state is now managed directly during mount
    useEffect(() => {
      if (prevSessionIdRef.current !== sessionId) {
        setIsLoading(false);
      }
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
          showStaleIndicator={showStaleIndicator}
          isContentFetching={isContentFetching}
          userMessagesCount={userMessagesCount}
          assistantMessagesCount={assistantMessagesCount}
          isCounterReady={isCounterReady}
          isEmbedding={isEmbedding}
          embeddingStatus={embeddingStatus}
          usageData={{
            lastUsage,
            cumulativeUsage,
            isConnected: isUsageConnected,
          }}
          onUsageClick={() => setIsUsagePopupOpen(true)}
          currentPageUrl={managedTabUrl}
          onConfigClick={handleConfigClick}
          configPanelOpen={showConfigPanel}
          moreOptionsMenu={isActive ? moreOptionsMenu : undefined}
        />
      ),
      [
        isLight,
        isActive,
        moreOptionsMenu,
        isPanelInteractive,
        agentPlans,
        agentGraphs,
        currentTabId,
        isPanelVisible,
        contentState,
        getCurrentTabTitle,
        triggerManualRefresh,
        showStaleIndicator,
        isContentFetching,
        userMessagesCount,
        assistantMessagesCount,
        isCounterReady,
        isEmbedding,
        embeddingStatus,
        lastUsage,
        cumulativeUsage,
        isUsageConnected,
        managedTabUrl,
        showConfigPanel,
      ],
    );

    // Notify parent whenever message counts change
    // IMPORTANT: Only report count AFTER hydration completes to prevent flickering from transient zero counts
    // Total count (user + assistant) is reported to parent for backward compatibility
    const totalMessagesCount = userMessagesCount + assistantMessagesCount;
    
    useEffect(() => {
      // Only log when there's an actual change or significant state transition
      const shouldLog = hydrationCompleted !== (hasReportedInitialCountRef.current || false) ||
                       totalMessagesCount !== lastReportedCountRef.current;
      
      if (shouldLog) {
      }

      if (!onMessagesCountChange) return;

      // Only report the count once after hydration is fully complete
      // This prevents reporting transient zero counts during restore
      if (hydrationCompleted && !hasReportedInitialCountRef.current) {
        debug.log(
          `[ChatSessionContainer] Reporting message count to parent: ${totalMessagesCount} for session ${sessionId}`,
        );
        onMessagesCountChange(sessionId, totalMessagesCount);
        hasReportedInitialCountRef.current = true;
        lastReportedCountRef.current = totalMessagesCount;
        initialReportTimeRef.current = Date.now();

        // Signal that counter is stable - this will trigger skeleton to hide
        setIsCounterReady(true);
      } else if (hydrationCompleted && hasReportedInitialCountRef.current) {
        // Grace period: Allow count changes within first 500ms after initial report (during hydration settling)
        const timeSinceInitialReport = Date.now() - initialReportTimeRef.current;
        const isInGracePeriod = timeSinceInitialReport < 500;

        // Special case: Always report when count changes significantly
        // This handles: 1) user deleted all messages (0), 2) force-restore after failed clear
        if (totalMessagesCount !== lastReportedCountRef.current) {
          onMessagesCountChange(sessionId, totalMessagesCount);
          lastReportedCountRef.current = totalMessagesCount;
          return;
        }

        // Update last reported count even during grace period (for future comparisons)
        if (isInGracePeriod) {
          lastReportedCountRef.current = totalMessagesCount;
        }
      }
      // After initial report, do NOT update anymore to prevent flickering
    }, [onMessagesCountChange, sessionId, totalMessagesCount, hydrationCompleted]);

    // Register reset function with parent when available
    // We register a wrapper that always calls the current value of resetChatRef.current
    // This ensures we always call the wrapped version (with manual reset tracking) even if
    // the ref was updated after registration
    useEffect(() => {
      if (onRegisterResetFunction) {
        const resetWrapper = () => {
          if (resetChatRef.current) {
            resetChatRef.current();
          }
        };
        onRegisterResetFunction(sessionId, resetWrapper);
      }
    }, [onRegisterResetFunction, sessionId]);

    // Register getMessages function so parent can retrieve current messages for export
    useEffect(() => {
      if (onRegisterGetMessagesFunction) {
        const getMessages = () => {
          if (saveMessagesRef.current) {
            const data = saveMessagesRef.current();
            return data.filteredMessages || data.allMessages || [];
          }
          return [];
        };
        onRegisterGetMessagesFunction(sessionId, getMessages);
      }
    }, [onRegisterGetMessagesFunction, sessionId]);

    // Register open settings function so header "Chat Settings" can open the modal
    useEffect(() => {
      if (onRegisterOpenSettings) {
        const openSettings = () => setIsSettingsOpen(true);
        onRegisterOpenSettings(sessionId, openSettings);
      }
    }, [onRegisterOpenSettings, sessionId]);

    // Register config panel state so header button can toggle and footer can be pushed
    useEffect(() => {
      if (onRegisterConfigPanel) {
        const toggle = () => setShowConfigPanel((prev) => !prev);
        onRegisterConfigPanel(sessionId, { isOpen: showConfigPanel, width: panelWidth, toggle });
      }
    }, [onRegisterConfigPanel, sessionId, showConfigPanel, panelWidth]);

    // Callback to update message counts (user and assistant separately)
    const handleSetMessageCounts = useCallback(
      (counts: { userCount: number; assistantCount: number }) => {
        setUserMessagesCount(counts.userCount);
        setAssistantMessagesCount(counts.assistantCount);
      },
      [],
    );

    // Callback to update messages signature (for hydration detection)
    const handleMessagesSignatureChange = useCallback(
      (signature: string) => {
        if (messagesSignatureRef.current !== signature) {
          messagesSignatureRef.current = signature;
          setMessagesSignature(signature);
        }
      },
      [],
    );

    // Callback to update streaming state from CopilotKit
    const handleStreamingChange = useCallback(
      (isStreaming: boolean) => {
        setCopilotIsStreaming(isStreaming);
      },
      [],
    );

    // Headers for CopilotKit provider - useMemo provides sufficient stability
    const copilotHeaders = useMemo(() => {
      if (!sessionId) return {};

      const headers: Record<string, string> = {
      'x-copilot-thread-id': sessionId,
      };
      
      // Only add agent/model when both are selected to avoid intermediate "half-loaded" states
      if (selectedAgent && selectedModel && selectedAgent !== '' && selectedModel !== '') {
        headers['x-copilot-agent-type'] = selectedAgent;
        headers['x-copilot-model-type'] = selectedModel;
      
        if (organization?.id) headers['x-copilot-organization-id'] = organization.id;
        if (activeTeam) headers['x-copilot-team-id'] = activeTeam;
      }
      
      return headers;
    }, [selectedAgent, selectedModel, sessionId, organization?.id, activeTeam]);

    // V2: Tool renderers - create once and keep stable
    const toolRenderers = useMemo(() => createAllToolRenderers({ clipText }), [/* static */]);

    // V2: Activity message renderers - recreate when session changes
    const activityRenderers = useMemo(() => createActivityMessageRenderers({
        sessionId,
        setDynamicAgentState: setCurrentAgentStepState,
    }), [sessionId]);

    const renderChatInner = useCallback(
      () => {
        // CRITICAL FIX: Use ref to get the latest selectedPageURLs value
        // This ensures we always use the current state, not a stale closure value
        const currentSelectedPageURLs = selectedPageURLsRef.current;
        return (
        <ChatInner
          // Key only includes session - agent/model changes are handled via props/headers
          // This prevents remounts when switching agents/models
          key={`chat-inner-${sessionId}`}
          sessionId={sessionId}
          currentPageContent={currentPageContent}
          pageContentEmbedding={pageContentEmbeddingRef.current}
          dbTotals={dbTotals}
          selectedPageURLs={currentSelectedPageURLs}
          currentPageURL={currentPageContent?.url || null}
          onPagesChange={setSelectedPageURLs}
          themeColor={themeColor}
          setThemeColor={setThemeColor}
          setMessageCounts={handleSetMessageCounts}
          saveMessagesRef={saveMessagesRef}
          restoreMessagesRef={restoreMessagesRef}
          resetChatRef={resetChatRef}
          setIsAgentLoading={setIsAgentLoading}
          showSuggestions={showSuggestions}
          showThoughtBlocks={showThoughtBlocks}
          agentModeChat={agentModeChat}
          initialAgentStepState={currentAgentStepState}
          onAgentStepStateChange={handleAgentStepStateChange}
          setDynamicAgentStateRef={setDynamicAgentStateRef}
          contextMenuMessage={contextMenuMessage}
          triggerManualRefresh={triggerManualRefreshWithEmbeddingWait}
          isAgentAndModelSelected={selectedAgent !== '' && selectedModel !== ''}
          agentType={activeAgent}
          modelType={activeModel}
          organizationId={organization?.id || undefined}
          teamId={activeTeam || undefined}
          enabledFrontendTools={enabledFrontendTools}
          selectedNotes={selectedNotesRef.current}
          selectedCredentials={selectedCredentialsRef.current}
          onNotesChange={setSelectedNotes}
          onCredentialsChange={setSelectedCredentials}
          initialSelectedNoteIds={initialSelectedNoteIds}
          initialSelectedCredentialIds={initialSelectedCredentialIds}
          selectedAgent={selectedAgent}
          selectedModel={selectedModel}
          onAgentChange={handleAgentChange}
          onModelChange={handleModelChange}
          isLoadingSessionSelectors={isLoadingMetadata || isLoadingFromDB}
        />
        );
      },
      [
        activeAgent,
        activeModel,
        activeTeam,
        contextMenuMessage,
        currentAgentStepState,
        handleAgentChange,
        handleModelChange,
        handleAgentStepStateChange,
        currentPageContent,
        dbTotals,
        enabledFrontendTools,
        isLoadingFromDB,
        isLoadingMetadata,
        organization?.id,
        selectedAgent,
        selectedModel,
        selectedPageURLs,
        setSelectedPageURLs,
        sessionId,
        handleSetMessageCounts,
        setIsAgentLoading,
        setThemeColor,
        showSuggestions,
        showThoughtBlocks,
        agentModeChat,
        themeColor,
        triggerManualRefreshWithEmbeddingWait,
        selectedNotes,
        selectedCredentials,
        initialSelectedNoteIds,
        initialSelectedCredentialIds,
      ],
    );

    return (
      <ExploreAccordionProvider>
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Content area - no margin here; ConfigPanel is portaled to SessionsPage, content column has marginRight */}
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
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

        {/* Chat container with panels */}
        {/* Main container - no position so ConfigPanel anchors to root (immediately below header) */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Note: Agent switching modal removed - switching is now instant without remount */}

          {/* Defer mounting CopilotKit until metadata is loaded AND we have valid agent/model.
              This prevents redundant connections during initialization (default -> target agent). */}
          {shouldShowLoading ? (
            <div className="relative flex flex-1 flex-col overflow-hidden items-center justify-center">
              <div className="text-center p-6">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className={isLight ? 'text-gray-600 font-medium' : 'text-gray-300 font-medium'}>
                  Loading session...
                </p>
              </div>
            </div>
          ) : (
            <CopilotKitProvider
              key={`copilot-provider-${sessionId}`}
              runtimeUrl={COPIOLITKIT_CONFIG.RUNTIME_URL}
              headers={copilotHeaders}
              showDevConsole={false}
              renderToolCalls={toolRenderers as any}
              renderActivityMessages={activityRenderers as any}
            >
              <SharedAgentProvider key={sessionId} sessionKey={sessionId}>
                <AgentStateSync 
                  sessionId={sessionId} 
                  agentStateRef={dynamicAgentStateRef}
                  onStateChange={handleAgentStateChange}
                />
                
                {/* Wrapper for chat container and panels */}
                <div 
                  ref={chatWrapperRef}
                  className="relative flex flex-1 flex-col overflow-hidden h-full"
                >
                  {/* Chat Container */}
                  <div
                    className={`copilot-chat-container flex flex-1 flex-col overflow-hidden ${!isLight ? 'dark' : ''} font-size-${chatFontSize} transition-opacity duration-300 transition-all`}
                    style={
                      {
                        '--copilot-kit-primary-color': themeColor,
                        opacity: isCounterReady ? 1 : 0,
                        visibility: isCounterReady ? 'visible' : 'hidden',
                        // Margin applied at content wrapper level (StatusBar + main + SelectorsBar) for push behavior
                      } as CSSProperties
                    }>
                    <div className="relative flex flex-1 flex-col overflow-hidden h-full">
                      {/* Selection Overlay - only visible when agent/model not selected */}
                      {(!selectedAgent || !selectedModel) && (
                        <div className={`absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm ${isLight ? 'bg-white/80' : 'bg-gray-900/80'}`}>
                          <div className="text-center p-6">
                            <p className={isLight ? 'text-gray-600 font-medium' : 'text-gray-300 font-medium'}>
                              {!selectedAgent || !selectedModel 
                                ? 'Select an agent and model to continue' 
                                : 'Loading agent configuration...'}
                            </p>
                          </div>
                        </div>
                      )}

                      <ChatInnerWithSignatureSync
                        sessionId={sessionId}
                        onSignatureChange={handleMessagesSignatureChange}
                        onStreamingChange={handleStreamingChange}
                        renderChatInner={renderChatInner}
                        agentStateRef={dynamicAgentStateRef}
                      />
                    </div>
                  </div>
                </div>

                {/* 
                  Config Panel (plans, graphs, and other containers) - INSIDE SharedAgentProvider 
                  so it can access agent setState for bidirectional sync.
                  Only portal when active - multiple sessions share the portal, so inactive ones must not render.
                */}
                {isActive && showConfigPanel && (
                  <ConfigPanelWrapper
                    isLight={isLight}
                    showConfigPanel={showConfigPanel}
                    activeTab={configPanelTab}
                    onTabChange={setConfigPanelTab}
                    agentPlans={agentPlans}
                    agentGraphs={agentGraphs}
                    sessionId={sessionId}
                    onCloseConfig={() => setShowConfigPanel(false)}
                    portalRef={configPanelPortalRef}
                    onPlansUpdate={(updatedPlans: any) => {
                      const planIds = Object.keys(updatedPlans ?? {});
                      debug.log('[SessionPlans] ChatSessionContainer onPlansUpdate:', {
                        sessionId: sessionId?.slice(0, 8),
                        plansCount: planIds.length,
                        planIds,
                      });
                      setAgentPlans({ ...updatedPlans });
                      dynamicAgentStateRef.current = {
                        ...dynamicAgentStateRef.current,
                        plans: updatedPlans,
                      };
                    }}
                    onGraphsUpdate={(updatedGraphs: any) => {
                      setAgentGraphs({ ...updatedGraphs });
                      dynamicAgentStateRef.current = {
                        ...dynamicAgentStateRef.current,
                        graphs: updatedGraphs,
                      };
                    }}
                    onWidthChange={handlePanelWidthChange}
                    initialPanelWidth={panelWidth}
                    chatFontSize={chatFontSize}
                  />
                )}
              </SharedAgentProvider>
            </CopilotKitProvider>
          )}
        </div>

        {/* Agent and Model Selectors with Settings - Outside chat container so panels don't cover it */}
        <SelectorsBar
            isLight={isLight}
            selectedAgent={selectedAgent}
            selectedModel={selectedModel}
            isLoadingSession={isLoadingMetadata || isLoadingFromDB}
            showSuggestions={showSuggestions}
            showThoughtBlocks={showThoughtBlocks}
            onAgentChange={handleAgentChange}
            onModelChange={handleModelChange}
            onShowSuggestionsChange={(show: boolean) => preferencesStorage.setShowSuggestions(show)}
            onShowThoughtBlocksChange={(show: boolean) => preferencesStorage.setShowThoughtBlocks(show)}
            onExpandSettingsClick={() => setIsSettingsOpen(true)}
          />
        </div>

        {/* Settings Modal */}
        <SettingsModal
          isOpen={isSettingsOpen}
          isLight={isLight}
          showSuggestions={showSuggestions}
          showThoughtBlocks={showThoughtBlocks}
          agentModeChat={agentModeChat}
          agentType={activeAgent}
          modelType={activeModel}
          organizationId={organization?.id || undefined}
          teamId={activeTeam || undefined}
          sharedContexts={sharedContexts}
          onClose={() => setIsSettingsOpen(false)}
          onShowSuggestionsChange={(show: boolean) => preferencesStorage.setShowSuggestions(show)}
          onShowThoughtBlocksChange={(show: boolean) => preferencesStorage.setShowThoughtBlocks(show)}
          onAgentModeChatChange={(enabled: boolean) => preferencesStorage.setAgentModeChat(enabled)}
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
      </div>
      </ExploreAccordionProvider>
    );
  },
  // Custom comparison function to prevent unnecessary re-renders
  (prevProps, nextProps) => {
    // Only re-render if these specific props change
    // OPTIMIZATION: Compare agent/model from initialMetadata to trigger updates if selection changes externally
    return (
      prevProps.sessionId === nextProps.sessionId &&
      prevProps.isLight === nextProps.isLight &&
      prevProps.publicApiKey === nextProps.publicApiKey &&
      prevProps.isActive === nextProps.isActive &&
      prevProps.contextMenuMessage === nextProps.contextMenuMessage &&
      prevProps.initialMetadata?.selectedAgent === nextProps.initialMetadata?.selectedAgent &&
      prevProps.initialMetadata?.selectedModel === nextProps.initialMetadata?.selectedModel
    );
  },
);

ChatSessionContainer.displayName = 'ChatSessionContainer';
