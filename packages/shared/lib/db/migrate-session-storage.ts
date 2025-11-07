/**
 * Migration utility to move session data from chrome.storage.local to IndexedDB
 * 
 * One-time migration that:
 * 1. Reads existing session data from chrome.storage.local
 * 2. Writes it to the new IndexedDB structure
 * 3. Marks migration as complete
 */

import type { SessionStorageDB } from './session-storage-db.js';

// Debug logging
const DEBUG = true;
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const log = (...args: any[]) => DEBUG && console.log(ts(), ...args);

const MIGRATION_FLAG_KEY = 'session-storage-migrated-to-indexeddb';
const OLD_SESSION_STORAGE_KEY = 'session-storage-key';
const OLD_CHAT_MESSAGES_KEY = 'copilot-chat-messages';

/**
 * Old data structures from chrome.storage.local
 */
interface OldSessionType {
  id: string;
  title: string;
  timestamp: number;
  isActive: boolean;
  isOpen: boolean;
  allMessages?: any[];
  selectedAgent?: string;
  selectedModel?: string;
  usageStats?: {
    request: number;
    response: number;
    total: number;
    requestCount: number;
  };
  agentStepState?: {
    steps: Array<{
      description: string;
      status: 'pending' | 'running' | 'completed' | 'failed' | 'deleted';
    }>;
  };
}

interface OldSessionState {
  sessions: OldSessionType[];
  currentSessionId: string | null;
}

/**
 * Check if migration has already been completed
 */
export async function isMigrationComplete(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get([MIGRATION_FLAG_KEY]);
    return result[MIGRATION_FLAG_KEY] === true;
  } catch (error) {
    console.error('[Migration] Failed to check migration status:', error);
    return false;
  }
}

/**
 * Mark migration as complete
 */
async function markMigrationComplete(): Promise<void> {
  await chrome.storage.local.set({ [MIGRATION_FLAG_KEY]: true });
  log('[Migration] ✅ Marked migration as complete');
}

/**
 * Migrate session data from chrome.storage.local to IndexedDB
 */
export async function migrateSessionStorage(db: SessionStorageDB): Promise<void> {
  log('[Migration] Starting session storage migration...');

  try {
    // Check if already migrated
    if (await isMigrationComplete()) {
      log('[Migration] ⏭️  Migration already completed, skipping');
      return;
    }

    // Read old data from chrome.storage.local
    const result = await chrome.storage.local.get([OLD_SESSION_STORAGE_KEY, OLD_CHAT_MESSAGES_KEY]);
    const oldState: OldSessionState | null = result[OLD_SESSION_STORAGE_KEY] || null;
    const oldMessages: Record<string, any[]> = result[OLD_CHAT_MESSAGES_KEY] || {};

    if (!oldState || !oldState.sessions || oldState.sessions.length === 0) {
      log('[Migration] No existing session data found, creating default session');
      
      // Create a default session
      const defaultSession = await db.addSession({
        title: 'Quick Start',
        isActive: true,
        isOpen: true,
        selectedAgent: 'general',
        selectedModel: 'claude-4.5-haiku',
      });

      await markMigrationComplete();
      log('[Migration] ✅ Created default session:', defaultSession.id);
      return;
    }

    log(`[Migration] Found ${oldState.sessions.length} sessions to migrate`);

    // Migrate each session
    for (const oldSession of oldState.sessions) {
      log(`[Migration] Migrating session: ${oldSession.id} (${oldSession.title})`);

      // 1. Migrate session metadata
      await db.addSession({
        title: oldSession.title,
        isActive: oldSession.isActive,
        isOpen: oldSession.isOpen,
        selectedAgent: oldSession.selectedAgent,
        selectedModel: oldSession.selectedModel,
      });

      // Override the generated ID with the old one to maintain compatibility
      // This is a bit hacky but ensures continuity
      const worker = (db as any).getWorker();
      await worker.query(
        'UPDATE session_metadata SET id = $newId WHERE id = $oldId;',
        { oldId: `session-${Date.now()}`, newId: oldSession.id }
      );

      // 2. Migrate messages
      // Messages can come from oldSession.allMessages or from the separate messages storage
      let messages: any[] = [];
      
      if (oldSession.allMessages && oldSession.allMessages.length > 0) {
        messages = oldSession.allMessages;
      } else if (oldMessages[oldSession.id] && oldMessages[oldSession.id].length > 0) {
        messages = oldMessages[oldSession.id];
      }

      if (messages.length > 0) {
        await db.updateMessages(oldSession.id, messages);
        log(`[Migration] ✅ Migrated ${messages.length} messages for session ${oldSession.id}`);
      }

      // 3. Migrate usage stats if present
      if (oldSession.usageStats) {
        await db.updateUsageStats(oldSession.id, oldSession.usageStats);
        log(`[Migration] ✅ Migrated usage stats for session ${oldSession.id}`);
      }

      // 4. Migrate agent state if present
      if (oldSession.agentStepState) {
        await db.updateAgentState(oldSession.id, oldSession.agentStepState);
        log(`[Migration] ✅ Migrated agent state for session ${oldSession.id}`);
      }
    }

    // Set the current session
    if (oldState.currentSessionId) {
      await db.setActiveSession(oldState.currentSessionId);
      log(`[Migration] ✅ Set current session: ${oldState.currentSessionId}`);
    }

    // Mark migration as complete
    await markMigrationComplete();

    log('[Migration] ✅ Session storage migration completed successfully');
    log('[Migration] 📊 Migration summary:', {
      totalSessions: oldState.sessions.length,
      currentSessionId: oldState.currentSessionId,
    });

  } catch (error) {
    console.error('[Migration] ❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Optional: Clean up old chrome.storage.local data after successful migration
 * Only call this after verifying the migration worked correctly
 */
export async function cleanupOldStorage(): Promise<void> {
  log('[Migration] Cleaning up old chrome.storage.local data...');
  
  try {
    await chrome.storage.local.remove([OLD_SESSION_STORAGE_KEY, OLD_CHAT_MESSAGES_KEY]);
    log('[Migration] ✅ Old storage data cleaned up');
  } catch (error) {
    console.error('[Migration] ❌ Failed to clean up old storage:', error);
    throw error;
  }
}

