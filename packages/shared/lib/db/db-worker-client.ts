/**
 * Database Worker Client
 * Provides a clean API for the main thread to communicate with the DB worker
 * All database operations are non-blocking and happen in the worker
 */

import { debug } from '../utils/debug.js';

// Typed message contracts and error type
type DBOp =
  | 'initialize'
  | 'storeHTMLChunks'
  | 'storeFormFields'
  | 'storeClickableElements'
  | 'storeDOMUpdate'
  | 'searchHTMLChunks'
  | 'searchFormFields'
  | 'searchClickableElements'
  | 'query'
  | 'terminate';

interface WorkerRequest {
  id: string;
  type: DBOp;
  payload?: unknown;
}

interface WorkerResponse<T = unknown> {
  id: string;
  type: DBOp | 'ready';
  success?: boolean;
  data?: T;
  error?: string;
}

class DBWorkerError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
    this.name = 'DBWorkerError';
  }
}

/**
 * Database Worker Client Manager
 */
class DBWorkerClient {
  private worker: Worker | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private workerReadyPromise: Promise<void> | null = null;
  private workerReadyResolve: (() => void) | null = null;
  private messageId = 0;
  private pendingMessages = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout?: number;
  }>();
  private enableDebug = true;
  private defaultDbName = 'embeddings_db';
  private boundHandleWorkerMessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;

  // Constructor accepts optional config for advanced use cases
  constructor(private config?: { worker?: Worker; debug?: boolean; defaultDbName?: string }) {
    // Create promise that resolves when worker is ready
    this.workerReadyPromise = new Promise(resolve => {
      this.workerReadyResolve = resolve;
    });

    if (config) {
      if (config.debug !== undefined) this.enableDebug = config.debug;
      if (config.defaultDbName) this.defaultDbName = config.defaultDbName;
      if (config.worker) {
        this.worker = config.worker;
        this.attachWorkerListeners();
      }
    }
  }

  /**
   * Initialize the worker
   * @param useMemory - Always use in-memory storage (not IndexedDB) for embeddings
   */
  async initialize(useMemory = true, dbName: string = this.defaultDbName): Promise<void> {
    if (this.isInitialized) {
      if (this.enableDebug) debug.log('[DB Worker Client] Already initialized');
      return;
    }

    // Prevent duplicate initialization
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      try {
        // Create worker if not already provided via constructor
        if (!this.worker) {
          // Use .js extension because this file is consumed from the built dist of @extension/shared
          // Vite's new URL('./...', import.meta.url) correctly resolves the worker path at build time
          this.worker = new Worker(new URL('./db-worker.js', import.meta.url), { type: 'module' });
          this.attachWorkerListeners();
        }

        if (this.enableDebug) debug.log('[DB Worker Client] Worker created, waiting for ready signal...');

        // Wait for worker to signal it's ready
        await this.workerReadyPromise;

        if (this.enableDebug) debug.log('[DB Worker Client] Worker ready, initializing database...');

        // Send initialization message
        // IMPORTANT: useMemory=true for in-memory storage (fast, no IndexedDB persistence)
        await this.sendMessage('initialize', {
          dbName,
          useMemory,
        });

        this.isInitialized = true;
        if (this.enableDebug) debug.log('[DB Worker Client] Initialized successfully');
      } catch (error) {
        debug.error('[DB Worker Client] Failed to initialize:', error);
        this.initializationPromise = null;
        // Clean up worker on failure
        this.cleanup();
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Handle messages from worker
   */
  private handleWorkerMessage(event: MessageEvent<WorkerResponse>): void {
    const response = event.data as WorkerResponse;

    // Handle ready signal
    if (response.type === 'ready') {
      if (this.enableDebug) debug.log('[DB Worker Client] Received ready signal from worker');
      if (this.workerReadyResolve) {
        this.workerReadyResolve();
        this.workerReadyResolve = null;
      }
      return;
    }

    // Handle operation responses
    const pending = this.pendingMessages.get(response.id);
    if (pending) {
      this.pendingMessages.delete(response.id);
      if (pending.timeout) clearTimeout(pending.timeout);
      
      if (response.success) {
        pending.resolve(response.data);
      } else {
        pending.reject(new DBWorkerError(response.error || 'Unknown error'));
      }
    }
  }

  private attachWorkerListeners() {
    if (!this.worker) return;
    
    // Store bound handler to prevent memory leaks
    this.boundHandleWorkerMessage = this.handleWorkerMessage.bind(this);
    this.worker.addEventListener('message', this.boundHandleWorkerMessage);
    
    this.worker.addEventListener('error', (error: ErrorEvent) => {
      debug.error('[DB Worker Client] Worker error:', {
        message: error.message,
        filename: error.filename,
        lineno: error.lineno,
        colno: error.colno,
      });
    });
    
    this.worker.addEventListener('messageerror', (event) => {
      debug.error('[DB Worker Client] Worker messageerror:', event);
    });
  }

  /**
   * Clean up worker and listeners
   */
  private cleanup(): void {
    if (this.worker && this.boundHandleWorkerMessage) {
      this.worker.removeEventListener('message', this.boundHandleWorkerMessage);
      this.boundHandleWorkerMessage = null;
    }
  }

  /**
   * Send message to worker and wait for response
   */
  private async sendMessage<T = unknown>(type: DBOp, payload?: unknown, opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<T> {
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    const id = `dbw_${++this.messageId}`;
    
    return new Promise<T>((resolve, reject) => {
      const entry: { resolve: (value: any) => void; reject: (error: Error) => void; timeout?: number } = { resolve, reject };
      this.pendingMessages.set(id, entry);

      const req: WorkerRequest = { id, type, payload };
      this.worker!.postMessage(req);

      const timeoutMs = opts?.timeoutMs ?? 30000;
      entry.timeout = window.setTimeout(() => {
        if (this.pendingMessages.has(id)) {
          this.pendingMessages.delete(id);
          reject(new DBWorkerError(`Worker message timeout: ${type}`));
        }
      }, timeoutMs);

      if (opts?.signal) {
        const onAbort = () => {
          if (this.pendingMessages.has(id)) {
            if (entry.timeout) clearTimeout(entry.timeout);
            this.pendingMessages.delete(id);
            reject(new DBWorkerError(`Worker message aborted: ${type}`, 'ABORTED'));
          }
        };
        if (opts.signal.aborted) onAbort();
        else opts.signal.addEventListener('abort', onAbort, { once: true });
      }
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
  }, opts?: { timeoutMs?: number; signal?: AbortSignal; maxBatchSize?: number }): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    // Worker already batches internally - send all chunks at once for simplicity
    // If maxBatchSize is specified, respect it for memory constraints
    if (opts?.maxBatchSize && opts.maxBatchSize > 0 && opts.maxBatchSize < data.chunks.length) {
      const batch = opts.maxBatchSize;
      for (let i = 0; i < data.chunks.length; i += batch) {
        const portion = data.chunks.slice(i, i + batch);
        if (this.enableDebug) debug.log(`[DB Worker Client] Sending ${portion.length} HTML chunks (batch ${i + 1}/${Math.ceil(data.chunks.length / batch)})`);
        await this.sendMessage('storeHTMLChunks', { ...data, chunks: portion }, opts);
      }
    } else {
      if (this.enableDebug) debug.log(`[DB Worker Client] Sending ${data.chunks.length} HTML chunks`);
      await this.sendMessage('storeHTMLChunks', data, opts);
    }
    
    if (this.enableDebug) debug.log('[DB Worker Client] HTML chunks stored');
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
  }, opts?: { timeoutMs?: number; signal?: AbortSignal; maxBatchSize?: number }): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (opts?.maxBatchSize && opts.maxBatchSize > 0 && opts.maxBatchSize < data.groups.length) {
      const batch = opts.maxBatchSize;
      for (let i = 0; i < data.groups.length; i += batch) {
        const portion = data.groups.slice(i, i + batch);
        if (this.enableDebug) debug.log(`[DB Worker Client] Sending ${portion.length} form field groups (batch ${i + 1}/${Math.ceil(data.groups.length / batch)})`);
        await this.sendMessage('storeFormFields', { ...data, groups: portion }, opts);
      }
    } else {
      if (this.enableDebug) debug.log(`[DB Worker Client] Sending ${data.groups.length} form field groups`);
      await this.sendMessage('storeFormFields', data, opts);
    }
    
    if (this.enableDebug) debug.log('[DB Worker Client] Form fields stored');
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
  }, opts?: { timeoutMs?: number; signal?: AbortSignal; maxBatchSize?: number }): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (opts?.maxBatchSize && opts.maxBatchSize > 0 && opts.maxBatchSize < data.groups.length) {
      const batch = opts.maxBatchSize;
      for (let i = 0; i < data.groups.length; i += batch) {
        const portion = data.groups.slice(i, i + batch);
        if (this.enableDebug) debug.log(`[DB Worker Client] Sending ${portion.length} clickable element groups (batch ${i + 1}/${Math.ceil(data.groups.length / batch)})`);
        await this.sendMessage('storeClickableElements', { ...data, groups: portion }, opts);
      }
    } else {
      if (this.enableDebug) debug.log(`[DB Worker Client] Sending ${data.groups.length} clickable element groups`);
      await this.sendMessage('storeClickableElements', data, opts);
    }
    
    if (this.enableDebug) debug.log('[DB Worker Client] Clickable elements stored');
  }

  /**
   * Store DOM update with embedding and recency score
   */
  async storeDOMUpdate(data: {
    pageURL: string;
    pageTitle: string;
    updateJSON: string;
    summary: string;
    embedding: number[];
    sessionId?: string;
  }, opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    if (this.enableDebug) debug.log('[DB Worker Client] Storing DOM update');
    await this.sendMessage('storeDOMUpdate', data, opts);
    if (this.enableDebug) debug.log('[DB Worker Client] DOM update stored');
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

    if (this.enableDebug) debug.log(`[DB Worker Client] Searching HTML chunks (topK=${topK})...`);
    const results = await this.sendMessage<Array<{
      id: string;
      pageURL: string;
      pageTitle: string;
      chunkIndex: number;
      text: string;
      html: string;
      similarity: number;
    }>>('searchHTMLChunks', {
      pageURL,
      queryEmbedding,
      topK,
    });
    if (this.enableDebug) debug.log(`[DB Worker Client] Found ${results.length} results`);
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

    if (this.enableDebug) debug.log(`[DB Worker Client] Searching form fields (topK=${topK})...`);
    const results = await this.sendMessage<Array<{
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
    }>>('searchFormFields', {
      pageURL,
      queryEmbedding,
      topK,
    }, { timeoutMs: 10000 });
    if (this.enableDebug) debug.log(`[DB Worker Client] Found ${results.length} results`);
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

    if (this.enableDebug) debug.log(`[DB Worker Client] Searching clickable elements (topK=${topK})...`);
    const results = await this.sendMessage<Array<{
      id: string;
      pageURL: string;
      selector: string;
      tagName: string;
      text: string;
      ariaLabel?: string;
      href?: string;
      similarity: number;
    }>>('searchClickableElements', {
      pageURL,
      queryEmbedding,
      topK,
    });
    if (this.enableDebug) debug.log(`[DB Worker Client] Found ${results.length} results`);
    return results;
  }

  /**
   * Execute custom query
   */
  async query<T>(sql: string, vars?: Record<string, unknown>, opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<T> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return await this.sendMessage('query', { sql, vars }, opts);
  }

  /**
   * Terminate the worker gracefully
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      try {
        // Send terminate message to allow graceful DB cleanup
        if (this.isInitialized) {
          await this.sendMessage('terminate', undefined, { timeoutMs: 5000 });
        }
      } catch (error) {
        debug.warn('[DB Worker Client] Failed to send terminate message:', error);
      } finally {
        this.cleanup();
        this.worker.terminate();
        this.worker = null;
        this.isInitialized = false;
        this.initializationPromise = null;
        this.workerReadyPromise = null;
        this.workerReadyResolve = null;
        this.pendingMessages.forEach(entry => entry.timeout && clearTimeout(entry.timeout));
        this.pendingMessages.clear();
        if (this.enableDebug) debug.log('[DB Worker Client] Worker terminated');
      }
    }
  }
}

// Export class for custom instantiation with custom worker path
export { DBWorkerClient, DBWorkerError };

