/**
 * ================================================================================
 * ChatInner Component
 * ================================================================================
 * 
 * Core chat interface component that integrates CopilotKit for AI agent interactions.
 * Handles all agent actions, semantic search, message management, and UI state.
 * 
 * Key Responsibilities:
 * - AI agent communication via CopilotKit hooks
 * - Semantic search over page content (HTML, forms, clickable elements)
 * - DOM manipulation actions (click, scroll, input, etc.)
 * - Message sanitization and persistence
 * - Progress bar and agent state management
 * - Context menu integration
 * 
 * Architecture:
 * - Custom hooks for state management (useMessageSanitization, useContextMenuPrefill, etc.)
 * - CopilotKit actions for agent capabilities
 * - SemanticSearchManager for embeddings-based search
 * - Message persistence via storage layer
 * 
 * @module ChatInner
 * ================================================================================
 */

// ================================================================================
// IMPORTS
// ================================================================================

// React Core
import type { FC } from 'react';
import React, { useEffect, useRef, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';

// CopilotKit Hooks & Components
import {
  useCopilotChat,
  useCoAgent,
  useCoAgentStateRender,
  useCopilotReadable,
  useCopilotChatHeadless_c,
  useFrontendTool,
  useHumanInTheLoop,
  useDefaultTool,
  useRenderToolCall,
  useCopilotContext,
} from '@copilotkit/react-core';
import { CopilotChat, useCopilotChatSuggestions } from '@copilotkit/react-ui';

// Extension Utilities & Storage
import { debug, useStorage, cosineSimilarity, embeddingService, sessionStorageDBWrapper } from '@extension/shared';
import { embeddingsStorage } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { cn } from '@extension/ui';

// UI Components
import { WeatherCard } from './WeatherCard';
import { ActionStatus } from './ActionStatus';
import { WaitCountdown } from './WaitCountdown';
import { TaskProgressCard, AgentStepState } from './TaskProgressCard';
import { StreamingContext } from '../context/StreamingContext';
import { CustomUserMessage } from './CustomUserMessage';
import { CustomAssistantMessage } from './CustomAssistantMessage';
import { CustomInput } from './CustomInput';
import { CustomMessages } from './CustomMessages';
import { ThinkingBlock } from './ThinkingBlock';
import { MermaidBlock } from './MermaidBlock';
const EmptyThinkingBlock: React.FC<{ children?: React.ReactNode }> = () => null;
import { ChatErrorDisplay } from './ChatErrorDisplay';

// Custom Hooks
import { useMessageSanitization, MessageData } from '../hooks/useMessageSanitization';
import { useContextMenuPrefill } from '../hooks/useContextMenuPrefill';
import { useProgressBarState } from '../hooks/useProgressBarState';
import { usePageMetadata } from '../hooks/usePageMetadata';
import { useProgressCardCollapse } from '../hooks/useProgressCardCollapse';

// Constants
import { CHAT_SUGGESTIONS_INSTRUCTIONS, DEFAULT_MAX_SUGGESTIONS } from '../constants/chatSuggestions';

// CopilotKit Action Creators
import { createSetThemeColorAction } from '../actions/copilot/themeActions';
import { 
  createSearchPageContentAction,
  createSearchFormDataAction,
  createSearchDOMUpdatesAction,
  createSearchClickableElementsAction,
} from '../actions/copilot/searchActions';
import {
  createGetHtmlChunksByRangeAction,
  createGetFormChunksByRangeAction,
  createGetClickableChunksByRangeAction,
} from '../actions/copilot/dataRetrievalActions';
import {
  createMoveCursorToElementAction,
  createRefreshPageContentAction,
  createCleanupExtensionUIAction,
  createClickElementAction,
  createVerifySelectorAction,
  createGetSelectorAtPointAction,
  createGetSelectorsAtPointsAction,
} from '../actions/copilot/domActions';
import { createSendKeystrokesAction } from '../actions/copilot/domActions';
import { createInputDataAction } from '../actions/copilot/formActions';
import {
  createOpenNewTabAction,
  createScrollAction,
  createDragAndDropAction,
} from '../actions/copilot/navigationActions';
import { createTakeScreenshotAction } from '../actions/copilot/screenshotActions';
import { createGetWeatherAction } from '../actions/copilot/weatherActions';
import { createGenerateImagesAction } from '../actions/copilot/imageActions';
import { createWaitAction, createConfirmActionHumanInTheLoop } from '../actions/copilot/utilityActions';
import { 
  createWebSearchRender, 
  createCodeExecutionRender, 
  createUrlContextRender 
} from '../actions/copilot/builtinToolActions';

// Types & Libraries
import { AgentState } from '../lib/types';
import { SemanticSearchManager } from '../lib/SemanticSearchManager';
import { z } from 'zod';

// Action Handlers
import { 
  handleMoveCursorToElement, 
  handleCleanupExtensionUI, 
  handleClickElement, 
  handleInputData,
  handleOpenNewTab,
  handleScroll,
  handleDragAndDrop,
  handleRefreshPageContent,
  handleTakeScreenshot,
  handleVerifySelector,
  handleGetSelectorAtPoint,
  handleGetSelectorsAtPoints,
} from '../actions';

const DefaultToolIcon: React.FC<{ isLight: boolean }> = ({ isLight }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ 
      flexShrink: 0, 
      marginRight: 6,
      color: isLight ? '#4b5563' : '#6b7280' // gray-600 for light, gray-500 for dark
    }}
  >
    <path
      stroke="currentColor"
      fill="none"
      d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
    />
    <circle cx="12" cy="12" r="3" stroke="currentColor" fill="none" />
  </svg>
);

// ================================================================================
// TYPES & INTERFACES
// ================================================================================

