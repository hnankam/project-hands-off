/**
 * Persistence Lock Manager
 * 
 * Coordination lock to prevent race between message loading and auto-persistence.
 * Prevents RuntimeStateBridge from persisting empty array while messages are loading.
 */

const DEBUG = true;
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const log = (...args: any[]) => DEBUG && console.log(ts(), '[PersistenceLock]', ...args);

interface Lock {
  loading: boolean;
  timestamp: number;
  resolver?: () => void;
}

class PersistenceLockManager {
  private locks = new Map<string, Lock>();
  private manualResetFlags = new Map<string, boolean>();
  private readonly LOCK_TIMEOUT = 10000; // 10 seconds max lock duration
  private readonly GRACE_PERIOD = 700; // 700ms grace period for empty persistence

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
      log(`Waiting for previous load to complete: ${sessionId.slice(0, 8)}`);
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

    log(`Acquired loading lock: ${sessionId.slice(0, 8)}`);

    // Return unlock function
    return () => {
      const lock = this.locks.get(sessionId);
      if (lock) {
        log(`Released loading lock: ${sessionId.slice(0, 8)}`);
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
      console.warn(`[PersistenceLock] Force-releasing stale lock: ${sessionId.slice(0, 8)}`);
      this.locks.delete(sessionId);
      lock.resolver?.();
      return false;
    }

    return true;
  }

  /**
   * Clear all locks (for cleanup/testing)
   */
  clearAll(): void {
    for (const [sessionId, lock] of this.locks.entries()) {
      log(`Clearing lock: ${sessionId.slice(0, 8)}`);
      lock.resolver?.();
    }
    this.locks.clear();
  }

  /**
   * Clear lock for specific session
   * 
   * @param sessionId - The session ID to clear
   */
  clear(sessionId: string): void {
    const lock = this.locks.get(sessionId);
    if (lock) {
      log(`Clearing lock: ${sessionId.slice(0, 8)}`);
      lock.resolver?.();
      this.locks.delete(sessionId);
    }
  }

  /**
   * Get lock status for debugging
   */
  getStatus(): Record<string, { loading: boolean; age: number }> {
    const status: Record<string, { loading: boolean; age: number }> = {};
    const now = Date.now();
    
    for (const [sessionId, lock] of this.locks.entries()) {
      status[sessionId] = {
        loading: lock.loading,
        age: now - lock.timestamp,
      };
    }
    
    return status;
  }

  /**
   * Mark that a manual reset is in progress
   * This allows RuntimeStateBridge to permit intentional empty writes
   * 
   * @param sessionId - The session ID being reset
   * @param isResetting - true to mark reset in progress, false to clear
   */
  setManualReset(sessionId: string, isResetting: boolean): void {
    if (isResetting) {
      this.manualResetFlags.set(sessionId, true);
      log(`Manual reset started: ${sessionId.slice(0, 8)}`);
      
      // Auto-clear after 3 seconds to prevent permanent bypass
      setTimeout(() => {
        this.manualResetFlags.delete(sessionId);
        log(`Manual reset flag cleared: ${sessionId.slice(0, 8)}`);
      }, 3000);
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

