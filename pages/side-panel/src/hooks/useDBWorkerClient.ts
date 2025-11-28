/**
 * Hook to initialize DB Worker Client for embeddings storage AND session storage.
 * This must be called at the app root level to ensure the worker is available.
 */
import { useEffect, useState } from 'react';
import { embeddingsStorage, sessionStorageDB } from '@extension/shared';
import { DBWorkerClient } from '@extension/shared/lib/db/db-worker-client';
import { debug } from '@extension/shared/lib/utils/debug';

// Database names as constants to avoid duplication
const EMBEDDINGS_DB_NAME = 'embeddings_db';
const SESSIONS_DB_NAME = 'sessions_db';

// Module-level singleton clients
let embeddingsClient: DBWorkerClient | null = null;
let sessionsClient: DBWorkerClient | null = null;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize DB Worker Clients for embeddings and session storage.
 * Must be called at app root level to ensure workers are available globally.
 * 
 * @returns Object containing:
 *   - isReady: boolean - true when both workers are initialized
 *   - error: Error | null - initialization error if any
 * 
 * @example
 * ```tsx
 * const { isReady, error } = useDBWorkerClient();
 * 
 * if (error) {
 *   return <div>Failed to initialize database</div>;
 * }
 * 
 * if (!isReady) {
 *   return <div>Loading database...</div>;
 * }
 * ```
 */
export function useDBWorkerClient() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // If already initialized globally, just mark as ready
    if (sessionsClient && embeddingsClient) {
      setIsReady(true);
      return;
    }

    // If initialization is in progress, wait for it
    if (initializationPromise) {
      initializationPromise
        .then(() => setIsReady(true))
        .catch(err => setError(err as Error));
      return;
    }

    // Start new initialization
    initializationPromise = (async () => {
      try {
        debug.log('[useDBWorkerClient] Initializing DB workers...');
        
        // Create separate worker clients for embeddings and sessions (both use IndexedDB)
        embeddingsClient = new DBWorkerClient({ defaultDbName: EMBEDDINGS_DB_NAME });
        sessionsClient = new DBWorkerClient({ defaultDbName: SESSIONS_DB_NAME });

        // Set the worker clients on the respective singletons
        embeddingsStorage.setWorkerClient(embeddingsClient);
        sessionStorageDB.setWorker(sessionsClient);

        // Initialize workers (IndexedDB for both embeddings and sessions for persistence)
        await embeddingsClient.initialize(false, EMBEDDINGS_DB_NAME);
        await sessionsClient.initialize(false, SESSIONS_DB_NAME);

        debug.log('[useDBWorkerClient] DB workers initialized successfully');
        setIsReady(true);
      } catch (err) {
        debug.error('[useDBWorkerClient] Failed to initialize DB workers:', err);
        setError(err as Error);
        initializationPromise = null; // Reset to allow retry
        throw err;
      }
    })();

    initializationPromise.catch(() => {
      // Error already handled and set in state - this prevents unhandled rejection warning
    });
  }, []); // Empty deps - only run once

  return { isReady, error };
}
