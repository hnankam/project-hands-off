/**
 * @fileoverview Session URL Synchronization Hook
 * 
 * Manages synchronization between URL session ID and active session.
 * Only applies URL session ID once on initial load to avoid interfering
 * with manual tab switches.
 */

import { useEffect, useRef } from 'react';
import { sessionStorageDBWrapper } from '@extension/shared';
import { getCurrentViewMode, getSessionIdFromUrl } from '../utils/windowManager';

export interface Session {
  id: string;
  [key: string]: any;
}

export function useSessionUrlSync(
  sessions: Session[],
  currentSessionId: string | null,
  activePage: string,
  onPageChange: (page: 'sessions') => void
): void {
  const urlSessionIdAppliedRef = useRef<string | null>(null);
  
  useEffect(() => {
    const viewMode = getCurrentViewMode();
    const urlSessionId = getSessionIdFromUrl();
    
    console.log('[SessionUrlSync] View mode:', { viewMode, urlSessionId, currentSessionId });
    
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
          console.log('[SessionUrlSync] Setting active session from URL (initial load):', urlSessionId);
          
          // Switch to the specified session
          sessionStorageDBWrapper.setActiveSession(urlSessionId).catch(err => {
            console.error('[SessionUrlSync] Failed to set active session from URL:', err);
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
        console.warn('[SessionUrlSync] Session ID from URL not found:', urlSessionId);
      }
    }
  }, [sessions, currentSessionId, activePage, onPageChange]);
}

