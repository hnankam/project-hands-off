/**
 * ================================================================================
 * useSessionCache Hook
 * ================================================================================
 * 
 * Manages which sessions should remain mounted using LRU (Least Recently Used) eviction.
 * 
 * Behavior:
 * - On panel open, only the active session is mounted
 * - When a session is visited, it's added to the cache and mounted
 * - Sessions stay mounted between tab switches until evicted
 * - LRU eviction removes least recently used sessions when cache exceeds max size
 * - Archived sessions (isOpen=false) are automatically removed from cache
 * 
 * @module useSessionCache
 * ================================================================================
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { debug } from '@extension/shared';
import type { SessionMetadata } from '@extension/shared';

/** Default maximum number of sessions to keep mounted */
export const DEFAULT_MAX_CACHED_SESSIONS = 5;

interface UseSessionCacheParams {
  /** All sessions (open and archived) */
  sessions: SessionMetadata[];
  /** Currently active session ID */
  currentSessionId: string | null;
  /** Maximum number of sessions to keep mounted (default: 5) */
  maxCachedSessions?: number;
}

interface UseSessionCacheReturn {
  /** Set of session IDs that should be mounted */
  mountedSessionIds: Set<string>;
  /** Check if a session should be mounted */
  isMounted: (sessionId: string) => boolean;
  /** Manually evict a session from the cache */
  evict: (sessionId: string) => void;
  /** Get cache statistics */
  getCacheStats: () => { size: number; maxSize: number; ids: string[] };
}

/**
 * Hook that manages session mounting with LRU eviction
 */
export function useSessionCache({
  sessions,
  currentSessionId,
  maxCachedSessions = DEFAULT_MAX_CACHED_SESSIONS,
}: UseSessionCacheParams): UseSessionCacheReturn {
  // LRU cache: array where index 0 is most recently used
  // We use an array to maintain order, and a Set for O(1) lookups
  const [lruOrder, setLruOrder] = useState<string[]>(() => 
    currentSessionId ? [currentSessionId] : []
  );
  
  // Track open session IDs for quick lookup
  const openSessionIdsRef = useRef<Set<string>>(new Set());
  
  // Update open session IDs when sessions change
  useEffect(() => {
    openSessionIdsRef.current = new Set(
      sessions.filter(s => s.isOpen).map(s => s.id)
    );
  }, [sessions]);

  // PERFORMANCE FIX: Track currentSessionId in ref to avoid recreating touchSession on every session change
  const currentSessionIdRef = useRef(currentSessionId);
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  /**
   * Add session to cache (move to front if already exists)
   */
  const touchSession = useCallback((sessionId: string) => {
    if (!sessionId) return;
    
    setLruOrder(prev => {
      // Remove if exists (we'll add to front)
      const filtered = prev.filter(id => id !== sessionId);
      // Add to front (most recently used)
      const updated = [sessionId, ...filtered];
      
      // Evict if over limit (keep active session even if it's oldest)
      if (updated.length > maxCachedSessions) {
        // Find sessions to evict (from end, but skip current session)
        // Use ref to avoid dependency on currentSessionId
        const toEvict: string[] = [];
        for (let i = updated.length - 1; i >= 0 && updated.length - toEvict.length > maxCachedSessions; i--) {
          if (updated[i] !== currentSessionIdRef.current) {
            toEvict.push(updated[i]);
          }
        }
        
        if (toEvict.length > 0) {
          debug.log('[useSessionCache] Evicting LRU sessions:', toEvict);
          return updated.filter(id => !toEvict.includes(id));
        }
      }
      
      return updated;
    });
  }, [maxCachedSessions]); // ✅ FIXED: Removed currentSessionId dependency

  /**
   * When current session changes, add it to cache
   */
  useEffect(() => {
    if (currentSessionId) {
      touchSession(currentSessionId);
    }
  }, [currentSessionId, touchSession]);

  /**
   * Remove archived sessions from cache
   */
  useEffect(() => {
    setLruOrder(prev => {
      const openIds = openSessionIdsRef.current;
      const filtered = prev.filter(id => openIds.has(id));
      
      if (filtered.length !== prev.length) {
        const removed = prev.filter(id => !openIds.has(id));
        debug.log('[useSessionCache] Removed archived sessions from cache:', removed);
        return filtered;
      }
      
      return prev;
    });
  }, [sessions]);

  /**
   * Manually evict a session from cache
   */
  const evict = useCallback((sessionId: string) => {
    if (sessionId === currentSessionId) {
      debug.warn('[useSessionCache] Cannot evict active session');
      return;
    }
    
    setLruOrder(prev => {
      const filtered = prev.filter(id => id !== sessionId);
      if (filtered.length !== prev.length) {
        debug.log('[useSessionCache] Manually evicted session:', sessionId);
      }
      return filtered;
    });
  }, [currentSessionId]);

  /**
   * Check if a session should be mounted
   */
  const isMounted = useCallback((sessionId: string): boolean => {
    return lruOrder.includes(sessionId);
  }, [lruOrder]);

  /**
   * Get cache statistics
   */
  const getCacheStats = useCallback(() => ({
    size: lruOrder.length,
    maxSize: maxCachedSessions,
    ids: [...lruOrder],
  }), [lruOrder, maxCachedSessions]);

  // PERFORMANCE FIX: Memoize Set to prevent new object on every render
  // This prevents unnecessary re-renders in components that depend on mountedSessionIds
  const mountedSessionIds = useMemo(() => new Set(lruOrder), [lruOrder]);

  return {
    mountedSessionIds,
    isMounted,
    evict,
    getCacheStats,
  };
}

