/**
 * Centralized CopilotKit Chat Hook
 *
 * V2 Implementation using useAgent and useCopilotKit from @copilotkit/react-core/v2.
 * Suggestions are configured separately via useCopilotSuggestions hook.
 */

import { useAgent, useCopilotKit } from '@copilotkit/react-core/v2';
import type { Message } from '@ag-ui/core';
import { useMemo, useCallback } from 'react';

// Re-export Message type for convenience
export type { Message };

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
  /**
   * Send a new message to the chat.
   * Note: In V2, this is handled via CopilotChat component's input.
   * This method runs the agent which processes the last user message.
   */
  sendMessage: (message: Message) => Promise<void>;

  /** Regenerate the response for a specific message */
  reloadMessages: (messageId?: string) => Promise<void>;

  /** Clear all messages and reset chat state */
  reset: () => void;

  /** Stop the current message generation */
  stopGeneration: () => void;
}

// Default agent ID used throughout the application
const DEFAULT_AGENT_ID = 'dynamic_agent';

/**
 * Centralized hook for CopilotKit chat functionality.
 *
 * @example
 * ```tsx
 * const { messages, isLoading, reset } = useCopilotChat();
 * ```
 */
export function useCopilotChat(agentId: string = DEFAULT_AGENT_ID): CopilotChatState {
  // V2 implementation using useAgent
  const { agent } = useAgent({
    agentId,
  });

  // CopilotKit core for stopAgent and other utilities
  const { copilotkit } = useCopilotKit();

  // Memoize messages to prevent unnecessary re-renders
  const messages = useMemo(() => {
    return (agent?.messages ?? []) as Message[];
  }, [agent?.messages]);

  // Set messages - V2 uses agent.setMessages() per CopilotKit v1.50 docs
  const setMessages = useCallback((newMessages: Message[]) => {
    if (agent && typeof agent.setMessages === 'function') {
      agent.setMessages(newMessages);
    }
  }, [agent]);

  // Delete message by ID - filter and use agent.setMessages()
  const deleteMessage = useCallback((messageId: string) => {
    if (agent && typeof agent.setMessages === 'function') {
      const filtered = (agent.messages ?? []).filter((m: Message) => m.id !== messageId);
      agent.setMessages(filtered);
    }
  }, [agent]);

  // Send a new message - V2 implementation
  // In V2, messages are typically sent via CopilotChat's input component.
  // This method adds the message and triggers the agent run.
  const sendMessage = useCallback(async (message: Message) => {
    if (!agent || !copilotkit) {
      console.warn('[useCopilotChat] sendMessage: agent or copilotkit not available');
      return;
    }
    
    // Add the message to the current messages
    if (typeof agent.setMessages === 'function') {
      const currentMessages = agent.messages ?? [];
      agent.setMessages([...currentMessages, message]);
    }
    
    // Run the agent to process the new message
    try {
      await copilotkit.runAgent({ agent: agentId as any });
    } catch (error) {
      console.error('[useCopilotChat] Failed to send message:', error);
      throw error;
    }
  }, [agent, copilotkit, agentId]);

  // Reload/regenerate messages
  const reloadMessages = useCallback(async (_messageId?: string) => {
    // In V2, use copilotkit.runAgent to re-run the agent
    if (copilotkit) {
      try {
        await copilotkit.runAgent({ agent: agentId as any });
      } catch (error) {
        console.error('[useCopilotChat] Failed to reload messages:', error);
        throw error;
      }
    }
  }, [copilotkit, agentId]);

  // Reset chat state - V2 implementation using agent.setMessages([])
  const reset = useCallback(() => {
    if (agent && typeof agent.setMessages === 'function') {
      agent.setMessages([]);
    }
  }, [agent]);

  // Stop current generation
  const stopGeneration = useCallback(() => {
    if (copilotkit) {
      copilotkit.stopAgent({ agent: agentId as any });
    }
  }, [copilotkit, agentId]);

  // Loading state - derive from agent state
  const isLoading = agent?.isRunning ?? false;

  return {
    messages,
    setMessages,
    deleteMessage,
    isLoading,
    sendMessage,
    reloadMessages,
    reset,
    stopGeneration,
  };
}
