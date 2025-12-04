import { useEffect, useState, useCallback, useRef } from 'react';
import * as Ably from 'ably';

// Debug toggle (set false in production)
const DEBUG = true;
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const log = (...args: unknown[]) => DEBUG && console.log(ts(), ...args);
const err = (...args: unknown[]) => console.error(ts(), ...args);

export interface UsageData {
  session_id: string;
  agent_type: string;
  model: string;
  request_tokens: number;
  response_tokens: number;
  total_tokens: number;
  timestamp: string;
}

export interface CumulativeUsage {
  request: number;
  response: number;
  total: number;
  requestCount: number;
}

export interface UseUsageStreamReturn {
  lastUsage: UsageData | null;
  cumulativeUsage: CumulativeUsage;
  isConnected: boolean;
  error: string | null;
  resetCumulative: () => void;
  setCumulative: (usage: CumulativeUsage) => void;
  setLastUsage: (usage: UsageData | null) => void;
}

const createEmptyCumulative = (): CumulativeUsage => ({
  request: 0,
  response: 0,
  total: 0,
  requestCount: 0,
});

const cloneCumulative = (usage?: CumulativeUsage): CumulativeUsage => ({
  request: usage?.request ?? 0,
  response: usage?.response ?? 0,
  total: usage?.total ?? 0,
  requestCount: usage?.requestCount ?? 0,
});

// Shared Ably client instance (singleton pattern)
let sharedAblyClient: Ably.Realtime | null = null;
let clientRefCount = 0;

const getAblyClient = (apiKey: string): Ably.Realtime => {
  if (!sharedAblyClient) {
    sharedAblyClient = new Ably.Realtime({ key: apiKey });
    log('[useUsageStream] Created shared Ably client');
  }
  clientRefCount++;
  return sharedAblyClient;
};

const releaseAblyClient = () => {
  clientRefCount--;
  if (clientRefCount <= 0 && sharedAblyClient) {
    log('[useUsageStream] Closing shared Ably client');
    sharedAblyClient.close();
    sharedAblyClient = null;
    clientRefCount = 0;
  }
};

/**
 * Custom hook to stream usage statistics via Ably Pub/Sub.
 * 
 * Subscribes to session-specific usage channels and receives
 * real-time updates when the backend publishes usage data.
 */
export function useUsageStream(
  sessionId: string | null,
  enabled: boolean = true,
  ablyKey: string = '',
  initialCumulative?: CumulativeUsage,
  initialLastUsage?: UsageData | null,
): UseUsageStreamReturn {
  const [lastUsage, setLastUsageState] = useState<UsageData | null>(initialLastUsage ?? null);
  const [cumulativeUsage, setCumulativeState] = useState<CumulativeUsage>(
    () => cloneCumulative(initialCumulative)
  );
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<Ably.RealtimeChannel | null>(null);
  const clientRef = useRef<Ably.Realtime | null>(null);
  const listenersAttachedRef = useRef(false);

  // Update cumulative when initial values change (e.g., from DB)
  useEffect(() => {
    if (initialCumulative) {
      const hasRealData = 
        initialCumulative.request > 0 || 
        initialCumulative.response > 0 || 
        initialCumulative.total > 0;
      
      if (hasRealData) {
        setCumulativeState(prev => {
          const incomingTotal = initialCumulative.total || (initialCumulative.request + initialCumulative.response);
          const currentTotal = prev.total || (prev.request + prev.response);
          
          if (incomingTotal > currentTotal) {
            return cloneCumulative(initialCumulative);
          }
          return prev;
        });
      }
    }
    if (initialLastUsage) {
      setLastUsageState(initialLastUsage);
    }
  }, [initialCumulative, initialLastUsage]);

  useEffect(() => {
    if (!sessionId || !enabled || !ablyKey) {
      // Cleanup channel subscription only (keep client alive for other sessions)
      if (channelRef.current) {
        log(`[useUsageStream] Unsubscribing from channel`);
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      if (clientRef.current) {
        releaseAblyClient();
        clientRef.current = null;
        listenersAttachedRef.current = false;
      }
      setIsConnected(false);
      
      if (!ablyKey && enabled && sessionId) {
        log('[useUsageStream] Ably key not configured');
      }
      return;
    }

    const channelName = `usage:${sessionId}`;
    log(`[useUsageStream] Subscribing to channel: ${channelName}`);

    try {
      const client = getAblyClient(ablyKey);
      clientRef.current = client;

      // Connection state handlers (only attach once per client)
      const onConnected = () => {
        log('[useUsageStream] Connected to Ably!');
        setIsConnected(true);
        setError(null);
      };

      const onDisconnected = () => {
        log('[useUsageStream] Disconnected from Ably (will auto-reconnect)');
        setIsConnected(false);
      };

      const onFailed = () => {
        err('[useUsageStream] Ably connection failed');
        setIsConnected(false);
        setError('Connection failed');
      };

      // Only attach listeners if not already attached
      if (!listenersAttachedRef.current) {
        client.connection.on('connected', onConnected);
        client.connection.on('disconnected', onDisconnected);
        client.connection.on('failed', onFailed);
        listenersAttachedRef.current = true;
      }

      // Set initial connection state
      if (client.connection.state === 'connected') {
        setIsConnected(true);
      }

      // Get channel and subscribe
      const channel = client.channels.get(channelName);
      channelRef.current = channel;

      // Message handler
      const onMessage = (message: Ably.Message) => {
        try {
          const data = message.data as UsageData;
          log('[useUsageStream] Message received:', data);

          const requestTokens = Number(data.request_tokens) || 0;
          const responseTokens = Number(data.response_tokens) || 0;
          const totalTokens = Number(data.total_tokens) || requestTokens + responseTokens;

          setLastUsageState(data);
          setCumulativeState(prev => ({
            request: prev.request + requestTokens,
            response: prev.response + responseTokens,
            total: prev.total + totalTokens,
            requestCount: prev.requestCount + 1,
          }));
        } catch (e) {
          err('[useUsageStream] Failed to process message:', e);
        }
      };

      channel.subscribe('update', onMessage);

      // Cleanup on unmount or dependency change
      return () => {
        log(`[useUsageStream] Cleanup: unsubscribing from ${channelName}`);
        channel.unsubscribe('update', onMessage);
        
        // Only remove listeners and release client if we're the last user
        if (clientRef.current) {
          releaseAblyClient();
          clientRef.current = null;
          listenersAttachedRef.current = false;
        }
        channelRef.current = null;
      };

    } catch (e) {
      err('[useUsageStream] Error setting up Ably:', e);
      setError(e instanceof Error ? e.message : 'Failed to connect');
      return undefined;
    }
  }, [sessionId, enabled, ablyKey]);

  const resetCumulative = useCallback(() => {
    setCumulativeState(createEmptyCumulative());
    setLastUsageState(null);
  }, []);

  const setCumulative = useCallback((usage: CumulativeUsage) => {
    setCumulativeState(cloneCumulative(usage));
  }, []);

  const setLastUsage = useCallback((usage: UsageData | null) => {
    setLastUsageState(usage);
  }, []);

  return {
    lastUsage,
    cumulativeUsage,
    isConnected,
    error,
    resetCumulative,
    setCumulative,
    setLastUsage,
  };
}
