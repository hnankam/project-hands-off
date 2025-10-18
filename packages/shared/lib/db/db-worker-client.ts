/**
 * Database Worker Client
 * Provides a clean API for the main thread to communicate with the DB worker
 * All database operations are non-blocking and happen in the worker
 */

// Message counter for unique IDs
let messageId = 0;

// Pending promises waiting for worker responses
const pendingMessages = new Map<string, {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}>();

/**
 * Database Worker Client Manager
 */
class DBWorkerClient {
  private worker: Worker | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private workerReadyPromise: Promise<void> | null = null;
  private workerReadyResolve: (() => void) | null = null;

  constructor(private workerPathOrUrl?: string | URL) {
    // Create promise that resolves when worker is ready
    this.workerReadyPromise = new Promise(resolve => {
      this.workerReadyResolve = resolve;
    });
  }

  private getWorkerPath(): string | URL {
    if (this.workerPathOrUrl) {
      return this.workerPathOrUrl;
    }
    // Default: try to resolve from side-panel package
    // This will be overridden by the consuming package
    return new URL('@src/workers/db-worker.ts', import.meta.url);
  }

  /**
   * Initialize the worker
   * @param useMemory - Always use in-memory storage (not IndexedDB) for embeddings
   */
  async initialize(useMemory = true): Promise<void> {
    if (this.isInitialized) {
      console.log('[DB Worker Client] Already initialized');
      return;
    }

    // Prevent duplicate initialization
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      try {
        // Create worker - path will be resolved by consuming package
        // Each package needs to provide the worker file location
        const workerPath = this.getWorkerPath();
        this.worker = new Worker(workerPath, { type: 'module' });

        // Set up message handler
        this.worker!.addEventListener('message', this.handleWorkerMessage.bind(this));
        
        // Set up error handler
        this.worker!.addEventListener('error', (error) => {
          console.error('[DB Worker Client] Worker error:', error);
        });

        console.log('[DB Worker Client] Worker created, waiting for ready signal...');

        // Wait for worker to signal it's ready
        await this.workerReadyPromise;

        console.log('[DB Worker Client] Worker ready, initializing database...');

        // Send initialization message
        // IMPORTANT: useMemory=true for in-memory storage (fast, no IndexedDB persistence)
        await this.sendMessage('initialize', {
          dbName: 'embeddings_db',
          useMemory: true, // Force in-memory storage (not IndexedDB)
        });

        this.isInitialized = true;
        console.log('[DB Worker Client] ✅ Initialized successfully');
      } catch (error) {
        console.error('[DB Worker Client] ❌ Failed to initialize:', error);
        this.initializationPromise = null;
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Handle messages from worker
   */
  private handleWorkerMessage(event: MessageEvent): void {
    const response = event.data;

    // Handle ready signal
    if (response.type === 'ready') {
      console.log('[DB Worker Client] Received ready signal from worker');
      if (this.workerReadyResolve) {
        this.workerReadyResolve();
        this.workerReadyResolve = null;
      }
      return;
    }

    // Handle operation responses
    const pending = pendingMessages.get(response.id);
    if (pending) {
      pendingMessages.delete(response.id);
      
      if (response.success) {
        pending.resolve(response.data);
      } else {
        pending.reject(new Error(response.error || 'Unknown error'));
      }
    }
  }

  /**
   * Send message to worker and wait for response
   */
  private async sendMessage(type: string, payload?: any): Promise<any> {
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    const id = `msg_${++messageId}`;
    
    return new Promise((resolve, reject) => {
      pendingMessages.set(id, { resolve, reject });
      
      this.worker!.postMessage({
        id,
        type,
        payload,
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (pendingMessages.has(id)) {
          pendingMessages.delete(id);
          reject(new Error(`Worker message timeout: ${type}`));
        }
      }, 30000);
    });
  }

  /**
   * Store HTML chunks with embeddings
   */
  async storeHTMLChunks(data: {
    pageURL: string;
    pageTitle: string;
    chunks: Array<{
      text: string;
      html: string;
      embedding: number[];
      index: number;
    }>;
    sessionId?: string;
  }): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log(`[DB Worker Client] 📤 Sending ${data.chunks.length} HTML chunks to worker...`);
    await this.sendMessage('storeHTMLChunks', data);
    console.log('[DB Worker Client] ✅ HTML chunks stored');
  }

  /**
   * Store form field groups with embeddings
   */
  async storeFormFields(data: {
    pageURL: string;
    groups: Array<{
      groupIndex: number;
      fieldsJSON: string;
      embedding: number[];
    }>;
    sessionId?: string;
  }): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log(`[DB Worker Client] 📤 Sending ${data.groups.length} form field groups to worker...`);
    await this.sendMessage('storeFormFields', data);
    console.log('[DB Worker Client] ✅ Form fields stored');
  }

