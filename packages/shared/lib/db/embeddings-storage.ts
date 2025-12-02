/**
 * Embeddings Storage Service using SurrealDB with IndexedDB
 * Stores page embeddings persistently for fast semantic search
 */

import { DBWorkerClient } from './db-worker-client.js';
import { debug } from '../utils/debug.js';

/**
 * Embeddings Storage Manager
 */
class EmbeddingsStorageManager {
  private isInitialized = false;
  private workerClient: DBWorkerClient | null = null;

  /**
   * Set the worker client (must be called before any operations)
   */
  setWorkerClient(client: DBWorkerClient): void {
    this.workerClient = client;
  }

  /**
   * Get worker client (throws if not set)
   */
  private getWorkerClient(): DBWorkerClient {
    if (!this.workerClient) {
      throw new Error('[EmbeddingsStorage] Worker client not initialized. Call setWorkerClient() first.');
    }
    return this.workerClient;
  }

  /**
   * Initialize the embeddings storage
   */
  async initialize(useMemory = false): Promise<void> {
    if (this.isInitialized) {
      debug.log('[EmbeddingsStorage] Already initialized');
      return;
    }

    if (!this.workerClient) {
      throw new Error('[EmbeddingsStorage] Worker client not set. Call setWorkerClient() first or pass worker to constructor.');
    }

    try {
      // Initialize DB worker (IndexedDB by default for persistence)
      await this.getWorkerClient().initialize(useMemory);

      this.isInitialized = true;
      debug.log('[EmbeddingsStorage] Initialized successfully');
    } catch (error) {
      debug.error('[EmbeddingsStorage] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Helper method to count records in a table
   */
  private async count(table: string, pageURL: string, errorContext: string): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    try {
      const res = await this.getWorkerClient().query<any[]>(
        `SELECT count() AS c FROM ${table} WHERE pageURL = $url;`,
        { url: pageURL }
      );
      const row = res?.[0]?.[0];
      return typeof row?.c === 'number' ? row.c : 0;
    } catch (error) {
      debug.error(`[EmbeddingsStorage] Failed to count ${errorContext}:`, error);
      return 0;
    }
  }

  /**
   * Count helpers for pagination/non-semantic access
   */
  async countHTMLChunks(pageURL: string): Promise<number> {
    return this.count('html_chunks', pageURL, 'HTML chunks');
  }

  async countFormFields(pageURL: string): Promise<number> {
    return this.count('form_fields', pageURL, 'form fields');
  }

  async countClickableElements(pageURL: string): Promise<number> {
    return this.count('clickable_elements', pageURL, 'clickable elements');
  }

  // ========================================
  // New: Pagination (range) fetchers for agent use
  // ========================================

  /**
   * Fetch HTML chunks by chunkIndex range (inclusive)
   */
  async fetchHTMLChunksByRange(
    pageURL: string,
    startIndex: number,
    endIndex: number
  ): Promise<Array<{ chunkIndex: number; text: string; html: string }>> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    const s = Math.max(0, Math.min(startIndex, endIndex));
    const e = Math.max(startIndex, endIndex);
    try {
      const res = await this.getWorkerClient().query<any[]>(
        `SELECT chunkIndex, text, html
         FROM html_chunks
         WHERE pageURL = $url AND chunkIndex >= $s AND chunkIndex <= $e
         ORDER BY chunkIndex ASC;`,
        { url: pageURL, s, e }
      );
      const rows = res?.[0] || [];
      return rows.map((r: any) => ({
        chunkIndex: r.chunkIndex,
        text: r.text || '',
        html: r.html || ''
      }));
    } catch (error) {
      debug.error('[EmbeddingsStorage] Failed to fetch HTML chunks range:', error);
      return [];
    }
  }

  /**
   * Fetch form field chunks (groups) by groupIndex range (inclusive)
   */
  async fetchFormChunksByRange(
    pageURL: string,
    startGroup: number,
    endGroup: number
  ): Promise<Array<{ groupIndex: number; fields: any[] }>> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    const s = Math.max(0, Math.min(startGroup, endGroup));
    const e = Math.max(startGroup, endGroup);
    try {
      const res = await this.getWorkerClient().query<any[]>(
        `SELECT groupIndex, fieldsJSON
         FROM form_fields
         WHERE pageURL = $url AND groupIndex >= $s AND groupIndex <= $e
         ORDER BY groupIndex ASC;`,
        { url: pageURL, s, e }
      );
      const rows = res?.[0] || [];
      return rows.map((r: any) => {
        let fields: any[] = [];
        try { 
          fields = JSON.parse(r.fieldsJSON);
        } catch (err) {
          debug.error('[EmbeddingsStorage] Failed to parse fieldsJSON:', err);
        }
        return { groupIndex: r.groupIndex, fields: Array.isArray(fields) ? fields : [] };
      });
    } catch (error) {
      debug.error('[EmbeddingsStorage] Failed to fetch form chunks range:', error);
      return [];
    }
  }

