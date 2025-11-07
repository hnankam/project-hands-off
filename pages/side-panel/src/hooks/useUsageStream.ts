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
  setLastUsage: (usage: UsageData | null) => void;
}

type ConnectionSnapshot = {
  lastUsage: UsageData | null;
  cumulativeUsage: CumulativeUsage;
  isConnected: boolean;
  error: string | null;
};

interface ConnectionEntry {
  key: string;
  sessionId: string;
  wsUrl: string;
  ws: WebSocket | null;
  listeners: Set<(snapshot: ConnectionSnapshot) => void>;
  enabledCount: number;
  reconnectAttempts: number;
  reconnectTimeout: NodeJS.Timeout | null;
  immediateFailureCount: number;
  connectionOpenedAt: number;
  hasReceivedMessage: boolean;
  lastUsage: UsageData | null;
  cumulativeUsage: CumulativeUsage;
  isConnected: boolean;
  error: string | null;
  pingInterval: NodeJS.Timeout | null;
  initializedFromStorage: boolean;
}

const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;

const connectionPool = new Map<string, ConnectionEntry>();

const createEmptyCumulative = (): CumulativeUsage => ({
  request: 0,
  response: 0,
  total: 0,
  requestCount: 0,
});

const normalizeWsUrl = (url: string): string => {
  if (!url) {
    return '';
  }
  return url.endsWith('/') ? url.slice(0, -1) : url;
};

const cloneCumulative = (usage?: CumulativeUsage): CumulativeUsage => ({
  request: usage?.request ?? 0,
  response: usage?.response ?? 0,
  total: usage?.total ?? 0,
  requestCount: usage?.requestCount ?? 0,
});

const createSnapshot = (entry: ConnectionEntry): ConnectionSnapshot => ({
  lastUsage: entry.lastUsage,
  cumulativeUsage: cloneCumulative(entry.cumulativeUsage),
  isConnected: entry.isConnected,
  error: entry.error,
});

const notifyListeners = (entry: ConnectionEntry) => {
  const snapshot = createSnapshot(entry);
  entry.listeners.forEach(listener => {
    try {
      listener(snapshot);
    } catch (e) {
      err('Listener error in useUsageStream:', e);
    }
  });
};

const cleanupEntryIfIdle = (entry: ConnectionEntry) => {
  if (entry.enabledCount > 0 || entry.listeners.size > 0) {
    return;
  }

  log(`🧹 [useUsageStream] Cleaning up entry for session ${entry.sessionId}`);

  if (entry.reconnectTimeout) {
    clearTimeout(entry.reconnectTimeout);
    entry.reconnectTimeout = null;
  }

  if (entry.pingInterval) {
    clearInterval(entry.pingInterval);
    entry.pingInterval = null;
  }

  if (entry.ws) {
    try {
      entry.ws.close();
    } catch {}
    entry.ws = null;
  }

  connectionPool.delete(entry.key);
};

const scheduleReconnect = (entry: ConnectionEntry) => {
  if (entry.enabledCount <= 0) {
    cleanupEntryIfIdle(entry);
    return;
  }

  if (entry.reconnectAttempts >= DEFAULT_MAX_RECONNECT_ATTEMPTS) {
    entry.error = 'Max reconnection attempts reached';
    notifyListeners(entry);
    return;
  }

  entry.reconnectAttempts += 1;
  const delay = Math.min(1000 * Math.pow(2, entry.reconnectAttempts), 30000);
  log(
    `🔄 [useUsageStream] Reconnecting session ${entry.sessionId} in ${delay}ms ` +
      `(attempt ${entry.reconnectAttempts}/${DEFAULT_MAX_RECONNECT_ATTEMPTS})`,
  );

  if (entry.reconnectTimeout) {
    clearTimeout(entry.reconnectTimeout);
  }

  entry.reconnectTimeout = setTimeout(() => {
    entry.reconnectTimeout = null;
    ensureConnection(entry);
  }, delay);
};

