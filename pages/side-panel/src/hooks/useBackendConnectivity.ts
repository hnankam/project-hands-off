/**
 * Hook to check connectivity to Backend Server URL.
 * Polls periodically for green/red status indicator (e.g. login page, status bar).
 */

import { useState, useEffect, useCallback } from 'react';
import { checkBackendServerConnectivity } from '@src/utils/backend-health-check';

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const INITIAL_DELAY_MS = 500; // Small delay before first check

export function useBackendConnectivity(): { isConnected: boolean | null } {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  const check = useCallback(async () => {
    try {
      const ok = await checkBackendServerConnectivity();
      setIsConnected(ok);
    } catch {
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    // Initial check after short delay
    const initialTimer = setTimeout(check, INITIAL_DELAY_MS);

    // Poll periodically
    const pollTimer = setInterval(check, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(pollTimer);
    };
  }, [check]);

  return { isConnected };
}
