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

import type { FC } from 'react';
import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';

// CopilotKit Hooks & Components
import {
  useCoAgent,
  useCoAgentStateRender,
  useCopilotReadable,
  useCopilotChatHeadless_c,
  useFrontendTool,
  useHumanInTheLoop,
  useDefaultTool,
  useRenderToolCall,
} from '@copilotkit/react-core';
import { CopilotChat, useCopilotChatSuggestions } from '@copilotkit/react-ui';
import type { InputProps, MessagesProps } from '@copilotkit/react-ui';

// Extension Utilities & Storage
import { debug, useStorage, sessionStorageDBWrapper } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { cn } from '@extension/ui';

// UI Components
import { ActionStatus } from './ActionStatus';
import { TaskProgressCard, AgentStepState } from './TaskProgressCard';
import { CustomUserMessage } from './CustomUserMessage';
import { CustomAssistantMessage } from './CustomAssistantMessage';
import { CustomInput } from './CustomInput';
import { CustomMessages } from './CustomMessages';
import { ThinkingBlock } from './ThinkingBlock';
import { MermaidBlock } from './MermaidBlock';
import { ChatErrorDisplay } from './ChatErrorDisplay';

// Custom Hooks
import { useMessageSanitization, MessageData } from '../hooks/useMessageSanitization';
import { useContextMenuPrefill } from '../hooks/useContextMenuPrefill';
import { useProgressBarState } from '../hooks/useProgressBarState';
import { usePageMetadata, type PageContent } from '../hooks/usePageMetadata';
import { useProgressCardCollapse } from '../hooks/useProgressCardCollapse';
import { useAgentStateManagement } from '../hooks/useAgentStateManagement';

// Note: Scroll management is handled entirely by CustomMessages via Virtua's VList API
// Do NOT add duplicate scroll logic here - it won't work with virtualized lists

// Utilities
import {
  runCachedSanitization,
  applySanitizationIfChanged,
  filterValidMessages,
  findLastMessageByRole,
  computeMessagesSignature
} from '../utils/sanitizationHelper';

// Constants
import { CHAT_SUGGESTIONS_INSTRUCTIONS, DEFAULT_MAX_SUGGESTIONS } from '../constants/chatSuggestions';

// CopilotKit Action Creators
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
  createSendKeystrokesAction,
} from '../actions/copilot/domActions';
import { createInputDataAction } from '../actions/copilot/formActions';
import {
  createOpenNewTabAction,
  createScrollAction,
  createDragAndDropAction,
} from '../actions/copilot/navigationActions';
import { createTakeScreenshotAction } from '../actions/copilot/screenshotActions';
import { createGenerateImagesAction } from '../actions/copilot/imageActions';
import { createWaitAction, createConfirmActionHumanInTheLoop } from '../actions/copilot/utilityActions';
import { 
  createWebSearchRender, 
  createCodeExecutionRender, 
  createUrlContextRender 
} from '../actions/copilot/builtinToolActions';

// Types & Libraries
import { SemanticSearchManager } from '../lib/SemanticSearchManager';

// Local type for CopilotKit agent state
// interface AgentState {
//   proverbs: string[];
// }

// Empty component for hiding thinking blocks
const EmptyThinkingBlock: React.FC<{ children?: React.ReactNode }> = () => null;

// Default tool icon component
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
      color: isLight ? '#4b5563' : '#6b7280'
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

export interface ChatInnerProps {
  sessionId: string;
  // Removed: sessionTitle (was never used in the component)
  currentPageContent: PageContent | null;
  dbTotals?: { html: number; form: number; click: number };
  pageContentEmbedding?: {
    fullEmbedding: number[];
    chunks?: Array<{ text: string; html: string; embedding: number[] }>;
    timestamp: number;
  } | null;
  latestDOMUpdate: unknown;
  themeColor: string;
  setThemeColor: (color: string) => void;
  saveMessagesToStorage: (messages: unknown[]) => Promise<void>;
  setHeadlessMessagesCount: (count: number) => void;
  saveMessagesRef: React.MutableRefObject<(() => MessageData) | null>;
  restoreMessagesRef: React.MutableRefObject<((messages: unknown[]) => void) | null>;
  resetChatRef: React.MutableRefObject<(() => void) | null>;
  setIsAgentLoading: (loading: boolean) => void;
  showSuggestions: boolean;
  showThoughtBlocks: boolean;
  agentModeChat: boolean;
  onProgressBarStateChange?: (hasProgressBar: boolean, showProgressBar: boolean, onToggle: () => void) => void;
  initialAgentStepState?: AgentStepState;
  onAgentStepStateChange?: (state: AgentStepState) => void;
  contextMenuMessage?: string | null;
  triggerManualRefresh?: () => void;
  isAgentAndModelSelected?: boolean;
  agentType?: string;
  modelType?: string;
  organizationId?: string;
  teamId?: string;
}

