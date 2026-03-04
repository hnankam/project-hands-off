/**
 * ================================================================================
 * usePendingInvitations Hook
 * ================================================================================
 * 
 * Automatically checks for pending invitations when a user logs in.
 * This handles the case where a user received an invitation before
 * installing the extension.
 * 
 * Features:
 * - Fetches pending invitations from API
 * - Cancellable requests with AbortController
 * - Automatic cleanup on unmount
 * - Provides refresh functionality
 * 
 * @module usePendingInvitations
 * ================================================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { debug } from '@extension/shared';
import { API_CONFIG } from '../constants';

// ============================================================================
// TYPES
// ============================================================================

interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
  };
  inviter: {
    email: string;
    name: string | null;
  };
  expiresAt: string;
  createdAt: string;
}

interface UsePendingInvitationsReturn {
  invitations: PendingInvitation[];
  loading: boolean;
  error: string | null;
  count: number;
  hasPendingInvitations: boolean;
  refresh: () => void;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Type guard to check if error has a message property.
 */
function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as any).message === 'string'
  );
}

/**
 * Safely extract error message from unknown error type.
 */
function getErrorMessage(error: unknown): string {
  if (isErrorWithMessage(error)) {
    return error.message;
  }
  return String(error);
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook to check for pending organization invitations.
 * 
 * Automatically fetches invitations when user logs in and provides
 * manual refresh functionality.
 * 
 * @returns Object containing invitations, loading state, and refresh function
 * 
 * @example
 * ```tsx
 * const { invitations, hasPendingInvitations, loading, refresh } = usePendingInvitations();
 * 
 * if (hasPendingInvitations) {
 *   return <InvitationBanner invitations={invitations} onAccept={refresh} />;
 * }
 * ```
 */
export function usePendingInvitations(): UsePendingInvitationsReturn {
  const { session } = useAuth();
  
  // ============================================================================
  // STATE
  // ============================================================================
  
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================================================
  // REFS
  // ============================================================================
  
  // Track abort controller for cleanup
  const abortControllerRef = useRef<AbortController | null>(null);

  // ============================================================================
  // CALLBACKS
  // ============================================================================

  /**
   * Fetch pending invitations from API for the given email.
   * Cancellable via AbortController.
   */
  const checkPendingInvitations = useCallback(async (email: string): Promise<void> => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    setLoading(true);
    setError(null);

    try {
      const baseURL = API_CONFIG.BASE_URL;
      const url = `${baseURL}/api/invitations/user/${encodeURIComponent(email)}`;
      
      debug.log('[usePendingInvitations] Checking invitations for:', email);
      
      const response = await fetch(url, { signal: abortController.signal });
      
      // Check if request was aborted
      if (abortController.signal.aborted) {
        return;
      }
      
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to check invitations');
      }

      const invitationCount = data.invitations?.length || 0;
      debug.log(`[usePendingInvitations] Found ${invitationCount} pending invitation(s)`);
      
      setInvitations(data.invitations || []);
    } catch (err: unknown) {
      // Don't log or set error if request was aborted
      if (err instanceof Error && err.name === 'AbortError') {
        debug.log('[usePendingInvitations] Request cancelled');
        return;
      }
      
      const errorMessage = getErrorMessage(err);
      debug.error('[usePendingInvitations] Failed to check invitations:', errorMessage);
      setError(errorMessage);
      setInvitations([]);
    } finally {
      // Only update loading state if this request wasn't aborted
      if (!abortController.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  /**
   * Manually refresh pending invitations.
   * Uses current session email.
   */
  const refresh = useCallback(() => {
    if (session?.user?.email) {
      checkPendingInvitations(session.user.email);
    }
  }, [session?.user?.email, checkPendingInvitations]);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  /**
   * Auto-fetch invitations when user email changes (login/logout).
   */
  useEffect(() => {
    if (session?.user?.email) {
      checkPendingInvitations(session.user.email);
    } else {
      // Clear invitations when user logs out
      setInvitations([]);
      setError(null);
    }
    
    // Cleanup: Cancel pending request on unmount or email change
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [session?.user?.email, checkPendingInvitations]);

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    invitations,
    loading,
    error,
    count: invitations.length,
    hasPendingInvitations: invitations.length > 0,
    refresh,
  };
}
