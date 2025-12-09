/**
 * Centralized CopilotKit Chat Context Hook
 *
 * This abstraction layer enables easy migration to CopilotKit v2.
 * When upgrading to v2, only this file needs to change.
 *
 * v1: Uses useChatContext from @copilotkit/react-ui
 * v2: Uses useCopilotChatConfiguration from @copilotkit/react-core/v2
 */

import { useChatContext } from '@copilotkit/react-ui';

/**
 * Chat context labels configuration
 */
export interface CopilotChatLabels {
  initial?: string;
  placeholder?: string;
  title?: string;
  thinking?: string;
  stopGenerating?: string;
  regenerateResponse?: string;
  copyToClipboard?: string;
  thumbsUp?: string;
  thumbsDown?: string;
  [key: string]: string | undefined; // Allow additional labels
}

/**
 * Chat context icons configuration
 */
export interface CopilotChatIcons {
  sendIcon?: React.ReactNode;
  activityIcon?: React.ReactNode;
  spinnerIcon?: React.ReactNode;
  stopIcon?: React.ReactNode;
  regenerateIcon?: React.ReactNode;
  headerCloseIcon?: React.ReactNode;
  openIcon?: React.ReactNode;
  closeIcon?: React.ReactNode;
}

/**
 * Centralized chat context value interface.
 * Provides a stable interface regardless of CopilotKit version.
 */
export interface CopilotChatContextValue {
  /** Chat labels configuration */
  labels: CopilotChatLabels;
  /** Chat icons configuration */
  icons: CopilotChatIcons;
  /** Whether the chat is open (modal state) */
  isOpen: boolean;
  /** Function to set the open state */
  setOpen: (open: boolean) => void;
  /** Raw context for advanced usage */
  _rawContext: ReturnType<typeof useChatContext>;
}

/**
 * Centralized hook for accessing CopilotKit chat context.
 *
 * Provides access to chat labels, icons, and modal state.
 *
 * @example
 * ```tsx
 * const { labels, icons, isOpen, setOpen } = useCopilotChatContext();
 * ```
 */
export function useCopilotChatContext(): CopilotChatContextValue {
  // v1 implementation using useChatContext
  const context = useChatContext();

  return {
    labels: context.labels as CopilotChatLabels,
    icons: context.icons as CopilotChatIcons,
    isOpen: context.open,
    setOpen: context.setOpen,
    _rawContext: context,
  };
}

// === V2 MIGRATION ===
// The v2 equivalent is `useCopilotChatConfiguration` from '@copilotkit/react-core/v2'
//
// V2 Interface:
// interface CopilotChatConfigurationValue {
//   labels: CopilotChatLabels;
//   agentId: string;
//   threadId: string;
//   isModalOpen: boolean;           // replaces 'open'
//   setModalOpen: (open: boolean) => void;  // replaces 'setOpen'
//   isModalDefaultOpen: boolean;
// }
//
// import { useCopilotChatConfiguration } from '@copilotkit/react-core/v2';
//
// export function useCopilotChatContext(): CopilotChatContextValue | null {
//   const config = useCopilotChatConfiguration();
//
//   if (!config) return null;
//
//   return {
//     labels: config.labels as CopilotChatLabels,
//     icons: {}, // Icons not available in v2 - handled internally
//     isOpen: config.isModalOpen,
//     setOpen: config.setModalOpen,
//     _rawContext: config,
//   };
// }
//
// Key Differences:
// - No `icons` in v2 (handled internally)
// - `open` → `isModalOpen`
// - `setOpen` → `setModalOpen`
// - New fields: `agentId`, `threadId`, `isModalDefaultOpen`
// - Returns `null` if used outside chat context