// ================================================================================
// COMPONENT DEFINITION
// ================================================================================

const ChatInnerComponent: FC<ChatInnerProps> = ({
  sessionId,
  // Removed: sessionTitle (was never used)
  currentPageContent,
  pageContentEmbedding,
  latestDOMUpdate,
  themeColor,
  setThemeColor,
  saveMessagesToStorage,
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
  // THEME & STORAGE
  // ================================================================================
  const { isLight } = useStorage(themeStorage);

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
    pageContent: unknown;
  }>({
    embeddings: null,
    pageContent: null,
  });

  // Semantic search manager for embeddings-based queries
  const searchManager = useMemo(() => new SemanticSearchManager(pageDataRef), []);

  // ================================================================================
  // COPILOTKIT HOOKS
  // ================================================================================
  
  const {
    messages,
    setMessages,
    isLoading,
    generateSuggestions,
    reloadMessages,
    reset,
    stopGeneration,
  } = useCopilotChatHeadless_c();
  
  // Track streaming state to avoid restoring messages after edits/deletes
  const wasStreamingRef = useRef(false);
  
  // Loading state ref for callbacks
  const isLoadingRef = useRef(false);

  // ================================================================================
  // CUSTOM HOOKS
  // ================================================================================
  
  // Note: Scroll management is handled by CustomMessages via Virtua's VList API
  // No duplicate scroll logic needed here
  
  // Agent state management (extracted to hook)
  const {
    dynamicAgentState,
    setDynamicAgentState,
    latestAssistantMessageIdRef
  } = useAgentStateManagement({
    sessionId,
    messages,
    initialAgentStepState,
    onAgentStepStateChange
  });

  // Shared agent state for maintaining agent context across interactions
  //   const { state, setState } = useCoAgent<AgentState>({
  //   name: 'dynamic_agent',
  //     initialState: {
  //     proverbs: ['CopilotKit may be new, but its the best thing since sliced bread.'],
  //   },
  // });

  // Totals for DB-backed counts (HTML, form, clickable element chunks)
  const [totals, setTotals] = useState<{ html: number; form: number; click: number }>({ html: 0, form: 0, click: 0 });

  // ================================================================================
  // EFFECTS & SIDE EFFECTS
  // ================================================================================

  // Update parent component with loading state
  useEffect(() => {
    setIsAgentLoading(isLoading);
    isLoadingRef.current = isLoading;
  }, [isLoading, setIsAgentLoading]);
  
  // Expose reset function via ref
  useEffect(() => {
    if (resetChatRef) {
      resetChatRef.current = reset;
    }
  }, [reset, resetChatRef]);
  
  // Clear streaming flag when messages are cleared
  useEffect(() => {
    if (messages.length === 0) {
      wasStreamingRef.current = false;
    }
  }, [messages.length]);

  // Persist immediately when messages are removed (e.g., user deletion)
  const previousMessageCountRef = useRef(messages.length);

  useEffect(() => {
    const previousCount = previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;

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
        void saveMessagesToStorage(sanitizedMessages as unknown[]);
      } else {
        void sessionStorageDBWrapper.updateAllMessages(sessionId, []);
      }
    } catch (error) {
      debug.warn?.('[ChatInner] Failed to persist messages after deletion:', error);
    }
  }, [messages, isLoading, saveMessagesRef, saveMessagesToStorage, sessionId]);
  
  // Comprehensive ref cleanup on session change
  useEffect(() => {
    debug.log('[ChatInner] Session changed, cleaning up refs');
    
    cachedSanitizedRef.current = null;
    wasStreamingRef.current = false;
    pageDataRef.current = { embeddings: null, pageContent: null };
    previousMessageCountRef.current = 0;
    
    debug.log('[ChatInner] Ref cleanup complete');
  }, [sessionId]);

  // Adopt embed-time totals from container if available
  useEffect(() => {
    if (dbTotals && (dbTotals.html || dbTotals.form || dbTotals.click)) {
      setTotals(dbTotals);
      debug.log('[ChatInner] Adopted embed-time totals:', dbTotals);
    }
  }, [dbTotals?.html, dbTotals?.form, dbTotals?.click]);

  // Context menu prefill handling
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
  const { 
    filteredMessages, 
    sanitizeMessages, 
    cachedSanitizedRef 
  } = useMessageSanitization(
    messages,
    setMessages,
    saveMessagesRef,
    restoreMessagesRef,
    setHeadlessMessagesCount
  );

  // Update pageDataRef when embeddings or content changes
  useEffect(() => {
    pageDataRef.current.embeddings = pageContentEmbedding || null;
    pageDataRef.current.pageContent = currentPageContent;
  }, [pageContentEmbedding, currentPageContent]);

  // ================================================================================
  // PAGE METADATA
  // ================================================================================
  const pageMetadataForAgent = usePageMetadata({
    currentPageContent,
    pageContentEmbedding,
    totals,
    enableLogging: false,
  });

  useCopilotReadable({
    description:
      'Current web page metadata including: pageTitle, pageURL, hasContent, hasEmbeddings, totalHtmlChunks, totalFormChunks, totalClickableChunks, documentInfo, windowInfo, and timestamp. Use searchPageContent to semantically search page content when needed.',
    value: pageMetadataForAgent,
  });

  // ================================================================================
  // HELPER FUNCTIONS
  // ================================================================================

  const clipText = useCallback((v: unknown, n: number = 60) => {
    const s = typeof v === 'string' ? v : String(v ?? '');
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
  }, []);

  const yesNo = useCallback((b: unknown) => (b ? 'yes' : 'no'), []);

  // ================================================================================
  // DEFAULT TOOL RENDER
  // ================================================================================

  const defaultToolRender = useCallback(
    (props: { name?: string; status?: string; args?: Record<string, unknown>; result?: unknown; error?: unknown }) => {
      const { name, status, args, result } = props;
      const error = props?.error ?? (typeof result === 'object' && result ? (result as Record<string, unknown>)?.error : undefined);
      
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
      } catch {
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
          status={status as 'pending' | 'executing' | 'complete'}
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
  
  const actionDeps = useMemo(() => ({
    searchManager,
    isLight,
    clipText,
    yesNo,
    currentPageContent,
    pageDataRef,
    themeColor,
  }), [searchManager, isLight, clipText, yesNo, currentPageContent, themeColor]);
  
  // Search Actions
  useFrontendTool(createSearchPageContentAction(actionDeps) as Parameters<typeof useFrontendTool>[0], [actionDeps]);
  useFrontendTool(createSearchFormDataAction(actionDeps) as Parameters<typeof useFrontendTool>[0], [actionDeps]);
  useFrontendTool(createSearchDOMUpdatesAction(actionDeps) as Parameters<typeof useFrontendTool>[0], [actionDeps]);
  useFrontendTool(createSearchClickableElementsAction(actionDeps) as Parameters<typeof useFrontendTool>[0], [actionDeps]);

  // Data Retrieval Actions
  const retrievalDeps = useMemo(() => ({ currentPageContent, isLight }), [currentPageContent, isLight]);
  useFrontendTool(createGetHtmlChunksByRangeAction(retrievalDeps) as Parameters<typeof useFrontendTool>[0], [retrievalDeps]);
  useFrontendTool(createGetFormChunksByRangeAction(retrievalDeps) as Parameters<typeof useFrontendTool>[0], [retrievalDeps]);
  useFrontendTool(createGetClickableChunksByRangeAction(retrievalDeps) as Parameters<typeof useFrontendTool>[0], [retrievalDeps]);

  // DOM Manipulation Actions
  const domDeps = useMemo(() => ({ isLight, clipText, pageDataRef, triggerManualRefresh }), [isLight, clipText, triggerManualRefresh]);
  useFrontendTool(createMoveCursorToElementAction({ isLight, clipText }) as Parameters<typeof useFrontendTool>[0], [domDeps]);
  useFrontendTool(createRefreshPageContentAction({ isLight, pageDataRef, triggerManualRefresh }) as Parameters<typeof useFrontendTool>[0], [domDeps]);
  useFrontendTool(createCleanupExtensionUIAction({ isLight }) as Parameters<typeof useFrontendTool>[0], [isLight]);
  useFrontendTool(createClickElementAction({ isLight, clipText }) as Parameters<typeof useFrontendTool>[0], [domDeps]);
  useFrontendTool(createVerifySelectorAction({ isLight, clipText }) as Parameters<typeof useFrontendTool>[0], [domDeps]);
  useFrontendTool(createGetSelectorAtPointAction({ isLight }) as Parameters<typeof useFrontendTool>[0], [isLight]);
  useFrontendTool(createGetSelectorsAtPointsAction({ isLight }) as Parameters<typeof useFrontendTool>[0], [isLight]);
  useFrontendTool(createSendKeystrokesAction({ isLight, clipText }) as Parameters<typeof useFrontendTool>[0], [domDeps]);

  // Form Actions
  useFrontendTool(createInputDataAction({ isLight, clipText }) as Parameters<typeof useFrontendTool>[0], [isLight, clipText]);

  // Navigation Actions
  useFrontendTool(createOpenNewTabAction({ isLight, clipText }) as Parameters<typeof useFrontendTool>[0], [isLight, clipText]);
  useFrontendTool(createScrollAction({ isLight, clipText, yesNo }) as Parameters<typeof useFrontendTool>[0], [isLight, clipText, yesNo]);
  useFrontendTool(createDragAndDropAction({ isLight, clipText }) as Parameters<typeof useFrontendTool>[0], [isLight, clipText]);

  // Screenshot Actions
  useFrontendTool(createTakeScreenshotAction({ isLight }) as Parameters<typeof useFrontendTool>[0], [isLight]);

  // Image Generation Actions
  useRenderToolCall(createGenerateImagesAction({ themeColor }) as Parameters<typeof useRenderToolCall>[0], [themeColor]);

  // Builtin Tool Renders
  useRenderToolCall(createWebSearchRender({ isLight, clipText }) as Parameters<typeof useRenderToolCall>[0], [isLight, clipText]);
  useRenderToolCall(createCodeExecutionRender({ isLight, clipText }) as Parameters<typeof useRenderToolCall>[0], [isLight, clipText]);
  useRenderToolCall(createUrlContextRender({ isLight, clipText }) as Parameters<typeof useRenderToolCall>[0], [isLight, clipText]);

  // Utility Actions
  useFrontendTool(createWaitAction({ isLight }) as Parameters<typeof useFrontendTool>[0], [isLight]);
  
  // Human in the Loop
  useHumanInTheLoop(createConfirmActionHumanInTheLoop({ isLight }) as Parameters<typeof useHumanInTheLoop>[0]);

  // ================================================================================
  // AGENT STATE RENDERING
  // ================================================================================
  
  useCoAgentStateRender<AgentStepState>({
    name: 'dynamic_agent',
    render: ({ state: scopedState }) => {
      if (!scopedState?.steps || scopedState.steps.length === 0) {
        return null;
      }
      
      if (scopedState.sessionId && scopedState.sessionId !== sessionId) {
        return null;
      }

      // Add sessionId if missing
      const stateWithSession = scopedState.sessionId 
        ? scopedState 
        : { ...scopedState, sessionId };
      
      return (
        <div
          data-task-progress="true"
          data-session-id={sessionId}
          data-timestamp={Date.now()}
          className="w-full pt-2"
          style={{
            maxWidth: '56rem',
            marginLeft: 'auto',
            marginRight: 'auto',
            paddingLeft: 12,
            paddingRight: 12,
            ['--copilot-kit-input-background-color' as string]: 'transparent',
            ['--copilot-kit-separator-color' as string]: isLight ? '#e5e7eb' : '#374151',
            ['--copilot-kit-border-color' as string]: isLight ? '#e5e7eb' : '#374151',
            ['--task-progress-rendered-border-color' as string]: isLight ? 'rgba(229, 231, 235, 0.7)' : '#374151',
          }}
        >
          <TaskProgressCard 
            state={stateWithSession}
            setState={setDynamicAgentState}
            isCollapsed={true}
            isHistorical={true}
            showControls={false}
          />
        </div>
      );
    },
  });

  // Auto-collapse older progress cards
  useProgressCardCollapse();

  // ================================================================================
  // CHAT SUGGESTIONS
  // ================================================================================
  // Note: useCopilotChatSuggestions must be called unconditionally per React rules.
  // We control behavior via the disabled parameter.
    useCopilotChatSuggestions({
    instructions: showSuggestions ? CHAT_SUGGESTIONS_INSTRUCTIONS : '',
    minSuggestions: showSuggestions ? 2 : 0,
    maxSuggestions: showSuggestions ? DEFAULT_MAX_SUGGESTIONS : 0,
    });

  // ================================================================================
  // PROGRESS BAR STATE
  // ================================================================================
  
  const hasProgressBar = dynamicAgentState.steps && dynamicAgentState.steps.length > 0;
  const { showProgressBar, toggleProgressBar: toggleProgressBarFn } = useProgressBarState(
    hasProgressBar,
    onProgressBarStateChange
  );

  // ================================================================================
  // COMPONENT CONFIGURATION
  // ================================================================================
  
  const customMarkdownTagRenderers = useMemo(() => ({
    think: showThoughtBlocks ? ThinkingBlock : EmptyThinkingBlock,
    mermaid: MermaidBlock,
  }), [showThoughtBlocks]);

  // Scoped Input component - receives InputProps from CopilotChat
  const ScopedInput = useMemo(() => {
    const Comp = (props: InputProps) => (
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
  // EVENT HANDLERS
  // ================================================================================
    
  /**
   * Handle message submission
   * 
   * NOTE: Sanitization disabled on submit - only runs when streaming ends
   * Auto-save is still active to persist user messages immediately
   */
  const handleSubmitMessage = useCallback((message: string) => {
    debug.log('[ChatInner] User submitted message');
    
    // COMMENTED OUT: Sanitization on submit - only sanitize when streaming ends
    // try {
    //   const current = messages || [];
    //   const result = runCachedSanitization(current, cachedSanitizedRef, sanitizeMessages as (msgs: unknown[]) => { messages: unknown[]; hasChanges: boolean });
    //   
    //   if (result.hasChanges) {
    //     const currentSignature = computeMessagesSignature(current);
    //     applySanitizationIfChanged(result, currentSignature, setMessages);
    //   }
    // } catch (e) {
    //   debug.warn?.('[ChatInner] onSubmit sanitization skipped:', e);
    // }
    
    // ACTIVE: Auto-save shortly after submit (without sanitization)
    setTimeout(() => {
      try {
        const fn = saveMessagesRef?.current;
        if (!fn) return;
        const data = fn();
        const all = (data && data.allMessages) || [];
        if (all.length > 0) {
          void saveMessagesToStorage(all as unknown[]);
        }
      } catch (e) {
        debug.warn?.('[ChatInner] Auto-save after submit failed:', e);
      }
    }, 100);
  }, [saveMessagesRef, saveMessagesToStorage]);

  /**
   * Handle progress state changes
   */
  const handleInProgress = useCallback(async (inProgress: boolean) => {
            if (inProgress) {
              wasStreamingRef.current = true;
              return;
            }
            
            if (!wasStreamingRef.current) {
              return;
            }
            
            wasStreamingRef.current = false;
            
            try {
              const fn = saveMessagesRef?.current;
              if (!fn) return;
              
              const data = fn();
      const all = (data && data.allMessages) || [];
      
      const result = runCachedSanitization(all, cachedSanitizedRef, sanitizeMessages as (msgs: unknown[]) => { messages: unknown[]; hasChanges: boolean });
      
              if (result.hasChanges) {
        const currentSignature = computeMessagesSignature(all);
        applySanitizationIfChanged(result, currentSignature, setMessages);
                }
      
      if (all.length > 0) {
        void saveMessagesToStorage(all as unknown[]);
              }
              
      // Generate suggestions after streaming stops
              if (showSuggestions && generateSuggestions) {
        debug.log('[ChatInner] Generating suggestions...');
                try {
                  await Promise.resolve(generateSuggestions());
                } catch (err) {
          debug.warn?.('[ChatInner] Failed to generate suggestions:', err);
                }
              }
            } catch (e) {
      debug.warn?.('[ChatInner] Auto-save on stop failed:', e);
            }
  }, [saveMessagesRef, saveMessagesToStorage, showSuggestions, generateSuggestions, cachedSanitizedRef, sanitizeMessages, setMessages]);

  /**
   * Handle error display with retry functionality
   */
  const renderError = useCallback((err: { message: string; operation?: string }) => {
    const { message, operation } = err;
            const error = new Error(operation ? `${operation}: ${message}` : message);
            error.name = operation || 'Error';
            
            const handleRetry = () => {
      debug.log('[ChatInner] Retrying...');

              const currentMessages = messages || [];
      let sanitizedMessagesArr: unknown[] = currentMessages;

              try {
        const result = runCachedSanitization(currentMessages, cachedSanitizedRef, sanitizeMessages as (msgs: unknown[]) => { messages: unknown[]; hasChanges: boolean });
                  sanitizedMessagesArr = result.messages;

                  if (result.hasChanges) {
          const currentSignature = computeMessagesSignature(currentMessages);
                    const newSignature = computeMessagesSignature(result.messages);
          if (newSignature !== currentSignature) {
            setMessages(result.messages as typeof messages);
                  }
                }
              } catch (err) {
        debug.warn?.('[ChatInner] Failed to sanitize before retry:', err);
              }

      const validMessages = filterValidMessages(sanitizedMessagesArr);
              
              if (validMessages.length === 0) {
        debug.error('[ChatInner] No valid messages to reload');
                return;
              }
              
      const lastAssistant = findLastMessageByRole(validMessages, 'assistant');
      if (lastAssistant?.id) {
        debug.log('[ChatInner] Reloading from assistant message:', lastAssistant.id);
        reloadMessages(lastAssistant.id);
              } else {
        const lastUser = findLastMessageByRole(validMessages, 'user');
        if (lastUser?.id) {
          debug.log('[ChatInner] Reloading from user message:', lastUser.id);
          reloadMessages(lastUser.id);
                } else {
          debug.warn?.('[ChatInner] No valid message found to reload');
                }
              }
            };
            
            return (
              <ChatErrorDisplay
                error={error}
        retry={handleRetry}
                isLight={isLight}
                autoDismissMs={15000}
              />
            );
  }, [isLight, reloadMessages, messages, sanitizeMessages, cachedSanitizedRef, setMessages]);

  /**
   * Custom Messages wrapper - receives MessagesProps from CopilotChat
   */
  const MessagesComponent = useCallback((props: MessagesProps) => (
    <CustomMessages {...props} agentMode={agentModeChat} />
  ), [agentModeChat]);

  // ================================================================================
  // RENDER
  // ================================================================================
    
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div 
        className={cn("copilot-chat-wrapper relative min-h-0 flex-1 overflow-y-auto", !isAgentAndModelSelected && "chat-input-disabled")}
      >
        <CopilotChat
          imageUploadsEnabled={false}
          onSubmitMessage={handleSubmitMessage}
          onError={errorEvent => {
            debug.log('[ChatInner] Error:', errorEvent);
          }}
          onInProgress={handleInProgress}
          renderError={renderError}
          onRegenerate={() => {
            debug.log('[ChatInner] Regenerate');
          }}
          onCopy={(text: string) => {
            debug.log('[ChatInner] Copy:', text.substring(0, 50));
          }}
          onStopGeneration={() => {
            debug.log('[ChatInner] Stop generation');
            try {
              stopGeneration?.();
            } catch (error) {
              debug.warn?.('[ChatInner] Failed to stop generation', error);
            }
          }}
          onThumbsDown={() => {
            debug.log('[ChatInner] Thumbs down');
          }}
          onThumbsUp={() => {
            debug.log('[ChatInner] Thumbs up');
          }}
          markdownTagRenderers={customMarkdownTagRenderers}
          AssistantMessage={CustomAssistantMessage}
          UserMessage={CustomUserMessage}
          Messages={MessagesComponent}
          Input={ScopedInput}
        />
      </div>
    </div>
  );
};

export const ChatInner = React.memo(ChatInnerComponent);
