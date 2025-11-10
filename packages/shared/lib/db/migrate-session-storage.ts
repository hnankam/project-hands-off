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
 * 
 * NOTE: Since userId is now required and legacy sessions don't have userId,
 * this migration will skip importing old sessions. Users must be logged in
 * to create new sessions.
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
      log('[Migration] No existing session data found');
      log('[Migration] ⚠️  NOTE: userId is now required. User must log in before creating sessions.');
      
      // Don't create default session - user must be logged in
      await markMigrationComplete();
      log('[Migration] ✅ Migration complete (no sessions to migrate)');
      return;
    }

    log(`[Migration] Found ${oldState.sessions.length} legacy sessions`);
    log('[Migration] ⚠️  Skipping legacy session migration - userId is now required');
    log('[Migration] ℹ️  Users must log in to create new sessions');

    // Skip migration of legacy sessions since they don't have userId
    // and we've removed backward compatibility
    
    // Note: If you want to migrate legacy sessions, you would need to:
    // 1. Have a default "migration" userId, OR
    // 2. Prompt user to log in before migration, OR
    // 3. Assign sessions to the first user who logs in
    
    // For now, we'll just mark migration as complete and let users start fresh

    // Mark migration as complete
    await markMigrationComplete();

    log('[Migration] ✅ Session storage migration completed successfully');
    log('[Migration] 📊 Migration summary:', {
      legacySessionsSkipped: oldState.sessions.length,
      note: 'Users must log in to create new sessions',
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

