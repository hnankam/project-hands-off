# Critical Fixes Implementation Guide

## Priority 1: Fix Database Write Race Conditions

### Problem
Multiple components can write to `session_messages` simultaneously, causing last-write-wins conflicts.

### Solution: Optimistic Locking with Version Field

**Step 1: Update Database Schema**

```typescript
// packages/shared/lib/db/session-schema.ts

export async function initializeSessionSchema(worker: DBWorkerClient): Promise<void> {
  log('[SessionSchema] Initializing session storage schema...');

  try {
    await worker.query(`
      -- Session Messages Table (heavy data, rarely accessed all at once)
      DEFINE TABLE IF NOT EXISTS session_messages SCHEMALESS;
      DEFINE FIELD IF NOT EXISTS sessionId ON session_messages TYPE string;
      DEFINE FIELD IF NOT EXISTS messages ON session_messages TYPE array;
      DEFINE FIELD IF NOT EXISTS version ON session_messages TYPE number DEFAULT 0;  -- NEW
      DEFINE FIELD IF NOT EXISTS lastModified ON session_messages TYPE number;        -- NEW
      DEFINE INDEX IF NOT EXISTS idx_messages_session ON session_messages FIELDS sessionId;
      DEFINE INDEX IF NOT EXISTS idx_messages_version ON session_messages FIELDS version;  -- NEW
    `);
    
    // ... rest of schema
  }
}
```

**Step 2: Add Version-Aware Update Method**

```typescript
// packages/shared/lib/db/session-storage-db.ts

export class SessionStorageDB {
  /**
   * Update messages for a session with optimistic locking
   * Returns true if update succeeded, false if version conflict detected
   */
  async updateMessagesWithVersion(
    sessionId: string, 
    messages: any[], 
    expectedVersion?: number
  ): Promise<{ success: boolean; currentVersion?: number; error?: string }> {
    const worker = this.getWorker();

    // 1. Read current record with version
    const existing = await worker.query<any[]>(
      'SELECT * FROM session_messages WHERE sessionId = $id LIMIT 1;',
      { id: sessionId }
    );

    const existingRecord = existing[0]?.[0];
    const currentVersion = existingRecord?.version ?? 0;

    // 2. If expectedVersion provided, check for conflict
    if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
      log('[SessionStorageDB] ⚠️  Version conflict detected:', {
        sessionId: sessionId.slice(0, 12),
        expected: expectedVersion,
        current: currentVersion,
      });
      
      return {
        success: false,
        currentVersion,
        error: 'Version conflict: data was modified by another operation',
      };
    }

    // 3. Normalize messages
    const normalizedMessages = this.normalizeMessagesForStorage(messages);
    const newSignature = this.computeMessageSignature(normalizedMessages);
    const existingSignature = existingRecord 
      ? this.computeMessageSignature(existingRecord.messages || [])
      : '';

    // 4. Skip if content unchanged
    if (existingSignature === newSignature) {
      log('[SessionStorageDB] ℹ️  Skipping update - content unchanged');
      return { success: true, currentVersion };
    }

    // 5. Perform versioned update
    const newVersion = currentVersion + 1;
    const now = Date.now();

    try {
      if (existingRecord) {
        // Update with version check
        const result = await worker.query(
          `UPDATE session_messages 
           SET messages = $messages, 
               version = $newVersion,
               lastModified = $timestamp
           WHERE sessionId = $id AND version = $currentVersion
           RETURN AFTER;`,
          { 
            id: sessionId, 
            messages: normalizedMessages,
            newVersion,
            currentVersion,
            timestamp: now,
          }
        );

        // Check if update actually happened (would return empty if version mismatched)
        if (!result[0] || result[0].length === 0) {
          log('[SessionStorageDB] ⚠️  Update failed - version changed during operation');
          return {
            success: false,
            error: 'Version conflict: data changed during update',
          };
        }
      } else {
        // Create new record
        await worker.query(
          `CREATE session_messages CONTENT { 
            sessionId: $id, 
            messages: $messages,
            version: 1,
            lastModified: $timestamp
          };`,
          { id: sessionId, messages: normalizedMessages, timestamp: now }
        );
      }

      // 6. Update session timestamp
      await worker.query(
        'UPDATE session_metadata SET timestamp = $timestamp WHERE sessionId = $id OR id = $id;',
        { id: sessionId, timestamp: now }
      );

      this.notify({ type: 'messagesUpdated', sessionId });
      log(`[SessionStorageDB] ✅ Updated ${normalizedMessages.length} messages (v${newVersion})`);
      
      return { success: true, currentVersion: newVersion };
      
    } catch (error) {
      log('[SessionStorageDB] ❌ Update failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Get current version for a session
   */
  async getMessagesVersion(sessionId: string): Promise<number> {
    const worker = this.getWorker();
    const result = await worker.query<any[]>(
      'SELECT version FROM session_messages WHERE sessionId = $id LIMIT 1;',
      { id: sessionId }
    );
    return result[0]?.[0]?.version ?? 0;
  }

  // Keep old method for backward compatibility, but use new method internally
  async updateMessages(sessionId: string, messages: any[]): Promise<void> {
    const result = await this.updateMessagesWithVersion(sessionId, messages);
    if (!result.success) {
      // Retry once on conflict
      log('[SessionStorageDB] Retrying after version conflict...');
      const retryResult = await this.updateMessagesWithVersion(sessionId, messages);
      if (!retryResult.success) {
        throw new Error(retryResult.error || 'Failed to update messages after retry');
      }
    }
  }
}
```

