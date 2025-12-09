/**
 * Centralized CopilotKit Type Re-exports
 *
 * This module re-exports CopilotKit types to:
 * 1. Provide a single import location for all CopilotKit types
 * 2. Enable easy migration to CopilotKit v2
 * 3. Allow for type augmentation if needed
 *
 * v1: Types from @copilotkit/react-ui and @copilotkit/shared
 * v2: Types may come from @copilotkit/react-core/v2 or remain in react-ui
 */

// =============================================================================
// Message Types (from @copilotkit/shared)
// =============================================================================

export type { Message } from '@copilotkit/shared';

// =============================================================================
// Component Props Types (from @copilotkit/react-ui)
// =============================================================================

// Input component props
export type { InputProps } from '@copilotkit/react-ui';

// Messages component props
export type { MessagesProps } from '@copilotkit/react-ui';

// User message component props
export type { UserMessageProps } from '@copilotkit/react-ui';

// Assistant message component props
export type { AssistantMessageProps } from '@copilotkit/react-ui';

// =============================================================================
// Additional Types (if needed)
// =============================================================================

// Re-export any additional types that may be used across the codebase
// Add more type exports here as needed

// =============================================================================
// V2 MIGRATION NOTES
// =============================================================================
//
// Type Location Changes:
// - Message type: Verify if still from @copilotkit/shared or moved
// - InputProps: Verify availability in v2
// - MessagesProps: Verify availability in v2
// - UserMessageProps: Verify availability in v2
// - AssistantMessageProps: Verify availability in v2
//
// New Types in v2:
// - ReactToolCallRenderer<T>
// - ReactActivityMessageRenderer<T>
// - ReactCustomMessageRenderer
// - ReactFrontendTool
// - ReactHumanInTheLoop
// - CopilotChatLabels
// - CopilotKitProviderProps
//
// Example v2 imports:
//
// import type {
//   ReactToolCallRenderer,
//   ReactActivityMessageRenderer,
//   CopilotKitProviderProps,
// } from '@copilotkit/react-core/v2';
//
// // Component props may still be from react-ui
// import type {
//   InputProps,
//   MessagesProps,
//   UserMessageProps,
//   AssistantMessageProps,
// } from '@copilotkit/react-ui';
//
// // Or may be available from react-core/v2
// // Verify during migration
