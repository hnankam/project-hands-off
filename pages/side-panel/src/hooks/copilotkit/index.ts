/**
 * Centralized CopilotKit Hooks, Components, and Types
 *
 * This module provides abstraction layers over CopilotKit to:
 * 1. Enable easy migration to CopilotKit v2
 * 2. Provide a single point of change when upgrading
 * 3. Standardize the API across the codebase
 *
 * When migrating to v2, only the implementation files in this directory
 * need to change - all consuming code remains the same.
 */

// =============================================================================
// Hooks
// =============================================================================

// Chat functionality
export { useCopilotChat } from './useCopilotChat';
export type { CopilotChatState } from './useCopilotChat';

// Chat context (labels, icons, modal state)
export { useCopilotChatContext } from './useCopilotChatContext';
export type {
  CopilotChatContextValue,
  CopilotChatLabels,
  CopilotChatIcons,
} from './useCopilotChatContext';

// Agent state management
export { useCopilotAgent } from './useCopilotAgent';
export type { CopilotAgentOptions, CopilotAgentState } from './useCopilotAgent';

// Agent state rendering
export { useCopilotAgentStateRender } from './useCopilotAgentStateRender';
export type {
  CopilotAgentStateRenderOptions,
  AgentStateRenderParams,
  RenderStatus,
} from './useCopilotAgentStateRender';

// Runtime context
export { useCopilotRuntimeContext } from './useCopilotRuntimeContext';
export type { CopilotRuntimeContextValue, CopilotApiConfig } from './useCopilotRuntimeContext';

// Readable data
export { useCopilotReadableData } from './useCopilotReadableData';
export type { CopilotReadableDataConfig } from './useCopilotReadableData';

// Suggestions
export { useCopilotSuggestions } from './useCopilotSuggestions';
export type { CopilotSuggestionsConfig } from './useCopilotSuggestions';

// Tool hooks (re-exported for centralized imports)
export {
  useFrontendTool,
  useHumanInTheLoop,
  useDefaultTool,
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
  CopilotChat,
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

