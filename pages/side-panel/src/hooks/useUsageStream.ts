import { useEffect, useState, useRef, useCallback } from 'react';

// Debug toggle (set false in production)
const DEBUG = true;
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const log = (...args: any[]) => DEBUG && console.log(ts(), ...args);
const err = (...args: any[]) => console.error(ts(), ...args);

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
}

/**
 * Custom hook to stream usage statistics via WebSocket
 * Connects to the backend WebSocket endpoint and receives real-time token usage updates
 */
export function useUsageStream(
  sessionId: string | null,
  enabled: boolean = true,
  wsUrl: string = 'ws://localhost:8001',
  initialCumulative?: CumulativeUsage,
): UseUsageStreamReturn {
  const [lastUsage, setLastUsage] = useState<UsageData | null>(null);
  const [cumulativeUsage, setCumulativeUsage] = useState<CumulativeUsage>(
    initialCumulative || {
      request: 0,
      response: 0,
      total: 0,
      requestCount: 0,
    },
  );
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const connectionOpenedAtRef = useRef<number>(0);
  const immediateFailureCountRef = useRef(0);
  const hasReceivedMessageRef = useRef(false);

  const resetCumulative = useCallback(() => {
    // Always reset to zeros, not to initial values
    setCumulativeUsage({
      request: 0,
      response: 0,
      total: 0,
      requestCount: 0,
    });
  }, []);

  const connect = useCallback(() => {
    if (!sessionId || !enabled) {
      return;
    }

    // If an existing socket is for a different session, close it to force reconnect
    if (wsRef.current && (wsRef.current as any)._sessionId && (wsRef.current as any)._sessionId !== sessionId) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
      // Reset failure counters when switching sessions
      immediateFailureCountRef.current = 0;
      reconnectAttemptsRef.current = 0;
    }

    // Prevent duplicate connections for the same session
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      log('useUsageStream: WebSocket already open or connecting for session', (wsRef.current as any)._sessionId);
      return;
    }

    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      log(`🔌 Connecting to usage WebSocket for session: ${sessionId}`);
      const ws = new WebSocket(`${wsUrl}/ws/usage/${sessionId}`);
      wsRef.current = ws;
      (ws as any)._sessionId = sessionId;
      hasReceivedMessageRef.current = false;

      ws.onopen = () => {
        log('✅ WebSocket connected');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        connectionOpenedAtRef.current = Date.now();
        immediateFailureCountRef.current = 0; // Reset on successful connection
      };

      ws.onmessage = event => {
        try {
          const data = JSON.parse(event.data);

          // Ignore pong messages
          if (data.type === 'pong') {
            return;
          }

          // Update last usage
          setLastUsage(data);

          // Accumulate tokens
          setCumulativeUsage(prev => ({
            request: prev.request + (data.request_tokens || 0),
            response: prev.response + (data.response_tokens || 0),
            total: prev.total + (data.total_tokens || 0),
            requestCount: prev.requestCount + 1,
          }));

          log('📊 Usage update:', {
            request: data.request_tokens,
            response: data.response_tokens,
            total: data.total_tokens,
          });

          hasReceivedMessageRef.current = true;
        } catch (e) {
          err('❌ Error parsing WebSocket message:', e);
        }
      };

      ws.onerror = event => {
        err('❌ WebSocket error:', event);
        setError('WebSocket connection error');
        // Close to trigger onclose reconnection path
        try {
          ws.close();
        } catch {}
      };

      ws.onclose = (event) => {
        const connectionDuration = Date.now() - connectionOpenedAtRef.current;
        log('🔌 WebSocket disconnected', { 
          code: event.code, 
          reason: event.reason,
          wasClean: event.wasClean,
          connectionDuration: `${connectionDuration}ms`,
          sessionId: (ws as any)._sessionId
        });
        setIsConnected(false);
        // Clear ping interval immediately on close
        if ((ws as any)._pingInterval) {
          clearInterval((ws as any)._pingInterval);
        }
        wsRef.current = null;

        // Only treat as "immediate failure" if connection never opened OR closed within 100ms
        // This indicates a server rejection (connection limit reached)
        // Normal disconnects after successful operation should not trigger immediate failure logic
        const neverOpened = connectionOpenedAtRef.current === 0;
        const closedImmediately =
          connectionOpenedAtRef.current > 0 && connectionDuration < 200 && !hasReceivedMessageRef.current;
        const isImmediateFailure = neverOpened || closedImmediately;
        
        if (isImmediateFailure) {
          immediateFailureCountRef.current++;
          log(
            `⚠️ Immediate connection failure detected (${immediateFailureCountRef.current}/3) - connection ${
              neverOpened ? 'never opened' : 'closed in ' + connectionDuration + 'ms'
            }, hasReceivedMessage=${hasReceivedMessageRef.current}`,
          );
          
          // If we've had 3+ immediate failures, stop reconnecting - likely server rejection
          if (immediateFailureCountRef.current >= 3) {
            log('❌ Multiple immediate failures detected - stopping reconnection (likely server connection limit reached)');
            setError('Connection rejected by server (limit may be reached)');
            return;
          }
        } else {
          // Reset immediate failure counter for normal disconnects
          immediateFailureCountRef.current = 0;
          log(
            `ℹ️ Normal disconnect after ${connectionDuration}ms (hasReceivedMessage=${hasReceivedMessageRef.current}) - will not count as immediate failure`,
          );
        }

        // Attempt to reconnect if enabled and haven't exceeded max attempts
        if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          log(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setError('Max reconnection attempts reached');
        }
      };

      // Send periodic pings to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
        }
      }, 30000); // 30 seconds

      // Store interval ID for cleanup
      (ws as any)._pingInterval = pingInterval;
    } catch (error) {
      err('❌ Error creating WebSocket:', error);
      setError(error instanceof Error ? error.message : 'Connection failed');
    }
  }, [sessionId, enabled, wsUrl]);

  // Connect when sessionId, enabled, or wsUrl changes
  useEffect(() => {
    log(`📍 useUsageStream effect triggered:`, { sessionId, enabled, hasExistingConnection: !!wsRef.current });
    
    if (sessionId && enabled) {
      connect();
    } else if (!enabled && wsRef.current) {
      log(`⏸️ Disabled - closing existing WebSocket connection for session ${sessionId}`);
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      log(`🧹 useUsageStream cleanup triggered for session ${sessionId}, enabled was: ${enabled}`);
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (wsRef.current) {
        const ws = wsRef.current;

        // Clear ping interval
        if ((ws as any)._pingInterval) {
          clearInterval((ws as any)._pingInterval);
        }

        log(`🛑 Closing WebSocket in cleanup for session ${(ws as any)._sessionId}`);
        ws.close();
        wsRef.current = null;
      }
    };
  }, [connect, sessionId, enabled]);

  return {
    lastUsage,
    cumulativeUsage,
    isConnected,
    error,
    resetCumulative,
    setCumulative: setCumulativeUsage,
  };
}