// ChatInner Props Interface
export interface ChatInnerProps {
  sessionId: string;
  sessionTitle: string | undefined;
  currentPageContent: any;
  dbTotals?: { html: number; form: number; click: number };
  pageContentEmbedding?: {
    fullEmbedding: number[];
    chunks?: Array<{ text: string; html: string; embedding: number[] }>;
    timestamp: number;
  } | null;
  latestDOMUpdate: any;
  themeColor: string;
  setThemeColor: (color: string) => void;
  setCurrentMessages: (messages: any[]) => void;
  saveMessagesToStorage: (messages: any[]) => Promise<void>;
  setHeadlessMessagesCount: (count: number) => void;
  saveMessagesRef: React.MutableRefObject<(() => MessageData) | null>;
  restoreMessagesRef: React.MutableRefObject<((messages: any[]) => void) | null>;
  resetChatRef: React.MutableRefObject<(() => void) | null>;
  setIsAgentLoading: (loading: boolean) => void;
  showSuggestions: boolean;
  showThoughtBlocks: boolean;
  agentModeChat: boolean;
  // Progress bar state callbacks
  onProgressBarStateChange?: (hasProgressBar: boolean, showProgressBar: boolean, onToggle: () => void) => void;
  // Agent step state management
  initialAgentStepState?: AgentStepState;
  onAgentStepStateChange?: (state: AgentStepState) => void;
  // Context menu message to send
  contextMenuMessage?: string | null;
  // Manual refresh callback
  triggerManualRefresh?: () => void;
  // Agent and model selection state
  isAgentAndModelSelected?: boolean;
  // Agent and model configuration for generic tool actions
  agentType?: string;
  modelType?: string;
  organizationId?: string;
  teamId?: string;
}

// ================================================================================
// COMPONENT DEFINITION
// ================================================================================

/**
 * ChatInner Component
 * 
 * Inner component that uses CopilotKit hooks - MUST be inside <CopilotKit> wrapper
 * Handles all agent interactions, actions, and chat functionality
 * 
 * @param props - ChatInnerProps with session, content, and callback configurations
 */
