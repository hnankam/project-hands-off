/**
 * Browser-compatible embedding service using @huggingface/transformers
 * This replaces fastembed which only works in Node.js
 */

// Dynamic import to avoid build issues
type Pipeline = any;
type FeatureExtractionPipeline = any;

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
 */
class EmbeddingService {
  private pipeline: FeatureExtractionPipeline | null = null;
  private currentModel: EmbeddingModel | null = null;
  private isLoading = false;
  private loadPromise: Promise<void> | null = null;

  /**
   * Initialize the embedding pipeline with a specific model
   */
  async initialize(options: EmbeddingOptions = {}): Promise<void> {
    const {
      model = EmbeddingModel.ALL_MINILM_L6_V2,
      normalize = true,
      pooling = 'mean',
      onProgress,
    } = options;

    // If already loading the same model, wait for it
    if (this.isLoading && this.currentModel === model && this.loadPromise) {
      return this.loadPromise;
    }

    // If model is already loaded, skip
    if (this.pipeline && this.currentModel === model) {
      console.log('Model already loaded:', model);
      return;
    }

    this.isLoading = true;
    this.currentModel = model;

    this.loadPromise = (async () => {
      try {
        // Dynamic import to avoid build-time issues
        const { pipeline } = await import('@huggingface/transformers');

        onProgress?.({ status: 'Loading model...', progress: 0 });

        // Initialize the feature extraction pipeline
        this.pipeline = await pipeline('feature-extraction', model, {
          progress_callback: (progress: any) => {
            onProgress?.({
              status: progress.status || 'Loading',
              progress: progress.progress || undefined,
            });
          },
        });

        // Store options for embedding generation
        (this.pipeline as any).__options = { normalize, pooling };

        onProgress?.({ status: 'Model loaded', progress: 100 });
        console.log('Embedding model loaded:', model);
      } catch (error) {
        console.error('Failed to load embedding model:', error);
        this.pipeline = null;
        this.currentModel = null;
        throw error;
      } finally {
        this.isLoading = false;
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  /**
   * Generate embeddings for a single text
   */
  async embed(text: string): Promise<number[]> {
    if (!this.pipeline) {
      throw new Error('Embedding model not initialized. Call initialize() first.');
    }

    const options = (this.pipeline as any).__options || { normalize: true, pooling: 'mean' };

    const output = await this.pipeline(text, {
      pooling: options.pooling,
      normalize: options.normalize,
    });

    // Convert to regular array
    return Array.from(output.data);
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async embedBatch(texts: string[], batchSize = 32): Promise<number[][]> {
    if (!this.pipeline) {
      throw new Error('Embedding model not initialized. Call initialize() first.');
    }

    const results: number[][] = [];

    // Process in batches to avoid memory issues
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchPromises = batch.map(text => this.embed(text));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Generate embeddings with progress reporting
   * This is a generator function that yields embeddings as they're computed
   */
  async *embedStream(texts: string[], batchSize = 32): AsyncGenerator<number[][], void, unknown> {
    if (!this.pipeline) {
      throw new Error('Embedding model not initialized. Call initialize() first.');
    }

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchPromises = batch.map(text => this.embed(text));
      const batchResults = await Promise.all(batchPromises);
      yield batchResults;
    }
  }

  /**
   * Get the current model being used
   */
  getCurrentModel(): EmbeddingModel | null {
    return this.currentModel;
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
    return this.pipeline !== null && !this.isLoading;
  }

  /**
   * Dispose of the current model to free memory
   */
  async dispose(): Promise<void> {
    if (this.pipeline) {
      // The pipeline has a dispose method
      if (typeof (this.pipeline as any).dispose === 'function') {
        await (this.pipeline as any).dispose();
      }
      this.pipeline = null;
      this.currentModel = null;
      console.log('Embedding model disposed');
    }
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