**Step 3: Update Components to Use Versioned Updates**

```typescript
// pages/side-panel/src/context/SessionRuntimeContext.tsx

const RuntimeStateBridge: React.FC<RuntimeStateBridgeProps> = ({ sessionId, updateRuntimeState }) => {
  const { messages, isLoading } = useCopilotChatHeadless_c();
  
  // Track current version
  const currentVersionRef = useRef<number>(0);
  const persistInProgressRef = useRef<boolean>(false);

  // Load initial version on mount
  useEffect(() => {
    sessionStorageDBWrapper.getMessagesVersion(sessionId)
      .then(version => {
        currentVersionRef.current = version;
      })
      .catch(err => {
        console.warn('[RuntimeStateBridge] Failed to load version:', err);
      });
  }, [sessionId]);

  useEffect(() => {
    const signature = computeSignature(messages);
    
    if (lastPersistedSignatureRef.current === signature) {
      return;
    }

    const delay = isLoading ? 120 : 0;

    saveTimeoutRef.current = setTimeout(async () => {
      // Prevent concurrent writes
      if (persistInProgressRef.current) {
        console.log('[RuntimeStateBridge] Persist already in progress, skipping');
        return;
      }

      persistInProgressRef.current = true;

      try {
        const sanitizedMessages = sanitizeMessages(messages);
        const hasMessages = sanitizedMessages.length > 0;
        const shouldPersistEmpty = !isLoading && sanitizedMessages.length === 0;

        if (!hasMessages && !shouldPersistEmpty) {
          return;
        }

        // Check for early empty overwrite protection
        if (!hasMessages && Date.now() - mountedAtRef.current < 1500) {
          const stored = await sessionStorageDBWrapper.getAllMessagesAsync(sessionId);
          if (Array.isArray(stored) && stored.length > 0) {
            console.log('[RuntimeStateBridge] Preventing early empty overwrite');
            return;
          }
        }

        // Use versioned update
        const result = await sessionStorageDBWrapper.updateMessagesWithVersion(
          sessionId,
          sanitizedMessages,
          currentVersionRef.current  // Pass expected version
        );

        if (result.success) {
          currentVersionRef.current = result.currentVersion!;
          lastPersistedSignatureRef.current = signature;
          previousMessagesCountRef.current = sanitizedMessages.length;
        } else {
          console.warn('[RuntimeStateBridge] Version conflict detected:', result.error);
          
          // On conflict, reload current version and retry
          const currentVersion = await sessionStorageDBWrapper.getMessagesVersion(sessionId);
          currentVersionRef.current = currentVersion;
          
          // Don't retry automatically - let next state change trigger new attempt
          console.log('[RuntimeStateBridge] Version updated, will retry on next change');
        }

      } catch (error) {
        console.error('[RuntimeStateBridge] Persist failed:', error);
      } finally {
        persistInProgressRef.current = false;
      }
    }, delay);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [messages, isLoading, sessionId]);
};
```

