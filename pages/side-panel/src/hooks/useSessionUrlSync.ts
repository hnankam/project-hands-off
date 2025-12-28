/**
 * ================================================================================
 * useSessionUrlSync Hook
 * ================================================================================
 * 
 * Manages synchronization between URL session ID and active session.
 * Only applies URL session ID once on initial load to avoid interfering
 * with manual tab switches.
 * 
 * Features:
 * - Applies URL session ID on initial load (newtab/popup mode)
 * - Prevents overriding manual tab switches
 * - Validates session existence before switching
 * - Ensures user is on sessions page
 * 
 * @module useSessionUrlSync
 * ================================================================================
 */

import { useEffect, useRef, useCallback } from 'react';
import { sessionStorageDBWrapper, debug } from '@extension/shared';
import { getCurrentViewMode, getSessionIdFromUrl } from '../utils/windowManager';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Minimal session interface for URL sync.
 * Compatible with SessionMetadata from session-schema.
 */
export interface Session {
  /** Unique session identifier */
  id: string;
}

/**
 * Props for useSessionUrlSync hook
 */
export interface UseSessionUrlSyncProps {
  /** List of available sessions */
  sessions: Session[];
  /** Currently active session ID */
  currentSessionId: string | null;
  /** Current active page */
  activePage: string;
  /** Callback to change page */
  onPageChange: (page: 'sessions') => void;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook to synchronize URL session ID with active session.
 * 
 * This hook applies the session ID from the URL to the active session,
 * but only on initial load. It won't override manual tab switches.
 * 
 * @param props - Configuration object
 * @param props.sessions - List of available sessions
 * @param props.currentSessionId - Currently active session ID
 * @param props.activePage - Current active page
 * @param props.onPageChange - Callback to change page
 * 
 * @example
 * ```tsx
 * useSessionUrlSync({
 *   sessions,
 *   currentSessionId,
 *   activePage,
 *   onPageChange: (page) => setActivePage(page)
 * });
 * ```
 */
export function useSessionUrlSync({
  sessions,
  currentSessionId,
  activePage,
  onPageChange
}: UseSessionUrlSyncProps): void {
  // Track which URL session ID has been applied to prevent re-application
  const urlSessionIdAppliedRef = useRef<string | null>(null);
  // Track if we've already logged the view mode to reduce duplicate logs
  const hasLoggedViewModeRef = useRef(false);
  // Store stable session IDs string for comparison (avoids array reference changes)
  const sessionsIdsRef = useRef<string>('');
  // Track last logged values to prevent duplicate logs
  const lastLoggedValuesRef = useRef<{ urlSessionId: string | null; currentSessionId: string | null }>({
    urlSessionId: null,
    currentSessionId: null,
  });
  
  useEffect(() => {
    const viewMode = getCurrentViewMode();
    const urlSessionId = getSessionIdFromUrl();
    
    // Create stable sessions ID string for comparison
    const currentSessionsIds = sessions.map(s => s.id).sort().join(',');
    const sessionsChanged = sessionsIdsRef.current !== currentSessionsIds;
    if (sessionsChanged) {
      sessionsIdsRef.current = currentSessionsIds;
    }
    
    // Only log when values actually change (not just on every render)
    const valuesChanged = 
      lastLoggedValuesRef.current.urlSessionId !== urlSessionId ||
      lastLoggedValuesRef.current.currentSessionId !== currentSessionId ||
      sessionsChanged;
    
    if (!hasLoggedViewModeRef.current || valuesChanged) {
    debug.log('[useSessionUrlSync] View mode:', { viewMode, urlSessionId, currentSessionId });
      hasLoggedViewModeRef.current = true;
      lastLoggedValuesRef.current = { urlSessionId, currentSessionId };
    }
    
    // Only apply URL session ID if:
    // 1. We're in a new tab or popup context
    // 2. URL has a session ID
    // 3. We haven't already applied this URL session ID (to prevent overriding manual switches)
    // 4. Sessions are loaded
    if ((viewMode === 'newtab' || viewMode === 'popup') && urlSessionId && sessions.length > 0) {
      // Check if we've already applied this URL session ID
      if (urlSessionIdAppliedRef.current === urlSessionId) {
        // Already applied, don't override manual tab switches
        return;
      }
      
      // Check if the session exists
      const sessionExists = sessions.some(s => s.id === urlSessionId);
      
      if (sessionExists) {
        // Only apply if current session doesn't match (initial load scenario)
        if (urlSessionId !== currentSessionId) {
          debug.log('[useSessionUrlSync] Setting active session from URL (initial load):', urlSessionId);
          
          // Switch to the specified session
          sessionStorageDBWrapper.setActiveSession(urlSessionId).catch(err => {
            debug.error('[useSessionUrlSync] Failed to set active session from URL:', err);
          });
          
          // Mark this URL session ID as applied
          urlSessionIdAppliedRef.current = urlSessionId;
          
          // Ensure we're on the sessions page
          if (activePage !== 'sessions') {
            onPageChange('sessions');
          }
        } else {
          // Current session already matches URL, mark as applied
          urlSessionIdAppliedRef.current = urlSessionId;
        }
      } else {
        debug.warn('[useSessionUrlSync] Session ID from URL not found:', urlSessionId);
      }
    }
  }, [sessions, currentSessionId, activePage, onPageChange]);
}
