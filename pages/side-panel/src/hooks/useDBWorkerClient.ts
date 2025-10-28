/**
 * Hook to initialize DB Worker Client for embeddings storage
 * This must be called at the app root level to ensure the worker is available
 */
import { useEffect, useState } from 'react';
import { embeddingsStorage } from '@extension/shared';
import { DBWorkerClient } from '@extension/shared/lib/db/db-worker-client';

let globalWorkerClient: DBWorkerClient | null = null;
let initializationPromise: Promise<void> | null = null;

export function useDBWorkerClient() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // If already initialized globally, just mark as ready
    if (globalWorkerClient) {
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
        console.log('[useDBWorkerClient] Initializing DB worker...');
        
        // Create worker client - constructor will auto-resolve worker path
        globalWorkerClient = new DBWorkerClient();

        // Set the worker client on the singleton
        embeddingsStorage.setWorkerClient(globalWorkerClient);

        // Initialize the worker
        await embeddingsStorage.initialize(true); // Use memory mode by default

        console.log('[useDBWorkerClient] ✅ DB worker initialized successfully');
        setIsReady(true);
      } catch (err) {
        console.error('[useDBWorkerClient] ❌ Failed to initialize DB worker:', err);
        setError(err as Error);
        initializationPromise = null; // Reset to allow retry
        throw err;
      }
    })();

    initializationPromise.catch(err => {
      // Error already set in try/catch above
    });
  }, []); // Empty deps - only run once

  return { isReady, error, workerClient: globalWorkerClient };
}

/**
 * Get the global worker client instance
 * Throws if not initialized
 */
export function getGlobalWorkerClient(): DBWorkerClient {
  if (!globalWorkerClient) {
    throw new Error('[useDBWorkerClient] Worker client not initialized. Ensure useDBWorkerClient() is called at app root.');
  }
  return globalWorkerClient;
}

