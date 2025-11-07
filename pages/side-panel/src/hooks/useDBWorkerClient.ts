/**
 * Hook to initialize DB Worker Client for embeddings storage AND session storage
 * This must be called at the app root level to ensure the worker is available
 */
import { useEffect, useState } from 'react';
import { embeddingsStorage, sessionStorageDB, migrateSessionStorage } from '@extension/shared';
import { DBWorkerClient } from '@extension/shared/lib/db/db-worker-client';

let globalWorkerClient: DBWorkerClient | null = null;
let embeddingsWorkerClient: DBWorkerClient | null = null;
let sessionWorkerClient: DBWorkerClient | null = null;
let initializationPromise: Promise<void> | null = null;

export function useDBWorkerClient() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // If already initialized globally, just mark as ready
    if (sessionWorkerClient && embeddingsWorkerClient) {
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
        console.log('[useDBWorkerClient] Initializing DB workers...');
        
        // Create separate worker clients for embeddings (memory) and sessions (IndexedDB)
        embeddingsWorkerClient = new DBWorkerClient({ defaultDbName: 'embeddings_db' });
        sessionWorkerClient = new DBWorkerClient({ defaultDbName: 'sessions_db' });
        globalWorkerClient = sessionWorkerClient; // Preserve legacy getter behaviour

        // Set the worker clients on the respective singletons
        embeddingsStorage.setWorkerClient(embeddingsWorkerClient);
        sessionStorageDB.setWorker(sessionWorkerClient);

        // Initialize workers (memory for embeddings, IndexedDB for sessions)
        await embeddingsWorkerClient.initialize(true, 'embeddings_db');
        await sessionWorkerClient.initialize(false, 'sessions_db');

        // Run migration from chrome.storage.local to IndexedDB
        console.log('[useDBWorkerClient] Running session storage migration...');
        await migrateSessionStorage(sessionStorageDB);

        console.log('[useDBWorkerClient] ✅ DB workers initialized successfully');
        setIsReady(true);
      } catch (err) {
        console.error('[useDBWorkerClient] ❌ Failed to initialize DB workers:', err);
        setError(err as Error);
        initializationPromise = null; // Reset to allow retry
        throw err;
      }
    })();

    initializationPromise.catch(err => {
      // Error already set in try/catch above
    });
  }, []); // Empty deps - only run once

  return { isReady, error, workerClient: sessionWorkerClient };
}

export function getGlobalWorkerClient(): DBWorkerClient {
  if (!sessionWorkerClient) {
    throw new Error('[useDBWorkerClient] Session worker client not initialized. Ensure useDBWorkerClient() is called at app root.');
  }
  return sessionWorkerClient;
}

