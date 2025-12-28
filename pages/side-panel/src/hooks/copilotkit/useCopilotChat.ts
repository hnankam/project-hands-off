/**
 * Centralized CopilotKit Chat Hook
 *
 * V2 Implementation using shared agent from SharedAgentProvider.
 * Requires SharedAgentProvider to be present in the component tree.
 * Suggestions are configured separately via useCopilotSuggestions hook.
 */

import { useCopilotKit } from '@copilotkit/react-core/v2';
import type { Message } from '@ag-ui/core';
import { useMemo, useCallback } from 'react';
import { useCopilotAgent } from './useCopilotAgent';

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
  // ARCHITECTURE CHANGE: Use useCopilotAgent which supports SharedAgentProvider context
  // This ensures multiple hooks share a single connection to the runtime server
  const { 
    agent, 
    messages: agentMessages, 
    setMessages: agentSetMessages, 
    running: agentIsRunning 
  } = useCopilotAgent({ agentId });

  // CopilotKit core for stopAgent and other utilities
  const { copilotkit } = useCopilotKit();

  // Memoize messages to prevent unnecessary re-renders
  const messages = useMemo(() => {
    return (agentMessages ?? []) as Message[];
  }, [agentMessages]);

  // Set messages
  const setMessages = useCallback((newMessages: Message[]) => {
    agentSetMessages(newMessages);
  }, [agentSetMessages]);

  // Delete message by ID - filter and use agent.setMessages()
  const deleteMessage = useCallback((messageId: string) => {
    const filtered = (agentMessages ?? []).filter((m: Message) => m.id !== messageId);
    agentSetMessages(filtered);
  }, [agentMessages, agentSetMessages]);

  // Send a new message - V2 implementation
  // Call agent.runAgent() directly to bypass CopilotKit runtime caching
  const sendMessage = useCallback(async (message: Message) => {
    if (!agent) {
      console.warn('[useCopilotChat] sendMessage: agent not available');
      return;
    }
    
    try {
      // Add message to agent's message list
      if (typeof agent.addMessage === 'function') {
        agent.addMessage(message);
      }
      
      if (typeof agent.runAgent === 'function') {
        await agent.runAgent();
      }
      
    } catch (error) {
      console.error('[useCopilotChat] Error sending message:', error);
      throw error;
    }
  }, [agent]);

  // Reload/regenerate messages
  const reloadMessages = useCallback(async (_messageId?: string) => {
    // In V2, explicitly call runAgent to re-run
    if (agent && typeof agent.runAgent === 'function') {
      await agent.runAgent();
    } else if (agent && typeof agent.setMessages === 'function') {
      // Fallback: refresh messages array
      const currentMessages = agent.messages ?? [];
      agent.setMessages([...currentMessages]);
    }
  }, [agent]);

  // Reset chat state
  const reset = useCallback(() => {
    agentSetMessages([]);
  }, [agentSetMessages]);

  // Stop current generation
  const stopGeneration = useCallback(() => {
    if (copilotkit) {
      copilotkit.stopAgent({ agent: agentId as any });
    }
  }, [copilotkit, agentId]);

  // Loading state - derive from agent state
  const isLoading = agentIsRunning;

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
