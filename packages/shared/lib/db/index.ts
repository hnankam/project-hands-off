/**
 * Database exports
 */

export { surrealDB, initializeSchema } from './surreal-db.js';
export { DBWorkerClient } from './db-worker-client.js';
export { embeddingsStorage } from './embeddings-storage.js';
export { sessionStorageDB, SessionStorageDB } from './session-storage-db.js';
export { migrateSessionStorage, isMigrationComplete, cleanupOldStorage } from './migrate-session-storage.js';
export type { SessionMetadata, SessionMessages, SessionUsageStats, SessionAgentState } from './session-schema.js';

