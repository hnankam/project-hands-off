import React, { createContext, useContext, useMemo, useRef, useCallback, useEffect, memo, useState } from 'react';
import { useAgent } from '@copilotkit/react-core/v2';
import { debug } from '@extension/shared';

// --- Types ---

export interface CopilotAgentOptions<T> {
  agentId?: string;
  initialState?: T;
}

export interface CopilotAgentState<T> {
  name: string;
  nodeName: string | undefined;
  state: T;
  setState: (state: T | ((prev: T) => T)) => void;
  running: boolean;
  start: () => void;
  stop: () => void;
  run: (hint?: string) => void;
  messages: any[];
  setMessages: (messages: any[]) => void;
  agent: any;
}

// --- Configuration ---

const STABLE_AGENT_CONFIG = {
  agentId: 'dynamic_agent',
};

// --- Context ---

export const SharedAgentContext = createContext<CopilotAgentState<any> | null>(null);

/**
 * INTERNAL HOOK: Only used by SharedAgentProvider to establish the single connection.
 */
function useSharedAgentConnection<T>(sessionKey: string): CopilotAgentState<T> {
  // Establish the connection using the standard hook
  // We MUST call this unconditionally
  const agentResult = useAgent(STABLE_AGENT_CONFIG);
  const agentAny = agentResult.agent as any;
  
  // 1. Stabilize messages to prevent unnecessary re-renders when only reference changes
  const rawMessages = agentAny?.messages || [];
  const lastMessagesRef = useRef<any[]>([]);
  const messages = useMemo(() => {
    if (!rawMessages || rawMessages.length === 0) {
      if (lastMessagesRef.current.length > 0) {
        lastMessagesRef.current = [];
        return [];
      }
      return lastMessagesRef.current;
    }

    const hasChanged = 
      rawMessages.length !== lastMessagesRef.current.length ||
      rawMessages.some((m: any, i: number) => {
        const prev = lastMessagesRef.current[i];
        return m?.id !== prev?.id || m?.content !== prev?.content || m?.role !== prev?.role;
      });

    if (hasChanged) {
      lastMessagesRef.current = rawMessages;
      return rawMessages;
    }
    return lastMessagesRef.current;
  }, [rawMessages]);

  // Extract state to ensure reactivity to nested changes
  const agentState = agentAny?.state || {};
  
  // Return a stable interface that pulls from the hook's latest result
  // Include state in dependencies to ensure reactivity to nested changes
  return useMemo(() => {
    return {
      name: STABLE_AGENT_CONFIG.agentId,
      nodeName: agentAny?.nodeName,
      state: agentState,
      setState: (newState: any) => {
        return agentAny?.setState?.(newState);
      },
      running: agentAny?.isRunning || false,
      start: () => {},
      stop: () => agentAny?.stop?.(),
      run: (hint?: string) => agentAny?.run?.(hint),
      messages,
      setMessages: (newMessages: any[]) => agentAny?.setMessages?.(newMessages),
      agent: agentAny,
    };
  }, [agentAny, messages, agentState]);
}

/**
 * SharedAgentProvider: The ONLY component allowed to initiate a connection.
 * Now uses a "Mounting Gate" to prevent race conditions with CopilotChat.
 */
export const SharedAgentProvider: React.FC<{ children: React.ReactNode; sessionKey: string }> = memo(({ children, sessionKey }) => {
  // Mounting Gate
  const [isGateOpen, setIsGateOpen] = useState(false);
  const gateTimerRef = useRef<number | null>(null);
  
  useEffect(() => {
    // Reset gate when session changes
    setIsGateOpen(false);
    
    // Increased delay to ensure the connection is truly stable before children mount
    gateTimerRef.current = window.setTimeout(() => {
      setIsGateOpen(true);
    }, 350);
    
    return () => {
      if (gateTimerRef.current !== null) {
        clearTimeout(gateTimerRef.current);
        gateTimerRef.current = null;
      }
    };
  }, [sessionKey]);

  // Establish the SINGLE connection here
  const agentState = useSharedAgentConnection<any>(sessionKey);

  return React.createElement(
    SharedAgentContext.Provider, 
    { value: agentState }, 
    isGateOpen ? children : null
  );
}); // Removed custom comparison that was blocking child updates

/**
 * PUBLIC HOOK: Pure consumer of the shared agent.
 * Contains ZERO connection logic to prevent accidental redundant connections.
 */
export function useCopilotAgent<T>({
  agentId = 'dynamic_agent',
}: CopilotAgentOptions<T> = {}): CopilotAgentState<T> {
  const sharedAgent = useContext(SharedAgentContext);

  if (sharedAgent) {
    // Successfully using shared agent
    return sharedAgent as CopilotAgentState<T>;
  }

  return {
    name: agentId,
    nodeName: undefined,
    state: {} as T,
    setState: () => {},
    running: false,
    start: () => {},
    stop: () => {},
    run: () => {},
    messages: [],
    setMessages: () => {},
    agent: null,
  };
}