const ensureConnection = (entry: ConnectionEntry) => {
  if (entry.enabledCount <= 0) {
    log(`[useUsageStream] Skipping connection for session ${entry.sessionId} (no enabled listeners)`);
    return;
  }

  if (
    entry.ws &&
    (entry.ws.readyState === WebSocket.OPEN || entry.ws.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  if (entry.reconnectTimeout) {
    clearTimeout(entry.reconnectTimeout);
    entry.reconnectTimeout = null;
  }

  if (entry.ws) {
    try {
      entry.ws.close();
    } catch {}
    entry.ws = null;
  }

  const baseUrl = entry.wsUrl || 'ws://localhost:8001';
  const url = `${baseUrl}/ws/usage/${entry.sessionId}`;

  log(`🔌 [useUsageStream] Opening WebSocket for session ${entry.sessionId}: ${url}`);

  try {
    const ws = new WebSocket(url);
    entry.ws = ws;
    entry.connectionOpenedAt = 0;
    entry.hasReceivedMessage = false;

    ws.onopen = () => {
      log(`✅ [useUsageStream] WebSocket connected for session ${entry.sessionId}`);
      entry.isConnected = true;
      entry.error = null;
      entry.reconnectAttempts = 0;
      entry.connectionOpenedAt = Date.now();
      entry.immediateFailureCount = 0;
      notifyListeners(entry);

      if (entry.pingInterval) {
        clearInterval(entry.pingInterval);
      }

      entry.pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
        }
      }, 30000);
    };

    ws.onmessage = event => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'pong') {
          return;
        }

        const requestTokens = Number(data.request_tokens) || 0;
        const responseTokens = Number(data.response_tokens) || 0;
        const totalTokens = Number(data.total_tokens) || requestTokens + responseTokens;

        entry.lastUsage = data;
        entry.cumulativeUsage = {
          request: entry.cumulativeUsage.request + requestTokens,
          response: entry.cumulativeUsage.response + responseTokens,
          total: entry.cumulativeUsage.total + totalTokens,
          requestCount: entry.cumulativeUsage.requestCount + 1,
        };

        entry.hasReceivedMessage = true;
        notifyListeners(entry);
      } catch (e) {
        err('❌ [useUsageStream] Failed to parse WebSocket message:', e);
      }
    };

    ws.onerror = event => {
      err('❌ [useUsageStream] WebSocket error:', event);
      entry.error = 'WebSocket connection error';
      notifyListeners(entry);
    };

    ws.onclose = event => {
      const duration = entry.connectionOpenedAt ? Date.now() - entry.connectionOpenedAt : 0;
      log('🔌 [useUsageStream] WebSocket closed', {
        sessionId: entry.sessionId,
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        duration,
      });

      entry.isConnected = false;
      notifyListeners(entry);

      if (entry.pingInterval) {
        clearInterval(entry.pingInterval);
        entry.pingInterval = null;
      }

      entry.ws = null;

      const neverOpened = entry.connectionOpenedAt === 0;
      const closedImmediately =
        entry.connectionOpenedAt > 0 && duration < 200 && !entry.hasReceivedMessage;
      const immediateFailure = neverOpened || closedImmediately;

      if (immediateFailure) {
        entry.immediateFailureCount += 1;
        log(
          `⚠️ [useUsageStream] Immediate failure for session ${entry.sessionId} ` +
            `(${entry.immediateFailureCount}/3)`,
        );

        if (entry.immediateFailureCount >= 3) {
          entry.error = 'Connection rejected by server (limit may be reached)';
          notifyListeners(entry);
          return;
        }
      } else {
        entry.immediateFailureCount = 0;
      }

      if (entry.enabledCount > 0) {
        scheduleReconnect(entry);
      } else {
        cleanupEntryIfIdle(entry);
      }
    };
  } catch (error) {
    err('❌ [useUsageStream] Error creating WebSocket:', error);
    entry.error = error instanceof Error ? error.message : 'Connection failed';
    notifyListeners(entry);
    scheduleReconnect(entry);
  }
};

const getOrCreateEntry = (
  sessionId: string,
  wsUrl: string,
  initialCumulative?: CumulativeUsage,
  initialLastUsage?: UsageData | null,
): ConnectionEntry => {
  const normalizedUrl = normalizeWsUrl(wsUrl || 'ws://localhost:8001');
  const key = `${normalizedUrl}::${sessionId}`;
  const existing = connectionPool.get(key);

  if (existing) {
    const hasInitialData = Boolean(initialCumulative) || Boolean(initialLastUsage);
    if (hasInitialData && !existing.initializedFromStorage) {
      if (initialCumulative) {
        existing.cumulativeUsage = cloneCumulative(initialCumulative);
      }
      if (initialLastUsage) {
        existing.lastUsage = initialLastUsage;
      }
      existing.initializedFromStorage = true;
      notifyListeners(existing);
    }
    return existing;
  }

  const entry: ConnectionEntry = {
    key,
    sessionId,
    wsUrl: normalizedUrl,
    ws: null,
    listeners: new Set(),
    enabledCount: 0,
    reconnectAttempts: 0,
    reconnectTimeout: null,
    immediateFailureCount: 0,
    connectionOpenedAt: 0,
    hasReceivedMessage: false,
    lastUsage: initialLastUsage ?? null,
    cumulativeUsage: cloneCumulative(initialCumulative),
    isConnected: false,
    error: null,
    pingInterval: null,
    initializedFromStorage: Boolean(initialCumulative || initialLastUsage),
  };

  connectionPool.set(key, entry);
  return entry;
};