---

## Priority 2: Fix Message Restoration Race

### Problem
RuntimeStateBridge can persist empty array before message restoration completes.

### Solution: Coordination Lock

**Step 1: Create Shared Lock Manager**

```typescript
// packages/shared/lib/utils/persistence-lock.ts

/**
 * Coordination lock to prevent race between message loading and auto-persistence
 */
class PersistenceLockManager {
  private locks = new Map<string, {
    loading: boolean;
    timestamp: number;
    resolver?: () => void;
  }>();

  /**
   * Acquire loading lock for a session
   * Prevents auto-persistence while messages are being loaded
   */
  async acquireLoadingLock(sessionId: string): Promise<() => void> {
    const existing = this.locks.get(sessionId);
    
    if (existing?.loading) {
      // Wait for previous load to complete (max 5 seconds)
      console.log('[PersistenceLock] Waiting for previous load to complete:', sessionId.slice(0, 8));
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

    console.log('[PersistenceLock] Acquired loading lock:', sessionId.slice(0, 8));

    // Return unlock function
    return () => {
      const lock = this.locks.get(sessionId);
      if (lock) {
        console.log('[PersistenceLock] Released loading lock:', sessionId.slice(0, 8));
        this.locks.delete(sessionId);
        lock.resolver?.();
      }
    };
  }

  /**
   * Check if loading is in progress for a session
   */
  isLoading(sessionId: string): boolean {
    const lock = this.locks.get(sessionId);
    if (!lock?.loading) return false;

    // Auto-release locks older than 10 seconds (safety)
    if (Date.now() - lock.timestamp > 10000) {
      console.warn('[PersistenceLock] Force-releasing stale lock:', sessionId.slice(0, 8));
      this.locks.delete(sessionId);
      lock.resolver?.();
      return false;
    }

    return true;
  }

  /**
   * Clear all locks (for cleanup)
   */
  clearAll(): void {
    for (const [sessionId, lock] of this.locks.entries()) {
      lock.resolver?.();
    }
    this.locks.clear();
  }
}

export const persistenceLock = new PersistenceLockManager();
```

**Step 2: Use Lock in Message Loading**

```typescript
// pages/side-panel/src/hooks/useMessagePersistence.ts

const handleLoadMessages = async () => {
  // ... existing setup ...

  // Acquire lock to prevent auto-persistence during load
  const unlock = await persistenceLock.acquireLoadingLock(sessionId);

  try {
    const rawMessages = await sessionStorageDBWrapper.getAllMessagesAsync(sessionId);
    
    console.log(`[useMessagePersistence] 📦 Loaded ${rawMessages?.length || 0} messages from storage`);

    const sanitizedFromStorage = sanitizeNormalizedMessages(rawMessages as CopilotMessage[] ?? []);
    
    // ... rest of loading logic ...

    if (shouldRestoreMessages) {
      restoreMessagesRef.current?.(sanitizedFromStorage as any);
      storedMessagesRef.current = sanitizedFromStorage;
    }

  } catch (error) {
    debug.warn('[useMessagePersistence] Failed to load messages:', error);
  } finally {
    // Always release lock
    unlock();
  }
};
```

**Step 3: Check Lock in Auto-Persistence**

