import { useEffect, useState, useRef, useCallback } from 'react';

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
  initialCumulative?: CumulativeUsage
): UseUsageStreamReturn {
  const [lastUsage, setLastUsage] = useState<UsageData | null>(null);
  const [cumulativeUsage, setCumulativeUsage] = useState<CumulativeUsage>(
    initialCumulative || {
      request: 0,
      response: 0,
      total: 0,
      requestCount: 0,
    }
  );
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

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
      console.log(`🔌 Connecting to usage WebSocket for session: ${sessionId}`);
      const ws = new WebSocket(`${wsUrl}/ws/usage/${sessionId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket connected');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
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

          console.log('📊 Usage update:', {
            request: data.request_tokens,
            response: data.response_tokens,
            total: data.total_tokens,
          });
        } catch (err) {
          console.error('❌ Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('❌ WebSocket error:', event);
        setError('WebSocket connection error');
      };

      ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect if enabled and haven't exceeded max attempts
        if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          console.log(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
          
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

    } catch (err) {
      console.error('❌ Error creating WebSocket:', err);
      setError(err instanceof Error ? err.message : 'Connection failed');
    }
  }, [sessionId, enabled, wsUrl]);

  // Connect when sessionId, enabled, or wsUrl changes
  useEffect(() => {
    if (sessionId && enabled) {
      connect();
    }

    // Cleanup on unmount or when dependencies change
    return () => {
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

        ws.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return {
    lastUsage,
    cumulativeUsage,
    isConnected,
    error,
    resetCumulative,
    setCumulative: setCumulativeUsage,
  };
}

