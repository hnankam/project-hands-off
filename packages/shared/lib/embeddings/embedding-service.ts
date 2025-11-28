/**
 * Browser-compatible embedding service
 * Delegates to background script which uses offscreen document for embeddings
 * This avoids CSP issues and keeps transformers.js isolated
 */

import { debug } from '../utils/debug.js';

/**
 * Browser-compatible embedding service
 * Delegates to background script -> offscreen document for actual embeddings
 * 
 * NOTE: Model configuration is set in pages/offscreen/src/embedding-config.ts
 * The model cannot be changed at runtime - it's compiled into the offscreen document
 */
class EmbeddingService {
  private initialized = false;
  private isLoading = false;
  private loadPromise: Promise<void> | null = null;

  private sendMessage<T = any>(
    reqType: string,
    respType: string,
    payload?: Record<string, unknown>,
    opts?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<T> {
    const requestId = `${reqType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return new Promise<T>((resolve, reject) => {
      let isSettled = false;
      let timeoutId: number | null = null;

      // Cleanup function to ensure all resources are released
      const cleanup = () => {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
        chrome.runtime.onMessage.removeListener(responseListener);
      };

      // Wrapper for resolve that ensures cleanup
      const safeResolve = (value: T) => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        resolve(value);
      };

      // Wrapper for reject that ensures cleanup
      const safeReject = (error: Error) => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        reject(error);
      };

      const responseListener = (message: any) => {
        if (message && message.type === respType && message.requestId === requestId) {
          if (message.success) {
            safeResolve(message as T);
          } else {
            safeReject(new Error(message.error || `Failed ${reqType}`));
          }
        }
      };

      chrome.runtime.onMessage.addListener(responseListener);

      // Set timeout
      const timeoutMs = opts?.timeoutMs ?? 30000;
      timeoutId = window.setTimeout(() => {
        safeReject(new Error(`${reqType} timed out`));
      }, timeoutMs);

      // Handle abort signal
      if (opts?.signal) {
        const onAbort = () => {
          safeReject(new Error('Embedding request aborted'));
        };
        if (opts.signal.aborted) {
          onAbort();
          return;
        }
        opts.signal.addEventListener('abort', onAbort, { once: true });
      }

      // Send request
      chrome.runtime
        .sendMessage({
          type: reqType,
          requestId,
          ...(payload || {}),
        })
        .catch(err => {
          safeReject(err);
        });
    });
  }

  /**
   * Initialize the embedding service (signals background to prepare offscreen)
   */
  async initialize(opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<void> {
    // If already loading, wait for it
    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }

    // If already initialized, skip
    if (this.initialized) {
      debug.log('[EmbeddingService] Already initialized');
      return;
    }

    this.isLoading = true;

    this.loadPromise = (async () => {
      debug.log('[EmbeddingService] Initializing via background script...');
      const response = await this.sendMessage<{ success: boolean }>(
        'initializeEmbedding',
        'initializeEmbeddingResponse',
        {},
        opts
      );
      if (response && (response as any).success) {
        this.initialized = true;
        debug.log('[EmbeddingService] Initialized successfully');
        this.isLoading = false;
        this.loadPromise = null;
      } else {
        this.initialized = false;
        this.isLoading = false;
        this.loadPromise = null;
        throw new Error('Failed to initialize embedding service');
      }
    })();

    return this.loadPromise;
  }

  /**
   * Generate embeddings for a single text (delegates to background script)
   */
  async embed(text: string, opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<number[]> {
    if (!this.initialized) {
      debug.log('[EmbeddingService] Not initialized, initializing now...');
      await this.initialize(opts);
    }

    const res = await this.sendMessage<{ success: boolean; embedding: number[] }>(
      'generateEmbedding',
      'generateEmbeddingResponse',
      { text },
      opts
    );
    return (res as any).embedding as number[];
  }

  /**
   * Generate embeddings for multiple texts in batch (delegates to background script)
   */
  async embedBatch(texts: string[], batchSize = 32, opts?: { timeoutMsPerItem?: number; signal?: AbortSignal }): Promise<number[][]> {
    if (!this.initialized) {
      await this.initialize({ signal: opts?.signal });
    }

    // Just delegate to background script - it handles batching efficiently
    const results: number[][] = [];
    for (const text of texts) {
      const embedding = await this.embed(text, { timeoutMs: opts?.timeoutMsPerItem, signal: opts?.signal });
      results.push(embedding);
    }
    return results;
  }

  /**
   * Generate embeddings with progress reporting
   * This is a generator function that yields embeddings as they're computed
   */
  async *embedStream(texts: string[], batchSize = 32, opts?: { timeoutMsPerItem?: number; signal?: AbortSignal }): AsyncGenerator<number[][], void, unknown> {
    if (!this.initialized) {
      await this.initialize({ signal: opts?.signal });
    }

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchResults: number[][] = [];
      for (const text of batch) {
        const embedding = await this.embed(text, { timeoutMs: opts?.timeoutMsPerItem, signal: opts?.signal });
        batchResults.push(embedding);
      }
      yield batchResults;
    }
  }

  /**
   * Get the current model being used
   * NOTE: Model is configured in pages/offscreen/src/embedding-config.ts
   */
  getCurrentModel(): string {
    return 'Xenova/paraphrase-MiniLM-L3-v2'; // See embedding-config.ts
  }

  /**
   * Check if a model is currently loading
   */
  isModelLoading(): boolean {
    return this.isLoading;
  }

  /**
   * Check if a model is loaded and ready
   */
  isReady(): boolean {
    return this.initialized && !this.isLoading;
  }

  /**
   * Dispose of the current model to free memory
   */
  async dispose(): Promise<void> {
    this.initialized = false;
    debug.log('[EmbeddingService] Disposed');
  }
}

// Export singleton instance
export const embeddingService = new EmbeddingService();

// Export helper functions for backward compatibility
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!embeddingService.isReady()) {
    await embeddingService.initialize();
  }
  return embeddingService.embed(text);
}

export async function generateEmbeddings(
  texts: string[],
  options?: { batchSize?: number }
): Promise<number[][]> {
  const { batchSize = 32 } = options || {};
  
  if (!embeddingService.isReady()) {
    await embeddingService.initialize();
  }
  
  return embeddingService.embedBatch(texts, batchSize);
}