const incrementEnabled = (entry: ConnectionEntry) => {
  entry.enabledCount += 1;
  ensureConnection(entry);
};

const decrementEnabled = (entry: ConnectionEntry) => {
  if (entry.enabledCount > 0) {
    entry.enabledCount -= 1;
  }

  if (entry.enabledCount === 0) {
    if (entry.reconnectTimeout) {
      clearTimeout(entry.reconnectTimeout);
      entry.reconnectTimeout = null;
    }

    if (entry.ws) {
      try {
        entry.ws.close();
      } catch {}
    } else {
      cleanupEntryIfIdle(entry);
    }
  }
};

/**
 * Custom hook to stream usage statistics via WebSocket.
 * Ensures only one underlying WebSocket connection per session, shared across all hook consumers.
 */
export function useUsageStream(
  sessionId: string | null,
  enabled: boolean = true,
  wsUrl: string = 'ws://localhost:8001',
  initialCumulative?: CumulativeUsage,
  initialLastUsage?: UsageData | null,
): UseUsageStreamReturn {
  const [snapshot, setSnapshot] = useState<ConnectionSnapshot>(() => ({
    lastUsage: initialLastUsage ?? null,
    cumulativeUsage: cloneCumulative(initialCumulative),
    isConnected: false,
    error: null,
  }));

  const entryRef = useRef<ConnectionEntry | null>(null);
  const enabledRef = useRef<boolean>(false);

  useEffect(() => {
    if (!sessionId) {
      setSnapshot({
        lastUsage: null,
        cumulativeUsage: cloneCumulative(initialCumulative),
        isConnected: false,
        error: null,
      });
      const previousEntry = entryRef.current;
      if (previousEntry && enabledRef.current) {
        decrementEnabled(previousEntry);
      }
      entryRef.current = null;
      enabledRef.current = false;
      return;
    }

    const entry = getOrCreateEntry(sessionId, wsUrl, initialCumulative, initialLastUsage);
    entryRef.current = entry;

    const listener = (state: ConnectionSnapshot) => {
      setSnapshot(state);
    };

    entry.listeners.add(listener);
    listener(createSnapshot(entry));

    if (enabled) {
      incrementEnabled(entry);
      enabledRef.current = true;
    } else {
      enabledRef.current = false;
    }

    return () => {
      entry.listeners.delete(listener);

      if (enabledRef.current) {
        decrementEnabled(entry);
        enabledRef.current = false;
      }

      cleanupEntryIfIdle(entry);

      if (entryRef.current === entry) {
        entryRef.current = null;
      }
    };
    // Re-run when any dependency changes to update subscription/connection state
  }, [sessionId, wsUrl, enabled, initialCumulative, initialLastUsage]);

  const resetCumulative = useCallback(() => {
    const entry = entryRef.current;
    if (entry) {
      entry.cumulativeUsage = createEmptyCumulative();
      entry.lastUsage = null;
      notifyListeners(entry);
    } else {
      setSnapshot(prev => ({
        ...prev,
        lastUsage: null,
        cumulativeUsage: createEmptyCumulative(),
      }));
    }
  }, []);

  const setCumulative = useCallback((usage: CumulativeUsage) => {
    const entry = entryRef.current;
    if (entry) {
      entry.cumulativeUsage = cloneCumulative(usage);
      notifyListeners(entry);
    } else {
      setSnapshot(prev => ({
        ...prev,
        cumulativeUsage: cloneCumulative(usage),
      }));
    }
  }, []);

  const setLastUsage = useCallback((usage: UsageData | null) => {
    const entry = entryRef.current;
    if (entry) {
      entry.lastUsage = usage;
      notifyListeners(entry);
    } else {
      setSnapshot(prev => ({
        ...prev,
        lastUsage: usage,
      }));
    }
  }, []);

  return {
    lastUsage: snapshot.lastUsage,
    cumulativeUsage: snapshot.cumulativeUsage,
    isConnected: snapshot.isConnected,
    error: snapshot.error,
    resetCumulative,
    setCumulative,
    setLastUsage,
  };
}
