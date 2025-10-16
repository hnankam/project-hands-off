/**
 * Browser-compatible embedding service
 * Delegates to background script which uses offscreen document for embeddings
 * This avoids CSP issues and keeps transformers.js isolated
 */

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

  /**
   * Initialize the embedding service (signals background to prepare offscreen)
   */
  async initialize(options: EmbeddingOptions = {}): Promise<void> {
    // If already loading, wait for it
    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }

    // If already initialized, skip
    if (this.initialized) {
      console.log('[EmbeddingService] Already initialized');
      return;
    }

    this.isLoading = true;

    this.loadPromise = (async () => {
      try {
        console.log('[EmbeddingService] Initializing via background script...');
        
        // Signal background script to initialize offscreen document
        const response = await chrome.runtime.sendMessage({
          type: 'initializeEmbedding'
        });

        if (!response.success) {
          throw new Error(response.error || 'Failed to initialize embedding service');
        }

        this.initialized = true;
        console.log('[EmbeddingService] ✅ Initialized successfully');
      } catch (error) {
        console.error('[EmbeddingService] Failed to initialize:', error);
        this.initialized = false;
        throw error;
      } finally {
        this.isLoading = false;
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  /**
   * Generate embeddings for a single text (delegates to background script)
   */
  async embed(text: string): Promise<number[]> {
    if (!this.initialized) {
      console.log('[EmbeddingService] Not initialized, initializing now...');
      await this.initialize();
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'generateEmbedding',
        text
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to generate embedding');
      }

      return response.embedding;
    } catch (error) {
      console.error('[EmbeddingService] Failed to generate embedding:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch (delegates to background script)
   */
  async embedBatch(texts: string[], batchSize = 32): Promise<number[][]> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Just delegate to background script - it handles batching efficiently
    const results: number[][] = [];
    for (const text of texts) {
      const embedding = await this.embed(text);
      results.push(embedding);
    }
    return results;
  }

  /**
   * Generate embeddings with progress reporting
   * This is a generator function that yields embeddings as they're computed
   */
  async *embedStream(texts: string[], batchSize = 32): AsyncGenerator<number[][], void, unknown> {
    if (!this.initialized) {
      await this.initialize();
    }

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchResults: number[][] = [];
      for (const text of batch) {
        const embedding = await this.embed(text);
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
    console.log('[EmbeddingService] Disposed');
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

