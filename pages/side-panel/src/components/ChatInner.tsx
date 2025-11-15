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
import { createGenerateImagesAction } from '../actions/copilot/imageActions';
import { createWaitAction, createConfirmActionHumanInTheLoop } from '../actions/copilot/utilityActions';

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
  const scrollSpacerRef = useRef<HTMLDivElement>(null); // Spacer to force scrollable area
  const isLoadingRef = useRef(false); // Track loading state for interval callbacks
  const actualScrollContainerRef = useRef<HTMLElement | null>(null);
  const [scrollContainerReady, setScrollContainerReady] = useState(false);
  const isAutoScrollingRef = useRef(false);
  const isScrollingUserMessageToTopRef = useRef(false); // Track when scrolling user message to top
  const currentStickyIdRef = useRef<string | null>(null);
  const rafPendingRef = useRef(false);
  const previousMessagesLengthRef = useRef(messages.length);
  const lastScrollTopRef = useRef<number>(0);
  const scrollDirectionRef = useRef<'up' | 'down' | 'none'>('none');
  const scrollVelocityRef = useRef<number>(0);
  const lastScrollTimeRef = useRef<number>(Date.now());
  const lastStickyChangeTimeRef = useRef<number>(0);
  const lastUserMessageIdRef = useRef<string | null>(null);
  const hasInitializedStickyOnOpenRef = useRef<boolean>(false);
  
  // Helper function to find the actual scrolling container
  const getActualScrollContainer = React.useCallback((): HTMLElement | null => {
    if (!scrollContainerRef.current) return null;
    
    // CopilotKit renders messages in a .copilotKitMessages container
    const messagesContainer = scrollContainerRef.current.querySelector('.copilotKitMessages');
    if (messagesContainer) {
      return messagesContainer as HTMLElement;
    }
    
    // Fallback to the wrapper itself
    return scrollContainerRef.current;
  }, []);
  
  // Find and cache the actual scrolling container
  useEffect(() => {
    const container = getActualScrollContainer();
    if (container && container !== actualScrollContainerRef.current) {
      actualScrollContainerRef.current = container;
      setScrollContainerReady(true);
    }
    
    // Cleanup: remove spacer and clear intervals when component unmounts
    return () => {
      if (scrollSpacerRef.current) {
        // Clear sticky check interval
        const stickyCheckInterval = (scrollSpacerRef.current as any).__stickyCheckInterval;
        if (stickyCheckInterval) {
          clearInterval(stickyCheckInterval);
        }
        
        // Clear content wait interval
        const contentInterval = (scrollSpacerRef.current as any).__contentInterval;
        if (contentInterval) {
          clearInterval(contentInterval);
        }
        
        // Remove spacer
        scrollSpacerRef.current.remove();
        scrollSpacerRef.current = null;
      }
    };
  }, [getActualScrollContainer, messages.length]); // Re-run when messages change in case structure updates
  
  // Helper function to scroll so a user message becomes sticky
  const scrollToMakeSticky = React.useCallback((container: HTMLElement, messageElement: HTMLDivElement) => {
    try {
      isAutoScrollingRef.current = true;
      isScrollingUserMessageToTopRef.current = true;

      // Reuse existing spacer if present, otherwise create new one
      const existingSpacer = scrollSpacerRef.current;
      let reusingExistingSpacer = false;
      
      if (existingSpacer && existingSpacer.parentElement) {
        reusingExistingSpacer = true;
        
        // Clear any existing intervals on the spacer
        if ((existingSpacer as any).__contentInterval) {
          clearInterval((existingSpacer as any).__contentInterval);
          delete (existingSpacer as any).__contentInterval;
        }
        if ((existingSpacer as any).__stickyCheckInterval) {
          clearInterval((existingSpacer as any).__stickyCheckInterval);
          delete (existingSpacer as any).__stickyCheckInterval;
        }
      }
      
      // Calculate message position first
      let messageTopInContent = 0;
      let el: HTMLElement | null = messageElement;
      while (el && el !== container && el.parentElement) {
        messageTopInContent += el.offsetTop;
        el = el.parentElement as HTMLElement;
      }
      
      const containerHeight = container.clientHeight;
      const currentScrollHeight = container.scrollHeight;
      const currentScrollTop = container.scrollTop;
      const STICKY_THRESHOLD = -2; // Match the sticky detection threshold
      const requiredScrollHeight = messageTopInContent - STICKY_THRESHOLD + containerHeight;
      const targetHeight = Math.max(0, requiredScrollHeight - currentScrollHeight);
      
      // Also calculate how much we need to scroll from current position
      const targetScrollTop = messageTopInContent - STICKY_THRESHOLD;
      const scrollDelta = targetScrollTop - currentScrollTop;
      
      let spacer: HTMLDivElement;
      
      if (reusingExistingSpacer && existingSpacer) {
        // Reuse existing spacer - reset it to 0 height for fresh growth
        spacer = existingSpacer;
        spacer.style.transition = 'none'; // No transition for reset
        spacer.style.height = '0px';
        spacer.offsetHeight; // Force reflow
        spacer.style.transition = 'height 0.025s ease-out'; // Re-enable transition for growth
      } else {
        // Create new spacer with 0 height that will grow then shrink dynamically
        spacer = document.createElement('div');
        spacer.className = 'chat-scroll-spacer';
        spacer.style.height = '0px';
        spacer.style.width = '100%';
        spacer.style.pointerEvents = 'none';
        spacer.style.opacity = '0';
        spacer.style.overflow = 'hidden';
        spacer.style.boxSizing = 'border-box';
        spacer.style.transition = 'height 0.025s ease-out'; // 25ms fast growth
        spacer.style.backgroundColor = 'transparent';
        spacer.style.flexShrink = '0'; // Don't allow CSS auto-shrink in scroll container
        spacer.style.minHeight = '0';
        spacer.textContent = '\u00A0';
        spacer.setAttribute('aria-hidden', 'true');
        
        // Insert spacer at the END of the messages container (pushes message up as it grows)
        container.appendChild(spacer);
        scrollSpacerRef.current = spacer;
      }
      
      // Invalidate position cache since spacer changes layout
      elementCacheRef.current = null;
      
      // Start growing the spacer
      requestAnimationFrame(() => {
        if (!scrollSpacerRef.current) return;
        
        scrollSpacerRef.current.style.height = `${targetHeight}px`;
      });
      
        // Wait for spacer to finish growing (25ms ease-out transition) + 25ms buffer then start scrolling
        setTimeout(() => {
        if (!scrollSpacerRef.current) return;
        
        // Force layout recalculation to ensure spacer has taken effect
        container.offsetHeight; // Force reflow
        
        // Recalculate message position after spacer has grown to ensure accuracy
        let updatedMessageTopInContent = 0;
        let el: HTMLElement | null = messageElement;
        while (el && el !== container && el.parentElement) {
          updatedMessageTopInContent += el.offsetTop;
          el = el.parentElement as HTMLElement;
        }
        
        // Use the same sticky threshold (5px) for consistency
        // Target: scrollTop = messageTopInContent - 5, giving distanceFromTop = 5 (within sticky zone)
        const updatedTargetScrollTop = updatedMessageTopInContent - STICKY_THRESHOLD;
        
        // Temporarily allow sticky detection during this animation
        isScrollingUserMessageToTopRef.current = false;
        isAutoScrollingRef.current = false;
        
        // Use smooth scroll animation over 50ms with ease-out
        const startScrollTop = container.scrollTop;
        const scrollDistance = updatedTargetScrollTop - startScrollTop;
        const startTime = Date.now();
        const duration = 50; // 50ms fast scroll
        
        const smoothScrollStep = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          
          // Ease-out function for smooth deceleration
          const easeProgress = 1 - Math.pow(1 - progress, 3);
          
          container.scrollTop = startScrollTop + (scrollDistance * easeProgress);
          
          if (progress < 1 && scrollSpacerRef.current) {
            requestAnimationFrame(smoothScrollStep);
          }
        };
        
        requestAnimationFrame(smoothScrollStep);
        
        // Monitor until message becomes sticky
        const checkStickyInterval = setInterval(() => {
          // Force cache invalidation to ensure sticky detection gets fresh positions
          elementCacheRef.current = null;
          
          // Trigger scroll event to update sticky detection
          if (actualScrollContainerRef.current) {
            const scrollEvent = new Event('scroll', { bubbles: true });
            actualScrollContainerRef.current.dispatchEvent(scrollEvent);
          }
          
          // Check if message is now sticky
          if (messageElement.classList.contains('is-sticky')) {
            clearInterval(checkStickyInterval);
            
            // Track content growth and shrink spacer by exactly that amount
            let lastScrollHeight = container.scrollHeight;
            let currentSpacerHeight = targetHeight;
            
            const dynamicShrinkInterval = setInterval(() => {
              if (!scrollSpacerRef.current) {
                clearInterval(dynamicShrinkInterval);
                return;
        }
              
              const currentScrollHeight = container.scrollHeight;
              const contentGrowth = currentScrollHeight - lastScrollHeight;
              
              // Shrink spacer by the amount content grew (slightly slower for more persistence)
              if (contentGrowth > 0) {
                // Shrink spacer by 0.99x the content growth for controlled shrinking
                const shrinkAmount = contentGrowth * 0.99;
                currentSpacerHeight = Math.max(0, currentSpacerHeight - shrinkAmount);
                
                // Apply new height immediately without transition for instant response
                scrollSpacerRef.current.style.transition = 'none';
                scrollSpacerRef.current.style.height = `${currentSpacerHeight}px`;
                
                // Force reflow to ensure height is applied
                scrollSpacerRef.current.offsetHeight;
                
                // Only remove spacer if it has naturally reached 0
                if (currentSpacerHeight === 0) {
                  clearInterval(dynamicShrinkInterval);
                  setTimeout(() => {
                    if (scrollSpacerRef.current && scrollSpacerRef.current.parentElement) {
                      scrollSpacerRef.current.remove();
                      scrollSpacerRef.current = null;
                    }
                  }, 100);
                }
              }
              
              // Check if user scrolled up past the sticky message - smoothly remove spacer
              if (scrollSpacerRef.current && !messageElement.classList.contains('is-sticky')) {
                clearInterval(dynamicShrinkInterval);
                scrollSpacerRef.current.style.transition = 'height 0.3s ease-out';
                scrollSpacerRef.current.style.height = '0px';
                setTimeout(() => {
                  if (scrollSpacerRef.current && scrollSpacerRef.current.parentElement) {
                    scrollSpacerRef.current.remove();
                    scrollSpacerRef.current = null;
                  }
                }, 300);
              }
              
              lastScrollHeight = currentScrollHeight;
            }, 25); // Check every 25ms for faster response
            
            // Store interval for cleanup
            if (scrollSpacerRef.current) {
              (scrollSpacerRef.current as any).__contentInterval = dynamicShrinkInterval;
            }
          }
        }, 100);
        
        // Store interval for cleanup
        if (scrollSpacerRef.current) {
          (scrollSpacerRef.current as any).__stickyCheckInterval = checkStickyInterval;
        }
        
        // Safety timeout - if not sticky after 5 seconds, give up
        setTimeout(() => {
          if (!messageElement.classList.contains('is-sticky')) {
            clearInterval(checkStickyInterval);
            if (scrollSpacerRef.current && scrollSpacerRef.current.parentElement) {
              scrollSpacerRef.current.remove();
              scrollSpacerRef.current = null;
            }
            isAutoScrollingRef.current = false;
          isScrollingUserMessageToTopRef.current = false;
        }
      }, 5000);
        }, 50); // Wait for 25ms spacer growth + 25ms buffer
      
    } catch (error) {
      isAutoScrollingRef.current = false;
      isScrollingUserMessageToTopRef.current = false;
      if (scrollSpacerRef.current && scrollSpacerRef.current.parentElement) {
        scrollSpacerRef.current.remove();
        scrollSpacerRef.current = null;
      }
    }
  }, []);
  
  // Initialize lastUserMessageIdRef on first render to prevent spacer on tab open
  const hasInitializedRef = useRef(false);
  const previousUserMessageCountRef = useRef(0);

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
  
  // Auto-scroll to position new user message at top when sent (makes it sticky)
  useEffect(() => {
    const container = actualScrollContainerRef.current;
    if (!container || !scrollContainerReady) {
      return;
    }

    // Find the latest user message
    const userMessages = messages.filter((m: any) => m.role === 'user');
    const currentUserMessageCount = userMessages.length;
    
    if (currentUserMessageCount === 0) return;
    
    // Only proceed if user messages were ADDED, not deleted
    if (currentUserMessageCount <= previousUserMessageCountRef.current) {
      previousUserMessageCountRef.current = currentUserMessageCount;
      return;
    }
    
    const latestUserMessage = userMessages[userMessages.length - 1];
    const latestUserMessageId = latestUserMessage?.id;
    
    // Check if this is a new user message
    if (!latestUserMessageId || latestUserMessageId === lastUserMessageIdRef.current) {
      previousUserMessageCountRef.current = currentUserMessageCount;
      return;
    }
    
    // Update the refs to track this message
    lastUserMessageIdRef.current = latestUserMessageId;
    previousUserMessageCountRef.current = currentUserMessageCount;
    
    // Only use sticky logic if Agent Mode Chat is enabled
    if (!agentModeChat) {
      return;
    }
    
    // Wait for DOM to render the new message
    setTimeout(() => {
      const userMessageElement = container.querySelector<HTMLDivElement>(
        `[data-message-role="user"][data-message-id="${latestUserMessageId}"]`
      );
      
      if (!userMessageElement) {
        setTimeout(() => {
          const retryElement = container.querySelector<HTMLDivElement>(
            `[data-message-role="user"][data-message-id="${latestUserMessageId}"]`
          );
          if (retryElement) {
            scrollToMakeSticky(container, retryElement);
          }
        }, 200);
        return;
      }
      
      scrollToMakeSticky(container, userMessageElement);
    }, 100);
  }, [messages, scrollContainerReady, scrollToMakeSticky, agentModeChat]);

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
    // Skip if we're currently scrolling a user message to the top
    // Auto-scroll if spacer is hidden (after 3s) or if user is near bottom
    if (currentLength > previousLength && isLastMessageFromAssistant && !isScrollingUserMessageToTopRef.current) {
      const isSpacerHidden = !scrollSpacerRef.current || scrollSpacerRef.current.style.display === 'none';
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      
      // Auto-scroll if spacer is hidden (allowing scroll) or if user is already near bottom
      if (isSpacerHidden || isNearBottom || previousLength === 0) {
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

  // Direct DOM manipulation - immediate handoff between sticky messages
  const applyStickyClass = React.useCallback((stickyId: string | null) => {
    const container = actualScrollContainerRef.current;
    if (!container) return;

    // Get all user message elements
    const userMessageElements = container.querySelectorAll<HTMLDivElement>('[data-message-role="user"]');

    // Immediate synchronous update - no delays, no flickering
    // Remove sticky from ALL first (ensures clean handoff and prevents multiple sticky)
    userMessageElements.forEach(el => {
      if (el.classList.contains('is-sticky')) {
        el.classList.remove('is-sticky');
      }
    });
    
    // Then add sticky to ONLY the target message (if any)
    if (stickyId) {
      userMessageElements.forEach(el => {
        if (el.dataset.messageId === stickyId) {
        el.classList.add('is-sticky');
        }
      });
    }
  }, []);

  // Memoized scroll handler - optimized to minimize layout thrashing
  const handleScroll = React.useCallback(() => {
    const container = actualScrollContainerRef.current;
    if (!container) return;
    
    // Skip during auto-scroll or when scrolling user message to top
    if (isAutoScrollingRef.current || isScrollingUserMessageToTopRef.current) return;

    const { scrollTop, clientHeight, scrollHeight } = container;
    
    // Detect scroll direction and velocity
    const now = Date.now();
    const previousScrollTop = lastScrollTopRef.current;
    const timeDelta = now - lastScrollTimeRef.current;
    const scrollDelta = Math.abs(scrollTop - previousScrollTop);
    
    // Calculate velocity (pixels per millisecond)
    const velocity = timeDelta > 0 ? scrollDelta / timeDelta : 0;
    scrollVelocityRef.current = velocity;
    
    if (scrollTop > previousScrollTop) {
      scrollDirectionRef.current = 'down';
    } else if (scrollTop < previousScrollTop) {
      scrollDirectionRef.current = 'up';
    }
    
    lastScrollTopRef.current = scrollTop;
    lastScrollTimeRef.current = now;
    
    // Check if we're at the absolute top
    const isAtAbsoluteTop = scrollTop <= 5;
    
    // No stickiness needed if content doesn't overflow
    const hasOverflow = scrollHeight > clientHeight;
    if (!hasOverflow) {
      if (currentStickyIdRef.current !== null) {
        currentStickyIdRef.current = null;
        applyStickyClass(null);
        }
      return;
    }

    // Rebuild cache if stale (check every 100ms for responsive updates)
    const cacheAge = elementCacheRef.current ? now - elementCacheRef.current.timestamp : Infinity;
    
    if (!elementCacheRef.current || cacheAge > 100) {
      const allMessageElements = Array.from(
        container.querySelectorAll<HTMLDivElement>('[data-message-role]')
      );

      if (allMessageElements.length === 0) {
        if (currentStickyIdRef.current !== null) {
          currentStickyIdRef.current = null;
          applyStickyClass(null);
        }
        return;
      }

      // Batch all DOM reads - single getBoundingClientRect call for container
      const containerRect = container.getBoundingClientRect();
      const userMessages: Array<{ id: string; index: number; top: number }> = [];
      const assistantMessages: Array<{ index: number; top: number; bottom: number }> = [];
      
      // Read all positions in one batch (minimizes layout thrashing)
      allMessageElements.forEach((el, idx) => {
        const rect = el.getBoundingClientRect();
        const top = rect.top - containerRect.top + scrollTop;
        const bottom = rect.bottom - containerRect.top + scrollTop;
        
        if (el.dataset.messageRole === 'user') {
          userMessages.push({
            id: el.dataset.messageId || '',
            index: idx,
            top,
          });
        } else if (el.dataset.messageRole === 'assistant') {
          assistantMessages.push({
            index: idx,
            top,
            bottom,
          });
        }
      });

      elementCacheRef.current = {
        userMessages,
        assistantMessages,
        allElements: allMessageElements,
        timestamp: now,
      };
    }

    const { userMessages, assistantMessages } = elementCacheRef.current;
    
    if (userMessages.length === 0) {
      if (currentStickyIdRef.current !== null) {
        currentStickyIdRef.current = null;
        applyStickyClass(null);
      }
      return;
    }

    // Calculate viewport bounds
    const viewportTop = scrollTop;
    const viewportBottom = scrollTop + clientHeight;

    // Find the topmost visible assistant message using cached positions
    let topmostVisibleAssistantIndex = -1;
    
    for (const assistantMsg of assistantMessages) {
      // Check if this assistant message is visible in viewport using cached positions
      const isVisible = assistantMsg.bottom > viewportTop && assistantMsg.top < viewportBottom;
      
      if (isVisible) {
        topmostVisibleAssistantIndex = assistantMsg.index;
        break;
      }
    }

    // Find which user message should be sticky - dynamic threshold based on message positions
    let newStickyId: string | null = null;
    
    const scrollDirection = scrollDirectionRef.current;
    const currentStickyId = currentStickyIdRef.current;
    
    // Special case: At absolute top, remove all stickiness
    if (isAtAbsoluteTop) {
      if (currentStickyIdRef.current !== null) {
        currentStickyIdRef.current = null;
        applyStickyClass(null);
      }
      return;
    }

    if (topmostVisibleAssistantIndex !== -1) {
      
      // Fast scroll detection: velocity > 0.12px/ms is considered "fast"
      // (based on observed values: slow ~0.01, medium ~0.11, fast ~0.17+)
      const isFastScrolling = velocity > 0.12;
      
      // During fast scrolling, prevent rapid transitions
      const MIN_CHANGE_INTERVAL_FAST = 150; // ms - minimum time between sticky changes during fast scroll
      const timeSinceLastChange = now - lastStickyChangeTimeRef.current;
      
      // During fast upward scrolling with an existing sticky message, skip evaluation
      // unless enough time has passed to prevent rapid toggling
      if (scrollDirection === 'up' && isFastScrolling && currentStickyId !== null) {
        if (timeSinceLastChange < MIN_CHANGE_INTERVAL_FAST) {
          return; // Skip all sticky logic during cooldown
        }
      }
      
      // Find the user message that comes before the topmost visible assistant message
      for (let i = userMessages.length - 1; i >= 0; i--) {
        const userMsg = userMessages[i];
        
        if (userMsg.index < topmostVisibleAssistantIndex) {
          // This is the contextually correct message for these responses
          const isThisMessageCurrentlySticky = userMsg.id === currentStickyId;
          const distanceFromTop = userMsg.top - viewportTop;
          
          // HYSTERESIS: Use different thresholds for making sticky vs removing sticky
          // distanceFromTop = userMsg.top - viewportTop
          //   Positive = message is BELOW viewport top
          //   Negative = message is ABOVE viewport top (already scrolled past)
          
          const MAKE_STICKY_THRESHOLD = 10;     // Make sticky when within 10px of viewport top (positive or negative)
          const UNSTICK_THRESHOLD = 40;         // Only unstick when message is 40px BELOW viewport (back in view)
          
          let shouldBeSticky: boolean;
          let reason: string;
          
          if (isThisMessageCurrentlySticky) {
            // Already sticky - during fast upward scrolling, NEVER remove stickiness
            // This prevents flickering when scrolling rapidly through messages
            if (scrollDirection === 'up' && isFastScrolling) {
              shouldBeSticky = true;
              reason = `fast_scroll_lock: keeping sticky during fast upward scroll (${Math.round(distanceFromTop)}px)`;
            } else if (distanceFromTop > UNSTICK_THRESHOLD) {
              // Normal speed - only remove when message is back in view (positive distance, below viewport)
              shouldBeSticky = false;
              reason = `unstick: ${Math.round(distanceFromTop)}px below viewport (threshold: ${UNSTICK_THRESHOLD})`;
      } else {
              shouldBeSticky = true;
              reason = `keep_sticky: within keep zone (${Math.round(distanceFromTop)}px vs ${UNSTICK_THRESHOLD}px)`;
            }
          } else if (currentStickyId !== null) {
            // A DIFFERENT message is currently sticky - this is a transition
            // During fast upward scrolling, be VERY conservative about switching
            if (scrollDirection === 'up' && isFastScrolling) {
              // Find the current sticky message's position for comparison
              const currentStickyMsg = userMessages.find(m => m.id === currentStickyId);
              const currentStickyDistance = currentStickyMsg ? currentStickyMsg.top - viewportTop : Infinity;
              
              // Require ALL of these conditions:
              // 1. Message must be well past the top (-150px)
              // 2. Sufficient time since last change (150ms)
              // 3. New message must be significantly closer to viewport than current sticky
              //    (less negative distance = closer to viewport)
              const FAST_SWITCH_THRESHOLD = -150;
              const DISTANCE_IMPROVEMENT_REQUIRED = 100; // Must be 100px closer to viewport
              const hasEnoughTime = timeSinceLastChange > MIN_CHANGE_INTERVAL_FAST;
              // New message is closer if its distance is less negative (or more positive) than current
              // Example: current=-200px, new=-100px → improvement = 100px ✓
              const distanceImprovement = currentStickyDistance - distanceFromTop;
              const isSignificantlyCloser = distanceImprovement >= DISTANCE_IMPROVEMENT_REQUIRED;
              
              if (distanceFromTop <= FAST_SWITCH_THRESHOLD && hasEnoughTime && isSignificantlyCloser) {
                shouldBeSticky = true;
                reason = `fast_scroll_switch: ${Math.round(distanceFromTop)}px past top, ${Math.round(timeSinceLastChange)}ms since last, ${Math.round(currentStickyDistance - distanceFromTop)}px closer`;
              } else if (!hasEnoughTime) {
                shouldBeSticky = false;
                reason = `fast_scroll_cooldown: only ${Math.round(timeSinceLastChange)}ms since last change (min: ${MIN_CHANGE_INTERVAL_FAST}ms)`;
              } else if (!isSignificantlyCloser) {
                shouldBeSticky = false;
                reason = `fast_scroll_not_closer: current=${Math.round(currentStickyDistance)}px, new=${Math.round(distanceFromTop)}px (need ${DISTANCE_IMPROVEMENT_REQUIRED}px improvement)`;
              } else {
                shouldBeSticky = false;
                reason = `fast_scroll_wait: ${Math.round(distanceFromTop)}px not far enough (threshold: ${FAST_SWITCH_THRESHOLD})`;
              }
            } else {
              // Normal speed - use standard threshold
              if (distanceFromTop <= MAKE_STICKY_THRESHOLD) {
                shouldBeSticky = true;
                reason = `switch: ${Math.round(distanceFromTop)}px from top (threshold: ${MAKE_STICKY_THRESHOLD})`;
              } else {
                shouldBeSticky = false;
                reason = `switch_wait: ${Math.round(distanceFromTop)}px from top (threshold: ${MAKE_STICKY_THRESHOLD})`;
              }
            }
          } else {
            // No message currently sticky - make sticky when close to or past top
            if (distanceFromTop <= MAKE_STICKY_THRESHOLD) {
              shouldBeSticky = true;
              reason = `make_sticky: ${Math.round(distanceFromTop)}px from top (threshold: ${MAKE_STICKY_THRESHOLD})`;
            } else {
              shouldBeSticky = false;
              reason = `not_yet: ${Math.round(distanceFromTop)}px from top (threshold: ${MAKE_STICKY_THRESHOLD})`;
            }
          }
          
          if (shouldBeSticky) {
            newStickyId = userMsg.id;
          }
          break;
        }
      }
    } else {
      // No assistant message visible - check last user message scrolled past
      const MAKE_STICKY_THRESHOLD = 10;
      const UNSTICK_THRESHOLD = 40;  // Only unstick when back in view (below viewport)
      
      for (let i = userMessages.length - 1; i >= 0; i--) {
        const userMsg = userMessages[i];
        const isThisMessageCurrentlySticky = userMsg.id === currentStickyId;
        const distanceFromTop = userMsg.top - viewportTop;
        
        let shouldBeSticky: boolean;
        let reason: string;
        
        if (isThisMessageCurrentlySticky) {
          // Use hysteresis - keep sticky until message is back in view (positive distance)
          if (distanceFromTop > UNSTICK_THRESHOLD) {
            shouldBeSticky = false;
            reason = `no_assistant+unstick: ${Math.round(distanceFromTop)}px below viewport`;
          } else {
            shouldBeSticky = true;
            reason = `no_assistant+keep: within zone (${Math.round(distanceFromTop)}px)`;
          }
        } else {
          // Make sticky when close to or past top
          if (distanceFromTop <= MAKE_STICKY_THRESHOLD) {
            shouldBeSticky = true;
            reason = `no_assistant+make: ${Math.round(distanceFromTop)}px from top`;
          } else {
            shouldBeSticky = false;
            reason = `no_assistant+not_yet: ${Math.round(distanceFromTop)}px from top`;
          }
        }
        
        if (shouldBeSticky) {
          newStickyId = userMsg.id;
          break;
        } else if (userMsg.top > viewportTop) {
          // This and all previous messages are below viewport
          break;
        }
      }
    }

    // Apply changes with hysteresis built into the decision logic
    if (currentStickyIdRef.current !== newStickyId) {
      currentStickyIdRef.current = newStickyId;
      lastStickyChangeTimeRef.current = now; // Record time of change
      applyStickyClass(newStickyId);
    }
  }, [applyStickyClass]);

  // Properly throttled version - only ONE RAF pending at a time
  const throttledHandleScroll = React.useCallback(() => {
    if (isAutoScrollingRef.current) return;
    
    // If we already have a pending RAF, skip this scroll event
    if (rafPendingRef.current) return;
    
    // Mark that we have a pending RAF
    rafPendingRef.current = true;
    
    // Queue the calculation for next frame
    requestAnimationFrame(() => {
      rafPendingRef.current = false;
      handleScroll();
      });
  }, [handleScroll]);

  // Context-aware stickiness: attach scroll listener
  useEffect(() => {
    const container = actualScrollContainerRef.current;
    if (!container || !scrollContainerReady) return;

    // Use passive: true for better scroll performance
    container.addEventListener('scroll', throttledHandleScroll, { passive: true });
    
    // Initial check when messages change
    const timeoutId = setTimeout(handleScroll, 100);

    return () => {
      container.removeEventListener('scroll', throttledHandleScroll);
      clearTimeout(timeoutId);
    };
  }, [messages.length, scrollContainerReady, throttledHandleScroll, handleScroll]);

  // Make latest message sticky when tab opens (if content is long enough for scrolling)
  useEffect(() => {
    const container = actualScrollContainerRef.current;
    if (!container || !scrollContainerReady) return;
    
    // Only run once per session/tab open
    if (hasInitializedStickyOnOpenRef.current) return;
    
    // Wait for messages to be rendered
    if (messages.length === 0) return;
    
    // Small delay to ensure DOM is fully rendered
    const timeoutId = setTimeout(() => {
      // Check if content is long enough for scrolling
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const hasOverflow = scrollHeight > clientHeight;
      
      if (!hasOverflow) {
        // Not enough content to scroll, no need to make sticky
        hasInitializedStickyOnOpenRef.current = true;
        return;
      }
      
      // Find the latest user message
      const userMessages = messages.filter((m: any) => m.role === 'user');
      if (userMessages.length === 0) {
        hasInitializedStickyOnOpenRef.current = true;
        return;
      }
      
      const latestUserMessage = userMessages[userMessages.length - 1];
      const latestUserMessageId = latestUserMessage?.id;
      
      if (!latestUserMessageId) {
        hasInitializedStickyOnOpenRef.current = true;
        return;
      }
      
      // Find the message element in the DOM
      const userMessageElement = container.querySelector<HTMLDivElement>(
        `[data-message-role="user"][data-message-id="${latestUserMessageId}"]`
      );
      
      if (!userMessageElement) {
        // Retry once more after a short delay
        setTimeout(() => {
          const retryElement = container.querySelector<HTMLDivElement>(
            `[data-message-role="user"][data-message-id="${latestUserMessageId}"]`
          );
          if (retryElement) {
            retryElement.classList.add('is-sticky');
            currentStickyIdRef.current = latestUserMessageId;
            hasInitializedStickyOnOpenRef.current = true;
          } else {
            hasInitializedStickyOnOpenRef.current = true;
          }
        }, 200);
        return;
      }
      
      // Simply add the sticky class to the latest user message
      userMessageElement.classList.add('is-sticky');
      currentStickyIdRef.current = latestUserMessageId;
      hasInitializedStickyOnOpenRef.current = true;
    }, 300);
    
    return () => clearTimeout(timeoutId);
  }, [scrollContainerReady, messages.length, messages]);

  // Reset initialization flag when session changes
  useEffect(() => {
    hasInitializedStickyOnOpenRef.current = false;
  }, [sessionId]);

  // Invalidate cache and recalculate when messages change
  useEffect(() => {
    if (!scrollContainerReady) return;
    
    // Invalidate cache so it rebuilds with new message positions
    elementCacheRef.current = null;
    
    // Small delay to ensure DOM is ready after message updates
    const timeoutId = setTimeout(() => {
      handleScroll();
    }, 50);
    
    return () => clearTimeout(timeoutId);
  }, [messages.length, scrollContainerReady, handleScroll]);

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
    
    // Clear scroll spacer and its intervals
    if (scrollSpacerRef.current) {
      // Clear sticky check interval
      const stickyCheckInterval = (scrollSpacerRef.current as any).__stickyCheckInterval;
      if (stickyCheckInterval) {
        clearInterval(stickyCheckInterval);
        delete (scrollSpacerRef.current as any).__stickyCheckInterval;
      }
      
      // Clear content wait interval
      const contentInterval = (scrollSpacerRef.current as any).__contentInterval;
      if (contentInterval) {
        clearInterval(contentInterval);
        delete (scrollSpacerRef.current as any).__contentInterval;
      }
      
      // Remove spacer from DOM if it exists
      if (scrollSpacerRef.current.parentElement) {
        scrollSpacerRef.current.remove();
      }
      scrollSpacerRef.current = null;
    }
    
    // Clear element position cache
    elementCacheRef.current = null;
    
    // Clear sticky state
    currentStickyIdRef.current = null;
    
    // Reset scroll tracking refs
    lastScrollTopRef.current = 0;
    scrollDirectionRef.current = 'none';
    scrollVelocityRef.current = 0;
    lastScrollTimeRef.current = Date.now();
    lastStickyChangeTimeRef.current = 0;
    
    // Clear message tracking refs
    lastUserMessageIdRef.current = null;
    latestAssistantMessageIdRef.current = null;
    
    // Clear page data
    pageDataRef.current = { embeddings: null, pageContent: null };
    
    // Reset plan deletion tracking
    planDeletionInfoRef.current = { deleted: false, lastAssistantId: null };
    
    // Reset scroll flags
    isAutoScrollingRef.current = false;
    isScrollingUserMessageToTopRef.current = false;
    
    // Reset initialization flags
    hasInitializedStickyOnOpenRef.current = false;
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
          Input={ScopedInput}
        />
        </StreamingContext.Provider>
      </div>
    </div>
  );
};

export const ChatInner = React.memo(ChatInnerComponent);
