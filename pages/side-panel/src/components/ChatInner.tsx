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
import { debug, useStorage, cosineSimilarity, embeddingService } from '@extension/shared';
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
import { ThinkingBlock } from './ThinkingBlock';
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
import { createWaitAction } from '../actions/copilot/utilityActions';

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

const DefaultToolIcon: React.FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0, marginRight: 6 }}
  >
    <defs>
      <linearGradient id="defaultToolGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: '#3B82F6', stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: '#1E40AF', stopOpacity: 1 }} />
      </linearGradient>
    </defs>
    <path
      stroke="url(#defaultToolGradient)"
      fill="none"
      d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
    />
    <circle cx="12" cy="12" r="3" stroke="url(#defaultToolGradient)" fill="none" />
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
  onProgressBarStateChange,
  initialAgentStepState,
  onAgentStepStateChange,
  contextMenuMessage,
  dbTotals,
  triggerManualRefresh,
  isAgentAndModelSelected = true,
}) => {
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
  const { messages, setMessages, isLoading, generateSuggestions, reloadMessages, reset } = useCopilotChatHeadless_c();
  
  // Track streaming state to avoid restoring messages after edits/deletes
  const wasStreamingRef = useRef(false);
  
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
  
  // Clear sanitization cache when session changes to prevent cross-session contamination
  useEffect(() => {
    cachedSanitizedRef.current = null;
    wasStreamingRef.current = false;
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
          icon={<DefaultToolIcon />}
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

  // --- UTILITY ACTIONS ---
  useFrontendTool(createWaitAction({ isLight }) as any, [isLight]);

  // ================================================================================
  // AGENT STATE MANAGEMENT
  // ================================================================================
  
  // Dynamic agent state for progress tracking and step management
  // State is automatically synced to backend on next agent interaction
  const { state: dynamicAgentState, setState: setDynamicAgentState } = useCoAgent<AgentStepState>({
    name: 'dynamic_agent',
    initialState: initialAgentStepState || {
      steps: [],
    },
  });
  
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
    render: ({ state }) => {
      // Check if state has steps, if not return null
      if (!state.steps || state.steps.length === 0) {
        return null;
      }
      
      //console.log('[useCoAgentStateRender] Rendering inline with state:', state);
      
      // Render the TaskProgressCard inline (without controls - read-only)
      // New cards start expanded and non-historical
      // MutationObserver will collapse and mark older cards as historical
      return (
        <div data-task-progress="true" data-timestamp={Date.now()} className="w-full pt-2">
          <TaskProgressCard 
            state={state} 
            setState={setDynamicAgentState}
            isCollapsed={false}
            isHistorical={false}
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
  }), [showThoughtBlocks]);

  // Create a stable, session-scoped Input component to avoid remounts
  const ScopedInput = useMemo(() => {
    const Comp = (props: any) => (
      <CustomInput
        {...props}
        listenSessionId={sessionId}
        isAgentAndModelSelected={isAgentAndModelSelected}
      />
    );
    return Comp;
  }, [sessionId, isAgentAndModelSelected]);

  // ================================================================================
  // RENDER
  // ================================================================================

  // Memoize sticky style for referential stability
  const stickyStyle = React.useMemo(() => ({
    backgroundColor: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(12, 17, 23, 0.95)'
  }), [isLight]);
    
    return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* CopilotChat with inline historical cards and floating progress card */}
      <div className={cn("copilot-chat-wrapper relative min-h-0 flex-1", !isAgentAndModelSelected && "chat-input-disabled")}>
        {/* Floating TaskProgressCard - sticks to top and floats above messages */}
        {dynamicAgentState.steps && dynamicAgentState.steps.length > 0 && showProgressBar && (
          <div 
            className="sticky top-0 z-10 px-2 pb-1 pt-2 backdrop-blur-sm"
            style={stickyStyle}>
            <TaskProgressCard 
              state={dynamicAgentState} 
              setState={setDynamicAgentState}
              isCollapsed={false} 
              isHistorical={false}
              showControls={true}
            />
          </div>
        )}
        
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
          Input={ScopedInput}
        />
        </StreamingContext.Provider>
      </div>
    </div>
  );
};

export const ChatInner = React.memo(ChatInnerComponent);