const ChatInnerComponent: FC<ChatInnerProps> = ({
  sessionId,
  sessionTitle,
  currentPageContent,
  pageContentEmbedding,
  latestDOMUpdate,
  themeColor,
  setThemeColor,
  setCurrentMessages,
  saveMessagesToStorage,
  agentType = 'dynamic_agent',
  modelType = '',
  organizationId = '',
  teamId = '',
  setHeadlessMessagesCount,
  saveMessagesRef,
  restoreMessagesRef,
  resetChatRef,
  setIsAgentLoading,
  showSuggestions,
  showThoughtBlocks,
  agentModeChat,
  onProgressBarStateChange,
  initialAgentStepState,
  onAgentStepStateChange,
  contextMenuMessage,
  dbTotals,
  triggerManualRefresh,
  isAgentAndModelSelected = true,
}) => {
  // ================================================================================
  // RENDER TRACKING
  // ================================================================================
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  // console.log(`[ChatInner:${sessionId.slice(0, 8)}] Render #${renderCountRef.current}`);

  // ================================================================================
  // THEME & STORAGE
  // ================================================================================
  const { isLight } = useStorage(exampleThemeStorage);
  const theme = isLight ? 'light' : 'dark';

  // ================================================================================
  // STATE MANAGEMENT
  // ================================================================================

  // Store embeddings and content for semantic search (not sent to agent)
  const pageDataRef = useRef<{
    embeddings: {
      fullEmbedding: number[];
      chunks?: Array<{ text: string; html: string; embedding: number[] }>;
      timestamp: number;
    } | null;
    pageContent: any;
  }>({
    embeddings: null,
    pageContent: null,
  });

  // Semantic search manager for embeddings-based queries
  const searchManager = useMemo(() => new SemanticSearchManager(pageDataRef), []);

  // ================================================================================
  // COPILOTKIT HOOKS
  // ================================================================================
  
  // CopilotKit Context - Thread and instructions management
  const {
    threadId,
    setThreadId,
    chatInstructions,
    setChatInstructions,
    additionalInstructions,
    setAdditionalInstructions,
    runtimeClient,
  } = useCopilotContext();
  
  // Chat messages and loading state
  const {
    messages,
    setMessages,
    isLoading,
    generateSuggestions,
    reloadMessages,
    reset,
    stopGeneration,
  } = useCopilotChatHeadless_c();
  
  // console.log(`[ChatInner:${sessionId.slice(0, 8)}] CopilotKit state:`, {
  //   messagesCount: messages.length,
  //   isLoading,
  // });
  
  // Track streaming state to avoid restoring messages after edits/deletes
  const wasStreamingRef = useRef(false);
  const planDeletionInfoRef = useRef<{ deleted: boolean; lastAssistantId: string | null }>({
    deleted: false,
    lastAssistantId: null,
  });
  const latestAssistantMessageIdRef = useRef<string | null>(null);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false); // Track loading state for interval callbacks
  const actualScrollContainerRef = useRef<HTMLElement | null>(null);
  const [scrollContainerReady, setScrollContainerReady] = useState(false);
  
  // NOTE: Sticky message logic has been moved to CustomMessages.tsx
  // These refs are kept only for agent mode scroll functionality
  const isAutoScrollingRef = useRef(false);
  const lastUserMessageIdRef = useRef<string | null>(null);
  const previousMessagesLengthRef = useRef(messages.length);
  const previousUserMessageCountRef = useRef(0);
  
  // Helper function to find the actual scrolling container
  // With Virtua, we need to find the element that actually has overflow-y: auto
  const getActualScrollContainer = React.useCallback((): HTMLElement | null => {
    if (!scrollContainerRef.current) {
      console.log('[STICKY] getActualScrollContainer: No scrollContainerRef');
      return null;
    }
    
    // Virtua's VList creates a structure like:
    // .copilotKitMessagesContainer (VList root)
    //   └─ div (scrollable container with overflow-y: auto)
    //       └─ div (virtualized content)
    
    // First try to find the VList container
    const vListContainer = scrollContainerRef.current.querySelector('.copilotKitMessagesContainer') as HTMLElement;
    if (vListContainer) {
      console.log('[STICKY] Inspecting VList DOM structure:', {
        vListScrollHeight: vListContainer.scrollHeight,
        vListClientHeight: vListContainer.clientHeight,
        childrenCount: vListContainer.children.length,
        children: Array.from(vListContainer.children).map((child, i) => ({
          index: i,
          tagName: (child as HTMLElement).tagName,
          className: (child as HTMLElement).className,
          scrollHeight: (child as HTMLElement).scrollHeight,
          clientHeight: (child as HTMLElement).clientHeight,
          overflowY: window.getComputedStyle(child as HTMLElement).overflowY
        }))
      });

      // Check if VList itself is scrollable
      const computedStyle = window.getComputedStyle(vListContainer);
      if (computedStyle.overflowY === 'auto' || computedStyle.overflowY === 'scroll') {
        console.log('[STICKY] ✅ Using VList itself as scroll container (has overflow)');
        return vListContainer;
      }
      
      // If VList isn't scrollable, find its scrollable child
      // Virtua wraps content in a div that has the actual scroll
      const scrollableChild = Array.from(vListContainer.children).find((child) => {
        const style = window.getComputedStyle(child as HTMLElement);
        return style.overflowY === 'auto' || style.overflowY === 'scroll';
      }) as HTMLElement | undefined;
      
      if (scrollableChild) {
        console.log('[STICKY] ✅ Using scrollable child of VList');
        return scrollableChild;
      }
      
      // Fallback: return VList container anyway (may not be scrollable yet)
      console.log('[STICKY] ⚠️  Using VList container as fallback (no overflow detected)');
      return vListContainer;
    }
    
    // Fallback to .copilotKitMessages for backwards compatibility
    const messagesContainer = scrollContainerRef.current.querySelector('.copilotKitMessages') as HTMLElement;
    if (messagesContainer) {
      console.log('[STICKY] Using .copilotKitMessages as fallback');
      return messagesContainer;
    }
    
    // Last resort: wrapper itself
    console.log('[STICKY] Using scrollContainerRef as last resort');
    return scrollContainerRef.current;
  }, []);
  
  // Find and cache the actual scrolling container
  // Wait for Virtua to render before measuring dimensions
  useEffect(() => {
    const checkContainer = () => {
      const container = getActualScrollContainer();
      if (!container) return;
      
      // Wait a bit for Virtua to render and calculate dimensions
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;
        const hasOverflow = scrollHeight > clientHeight;
        
        if (container !== actualScrollContainerRef.current) {
          console.log('[STICKY] Setting scroll container:', {
            tagName: container.tagName,
            className: container.className,
            scrollTop: container.scrollTop,
            scrollHeight,
            clientHeight,
            hasOverflow
          });
          actualScrollContainerRef.current = container;
          setScrollContainerReady(true);
        } else {
          // Log dimensions even if same container to debug
          if (scrollHeight > 0 || hasOverflow) {
            console.log('[STICKY] Scroll container dimensions:', {
              scrollTop: container.scrollTop,
              scrollHeight,
              clientHeight,
              hasOverflow
            });
          }
        }
      });
    };
    
    // Initial check
    checkContainer();
    
    // Also check after a short delay to catch Virtua's delayed rendering
    const timeoutId = setTimeout(checkContainer, 100);
    
    return () => clearTimeout(timeoutId);
  }, [getActualScrollContainer, messages.length]); // Re-run when messages change in case structure updates
  
  // Helper function to scroll so a user message becomes sticky (Virtua implementation)
  // NOTE: This function is currently unused - sticky logic is now in CustomMessages.tsx
  const scrollToMakeSticky = React.useCallback((container: HTMLElement, messageElement: HTMLDivElement) => {
    console.log('[STICKY] scrollToMakeSticky called (unused)');
    // This function is no longer used - sticky logic is handled in CustomMessages
  }, []);
  
  // Initialize lastUserMessageIdRef on first render
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!hasInitializedRef.current && messages.length > 0) {
      const userMessages = messages.filter((m: any) => m.role === 'user');
      if (userMessages.length > 0) {
        const latestUserMessage = userMessages[userMessages.length - 1];
        lastUserMessageIdRef.current = latestUserMessage?.id || null;
        previousUserMessageCountRef.current = userMessages.length;
      }
      hasInitializedRef.current = true;
    }
  }, [messages]); // Depend on messages to initialize on first message load
  
  // Auto-scroll to position new user message at top when sent in agent mode (makes it sticky)
  // DISABLED: Ignoring agent mode for now - sticky logic is handled in CustomMessages.tsx
  useEffect(() => {
    return; // Early exit - agent mode disabled, sticky logic is in CustomMessages
  }, [messages, scrollContainerReady, agentModeChat]);

  // Auto-scroll to bottom when new assistant messages arrive (if user is already at bottom)
  useEffect(() => {
    const container = actualScrollContainerRef.current;
    if (!container) return;

    const currentLength = messages.length;
    const previousLength = previousMessagesLengthRef.current;
    
    // Check if the last message is NOT from user (could be assistant, system, tool, etc.)
    if (currentLength === 0) {
      previousMessagesLengthRef.current = currentLength;
      return;
    }
    
    const lastMessage = messages[messages.length - 1];
    const isLastMessageFromAssistant = (lastMessage as any)?.role !== 'user';
    
    // Only auto-scroll if messages were added (not removed/edited)
    // Auto-scroll if user is near bottom
    if (currentLength > previousLength && isLastMessageFromAssistant) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      
      // Auto-scroll if user is already near bottom
      if (isNearBottom || previousLength === 0) {
        isAutoScrollingRef.current = true;
        requestAnimationFrame(() => {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
          });
          // Reset flag after scroll completes
          setTimeout(() => {
            isAutoScrollingRef.current = false;
          }, 500);
        });
      }
    }
    
    previousMessagesLengthRef.current = currentLength;
  }, [messages]);

  // Cache for element positions to avoid repeated getBoundingClientRect calls
  const elementCacheRef = useRef<{
    userMessages: Array<{ id: string; index: number; top: number }>;
    assistantMessages: Array<{ index: number; top: number; bottom: number }>;
    allElements: HTMLDivElement[];
    timestamp: number;
  } | null>(null);

  // All sticky message logic has been moved to CustomMessages.tsx for better encapsulation
  // This component no longer manages sticky state - it's handled entirely within CustomMessages

  // Sticky initialization on tab open is now handled in CustomMessages.tsx

  // Sticky-related useEffects removed - all sticky logic is now in CustomMessages.tsx

  // Shared agent state for maintaining agent context across interactions
    const { state, setState } = useCoAgent<AgentState>({
    name: 'dynamic_agent',
      initialState: {
      proverbs: ['CopilotKit may be new, but its the best thing since sliced bread.'],
    },
  });

  // ================================================================================
  // EFFECTS & SIDE EFFECTS
  // ================================================================================

  // Update parent component with loading state
  useEffect(() => {
    setIsAgentLoading(isLoading);
  }, [isLoading, setIsAgentLoading]);
  
  // Sync isLoadingRef for use in interval callbacks
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);
  
  // Expose reset function via ref
  useEffect(() => {
    if (resetChatRef) {
      resetChatRef.current = reset;
    }
  }, [reset, resetChatRef]);
  
  // Clear streaming flag when messages are cleared (reset/delete all)
  useEffect(() => {
    if (messages.length === 0) {
      wasStreamingRef.current = false;
    }
  }, [messages.length]);

  const previousMessageCountRef = useRef(messages.length);

  useEffect(() => {
    const previousCount = previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;

    // Persist immediately when messages are removed (e.g., user deletion) to prevent
    // the persistence layer from restoring stale copies from storage.
    if (isLoading || messages.length >= previousCount) {
      return;
    }

    try {
      const data = saveMessagesRef?.current ? saveMessagesRef.current() : null;
      const sanitizedMessages =
        (data && Array.isArray(data.allMessages) && data.allMessages.length >= 0
          ? data.allMessages
          : messages) ?? [];

      if (sanitizedMessages.length > 0) {
        void saveMessagesToStorage(sanitizedMessages);
      } else {
        // When all messages are deleted, explicitly clear storage so nothing is restored.
        void sessionStorageDBWrapper.updateAllMessages(sessionId, []);
      }
    } catch (error) {
      debug.warn?.('[ChatInner] Failed to persist messages after deletion:', error);
    }
  }, [messages, isLoading, saveMessagesRef, saveMessagesToStorage, sessionId]);
  
  // Comprehensive ref cleanup on session change to prevent cross-session contamination
  useEffect(() => {
    debug.log('[ChatInner] Session changed, cleaning up refs and intervals');
    
    // Clear sanitization cache
    cachedSanitizedRef.current = null;
    wasStreamingRef.current = false;
    
    // Clear message tracking refs
    lastUserMessageIdRef.current = null;
    latestAssistantMessageIdRef.current = null;
    
    // Clear page data
    pageDataRef.current = { embeddings: null, pageContent: null };
    
    // Reset plan deletion tracking
    planDeletionInfoRef.current = { deleted: false, lastAssistantId: null };
    
    // Reset scroll flags
    isAutoScrollingRef.current = false;
    
    // Reset initialization flags
    hasInitializedRef.current = false;
    previousUserMessageCountRef.current = 0;
    previousMessageCountRef.current = 0;
    
    debug.log('[ChatInner] ✅ Ref cleanup complete');
  }, [sessionId]);

  // Totals for DB-backed counts (HTML, form, clickable element chunks)
  const [totals, setTotals] = useState<{ html: number; form: number; click: number }>({ html: 0, form: 0, click: 0 });

  // Adopt embed-time totals from container if available
  useEffect(() => {
    if (dbTotals && (dbTotals.html || dbTotals.form || dbTotals.click)) {
      setTotals(dbTotals);
      debug.log('[ChatInner] Adopted embed-time totals from container:', dbTotals);
    }
  }, [dbTotals?.html, dbTotals?.form, dbTotals?.click]);

  // Context menu prefill handling (extracted to custom hook)
  useContextMenuPrefill(sessionId, contextMenuMessage);

  // Add/remove class to body to hide suggestions via CSS
  useEffect(() => {
    if (!showSuggestions) {
      document.body.classList.add('hide-copilot-suggestions');
    } else {
      document.body.classList.remove('hide-copilot-suggestions');
    }
    
    return () => {
      document.body.classList.remove('hide-copilot-suggestions');
    };
  }, [showSuggestions]);

  // ========================================
  // MESSAGE SANITIZATION & FILTERING
  // ========================================
  // Extracted to custom hook for better organization and testability
  // Handles message truncation, deduplication, filtering, and persistence
  const { 
    filteredMessages, 
    sanitizeMessages, 
    computeMessagesSignature,
    cachedSanitizedRef 
  } = useMessageSanitization(
    messages,
    setMessages,
    saveMessagesRef,
    restoreMessagesRef,
    setHeadlessMessagesCount
  );

  // Update pageDataRef when embeddings or content changes (store locally, not sent to agent)
  useEffect(() => {
    pageDataRef.current.embeddings = pageContentEmbedding || null;
    pageDataRef.current.pageContent = currentPageContent;
  }, [pageContentEmbedding, currentPageContent]);

  // Removed continuous normalization effect to avoid render churn

  // ================================================================================
  // PAGE METADATA
  // ================================================================================
  // Extracted to custom hook for better organization
  // Constructs minimal metadata for agent (no large HTML/form data)
  const pageMetadataForAgent = usePageMetadata({
    currentPageContent,
    pageContentEmbedding,
    totals,
    enableLogging: true,
  });

  // Suggestions are generated only when streaming stops (see onInProgress handler)

  // DOM updates are now stored in database and don't trigger suggestion regeneration
  // Suggestions will regenerate when agent actions complete

  useCopilotReadable({
    description:
      'Current web page metadata including: pageTitle, pageURL, hasContent, hasEmbeddings, totalHtmlChunks, totalFormChunks, totalClickableChunks, documentInfo, windowInfo, and timestamp. Use searchPageContent to semantically search page content when needed.',
    value: pageMetadataForAgent,
  });

  /*** Define CopilotKit Actions ***/

  // Helpers for concise, natural-language status lines
  const clipText = React.useCallback((v: any, n: number = 60) => {
    const s = typeof v === 'string' ? v : String(v ?? '');
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
  }, []);

  const yesNo = React.useCallback((b: any) => (b ? 'yes' : 'no'), []);

  const defaultToolRender = React.useCallback(
    (props: any) => {
      const { name, status, args, result } = props;
      const error = props?.error ?? (typeof result === 'object' && result ? (result as any)?.error : undefined);
      const formatName = (value: string) => {
        const cleaned = value
          .replace(/^(mcp_|builtin_)/, '')
          .split(/[_-]/)
          .filter(Boolean)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        return cleaned || value || 'Tool';
      };

      const displayName = formatName(typeof name === 'string' ? name : 'Tool');
      let argsSummary = '';
      try {
        if (args && Object.keys(args).length > 0) {
          argsSummary = clipText(JSON.stringify(args), 80);
        }
      } catch (err) {
        argsSummary = '';
      }

      const baseMessage = argsSummary ? `${displayName} (${argsSummary})` : displayName;

      const messages = {
        pending: `Starting ${baseMessage}...`,
        inProgress: `${baseMessage} in progress...`,
        complete: error
          ? `${displayName} failed: ${clipText(String(error), 60)}`
          : `${displayName} complete`,
      };

      return (
        <ActionStatus
          toolName={displayName}
          status={status as any}
          isLight={isLight}
          icon={<DefaultToolIcon isLight={isLight} />}
          messages={messages}
          args={args}
          result={result}
          error={error}
        />
      );
    },
    [clipText, isLight]
  );

  useDefaultTool({ render: defaultToolRender }, [defaultToolRender]);

  // ================================================================================
  // COPILOTKIT ACTIONS
  // ================================================================================
  // Actions registered with CopilotKit that the AI agent can invoke.
  // All actions are now defined in separate files under actions/copilot/ for better organization.
  
  // Create shared dependencies object for action factories (memoized to avoid re-registering actions)
  const actionDeps = React.useMemo(() => ({
    searchManager,
    isLight,
    clipText,
    yesNo,
    currentPageContent,
    pageDataRef,
    themeColor,
  }), [searchManager, isLight, clipText, yesNo, currentPageContent, pageDataRef, themeColor]);
  
  // --- THEME ACTIONS ---
  useFrontendTool(createSetThemeColorAction(setThemeColor) as any, [setThemeColor]);

  // --- SEARCH ACTIONS ---
  useFrontendTool(createSearchPageContentAction(actionDeps) as any, [actionDeps]);
  useFrontendTool(createSearchFormDataAction(actionDeps) as any, [actionDeps]);
  useFrontendTool(createSearchDOMUpdatesAction(actionDeps) as any, [actionDeps]);
  useFrontendTool(createSearchClickableElementsAction(actionDeps) as any, [actionDeps]);

  // --- DATA RETRIEVAL ACTIONS ---
  const retrievalDeps = React.useMemo(() => ({ currentPageContent, isLight }), [currentPageContent, isLight]);
  useFrontendTool(createGetHtmlChunksByRangeAction(retrievalDeps) as any, [retrievalDeps]);
  useFrontendTool(createGetFormChunksByRangeAction(retrievalDeps) as any, [retrievalDeps]);
  useFrontendTool(createGetClickableChunksByRangeAction(retrievalDeps) as any, [retrievalDeps]);

  // --- DOM MANIPULATION ACTIONS ---
  const domDeps = React.useMemo(() => ({ isLight, clipText, pageDataRef, triggerManualRefresh }), [isLight, clipText, pageDataRef, triggerManualRefresh]);
  useFrontendTool(createMoveCursorToElementAction({ isLight, clipText }) as any, [domDeps]);
  useFrontendTool(createRefreshPageContentAction({ isLight, pageDataRef, triggerManualRefresh }) as any, [domDeps]);
  useFrontendTool(createCleanupExtensionUIAction({ isLight }) as any, [isLight]);
  useFrontendTool(createClickElementAction({ isLight, clipText }) as any, [domDeps]);
  useFrontendTool(createVerifySelectorAction({ isLight, clipText }) as any, [domDeps]);
  useFrontendTool(createGetSelectorAtPointAction({ isLight }) as any, [isLight]);
  useFrontendTool(createGetSelectorsAtPointsAction({ isLight }) as any, [isLight]);
  useFrontendTool(createSendKeystrokesAction({ isLight, clipText }) as any, [domDeps]);

  // --- FORM ACTIONS ---
  useFrontendTool(createInputDataAction({ isLight, clipText }) as any, [isLight, clipText]);

  // --- NAVIGATION ACTIONS ---
  useFrontendTool(createOpenNewTabAction({ isLight, clipText }) as any, [isLight, clipText]);
  useFrontendTool(createScrollAction({ isLight, clipText, yesNo }) as any, [isLight, clipText, yesNo]);
  useFrontendTool(createDragAndDropAction({ isLight, clipText }) as any, [isLight, clipText]);

  // --- SCREENSHOT ACTIONS ---
  useFrontendTool(createTakeScreenshotAction({ isLight }) as any);

  // --- WEATHER ACTIONS ---
  useFrontendTool(createGetWeatherAction({ themeColor }) as any, [themeColor]);

  // --- IMAGE GENERATION ACTIONS ---
  useRenderToolCall(createGenerateImagesAction({ themeColor }) as any, [themeColor]);

  // --- BUILTIN TOOL RENDERS ---
  useRenderToolCall(createWebSearchRender({ isLight, clipText }) as any, [isLight, clipText]);
  useRenderToolCall(createCodeExecutionRender({ isLight, clipText }) as any, [isLight, clipText]);
  useRenderToolCall(createUrlContextRender({ isLight, clipText }) as any, [isLight, clipText]);

  // --- UTILITY ACTIONS ---
  useFrontendTool(createWaitAction({ isLight }) as any, [isLight]);

  // --- HUMAN IN THE LOOP ---
  // Enable human confirmation for the confirmAction tool
  useHumanInTheLoop(createConfirmActionHumanInTheLoop({ isLight }) as any);

  // ================================================================================
  // AGENT STATE MANAGEMENT
  // ================================================================================
  
  // Dynamic agent state for progress tracking and step management
  // State is automatically synced to backend on next agent interaction
  const {
    state: rawDynamicAgentState,
    setState: setRawDynamicAgentState,
  } = useCoAgent<AgentStepState>({
    name: 'dynamic_agent',
    initialState:
      initialAgentStepState && initialAgentStepState.sessionId === sessionId
        ? initialAgentStepState
        : {
            sessionId,
      steps: [],
    },
  });

  const dynamicAgentState = React.useMemo<AgentStepState>(() => {
    console.log('[COAGENT_STATE_MEMO] Computing dynamicAgentState from rawDynamicAgentState:', {
      hasRaw: !!rawDynamicAgentState,
      rawStepsCount: rawDynamicAgentState?.steps?.length,
      rawSessionId: rawDynamicAgentState?.sessionId,
      currentSessionId: sessionId,
      planDeleted: planDeletionInfoRef.current.deleted,
    });
    
    if (!rawDynamicAgentState) {
      console.log('[COAGENT_STATE_MEMO] No raw state, returning empty');
      return { sessionId, steps: [] };
    }
    if (planDeletionInfoRef.current.deleted && (rawDynamicAgentState.steps?.length ?? 0) > 0) {
      console.log('[COAGENT_STATE_MEMO] Plan deleted, returning empty');
      return { sessionId, steps: [] };
    }
    if (rawDynamicAgentState.sessionId && rawDynamicAgentState.sessionId !== sessionId) {
      console.log('[COAGENT_STATE_MEMO] Session mismatch, returning empty');
      return { sessionId, steps: [] };
    }
    if (rawDynamicAgentState.sessionId === sessionId) {
      console.log('[COAGENT_STATE_MEMO] Session match, returning raw state with', rawDynamicAgentState.steps?.length, 'steps');
      return rawDynamicAgentState;
    }
    if (!rawDynamicAgentState.sessionId && Array.isArray(rawDynamicAgentState.steps)) {
      console.log('[COAGENT_STATE_MEMO] No session ID on raw, adding it with', rawDynamicAgentState.steps?.length, 'steps');
      return {
        sessionId,
        steps: rawDynamicAgentState.steps,
      };
    }
    console.log('[COAGENT_STATE_MEMO] Fallback, returning empty');
    return { sessionId, steps: [] };
  }, [rawDynamicAgentState, sessionId]);

  const setDynamicAgentState = React.useCallback(
    (nextState: AgentStepState) => {
      console.log('[COAGENT_STATE_UPDATE] setDynamicAgentState called with:', {
        sessionId,
        stepsCount: nextState?.steps?.length,
        steps: nextState?.steps?.map(s => ({ desc: s.description?.substring(0, 30), status: s.status })),
      });
      
      const nextSteps = nextState?.steps ?? [];
      if (nextSteps.length === 0) {
        console.log('[COAGENT_STATE_UPDATE] Clearing all steps (plan deleted)');
        planDeletionInfoRef.current = {
          deleted: true,
          lastAssistantId: latestAssistantMessageIdRef.current,
        };
        setRawDynamicAgentState({
          sessionId,
          steps: [],
        });
        return;
      }

      console.log('[COAGENT_STATE_UPDATE] Updating coAgent state via setRawDynamicAgentState');
      planDeletionInfoRef.current = {
        deleted: false,
        lastAssistantId: latestAssistantMessageIdRef.current,
      };
      setRawDynamicAgentState({
        ...nextState,
        sessionId,
      });
    },
    [sessionId, setRawDynamicAgentState],
  );
  
  // If co-agent state arrives without a sessionId but with steps, proactively clear it
  useEffect(() => {
    if (
      rawDynamicAgentState &&
      !rawDynamicAgentState.sessionId &&
      Array.isArray(rawDynamicAgentState.steps) &&
      rawDynamicAgentState.steps.length > 0 &&
      !planDeletionInfoRef.current.deleted
    ) {
      setRawDynamicAgentState({
        ...rawDynamicAgentState,
        sessionId,
      });
    }
  }, [rawDynamicAgentState, sessionId, setRawDynamicAgentState]);

  useEffect(() => {
    const lastAssistant = [...messages].reverse().find(message => (message as any)?.role === 'assistant');
    const latestAssistantId = (lastAssistant as any)?.id ?? null;
    const previousAssistantId = latestAssistantMessageIdRef.current;
    latestAssistantMessageIdRef.current = latestAssistantId;

    if (
      planDeletionInfoRef.current.deleted &&
      planDeletionInfoRef.current.lastAssistantId !== null &&
      latestAssistantId !== planDeletionInfoRef.current.lastAssistantId &&
      latestAssistantId !== previousAssistantId
    ) {
      planDeletionInfoRef.current = {
        deleted: false,
        lastAssistantId: latestAssistantId,
      };
    }
  }, [messages]);
  
  const initialScopedSteps = React.useMemo(() => {
    if (!initialAgentStepState) {
      return null;
    }
    if (initialAgentStepState.sessionId && initialAgentStepState.sessionId !== sessionId) {
      return null;
    }
    return initialAgentStepState.steps ?? [];
  }, [initialAgentStepState, sessionId]);

  useEffect(() => {
    if (!initialScopedSteps || initialScopedSteps.length === 0) {
      return;
    }
    if (dynamicAgentState.sessionId === sessionId && (dynamicAgentState.steps?.length ?? 0) > 0) {
      return;
    }
    setRawDynamicAgentState({
      sessionId,
      steps: [...initialScopedSteps],
    });
  }, [initialScopedSteps, dynamicAgentState.sessionId, dynamicAgentState.steps, sessionId, setRawDynamicAgentState]);
  
  // Notify parent component when agent step state changes
  useEffect(() => {
    if (onAgentStepStateChange && dynamicAgentState) {
      onAgentStepStateChange(dynamicAgentState);
    }
  }, [dynamicAgentState, onAgentStepStateChange]);

  // Progress bar state management (extracted to custom hook)
  const hasProgressBar = dynamicAgentState.steps && dynamicAgentState.steps.length > 0;
  const { showProgressBar, toggleProgressBar: toggleProgressBarFn } = useProgressBarState(
    hasProgressBar,
    onProgressBarStateChange
  );

  // ================================================================================
  // AGENT STATE RENDERING
  // ================================================================================
  
  // Render inline progress cards with chat messages using useCoAgentStateRender
  useCoAgentStateRender<AgentStepState>({
    name: 'dynamic_agent',
    render: ({ state: scopedState }) => {
      if (!scopedState?.steps || scopedState.steps.length === 0) {
        return null;
      }
      
      // Render only if the plan belongs to this session.
      if (scopedState.sessionId && scopedState.sessionId !== sessionId) {
        return null;
      }

      // Plans created by the backend for the first time may have no sessionId yet—accept them.
      if (!scopedState.sessionId && scopedState.steps.length > 0) {
        scopedState = {
          ...scopedState,
          sessionId,
        };
      }

      if (planDeletionInfoRef.current.deleted && (!scopedState.steps || scopedState.steps.length === 0)) {
        return null;
      }
      
      return (
        <div
          data-task-progress="true"
          data-session-id={sessionId}
          data-timestamp={Date.now()}
          className="w-full pt-2 pl-3 pr-3"
          style={{
            ['--copilot-kit-input-background-color' as any]: 'transparent',
            ['--copilot-kit-separator-color' as any]: isLight ? '#e5e7eb' : '#374151',
            ['--copilot-kit-border-color' as any]: isLight ? '#e5e7eb' : '#374151',
          ['--task-progress-rendered-border-color' as any]: isLight ? 'rgba(229, 231, 235, 0.7)' : '#374151',
          }}
        >
          <TaskProgressCard 
            state={{ ...scopedState, sessionId }}
            setState={setDynamicAgentState}
            isCollapsed={true}
            isHistorical={true}
            showControls={false}
          />
        </div>
      );
    },
  });

  // Auto-collapse older progress cards and mark them as historical
  useProgressCardCollapse();

  // 🪁 Chat Suggestions: Smart suggestions based on context
  // Only initialize the CopilotKit suggestions system when the setting is enabled.
  // We intentionally call this hook conditionally, and rely on the parent to
  // remount this component when the setting changes (see key in ChatSessionContainer).
  if (showSuggestions) {
    useCopilotChatSuggestions({
      instructions: CHAT_SUGGESTIONS_INSTRUCTIONS,
      minSuggestions: 2,
      maxSuggestions: DEFAULT_MAX_SUGGESTIONS,
    });
  }

  // ================================================================================
  // COMPONENT CONFIGURATION
  // ================================================================================
  
  // Custom markdown renderers for chat messages (stable reference)
  const customMarkdownTagRenderers = React.useMemo(() => ({
    think: showThoughtBlocks ? ThinkingBlock : EmptyThinkingBlock,
    mermaid: MermaidBlock,
  }), [showThoughtBlocks]);

  // Create a stable, session-scoped Input component to avoid remounts
  const ScopedInput = useMemo(() => {
    const Comp = (props: any) => (
      <CustomInput
        {...props}
        listenSessionId={sessionId}
        isAgentAndModelSelected={isAgentAndModelSelected}
        taskProgressState={dynamicAgentState}
        onTaskProgressStateChange={setDynamicAgentState}
        showTaskProgress={showProgressBar}
        sessionId={sessionId}
        onToggleTaskProgress={toggleProgressBarFn}
      />
    );
    return Comp;
  }, [sessionId, isAgentAndModelSelected, dynamicAgentState, setDynamicAgentState, showProgressBar, toggleProgressBarFn]);

  // ================================================================================
  // RENDER
  // ================================================================================
    
    return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* CopilotChat with inline historical cards - TaskProgressCard moved to CustomInput */}
      <div 
        ref={scrollContainerRef}
        className={cn("copilot-chat-wrapper relative min-h-0 flex-1 overflow-y-auto", !isAgentAndModelSelected && "chat-input-disabled")}>
        <StreamingContext.Provider value={{ isStreaming: !!isLoading }}>
        <CopilotChat
          // labels={{
          //   title: sessionTitle || `Session ${sessionId.slice(0, 8)}`,
          //   initial: `Work in autopilot mode.`,
          // }}
          imageUploadsEnabled={false} // Disable image uploads for now, using custom input for attachments
          onSubmitMessage={React.useCallback((message: string) => {
            debug.log('[ChatInner] User submitted message:', message);
            try {
              // Sanitize current messages immediately after user submits a prompt
              const current = messages || [];
              const signature = computeMessagesSignature(current);
              // Use cached result when possible to avoid redundant work
              let result: { messages: any[]; hasChanges: boolean };
              if (cachedSanitizedRef.current && cachedSanitizedRef.current.signature === signature) {
                result = cachedSanitizedRef.current.result;
              } else {
                result = sanitizeMessages(current);
                cachedSanitizedRef.current = { signature, result };
              }
              if (result.hasChanges) {
                const resultSignature = computeMessagesSignature(result.messages);
                if (resultSignature !== signature) {
                  setMessages(result.messages);
                  debug.log('[ChatInner] onSubmit sanitization applied. Count:', result.messages.length);
                }
              }
              // Auto-save shortly after submit to ensure the just-submitted
              // user message is captured in storage (uses ref to read latest)
              setTimeout(() => {
                try {
                  const fn = saveMessagesRef?.current;
                  if (!fn) return;
                  const data = fn();
                  const all = (data && (data as any).allMessages) || [];
                  if (all && all.length > 0) {
                    void saveMessagesToStorage(all);
                  }
                } catch (e) {
                  debug.warn?.('[ChatInner] Auto-save after submit failed:', e);
                }
              }, 150);
            } catch (e) {
              debug.warn?.('[ChatInner] onSubmit sanitization skipped due to error:', e);
            }
          }, [messages, computeMessagesSignature, sanitizeMessages, setMessages, saveMessagesRef, saveMessagesToStorage])}
          onError={errorEvent => {
            console.log('[ChatInner] Error:', errorEvent);
          }}
          onInProgress={React.useCallback(async (inProgress: boolean) => {
            // Track streaming state - only sanitize when transitioning from streaming to not-streaming
            if (inProgress) {
              wasStreamingRef.current = true;
              return;
            }
            
            // If we weren't streaming, this is likely a message edit/delete - don't restore
            if (!wasStreamingRef.current) {
              return;
            }
            
            // Reset flag - we're handling the streaming completion
            wasStreamingRef.current = false;
            
            // Streaming stopped - sanitize current messages immediately to fix thinking tags
            try {
              // Get messages from ref to avoid dependency loop
              const fn = saveMessagesRef?.current;
              if (!fn) return;
              
              const data = fn();
              const all = (data && (data as any).allMessages) || [];
              
              // Sanitize the messages
              const signature = computeMessagesSignature(all);
              let result: { messages: any[]; hasChanges: boolean };
              
              if (cachedSanitizedRef.current && cachedSanitizedRef.current.signature === signature) {
                result = cachedSanitizedRef.current.result;
              } else {
                result = sanitizeMessages(all);
                cachedSanitizedRef.current = { signature, result } as any;
              }
              
              // PERFORMANCE: Apply sanitization if changes were made - use rAF to batch with next paint
              if (result.hasChanges) {
                // Schedule for next animation frame to avoid blocking but still be fast
                // result.messages is already a new array from sanitizeMessages, no need to spread
                if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
                  requestAnimationFrame(() => setMessages(result.messages));
                } else {
                  setMessages(result.messages);
                }
              }
              
              // Save to storage
              if (all && all.length > 0) {
                void saveMessagesToStorage(all);
              }
              
              // Generate suggestions only after the assistant stops streaming
              if (showSuggestions && generateSuggestions) {
                debug.log('🧠 [ChatInner] Assistant stopped, generating suggestions...');
                try {
                  await Promise.resolve(generateSuggestions());
                } catch (err) {
                  debug.warn?.('❌ [ChatInner] Failed to generate suggestions:', err);
                }
              }
            } catch (e) {
              debug.warn?.('[ChatInner] Auto-save on assistant stop failed:', e);
            }
          }, [saveMessagesRef, saveMessagesToStorage, showSuggestions, generateSuggestions, computeMessagesSignature, sanitizeMessages, setMessages])}
          renderError={React.useCallback((err: { message: string; operation?: string; timestamp: number; onDismiss: () => void; onRetry?: () => void; }) => {
            const { message, operation /* onDismiss, timestamp */ } = err;
            // Create an Error object from the message
            const error = new Error(operation ? `${operation}: ${message}` : message);
            error.name = operation || 'Error';
            
            // Create retry handler using reloadMessages
            const handleRetry = () => {
              console.log('[ChatInner] 🔄 Calling reloadMessages...');

              const currentMessages = messages || [];
              let sanitizedMessagesArr = currentMessages;

              try {
                const signature = computeMessagesSignature(currentMessages);
                let result: { messages: any[]; hasChanges: boolean } | null = null;

                if (cachedSanitizedRef.current && cachedSanitizedRef.current.signature === signature) {
                  result = cachedSanitizedRef.current.result;
                } else {
                  result = sanitizeMessages(currentMessages);
                  cachedSanitizedRef.current = { signature, result } as any;
                }

                if (result) {
                  sanitizedMessagesArr = result.messages;

                  if (result.hasChanges) {
                    const newSignature = computeMessagesSignature(result.messages);
                    if (newSignature !== signature) {
                      setMessages(result.messages);
                    }
                  }
                }
              } catch (err) {
                console.warn('[ChatInner] Failed to sanitize messages before retry:', err);
              }

              // Validate messages have proper roles before calling reloadMessages
              const validMessages = sanitizedMessagesArr.filter(m => 
                m && typeof m === 'object' && 
                m.role && typeof m.role === 'string' && 
                ['user', 'assistant', 'tool', 'system'].includes(m.role)
              );
              
              if (validMessages.length === 0) {
                console.error('[ChatInner] No valid messages found to reload (all messages have invalid roles)');
                return;
              }
              
              // Try to find the last assistant message (failed/incomplete response)
              const lastAssistantMessage = [...validMessages].reverse().find(m => m.role === 'assistant');
              if (lastAssistantMessage?.id) {
                console.log('[ChatInner] Reloading from last assistant message:', lastAssistantMessage.id);
                reloadMessages(lastAssistantMessage.id);
              } else {
                // If no assistant message, reload from last user message to retry generation
                const lastUserMessage = [...validMessages].reverse().find(m => m.role === 'user');
                if (lastUserMessage?.id) {
                  console.log('[ChatInner] No assistant message found, reloading from last user message:', lastUserMessage.id);
                  reloadMessages(lastUserMessage.id);
                } else {
                  console.warn('[ChatInner] No valid user or assistant message found to reload');
                }
              }
            };
            
            return (
              <ChatErrorDisplay
                error={error}
                retry={handleRetry} // Use reloadMessages from useCopilotChat
                isLight={isLight}
                autoDismissMs={15000}
              />
            );
          }, [
            isLight,
            reloadMessages,
            messages,
            sanitizeMessages,
            computeMessagesSignature,
            setMessages,
            cachedSanitizedRef,
          ])}
          // onInProgress={(isInProgress) => {
          //     console.log('[ChatInner] In progress:', isInProgress);
          // }}
          // onReloadMessages={() => {
          //   console.log('[ChatInner] Reload messages');
          // }}
          onRegenerate={() => {
            console.log('[ChatInner] Regenerate');
          }}
          onCopy={(text: string) => {
            console.log('[ChatInner] 📋 Copy clicked:', text.substring(0, 50));
          }}
          onStopGeneration={() => {
            console.log('[ChatInner] ⏹️ Stop generation clicked');
            try {
              stopGeneration?.();
            } catch (error) {
              console.warn('[ChatInner] Failed to stop generation', error);
            }
          }}
          onThumbsDown={() => {
            console.log('[ChatInner] 👎 Thumbs down clicked');
          }}
          onThumbsUp={() => {
            console.log('[ChatInner] 👍 Thumbs up clicked');
          }}
          markdownTagRenderers={customMarkdownTagRenderers}
          AssistantMessage={CustomAssistantMessage}
          UserMessage={CustomUserMessage}
          Messages={React.useCallback((props: any) => (
            <CustomMessages {...props} />
          ), [])}
          Input={ScopedInput}
        />
        </StreamingContext.Provider>
      </div>
    </div>
  );
};

export const ChatInner = React.memo(ChatInnerComponent);
