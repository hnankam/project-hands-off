/**
 * Centralized CopilotKit Hooks, Components, and Types
 *
 * V2 Implementation:
 * This module provides abstraction layers over CopilotKit V2 to:
 * 1. Provide a stable API regardless of internal changes
 * 2. Standardize the API across the codebase
 * 3. Enable future migrations with minimal changes
 *
 * When upgrading, only the implementation files in this directory
 * need to change - all consuming code remains the same.
 */

// =============================================================================
// Hooks
// =============================================================================

// Chat functionality
export { useCopilotChat, deleteMessagesFromBackend } from './useCopilotChat';
export type { CopilotChatState } from './useCopilotChat';

// Chat context (labels, icons, modal state)
export { useCopilotChatContext } from './useCopilotChatContext';
export type {
  CopilotChatContextValue,
  CopilotChatLabels,
  CopilotChatIcons,
} from './useCopilotChatContext';

// Agent state management
export { useCopilotAgent, SharedAgentProvider, SharedAgentContext } from './useCopilotAgent';
export type { CopilotAgentOptions, CopilotAgentState } from './useCopilotAgent';

// Agent event subscriptions (v1.5+ comprehensive event system)
export { useAgentEventSubscriber } from './useAgentEventSubscriber';
export type {
  AgentError,
  LifecyclePhase,
  AgentLifecycleState,
  ToolExecution,
  AgentEventSubscriberConfig,
  AgentEventSubscriberResult,
} from './useAgentEventSubscriber';

// Shared agent context removed - hooks now call useAgent() directly with stable config
// CopilotKit handles connection deduplication internally

// Convenience hook for error banner display
export { useAgentWithErrorBanner } from './useAgentWithErrorBanner';
export type {
  AgentWithErrorBannerConfig,
  AgentWithErrorBannerResult,
} from './useAgentWithErrorBanner';

// Runtime context
export { useCopilotRuntimeContext } from './useCopilotRuntimeContext';
export type { CopilotRuntimeContextValue, CopilotApiConfig } from './useCopilotRuntimeContext';

// Readable data
export { useCopilotReadableData } from './useCopilotReadableData';
export type { CopilotReadableDataConfig } from './useCopilotReadableData';

// Suggestions
export { useCopilotSuggestions } from './useCopilotSuggestions';
export type { CopilotSuggestionsConfig } from './useCopilotSuggestions';

// Tool hooks (centralized for consistency)
export {
  useFrontendTool,
  useHumanInTheLoop,
  useRenderToolCall,
} from './useCopilotTools';
export type {
  FrontendAction,
  ActionRenderProps,
  RenderFunctionStatus,
} from './useCopilotTools';

// =============================================================================
// Components
// =============================================================================

export {
  CopilotKit,
  CopilotKitProvider,
  CopilotChat,
  CopilotChatAssistantMessage,
  CopilotChatUserMessage,
  CopilotSidebar,
  Markdown,
  ImageRenderer,
} from './components';

// =============================================================================
// Types
// =============================================================================

export type {
  Message,
  InputProps,
  MessagesProps,
  UserMessageProps,
  AssistantMessageProps,
} from './types';

// =============================================================================
// V2 Direct Exports (for advanced usage)
// =============================================================================

// Re-export V2 hooks for direct access when needed
// Note: useSuggestions omitted - causes "Agent default not found" errors
// when called before CopilotChat mounts. Use useConfigureSuggestions instead.
export {
  useAgent,
  useCopilotKit,
  useAgentContext,
  useConfigureSuggestions,
  useCopilotChatConfiguration,
  useRenderActivityMessage,
} from '@copilotkit/react-core/v2';