```typescript
// pages/side-panel/src/context/SessionRuntimeContext.tsx

useEffect(() => {
  // ... existing setup ...

  saveTimeoutRef.current = setTimeout(async () => {
    // Check if loading is in progress
    if (persistenceLock.isLoading(sessionId)) {
      console.log('[RuntimeStateBridge] Loading in progress, skipping auto-persist');
      return;
    }

    if (persistInProgressRef.current) {
      console.log('[RuntimeStateBridge] Persist already in progress, skipping');
      return;
    }

    // ... rest of persistence logic ...
  }, delay);
}, [messages, isLoading, sessionId]);
```

---

## Priority 3: Fix Agent Switching Session Contamination

### Problem
Agent switching can complete steps after session has switched, causing cross-session contamination.

### Solution: Session-Aware Cancellation

**Step 1: Add Session Check to Each Step**

```typescript
// pages/side-panel/src/hooks/useAgentSwitching.ts

export const useAgentSwitching = ({
  selectedAgent,
  selectedModel,
  sessionId,
  handleSaveMessages,
  handleLoadMessages,
}: UseAgentSwitchingParams) => {
  // ... existing state ...

  // Track current session for cancellation
  const currentSessionIdRef = useRef(sessionId);

  // Update on session change
  useEffect(() => {
    if (currentSessionIdRef.current !== sessionId) {
      console.log('[useAgentSwitching] Session changed, incrementing runId to cancel in-flight switch');
      switchRunIdRef.current++;
      currentSessionIdRef.current = sessionId;
    }
  }, [sessionId]);

  // Agent switching logic
  useEffect(() => {
    const agentChanged = previousAgentRef.current !== selectedAgent;
    const modelChanged = previousModelRef.current !== selectedModel;

    if (!agentChanged && !modelChanged) {
      return;
    }

    // Check for session change
    if (previousSessionIdRef.current !== sessionId) {
      console.log('[useAgentSwitching] Session changed, skipping switch');
      previousAgentRef.current = selectedAgent;
      previousModelRef.current = selectedModel;
      previousSessionIdRef.current = sessionId;
      return;
    }

    console.log('[useAgentSwitching] Agent/Model change detected');

    const runId = ++switchRunIdRef.current;
    const switchSessionId = sessionId; // Capture session ID for this switch

    (async () => {
      // Helper to check if switch is still valid
      const isValid = () => {
        if (switchRunIdRef.current !== runId) {
          console.log('[useAgentSwitching] Cancelled: runId changed');
          return false;
        }
        if (currentSessionIdRef.current !== switchSessionId) {
          console.log('[useAgentSwitching] Cancelled: session changed');
          return false;
        }
        return true;
      };

      // Step 1: Save messages
      setSwitchingStep(1);
      setIsSwitchingAgent(true);

      await delay(SAVE_DELAY_MS);
      if (!isValid()) return;

      console.log('[useAgentSwitching] Step 1: Saving messages');
      try {
        await handleSaveMessages();
      } catch (error) {
        console.error('[useAgentSwitching] Failed to save messages', error);
      }

      await delay(SWITCH_DELAY_MS);
      if (!isValid()) return;

      // Step 2: Switch agent/model
      console.log('[useAgentSwitching] Step 2: Switching agent/model');
      setSwitchingStep(2);
      setActiveAgent(selectedAgent);
      setActiveModel(selectedModel);

      await delay(REMOUNT_WAIT_MS);
      if (!isValid()) return;

      // Step 3: Restore messages
      console.log('[useAgentSwitching] Step 3: Restoring messages');
      setSwitchingStep(3);

      await delay(RESTORE_DELAY_MS);
      if (!isValid()) return;
      
      // Final validation before restore
      if (currentSessionIdRef.current === switchSessionId) {
        handleLoadMessages();
      } else {
        console.log('[useAgentSwitching] Session changed before restore, aborting');
        return;
      }

      // Complete
      await delay(COMPLETE_CHECKS_DELAY_MS);
      if (!isValid()) return;

      setSwitchingStep(4);
      await delay(FADE_OUT_DELAY_MS);
      if (!isValid()) return;

      setIsSwitchingAgent(false);
      setSwitchingStep(1);

    })();

    previousAgentRef.current = selectedAgent;
    previousModelRef.current = selectedModel;
    previousSessionIdRef.current = sessionId;
  }, [selectedAgent, selectedModel, sessionId, handleSaveMessages, handleLoadMessages]);

  return {
    activeAgent,
    activeModel,
    isSwitchingAgent,
    switchingStep,
  };
};
```