  /**
   * Fetch clickable element chunks (groups) by groupIndex range (inclusive)
   */
  async fetchClickableChunksByRange(
    pageURL: string,
    startGroup: number,
    endGroup: number
  ): Promise<Array<{ groupIndex: number; elements: any[] }>> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    const s = Math.max(0, Math.min(startGroup, endGroup));
    const e = Math.max(startGroup, endGroup);
    try {
      const res = await this.getWorkerClient().query<any[]>(
        `SELECT groupIndex, elementsJSON
         FROM clickable_elements
         WHERE pageURL = $url AND groupIndex >= $s AND groupIndex <= $e
         ORDER BY groupIndex ASC;`,
        { url: pageURL, s, e }
      );
      const rows = res?.[0] || [];
      return rows.map((r: any) => {
        let elements: any[] = [];
        try { 
          elements = JSON.parse(r.elementsJSON);
        } catch (err) {
          debug.error('[EmbeddingsStorage] Failed to parse elementsJSON:', err);
        }
        return { groupIndex: r.groupIndex, elements: Array.isArray(elements) ? elements : [] };
      });
    } catch (error) {
      debug.error('[EmbeddingsStorage] Failed to fetch clickable chunks range:', error);
      return [];
    }
  }

  /**
   * Store HTML chunks with embeddings in separate table (with HNSW index)
   * OPTIMIZED: Uses batching with yielding to prevent UI freeze
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

    try {
      await this.getWorkerClient().storeHTMLChunks({
        pageURL: data.pageURL,
        pageTitle: data.pageTitle,
        chunks: data.chunks,
        sessionId: data.sessionId,
      });
      debug.log(`[EmbeddingsStorage] Stored ${data.chunks.length} HTML chunks via worker`);
    } catch (error) {
      debug.error('[EmbeddingsStorage] Failed to store HTML chunks:', error);
      throw error;
    }
  }

  /**
   * Store form field groups with embeddings from JSON strings (with HNSW index)
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

    try {
      await this.getWorkerClient().storeFormFields({
        pageURL: data.pageURL,
        groups: data.groups,
        sessionId: data.sessionId,
      });
      debug.log(`[EmbeddingsStorage] Stored ${data.groups.length} form field groups via worker`);
    } catch (error) {
      debug.error('[EmbeddingsStorage] Failed to store form fields:', error);
      throw error;
    }
  }

  /**
   * Store clickable element groups with embeddings from JSON strings (with HNSW index)
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

    try {
      await this.getWorkerClient().storeClickableElements({
        pageURL: data.pageURL,
        groups: data.groups,
        sessionId: data.sessionId,
      });
      debug.log(`[EmbeddingsStorage] Stored ${data.groups.length} clickable element groups via worker`);
    } catch (error) {
      debug.error('[EmbeddingsStorage] Failed to store clickable elements:', error);
      throw error;
    }
  }

  /**
   * Store DOM update with embedding and recency score
   */
  async storeDOMUpdate(data: {
    pageURL: string;
    pageTitle: string;
    domUpdate: any;
    embedding: number[];
    sessionId?: string;
  }): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!data.domUpdate || !data.embedding || data.embedding.length === 0) {
      debug.log('[EmbeddingsStorage] Skipping DOM update storage - invalid data');
      return;
    }

    try {
      // Use dedicated worker method for optimized performance
      const summary = this.createDOMUpdateSummary(data.domUpdate);
      const updateJSON = JSON.stringify(data.domUpdate);
      
      await this.getWorkerClient().storeDOMUpdate({
        pageURL: data.pageURL,
        pageTitle: data.pageTitle,
        updateJSON,
        summary,
        embedding: data.embedding,
        sessionId: data.sessionId,
      });
      
      debug.log('[EmbeddingsStorage] Stored DOM update via worker');
    } catch (error) {
      debug.error('[EmbeddingsStorage] Failed to store DOM update:', error);
      throw error;
    }
  }

  /**
   * Create a human-readable summary of DOM update for better semantic search
   */
  private createDOMUpdateSummary(domUpdate: any): string {
    const parts: string[] = [];
    
    if (domUpdate.addedElements && domUpdate.addedElements.length > 0) {
      const elements = domUpdate.addedElements
        .map((el: any) => {
          const tag = el.tagName || 'element';
          const text = el.textContent ? `: "${el.textContent.substring(0, 50)}"` : '';
          return `${tag}${text}`;
        })
        .join(', ');
      parts.push(`Added ${domUpdate.addedElements.length} element(s): ${elements}`);
    }
    
    if (domUpdate.removedElements && domUpdate.removedElements.length > 0) {
      const elements = domUpdate.removedElements
        .map((el: any) => {
          const tag = el.tagName || 'element';
          const text = el.textContent ? `: "${el.textContent.substring(0, 50)}"` : '';
          return `${tag}${text}`;
        })
        .join(', ');
      parts.push(`Removed ${domUpdate.removedElements.length} element(s): ${elements}`);
    }
    
    if (domUpdate.textChanges && domUpdate.textChanges.length > 0) {
      const changes = domUpdate.textChanges
        .map((change: any) => `${change.type}: "${change.text?.substring(0, 50) || ''}"`)
        .join(', ');
      parts.push(`Text changes (${domUpdate.textChanges.length}): ${changes}`);
    }
    
    if (domUpdate.summary) {
      parts.push(`Summary: ${JSON.stringify(domUpdate.summary)}`);
    }
    
    return parts.join('. ') || 'DOM update with no details';
  }

  // Note: DOM update recency decay is now handled automatically by the worker's storeDOMUpdate function

  /**
   * Native vector search for HTML chunks using HNSW index
   * Supports single pageURL, array of pageURLs, or all pages (when both are undefined)
   */
  async searchHTMLChunks(
    pageURL: string | undefined,
    queryEmbedding: number[],
    topK: number = 3,
    pageURLs?: string[]
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

    try {
      debug.log('[EmbeddingsStorage] HNSW search - HTML chunks:', { pageURL, pageURLs, topK });
      
      // Use dedicated search method in worker client (optimized path)
      const results = await this.getWorkerClient().searchHTMLChunks(pageURL, queryEmbedding, topK, pageURLs);

      debug.log(`[EmbeddingsStorage] HNSW: Found ${results.length} HTML chunks`);
      return results;
    } catch (error) {
      debug.error('[EmbeddingsStorage] Failed to search HTML chunks:', error);
      return [];
    }
  }

  /**
   * Native vector search for form fields using HNSW index
   * Supports single pageURL, array of pageURLs, or all pages (when both are undefined)
   */
  async searchFormFields(
    pageURL: string | undefined,
    queryEmbedding: number[],
    topK: number = 5,
    pageURLs?: string[]
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

    try {
      debug.log('[EmbeddingsStorage] HNSW search - Form fields:', { pageURL, pageURLs, topK });
      
      // Use dedicated search method in worker client (optimized path)
      const results = await this.getWorkerClient().searchFormFields(pageURL, queryEmbedding, topK, pageURLs);

      debug.log(`[EmbeddingsStorage] HNSW: Found ${results.length} form fields`);
      return results;
    } catch (error) {
      debug.error('[EmbeddingsStorage] Failed to search form fields:', error);
      return [];
    }
  }

  /**
   * Native vector search for clickable elements using HNSW index
   * Supports single pageURL, array of pageURLs, or all pages (when both are undefined)
   */
  async searchClickableElements(
    pageURL: string | undefined,
    queryEmbedding: number[],
    topK: number = 5,
    pageURLs?: string[]
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

    try {
      debug.log('[EmbeddingsStorage] HNSW search - Clickable elements:', { pageURL, pageURLs, topK });
      
      // Use dedicated search method in worker client (optimized path)
      const results = await this.getWorkerClient().searchClickableElements(pageURL, queryEmbedding, topK, pageURLs);

      debug.log(`[EmbeddingsStorage] HNSW: Found ${results.length} clickable elements`);
      return results;
    } catch (error) {
      debug.error('[EmbeddingsStorage] Failed to search clickable elements:', error);
      return [];
    }
  }

  /**
   * Native vector search for DOM updates using HNSW index with recency weighting
   */
  async searchDOMUpdates(
    pageURL: string,
    queryEmbedding: number[],
    topK: number = 5
  ): Promise<Array<{
    id: string;
    pageURL: string;
    pageTitle: string;
    domUpdate: any;
    summary: string;
    timestamp: Date;
    recencyScore: number;
    similarity: number;
    combinedScore: number;
  }>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      debug.log('[EmbeddingsStorage] HNSW search - DOM updates (with recency):', { pageURL, topK });

      // Get more results than needed so we can apply recency weighting
      const searchK = Math.min(topK * 3, 20);
      const efSearch = Math.max(searchK * 3, 100);
      
      const results = await this.getWorkerClient().query<any[]>(`
        LET $q = $embedding;
        SELECT 
          id,
          pageURL,
          pageTitle,
          updateJSON,
          summary,
          timestamp,
          recencyScore,
          vector::distance::knn() AS distance
        FROM dom_updates
        WHERE 
          pageURL = $url
          AND embedding <|${searchK},${efSearch}|> $q
        ORDER BY timestamp DESC;
      `, {
        url: pageURL,
        embedding: queryEmbedding,
      });

      // Results are in index 1 (because of LET statement)
      if (!results || results.length < 2 || !results[1] || results[1].length === 0) {
        debug.log('[EmbeddingsStorage] No DOM updates found');
        return [];
      }

      // Parse and combine semantic similarity with recency score
      const domUpdates = results[1].map((record: any) => {
        const similarity = 1 - record.distance;
        const recencyScore = record.recencyScore || 0.5;
        
        // Combined score: 60% semantic similarity + 40% recency
        // This ensures recent changes are prioritized while still being relevant
        const combinedScore = (similarity * 0.6) + (recencyScore * 0.4);
        
        let domUpdate = null;
        try {
          domUpdate = JSON.parse(record.updateJSON);
        } catch (e) {
          debug.error('[EmbeddingsStorage] Failed to parse updateJSON:', e);
          domUpdate = { error: 'Failed to parse update' };
        }

        return {
          id: record.id,
          pageURL: record.pageURL,
          pageTitle: record.pageTitle,
          domUpdate,
          summary: record.summary,
          timestamp: new Date(record.timestamp),
          recencyScore,
          similarity,
          combinedScore,
        };
      });

      // Sort by combined score (semantic + recency) and return top K
      domUpdates.sort((a: any, b: any) => b.combinedScore - a.combinedScore);
      const topResults = domUpdates.slice(0, topK);

      debug.log(`[EmbeddingsStorage] HNSW: Found ${topResults.length} DOM updates (semantic + recency weighted)`);
      return topResults;
    } catch (error) {
      debug.error('[EmbeddingsStorage] Failed to search DOM updates:', error);
      return [];
    }
  }

  /**
   * Full-text search for HTML chunks using BM25
   * Supports single pageURL, array of pageURLs, or all pages (when both are undefined)
   */
  async fullTextSearchHTMLChunks(
    pageURL: string | undefined,
    query: string,
    topK: number = 3,
    pageURLs?: string[]
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

    try {
      debug.log('[EmbeddingsStorage] Full-text search - HTML chunks:', { pageURL, pageURLs, query, topK });
      const results = await this.getWorkerClient().fullTextSearchHTMLChunks(pageURL, query, topK, pageURLs);
      debug.log(`[EmbeddingsStorage] FTS: Found ${results?.length || 0} HTML chunks`);
      return results || [];
    } catch (error) {
      debug.error('[EmbeddingsStorage] Failed to full-text search HTML chunks:', error);
      return [];
    }
  }

  /**
   * Hybrid search for HTML chunks combining vector and full-text search
   * Default weights: 70% semantic, 30% keyword
   * Supports single pageURL, array of pageURLs, or all pages (when both are undefined)
   */
  async hybridSearchHTMLChunks(
    pageURL: string | undefined,
    query: string,
    queryEmbedding: number[],
    topK: number = 3,
    semanticWeight: number = 0.7,
    keywordWeight: number = 0.3,
    pageURLs?: string[]
  ): Promise<Array<{
    id: string;
    pageURL: string;
    pageTitle: string;
    chunkIndex: number;
    text: string;
    html: string;
    similarity: number;
    semanticScore: number;
    keywordScore: number;
  }>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      debug.log('[EmbeddingsStorage] Hybrid search - HTML chunks:', { 
        pageURL, 
        pageURLs,
        query, 
        topK, 
        semanticWeight, 
        keywordWeight 
      });
      const results = await this.getWorkerClient().hybridSearchHTMLChunks(
        pageURL, 
        query, 
        queryEmbedding, 
        topK, 
        semanticWeight, 
        keywordWeight,
        pageURLs
      );
      debug.log(`[EmbeddingsStorage] Hybrid: Found ${results?.length || 0} HTML chunks`);
      return results || [];
    } catch (error) {
      debug.error('[EmbeddingsStorage] Failed to hybrid search HTML chunks:', error);
      return [];
    }
  }

  /**
   * Full-text search for form fields
   */
  async fullTextSearchFormFields(
    pageURL: string,
    query: string,
    topK: number = 5
  ): Promise<Array<{
    id: string;
    pageURL: string;
    selector: string;
    tagName: string;
    type?: string;
    name?: string;
    label?: string;
    placeholder?: string;
    value?: string;
    similarity: number;
  }>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      debug.log('[EmbeddingsStorage] Full-text search - form fields:', { pageURL, query, topK });
      const results = await this.getWorkerClient().fullTextSearchFormFields(pageURL, query, topK);
      debug.log(`[EmbeddingsStorage] FTS: Found ${results?.length || 0} form fields`);
      return results || [];
    } catch (error) {
      debug.error('[EmbeddingsStorage] Failed to full-text search form fields:', error);
      return [];
    }
  }

  /**
   * Full-text search for clickable elements
   */
  async fullTextSearchClickableElements(
    pageURL: string,
    query: string,
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

    try {
      debug.log('[EmbeddingsStorage] Full-text search - clickable elements:', { pageURL, query, topK });
      const results = await this.getWorkerClient().fullTextSearchClickableElements(pageURL, query, topK);
      debug.log(`[EmbeddingsStorage] FTS: Found ${results?.length || 0} clickable elements`);
      return results || [];
    } catch (error) {
      debug.error('[EmbeddingsStorage] Failed to full-text search clickable elements:', error);
      return [];
    }
  }

  /**
   * Get all indexed pages with summary information
   * Returns lightweight summaries suitable for agent context
   */
  async getAllIndexedPages(options?: {
    sessionId?: string;
    limit?: number;
    includeEmpty?: boolean;
  }): Promise<Array<{
    pageURL: string;
    pageTitle: string;
    htmlChunkCount: number;
    formChunkCount: number;
    clickableChunkCount: number;
    lastIndexed: Date;
    sessionId?: string;
  }>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const { sessionId, limit = 100, includeEmpty = false } = options || {};

    try {
      debug.log('[EmbeddingsStorage] Getting all indexed pages:', { sessionId, limit });

      // Get HTML chunks grouped by page
      // First get all pages with their latest timestamps
      const htmlQuery = `
        SELECT 
          pageURL,
          pageTitle,
          timestamp,
          sessionId
        FROM html_chunks
        ${sessionId ? 'WHERE sessionId = $sessionId' : ''}
        ORDER BY pageURL, timestamp DESC;
      `;

      const htmlResult = await this.getWorkerClient().query<any[]>(
        htmlQuery,
        sessionId ? { sessionId } : undefined
      );
      const htmlChunks = htmlResult?.[0] || [];
      
      // Group chunks by page and get counts + latest timestamp
      const pageMap = new Map<string, { 
        pageURL: string; 
        pageTitle: string; 
        chunkCount: number; 
        lastIndexed: any;
        sessionId: string;
      }>();
      
      for (const chunk of htmlChunks) {
        const existing = pageMap.get(chunk.pageURL);
        if (existing) {
          existing.chunkCount++;
          // Keep the latest timestamp (chunks are ordered by timestamp DESC per page)
          if (!existing.lastIndexed && chunk.timestamp) {
            existing.lastIndexed = chunk.timestamp;
          }
        } else {
          pageMap.set(chunk.pageURL, {
            pageURL: chunk.pageURL,
            pageTitle: chunk.pageTitle || 'Untitled Page',
            chunkCount: 1,
            lastIndexed: chunk.timestamp,
            sessionId: chunk.sessionId,
          });
        }
      }
      
      // Convert map to array and sort by lastIndexed
      let htmlPages = Array.from(pageMap.values()).sort((a, b) => {
        const aTime = a.lastIndexed ? new Date(a.lastIndexed).getTime() : 0;
        const bTime = b.lastIndexed ? new Date(b.lastIndexed).getTime() : 0;
        return bTime - aTime; // Most recent first
      });
      
      // Apply limit
      if (limit) {
        htmlPages = htmlPages.slice(0, limit);
      }

      // Get form fields count per page
      const formQuery = `
        SELECT 
          pageURL,
          count() as groupCount
        FROM form_fields
        ${sessionId ? 'WHERE sessionId = $sessionId' : ''}
        GROUP BY pageURL;
      `;

      const formResult = await this.getWorkerClient().query<any[]>(
        formQuery,
        sessionId ? { sessionId } : undefined
      );
      const formCounts = new Map((formResult?.[0] || []).map((r: any) => [r.pageURL, r.groupCount]));

      // Get clickable elements count per page
      const clickableQuery = `
        SELECT 
          pageURL,
          count() as groupCount
        FROM clickable_elements
        ${sessionId ? 'WHERE sessionId = $sessionId' : ''}
        GROUP BY pageURL;
      `;

      const clickableResult = await this.getWorkerClient().query<any[]>(
        clickableQuery,
        sessionId ? { sessionId } : undefined
      );
      const clickableCounts = new Map((clickableResult?.[0] || []).map((r: any) => [r.pageURL, r.groupCount]));

      // Combine results
      const pages = htmlPages.map((page: any, index: number) => {
        const formGroups = formCounts.get(page.pageURL);
        const clickableGroups = clickableCounts.get(page.pageURL);
        
        // Debug first page timestamp
        if (index === 0) {
          debug.log('[EmbeddingsStorage] Sample timestamp from DB:', {
            raw: page.lastIndexed,
            type: typeof page.lastIndexed,
            isDate: page.lastIndexed instanceof Date,
          });
        }
        
        // Parse lastIndexed - handle various formats from SurrealDB
        let lastIndexedDate: Date;
        try {
          if (page.lastIndexed instanceof Date) {
            lastIndexedDate = page.lastIndexed;
          } else if (typeof page.lastIndexed === 'number') {
            lastIndexedDate = new Date(page.lastIndexed);
          } else if (typeof page.lastIndexed === 'string') {
            // Try parsing as ISO string or timestamp
            const parsed = new Date(page.lastIndexed);
            if (!isNaN(parsed.getTime())) {
              lastIndexedDate = parsed;
            } else {
              // Fallback to current time if parsing fails
              debug.warn('[EmbeddingsStorage] Invalid lastIndexed format:', page.lastIndexed);
              lastIndexedDate = new Date();
            }
          } else if (page.lastIndexed && typeof page.lastIndexed === 'object') {
            // SurrealDB might return datetime as object - try to extract timestamp
            const timestamp = (page.lastIndexed as any).timestamp || (page.lastIndexed as any).value || page.lastIndexed;
            lastIndexedDate = new Date(timestamp);
            if (isNaN(lastIndexedDate.getTime())) {
              debug.warn('[EmbeddingsStorage] Could not parse datetime object:', page.lastIndexed);
              lastIndexedDate = new Date();
            }
          } else {
            debug.warn('[EmbeddingsStorage] Unknown lastIndexed type:', typeof page.lastIndexed, page.lastIndexed);
            lastIndexedDate = new Date();
          }
        } catch (error) {
          debug.error('[EmbeddingsStorage] Error parsing lastIndexed:', error);
          lastIndexedDate = new Date();
        }
        
        return {
          pageURL: page.pageURL,
          pageTitle: page.pageTitle || 'Untitled Page',
          htmlChunkCount: page.chunkCount || 0,
          formChunkCount: (typeof formGroups === 'number' ? formGroups : 0) * 10, // Estimate: ~10 fields per group
          clickableChunkCount: (typeof clickableGroups === 'number' ? clickableGroups : 0) * 10, // Estimate: ~10 elements per group
          lastIndexed: lastIndexedDate,
          sessionId: page.sessionId,
        };
      });

      // Filter out empty pages if requested
      const filteredPages = includeEmpty 
        ? pages 
        : pages.filter((p: any) => p.htmlChunkCount > 0 || p.formChunkCount > 0 || p.clickableChunkCount > 0);

      debug.log(`[EmbeddingsStorage] Found ${filteredPages.length} indexed pages`);
      return filteredPages;
    } catch (error) {
      debug.error('[EmbeddingsStorage] Failed to get indexed pages:', error);
      return [];
    }
  }

  /**
   * Get summary statistics for specific pages
   */
  async getPagesSummary(pageURLs: string[]): Promise<{
    pages: Array<{
      pageURL: string;
      pageTitle: string;
      htmlChunkCount: number;
      formChunkCount: number;
      clickableChunkCount: number;
      lastIndexed: Date;
    }>;
    totalChunks: number;
    totalForms: number;
    totalClickables: number;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (pageURLs.length === 0) {
      return {
        pages: [],
        totalChunks: 0,
        totalForms: 0,
        totalClickables: 0,
      };
    }

    try {
      debug.log('[EmbeddingsStorage] Getting summary for pages:', pageURLs.length);

      // Fetch chunks for each page individually (SurrealDB doesn't support IN clause well)
      const allChunks: any[] = [];
      for (const url of pageURLs) {
        const query = `
          SELECT 
            pageURL,
            pageTitle,
            timestamp
          FROM html_chunks
          WHERE pageURL = $pageURL
          ORDER BY timestamp DESC;
        `;
        
        const result = await this.getWorkerClient().query<any[]>(query, { pageURL: url });
        const chunks = result?.[0] || [];
        allChunks.push(...chunks);
      }
      
      const htmlChunks = allChunks;
      
      // Group chunks by page
      const pageMap = new Map<string, { 
        pageURL: string; 
        pageTitle: string; 
        chunkCount: number; 
        lastIndexed: any;
      }>();
      
      for (const chunk of htmlChunks) {
        const existing = pageMap.get(chunk.pageURL);
        if (existing) {
          existing.chunkCount++;
          if (!existing.lastIndexed && chunk.timestamp) {
            existing.lastIndexed = chunk.timestamp;
          }
        } else {
          pageMap.set(chunk.pageURL, {
            pageURL: chunk.pageURL,
            pageTitle: chunk.pageTitle || 'Untitled Page',
            chunkCount: 1,
            lastIndexed: chunk.timestamp,
          });
        }
      }
      
      const htmlPages = Array.from(pageMap.values());

      // Get form and clickable counts (simplified for now)
      const pages = await Promise.all(
        htmlPages.map(async (page: any) => ({
          pageURL: page.pageURL,
          pageTitle: page.pageTitle || 'Untitled Page',
          htmlChunkCount: page.chunkCount || 0,
          formChunkCount: await this.countFormFields(page.pageURL),
          clickableChunkCount: await this.countClickableElements(page.pageURL),
          lastIndexed: page.lastIndexed ? new Date(page.lastIndexed) : new Date(),
        }))
      );

      const summary = {
        pages,
        totalChunks: pages.reduce((sum, p) => sum + p.htmlChunkCount, 0),
        totalForms: pages.reduce((sum, p) => sum + p.formChunkCount, 0),
        totalClickables: pages.reduce((sum, p) => sum + p.clickableChunkCount, 0),
      };

      debug.log('[EmbeddingsStorage] Pages summary:', summary);
      return summary;
    } catch (error) {
      debug.error('[EmbeddingsStorage] Failed to get pages summary:', error);
      return {
        pages: [],
        totalChunks: 0,
        totalForms: 0,
        totalClickables: 0,
      };
    }
  }

  /**
   * Delete all embeddings for a specific page URL
   * Removes HTML chunks, form fields, clickable elements, and DOM updates
   */
  async deletePageEmbeddings(pageURL: string): Promise<{
    deleted: boolean;
    counts: {
      htmlChunks: number;
      formFields: number;
      clickableElements: number;
      domUpdates: number;
    };
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      debug.log('[EmbeddingsStorage] Deleting embeddings for page:', pageURL);
      const result = await this.getWorkerClient().deletePageEmbeddings(pageURL);
      debug.log('[EmbeddingsStorage] Deleted embeddings:', result.counts);
      return result;
    } catch (error) {
      debug.error('[EmbeddingsStorage] Failed to delete page embeddings:', error);
      return {
        deleted: false,
        counts: {
          htmlChunks: 0,
          formFields: 0,
          clickableElements: 0,
          domUpdates: 0,
        },
      };
    }
  }
}

// Export singleton instance
export const embeddingsStorage = new EmbeddingsStorageManager();