  /**
   * Store clickable element groups with embeddings
   */
  async storeClickableElements(data: {
    pageURL: string;
    groups: Array<{
      groupIndex: number;
      elementsJSON: string;
      embedding: number[];
    }>;
    sessionId?: string;
  }): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log(`[DB Worker Client] 📤 Sending ${data.groups.length} clickable element groups to worker...`);
    await this.sendMessage('storeClickableElements', data);
    console.log('[DB Worker Client] ✅ Clickable elements stored');
  }

  /**
   * Search HTML chunks using HNSW index
   */
  async searchHTMLChunks(
    pageURL: string,
    queryEmbedding: number[],
    topK: number = 3
  ): Promise<Array<{
    id: string;
    pageURL: string;
    pageTitle: string;
    chunkIndex: number;
    text: string;
    html: string;
    similarity: number;
  }>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log(`[DB Worker Client] 🔍 Searching HTML chunks (topK=${topK})...`);
    const results = await this.sendMessage('searchHTMLChunks', {
      pageURL,
      queryEmbedding,
      topK,
    });
    console.log(`[DB Worker Client] ✅ Found ${results.length} results`);
    return results;
  }

  /**
   * Search form fields using HNSW index
   */
  async searchFormFields(
    pageURL: string,
    queryEmbedding: number[],
    topK: number = 5
  ): Promise<Array<{
    id: string;
    pageURL: string;
    selector: string;
    tagName: string;
    fieldType: string;
    fieldName: string;
    fieldId: string;
    placeholder?: string;
    fieldValue?: string;
    similarity: number;
  }>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log(`[DB Worker Client] 🔍 Searching form fields (topK=${topK})...`);
    const results = await this.sendMessage('searchFormFields', {
      pageURL,
      queryEmbedding,
      topK,
    });
    console.log(`[DB Worker Client] ✅ Found ${results.length} results`);
    return results;
  }

  /**
   * Search clickable elements using HNSW index
   */
  async searchClickableElements(
    pageURL: string,
    queryEmbedding: number[],
    topK: number = 5
  ): Promise<Array<{
    id: string;
    pageURL: string;
    selector: string;
    tagName: string;
    text: string;
    ariaLabel?: string;
    href?: string;
    similarity: number;
  }>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log(`[DB Worker Client] 🔍 Searching clickable elements (topK=${topK})...`);
    const results = await this.sendMessage('searchClickableElements', {
      pageURL,
      queryEmbedding,
      topK,
    });
    console.log(`[DB Worker Client] ✅ Found ${results.length} results`);
    return results;
  }

  /**
   * Execute custom query
   */
  async query<T>(sql: string, vars?: Record<string, unknown>): Promise<T> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return await this.sendMessage('query', { sql, vars });
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
      this.initializationPromise = null;
      pendingMessages.clear();
      console.log('[DB Worker Client] Worker terminated');
    }
  }
}

// Export class for custom instantiation with custom worker path
export { DBWorkerClient };

