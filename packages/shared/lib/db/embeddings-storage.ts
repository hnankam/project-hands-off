/**
 * Embeddings Storage Service using SurrealDB in-memory
 * Stores page embeddings for fast semantic search
 */

import { DBWorkerClient } from './db-worker-client.js';

// Debug logging toggle (development only)
const DEBUG = true;

// Timestamp helper for consistent logging
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

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
  async initialize(useMemory = true): Promise<void> {
    if (this.isInitialized) {
      DEBUG && console.log(`${ts()} [EmbeddingsStorage] Already initialized`);
      return;
    }

    if (!this.workerClient) {
      throw new Error('[EmbeddingsStorage] Worker client not set. Call setWorkerClient() first or pass worker to constructor.');
    }

    try {
      // Initialize DB worker (in-memory by default) and schema
      await this.getWorkerClient().initialize(useMemory);

      this.isInitialized = true;
      DEBUG && console.log(`${ts()} [EmbeddingsStorage] Initialized successfully`);
    } catch (error) {
      console.error('[EmbeddingsStorage] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Count helpers for pagination/non-semantic access
   */
  async countHTMLChunks(pageURL: string): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    try {
      const res = await this.getWorkerClient().query<any[]>(
        `SELECT count() AS c FROM html_chunks WHERE pageURL = $url;`,
        { url: pageURL }
      );
      const row = res?.[0]?.[0];
      return typeof row?.c === 'number' ? row.c : 0;
    } catch (error) {
      console.error('[EmbeddingsStorage] Failed to count HTML chunks:', error);
      return 0;
    }
  }

  async countFormFields(pageURL: string): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    try {
      const res = await this.getWorkerClient().query<any[]>(
        `SELECT count() AS c FROM form_fields WHERE pageURL = $url;`,
        { url: pageURL }
      );
      const row = res?.[0]?.[0];
      return typeof row?.c === 'number' ? row.c : 0;
    } catch (error) {
      console.error('[EmbeddingsStorage] Failed to count form fields:', error);
      return 0;
    }
  }

  async countClickableElements(pageURL: string): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    try {
      const res = await this.getWorkerClient().query<any[]>(
        `SELECT count() AS c FROM clickable_elements WHERE pageURL = $url;`,
        { url: pageURL }
      );
      const row = res?.[0]?.[0];
      return typeof row?.c === 'number' ? row.c : 0;
    } catch (error) {
      console.error('[EmbeddingsStorage] Failed to count clickable elements:', error);
      return 0;
    }
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
      console.error('[EmbeddingsStorage] Failed to fetch HTML chunks range:', error);
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
        try { fields = JSON.parse(r.fieldsJSON); } catch {}
        return { groupIndex: r.groupIndex, fields: Array.isArray(fields) ? fields : [] };
      });
    } catch (error) {
      console.error('[EmbeddingsStorage] Failed to fetch form chunks range:', error);
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
        try { elements = JSON.parse(r.elementsJSON); } catch {}
        return { groupIndex: r.groupIndex, elements: Array.isArray(elements) ? elements : [] };
      });
    } catch (error) {
      console.error('[EmbeddingsStorage] Failed to fetch clickable chunks range:', error);
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
        chunks: data.chunks.map(c => ({ text: c.text, html: c.html, embedding: c.embedding, index: c.index })),
        sessionId: data.sessionId,
      });
      DEBUG && console.log(`[EmbeddingsStorage] ✅ Stored ${data.chunks.length} HTML chunks via worker`);
    } catch (error) {
      console.error('[EmbeddingsStorage] Failed to store HTML chunks:', error);
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
        groups: data.groups.map(g => ({ groupIndex: g.groupIndex, fieldsJSON: g.fieldsJSON, embedding: g.embedding })),
        sessionId: data.sessionId,
      });
      DEBUG && console.log(`[EmbeddingsStorage] ✅ Stored ${data.groups.length} form field groups via worker`);
    } catch (error) {
      console.error('[EmbeddingsStorage] Failed to store form fields:', error);
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
        groups: data.groups.map(g => ({ groupIndex: g.groupIndex, elementsJSON: g.elementsJSON, embedding: g.embedding })),
        sessionId: data.sessionId,
      });
      DEBUG && console.log(`[EmbeddingsStorage] ✅ Stored ${data.groups.length} clickable element groups via worker`);
    } catch (error) {
      console.error('[EmbeddingsStorage] Failed to store clickable elements:', error);
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
      DEBUG && console.warn('[EmbeddingsStorage] Skipping DOM update storage - invalid data');
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
      
      DEBUG && console.log(`${ts()} [EmbeddingsStorage] ✅ Stored DOM update via worker`);
    } catch (error) {
      console.error('[EmbeddingsStorage] Failed to store DOM update:', error);
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

    try {
      DEBUG && console.log(`${ts()} [EmbeddingsStorage] 🔍 HNSW search - HTML chunks:`, { pageURL, topK });

      // HNSW operator requires TWO parameters: <|K,EF|>
      // K = number of neighbors, EF = efSearch (search width, typically 2-4x K for better recall)
      const efSearch = Math.max(topK * 3, 100);
      
      // Use dedicated search method in worker client (optimized path)
      const results = await this.getWorkerClient().searchHTMLChunks(pageURL, queryEmbedding, topK);

      DEBUG && console.log(`[EmbeddingsStorage] ✅ HNSW: Found ${results.length} HTML chunks`);
      return results;
    } catch (error) {
      console.error('[EmbeddingsStorage] Failed to search HTML chunks:', error);
      return [];
    }
  }

  /**
   * Native vector search for form fields using HNSW index
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

    try {
      DEBUG && console.log(`${ts()} [EmbeddingsStorage] 🔍 HNSW search - Form fields:`, { pageURL, topK });

      // HNSW search for form field groups (each group contains ~100 fields as JSON string)
      const groupTopK = Math.ceil(topK / 10); // Fewer groups needed since each has multiple fields
      const efSearch = Math.max(groupTopK * 3, 50);
      
      // Use dedicated search method in worker client (optimized path)
      const results = await this.getWorkerClient().searchFormFields(pageURL, queryEmbedding, topK);

      DEBUG && console.log(`[EmbeddingsStorage] ✅ HNSW: Found ${results.length} form fields`);
      return results;
    } catch (error) {
      console.error('[EmbeddingsStorage] Failed to search form fields:', error);
      return [];
    }
  }

  /**
   * Native vector search for clickable elements using HNSW index
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

    try {
      DEBUG && console.log(`${ts()} [EmbeddingsStorage] 🔍 HNSW search - Clickable elements:`, { pageURL, topK });

      // HNSW search for clickable element groups (each group contains ~100 elements as JSON string)
      const groupTopK = Math.ceil(topK / 10); // Fewer groups needed since each has multiple elements
      const efSearch = Math.max(groupTopK * 3, 50);
      
      // Use dedicated search method in worker client (optimized path)
      const results = await this.getWorkerClient().searchClickableElements(pageURL, queryEmbedding, topK);

      DEBUG && console.log(`[EmbeddingsStorage] ✅ HNSW: Found ${results.length} clickable elements`);
      return results;
    } catch (error) {
      console.error('[EmbeddingsStorage] Failed to search clickable elements:', error);
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
      DEBUG && console.log(`${ts()} [EmbeddingsStorage] 🔍 HNSW search - DOM updates (with recency):`, { pageURL, topK });

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
        DEBUG && console.log(`${ts()} [EmbeddingsStorage] ⚠️  No DOM updates found`);
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
          console.error('[EmbeddingsStorage] Failed to parse updateJSON:', e);
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

      DEBUG && console.log(`[EmbeddingsStorage] ✅ HNSW: Found ${topResults.length} DOM updates (semantic + recency weighted)`);
      return topResults;
    } catch (error) {
      console.error('[EmbeddingsStorage] Failed to search DOM updates:', error);
      return [];
    }
  }
}

// Export singleton instance
export const embeddingsStorage = new EmbeddingsStorageManager();

