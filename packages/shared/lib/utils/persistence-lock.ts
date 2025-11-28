/**
 * Persistence Lock Manager
 * 
 * Coordination lock to prevent race between message loading and auto-persistence.
 * Prevents RuntimeStateBridge from persisting empty array while messages are loading.
 */

import { debug } from './debug.js';

interface Lock {
  loading: boolean;
  timestamp: number;
  resolver?: () => void;
}

class PersistenceLockManager {
  private locks = new Map<string, Lock>();
  private manualResetFlags = new Map<string, boolean>();
  private manualResetTimers = new Map<string, NodeJS.Timeout>();
  private readonly LOCK_TIMEOUT = 10000; // 10 seconds max lock duration

  /**
   * Acquire loading lock for a session
   * Prevents auto-persistence while messages are being loaded
   * 
   * @param sessionId - The session ID to lock
   * @returns Unlock function to release the lock
   */
  async acquireLoadingLock(sessionId: string): Promise<() => void> {
    const existing = this.locks.get(sessionId);
    
    if (existing?.loading) {
      // Wait for previous load to complete (max 5 seconds)
      debug.log('[PersistenceLock] Waiting for previous load to complete:', sessionId.slice(0, 8));
      await Promise.race([
        new Promise<void>(resolve => {
          // Override resolver
          const lock = this.locks.get(sessionId);
          if (lock) {
            lock.resolver = resolve;
          }
        }),
        new Promise(resolve => setTimeout(resolve, 5000)), // Timeout
      ]);
    }

    // Set loading lock
    this.locks.set(sessionId, {
      loading: true,
      timestamp: Date.now(),
    });

    debug.log('[PersistenceLock] Acquired loading lock:', sessionId.slice(0, 8));

    // Return unlock function
    return () => {
      const lock = this.locks.get(sessionId);
      if (lock) {
        debug.log('[PersistenceLock] Released loading lock:', sessionId.slice(0, 8));
        this.locks.delete(sessionId);
        lock.resolver?.();
      }
    };
  }

  /**
   * Check if loading is in progress for a session
   * 
   * @param sessionId - The session ID to check
   * @returns true if loading is in progress
   */
  isLoading(sessionId: string): boolean {
    const lock = this.locks.get(sessionId);
    if (!lock?.loading) return false;

    // Auto-release locks older than LOCK_TIMEOUT (safety)
    if (Date.now() - lock.timestamp > this.LOCK_TIMEOUT) {
      debug.warn('[PersistenceLock] Force-releasing stale lock:', sessionId.slice(0, 8));
      this.locks.delete(sessionId);
      lock.resolver?.();
      return false;
    }

    return true;
  }


  /**
   * Mark that a manual reset is in progress
   * This allows RuntimeStateBridge to permit intentional empty writes
   * 
   * @param sessionId - The session ID being reset
   * @param isResetting - true to mark reset in progress, false to clear
   */
  setManualReset(sessionId: string, isResetting: boolean): void {
    // Clear any existing timer for this session
    const existingTimer = this.manualResetTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.manualResetTimers.delete(sessionId);
    }

    if (isResetting) {
      this.manualResetFlags.set(sessionId, true);
      debug.log('[PersistenceLock] Manual reset started:', sessionId.slice(0, 8));
      
      // Auto-clear after 3 seconds to prevent permanent bypass
      const timer = setTimeout(() => {
        this.manualResetFlags.delete(sessionId);
        this.manualResetTimers.delete(sessionId);
        debug.log('[PersistenceLock] Manual reset flag cleared:', sessionId.slice(0, 8));
      }, 3000);
      
      this.manualResetTimers.set(sessionId, timer);
    } else {
      this.manualResetFlags.delete(sessionId);
    }
  }

  /**
   * Check if a manual reset is in progress for a session
   * 
   * @param sessionId - The session ID to check
   * @returns true if manual reset is in progress
   */
  isManualReset(sessionId: string): boolean {
    return this.manualResetFlags.has(sessionId);
  }
}

// Export singleton instance
export const persistenceLock = new PersistenceLockManager();

// Export class for testing
export { PersistenceLockManager };

