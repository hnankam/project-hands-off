/**
 * Centralized CopilotKit Chat Hook
 *
 * This abstraction layer enables easy migration to CopilotKit v2.
 * When upgrading to v2, only this file needs to change.
 *
 * v1: Uses useCopilotChatHeadless_c
 * v2: Will use useAgent({ agentId: 'dynamic_agent' })
 */

import { useCopilotChatHeadless_c } from '@copilotkit/react-core';
import type { Message } from '@copilotkit/shared';
import type { ReactElement } from 'react';

/**
 * Return type for the centralized chat hook.
 * Provides a stable interface regardless of CopilotKit version.
 */
export interface CopilotChatState {
  // Messages
  /** The messages that are currently in the chat */
  messages: Message[];

  /** Replace all messages in the chat */
  setMessages: (messages: Message[]) => void;

  /** Remove a specific message by ID */
  deleteMessage: (messageId: string) => void;

  // Loading state
  /** Whether the chat is currently generating a response */
  isLoading: boolean;

  // Actions
  /** Send a new message to the chat */
  sendMessage: (message: Message) => Promise<void>;

  /** Regenerate the response for a specific message */
  reloadMessages: (messageId?: string) => Promise<void>;

  /** Clear all messages and reset chat state */
  reset: () => void;

  /** Stop the current message generation */
  stopGeneration: () => void;

  /** Interrupt content for human-in-the-loop workflows */
  interrupt: string | ReactElement | null;

  /** Trigger AI-powered suggestion generation */
  generateSuggestions: () => Promise<void>;
}

/**
 * Centralized hook for CopilotKit chat functionality.
 *
 * This abstraction layer enables easy migration to CopilotKit v2.
 * When upgrading to v2, only this file needs to change.
 *
 * @example
 * ```tsx
 * const { messages, isLoading, sendMessage } = useCopilotChat();
 * ```
 */
export function useCopilotChat(): CopilotChatState {
  // v1 implementation using useCopilotChatHeadless_c
  const {
    messages,
    setMessages,
    deleteMessage,
    isLoading,
    sendMessage,
    reloadMessages,
    reset,
    stopGeneration,
    interrupt,
    generateSuggestions,
  } = useCopilotChatHeadless_c();

  return {
    messages,
    setMessages: setMessages as (messages: Message[]) => void,
    deleteMessage,
    isLoading,
    sendMessage,
    reloadMessages,
    reset,
    stopGeneration,
    interrupt,
    generateSuggestions,
  };
}

// === V2 MIGRATION ===
// When migrating to v2, replace the implementation with:
//
// import { useAgent } from '@copilotkit/react-core/v2';
//
// export function useCopilotChat(): CopilotChatState {
//   const agent = useAgent({ agentId: 'dynamic_agent' });
//
//   return {
//     messages: agent.messages,
//     setMessages: agent.setMessages, // verify v2 API
//     deleteMessage: agent.deleteMessage, // verify v2 API
//     isLoading: agent.isLoading,
//     sendMessage: agent.sendMessage, // verify v2 API
//     reloadMessages: agent.reload, // verify v2 API
//     reset: agent.reset, // verify v2 API
//     stopGeneration: agent.stop, // verify v2 API
//     interrupt: agent.interrupt, // verify v2 API
//     generateSuggestions: agent.generateSuggestions, // verify v2 API
//   };
// }