---

## Priority 4: Fix Content Cache Cross-Session Issues

### Problem
Content cache uses `tabId` as key, allowing Session A's cache to be used by Session B.

### Solution: Session-Scoped Cache Keys

```typescript
// pages/side-panel/src/ChatSession.tsx

export const ChatSession: FC<ChatSessionProps> = ({ sessionId, isLight, publicApiKey, isActive = true }) => {
  // Change cache key structure to include sessionId
  const contentCacheRef = useRef<Map<string, { 
    content: any; 
    timestamp: number; 
    tabId: number;
    sessionId: string;  // ADD THIS
  }>>(new Map());

  // Clear cache when session changes
  useEffect(() => {
    // Clear entire cache on session change to prevent cross-contamination
    contentCacheRef.current.clear();
    console.log('[ChatSession] Cache cleared for session switch');
  }, [sessionId]);

  const fetchFreshPageContent = useCallback(async (force: boolean = false, tabId: number | null) => {
    if (!tabId) return null;

    // Create session-scoped cache key
    const cacheKey = `${sessionId}_${tabId}`;

    // Check cache
    if (!force && contentCacheRef.current.has(cacheKey)) {
      const cached = contentCacheRef.current.get(cacheKey)!;
      const age = Date.now() - cached.timestamp;
      
      // Verify session ID matches (extra safety check)
      if (cached.sessionId === sessionId && age < CACHE_TTL) {
        console.log('[ChatSession] Using cached content', { sessionId: sessionId.slice(0, 8), tabId, age });
        return cached.content;
      } else {
        console.log('[ChatSession] Cache invalid', { 
          sessionMatch: cached.sessionId === sessionId,
          age,
          maxAge: CACHE_TTL 
        });
        contentCacheRef.current.delete(cacheKey);
      }
    }

    // Fetch fresh content
    console.log('[ChatSession] Fetching fresh content', { 
      sessionId: sessionId.slice(0, 8), 
      tabId, 
      force 
    });

    const content = await fetchContentFromTab(tabId);

    // Store in cache with session ID
    contentCacheRef.current.set(cacheKey, {
      content,
      timestamp: Date.now(),
      tabId,
      sessionId,  // Store session ID
    });

    // Limit cache size (keep last 10 entries per session)
    if (contentCacheRef.current.size > 10) {
      // Remove oldest entries for THIS session
      const sessionEntries = Array.from(contentCacheRef.current.entries())
        .filter(([_, v]) => v.sessionId === sessionId)
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      if (sessionEntries.length > 10) {
        const toRemove = sessionEntries.slice(0, sessionEntries.length - 10);
        toRemove.forEach(([key]) => contentCacheRef.current.delete(key));
      }
    }

    return content;
  }, [sessionId]);

  // ... rest of component ...
};
```

---

## Priority 5: Cleanup Refs on Session Change

### Problem
Scroll spacer and other refs not cleaned up when session changes.

### Solution: Comprehensive Ref Cleanup

