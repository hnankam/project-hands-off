/**
 * Browser-compatible embedding service
 * Delegates to background script which uses offscreen document for embeddings
 * This avoids CSP issues and keeps transformers.js isolated
 */

// Debug logging toggle (development only)
const DEBUG = true;

/**
 * Supported embedding models
 */
export enum EmbeddingModel {
  /** Xenova's all-MiniLM-L6-v2 - Fast and efficient (384 dimensions) */
  ALL_MINILM_L6_V2 = 'Xenova/all-MiniLM-L6-v2',
  
  /** BGE Small English - Good balance of speed and quality (384 dimensions) */
  BGE_SMALL_EN_V1_5 = 'Xenova/bge-small-en-v1.5',
  
  /** BGE Base English - Higher quality (768 dimensions) */
  BGE_BASE_EN_V1_5 = 'Xenova/bge-base-en-v1.5',
  
  /** Multilingual E5 Small - Supports multiple languages (384 dimensions) */
  MULTILINGUAL_E5_SMALL = 'Xenova/multilingual-e5-small',
}

/**
 * Embedding options
 */
export interface EmbeddingOptions {
  /** Model to use for embeddings */
  model?: EmbeddingModel;
  
  /** Whether to normalize embeddings to unit length */
  normalize?: boolean;
  
  /** Pooling strategy: 'mean' or 'cls' */
  pooling?: 'mean' | 'cls';
  
  /** Progress callback for model loading */
  onProgress?: (progress: { status: string; progress?: number }) => void;
}

/**
 * Browser-compatible embedding service
 * Delegates to background script -> offscreen document for actual embeddings
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
      const responseListener = (message: any) => {
        if (message && message.type === respType && message.requestId === requestId) {
          chrome.runtime.onMessage.removeListener(responseListener);
          if (message.success) {
            resolve(message as T);
          } else {
            reject(new Error(message.error || `Failed ${reqType}`));
          }
        }
      };

      chrome.runtime.onMessage.addListener(responseListener);

      const timeoutMs = opts?.timeoutMs ?? 30000;
      const timeoutId = window.setTimeout(() => {
        chrome.runtime.onMessage.removeListener(responseListener);
        reject(new Error(`${reqType} timed out`));
      }, timeoutMs);

      const cleanupOnResolveReject = () => {
        window.clearTimeout(timeoutId);
      };

      // Ensure timeout cleared when promise settles
      const originalResolve = resolve;
      const originalReject = reject;
      // Wrap resolve/reject to clear timeout
      (resolve as any) = (value: any) => {
        cleanupOnResolveReject();
        originalResolve(value);
      };
      (reject as any) = (err: any) => {
        cleanupOnResolveReject();
        originalReject(err);
      };

      if (opts?.signal) {
        const onAbort = () => {
          chrome.runtime.onMessage.removeListener(responseListener);
          cleanupOnResolveReject();
          originalReject(new Error('Embedding request aborted'));
        };
        if (opts.signal.aborted) onAbort();
        else opts.signal.addEventListener('abort', onAbort, { once: true });
      }

      // Send request
      chrome.runtime
        .sendMessage({
          type: reqType,
          requestId,
          ...(payload || {}),
        })
        .catch(err => {
          chrome.runtime.onMessage.removeListener(responseListener);
          cleanupOnResolveReject();
          originalReject(err);
        });
    });
  }

  /**
   * Initialize the embedding service (signals background to prepare offscreen)
   */
  async initialize(options: EmbeddingOptions = {}, opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<void> {
    // If already loading, wait for it
    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }

    // If already initialized, skip
    if (this.initialized) {
      DEBUG && console.log('[EmbeddingService] Already initialized');
      return;
    }

    this.isLoading = true;

    this.loadPromise = (async () => {
      DEBUG && console.log('[EmbeddingService] Initializing via background script...');
      const response = await this.sendMessage<{ success: boolean }>(
        'initializeEmbedding',
        'initializeEmbeddingResponse',
        { options },
        opts
      );
      if (response && (response as any).success) {
        this.initialized = true;
        DEBUG && console.log('[EmbeddingService] ✅ Initialized successfully');
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
      DEBUG && console.log('[EmbeddingService] Not initialized, initializing now...');
      await this.initialize({}, opts);
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
      await this.initialize({}, { signal: opts?.signal });
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
      await this.initialize({}, { signal: opts?.signal });
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
   */
  getCurrentModel(): EmbeddingModel | null {
    return EmbeddingModel.ALL_MINILM_L6_V2; // Default model
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
    DEBUG && console.log('[EmbeddingService] Disposed');
  }
}

// Export singleton instance
export const embeddingService = new EmbeddingService();

// Export helper functions
export async function generateEmbedding(
  text: string,
  options?: EmbeddingOptions
): Promise<number[]> {
  if (!embeddingService.isReady()) {
    await embeddingService.initialize(options);
  }
  return embeddingService.embed(text);
}

export async function generateEmbeddings(
  texts: string[],
  options?: EmbeddingOptions & { batchSize?: number }
): Promise<number[][]> {
  const { batchSize = 32, ...initOptions } = options || {};
  
  if (!embeddingService.isReady()) {
    await embeddingService.initialize(initOptions);
  }
  
  return embeddingService.embedBatch(texts, batchSize);
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same length');
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Find most similar embeddings using cosine similarity
 */
export function findSimilar(
  queryEmbedding: number[],
  embeddings: number[][],
  topK = 5
): Array<{ index: number; similarity: number }> {
  const similarities = embeddings.map((embedding, index) => ({
    index,
    similarity: cosineSimilarity(queryEmbedding, embedding),
  }));

  // Sort by similarity descending
  similarities.sort((a, b) => b.similarity - a.similarity);

  return similarities.slice(0, topK);
}

