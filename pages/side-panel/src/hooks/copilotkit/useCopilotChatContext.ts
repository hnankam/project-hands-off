/**
 * Centralized CopilotKit Chat Context Hook
 *
 * This abstraction layer provides access to chat context (labels, icons, modal state).
 *
 * V2 Implementation:
 * Uses useCopilotChatConfiguration from @copilotkit/react-core/v2
 */

import { useCopilotChatConfiguration } from '@copilotkit/react-core/v2';

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
  // V2 specific labels
  chatInputPlaceholder?: string;
  modalHeaderTitle?: string;
  [key: string]: string | undefined; // Allow additional labels
}

/**
 * Chat context icons configuration
 * Note: In V2, icons are handled internally by the CopilotChat component
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
  /** Chat icons configuration (empty in V2 - handled internally) */
  icons: CopilotChatIcons;
  /** Whether the chat is open (modal state) */
  isOpen: boolean;
  /** Function to set the open state */
  setOpen: (open: boolean) => void;
  /** Current agent ID (V2 only) */
  agentId?: string;
  /** Current thread ID (V2 only) */
  threadId?: string;
  /** Whether context is available */
  available: boolean;
}

/**
 * Centralized hook for accessing CopilotKit chat context.
 *
 * V2 implementation using useCopilotChatConfiguration.
 * Note: Returns null-safe values - check `available` before using.
 *
 * @example
 * ```tsx
 * const { labels, isOpen, setOpen, available } = useCopilotChatContext();
 * if (available) {
 *   // Use context
 * }
 * ```
 */
export function useCopilotChatContext(): CopilotChatContextValue {
  // V2 implementation using useCopilotChatConfiguration
  // Note: Returns null if called outside CopilotChat context
  const config = useCopilotChatConfiguration();

  if (!config) {
    // Return default values when outside chat context
    return {
      labels: {},
      icons: {},
      isOpen: false,
      setOpen: () => {
        console.warn('[useCopilotChatContext] Called outside of CopilotChat context');
      },
      available: false,
    };
  }

  return {
    labels: config.labels as CopilotChatLabels,
    icons: {}, // V2 handles icons internally
    isOpen: config.isModalOpen ?? false,
    setOpen: config.setModalOpen ?? (() => {}),
    agentId: config.agentId,
    threadId: config.threadId,
    available: true,
  };
}