```typescript
// pages/side-panel/src/components/ChatInner.tsx

// Add cleanup effect for session changes
useEffect(() => {
  // Session change detected - clean up all refs
  console.log('[ChatInner] Session changed, cleaning up refs');

  // 1. Clear sanitization cache
  cachedSanitizedRef.current = null;
  wasStreamingRef.current = false;

  // 2. Clear scroll state
  if (scrollSpacerRef.current) {
    // Clear intervals
    const stickyCheckInterval = (scrollSpacerRef.current as any).__stickyCheckInterval;
    if (stickyCheckInterval) {
      clearInterval(stickyCheckInterval);
    }
    
    const contentInterval = (scrollSpacerRef.current as any).__contentInterval;
    if (contentInterval) {
      clearInterval(contentInterval);
    }
    
    // Remove spacer from DOM
    if (scrollSpacerRef.current.parentElement) {
      scrollSpacerRef.current.remove();
    }
    
    scrollSpacerRef.current = null;
  }

  // 3. Clear element cache
  elementCacheRef.current = null;

  // 4. Clear sticky state
  currentStickyIdRef.current = null;
  
  // 5. Reset scroll tracking
  lastScrollTopRef.current = 0;
  scrollDirectionRef.current = 'none';
  scrollVelocityRef.current = 0;
  lastScrollTimeRef.current = Date.now();

  // 6. Clear page data (prevent cross-session content leak)
  pageDataRef.current = {
    embeddings: null,
    pageContent: null,
  };

  // 7. Reset initialization flags
  hasInitializedStickyOnOpenRef.current = false;
  hasInitializedRef.current = false;

  console.log('[ChatInner] Ref cleanup complete');

}, [sessionId]);
```

---

## Testing Checklist

After implementing these fixes, test:

- [ ] **Rapid Session Switching**: Switch between sessions every 100ms for 30 seconds
- [ ] **Concurrent Message Updates**: Delete message while agent is adding new message
- [ ] **Agent Switch During Session Switch**: Switch agent, immediately switch session
- [ ] **Content Cache Isolation**: View same page in two sessions, verify separate caches
- [ ] **Version Conflict Handling**: Manually create version conflict, verify retry logic
- [ ] **Lock Timeout**: Block message loading for 15 seconds, verify auto-release
- [ ] **Memory Leaks**: Switch sessions 1000 times, check memory doesn't grow unbounded

---

## Monitoring & Alerts

Add instrumentation to detect issues in production:

```typescript
// packages/shared/lib/monitoring/data-integrity.ts

export class DataIntegrityMonitor {
  private static conflicts = new Map<string, number>();
  
  static recordVersionConflict(sessionId: string): void {
    const count = this.conflicts.get(sessionId) || 0;
    this.conflicts.set(sessionId, count + 1);
    
    if (count + 1 > 5) {
      console.error('[DataIntegrity] High conflict rate detected:', {
        sessionId: sessionId.slice(0, 8),
        conflicts: count + 1,
      });
      
      // Send to error tracking service
      // Sentry.captureMessage('High version conflict rate', {...});
    }
  }
  
  static verifyMessageIntegrity(messages: any[]): boolean {
    // Check for duplicates
    const ids = messages.map(m => m.id);
    const uniqueIds = new Set(ids);
    
    if (ids.length !== uniqueIds.size) {
      console.error('[DataIntegrity] Duplicate message IDs detected');
      return false;
    }
    
    // Check for role sequence violations
    for (let i = 1; i < messages.length; i++) {
      const prev = messages[i - 1];
      const curr = messages[i];
      
      // Assistant messages should follow user messages
      if (curr.role === 'assistant' && prev.role === 'assistant') {
        console.warn('[DataIntegrity] Sequential assistant messages detected');
        // Not necessarily an error, but worth noting
      }
    }
    
    return true;
  }
}
```

---

## Rollout Plan

1. **Phase 1 (Week 1)**: Deploy optimistic locking + persistence lock
2. **Phase 2 (Week 2)**: Deploy agent switching fix + content cache fix
3. **Phase 3 (Week 3)**: Deploy ref cleanup + monitoring
4. **Phase 4 (Week 4)**: Monitor for 1 week, gather metrics
5. **Phase 5 (Week 5)**: Address any remaining edge cases

Each phase should be deployed to 10% of users initially, then gradually increase.

