/**
 * Embeddings Storage Service using SurrealDB in-memory
 * Stores page embeddings for fast semantic search
 */

import { surrealDB } from './surreal-db.js';

// ========================================
// LEGACY INTERFACE REMOVED
// ========================================
// PageEmbeddingRecord interface has been removed.
// We now use separate tables with HNSW indexes:
// - html_chunks (for HTML content)
// - form_fields (for form inputs)
// - clickable_elements (for interactive elements)
//
// Each table has its own structure optimized for native vector search.

/**
 * Initialize embeddings schema in SurrealDB with native vector search indexes
 */
export async function initializeEmbeddingsSchema(): Promise<void> {
  const db = surrealDB.getInstance();

  await db.query(`
    -- ========================================
    -- NEW: Separate tables with HNSW vector indexes for native vector search
    -- Ref: https://surrealdb.com/docs/surrealdb/reference-guide/vector-search
    -- ========================================
    
    -- HTML chunks table with HNSW vector index
    DEFINE TABLE IF NOT EXISTS html_chunks SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS pageURL ON html_chunks TYPE string;
    DEFINE FIELD IF NOT EXISTS pageTitle ON html_chunks TYPE string;
    DEFINE FIELD IF NOT EXISTS chunkIndex ON html_chunks TYPE int;
    DEFINE FIELD IF NOT EXISTS text ON html_chunks TYPE string;
    DEFINE FIELD IF NOT EXISTS html ON html_chunks TYPE string;
    DEFINE FIELD IF NOT EXISTS embedding ON html_chunks TYPE array<float>;
    DEFINE FIELD IF NOT EXISTS sessionId ON html_chunks TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS timestamp ON html_chunks TYPE datetime;
    
    -- HNSW vector index for HTML chunks (384-dimensional embeddings, cosine similarity)
    DEFINE INDEX IF NOT EXISTS hnsw_html_idx ON html_chunks 
      FIELDS embedding 
      HNSW DIMENSION 384 
      DIST COSINE 
      TYPE F64 
      EFC 150 
      M 12;
    
    -- Regular indexes for filtering
    DEFINE INDEX IF NOT EXISTS html_chunks_url ON html_chunks FIELDS pageURL;
    DEFINE INDEX IF NOT EXISTS html_chunks_session ON html_chunks FIELDS sessionId;
    DEFINE INDEX IF NOT EXISTS html_chunks_timestamp ON html_chunks FIELDS timestamp;
    
    -- Form fields table with GROUPED storage (groups of ~100 fields per record, with HNSW)
    DEFINE TABLE IF NOT EXISTS form_fields SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS pageURL ON form_fields TYPE string;
    DEFINE FIELD IF NOT EXISTS groupIndex ON form_fields TYPE int;
    DEFINE FIELD IF NOT EXISTS fieldsJSON ON form_fields TYPE string;
    DEFINE FIELD IF NOT EXISTS embedding ON form_fields TYPE array<float>;
    DEFINE FIELD IF NOT EXISTS sessionId ON form_fields TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS timestamp ON form_fields TYPE datetime;
    
    -- HNSW vector index for form field groups
    DEFINE INDEX IF NOT EXISTS hnsw_form_idx ON form_fields 
      FIELDS embedding 
      HNSW DIMENSION 384 
      DIST COSINE 
      TYPE F64 
      EFC 150 
      M 12;
    
    -- Regular indexes for filtering
    DEFINE INDEX IF NOT EXISTS form_fields_url ON form_fields FIELDS pageURL;
    DEFINE INDEX IF NOT EXISTS form_fields_session ON form_fields FIELDS sessionId;
    DEFINE INDEX IF NOT EXISTS form_fields_timestamp ON form_fields FIELDS timestamp;
    
    -- Clickable elements table with GROUPED storage (groups of ~100 elements per record, with HNSW)
    DEFINE TABLE IF NOT EXISTS clickable_elements SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS pageURL ON clickable_elements TYPE string;
    DEFINE FIELD IF NOT EXISTS groupIndex ON clickable_elements TYPE int;
    DEFINE FIELD IF NOT EXISTS elementsJSON ON clickable_elements TYPE string;
    DEFINE FIELD IF NOT EXISTS embedding ON clickable_elements TYPE array<float>;
    DEFINE FIELD IF NOT EXISTS sessionId ON clickable_elements TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS timestamp ON clickable_elements TYPE datetime;
    
    -- HNSW vector index for clickable element groups
    DEFINE INDEX IF NOT EXISTS hnsw_clickable_idx ON clickable_elements 
      FIELDS embedding 
      HNSW DIMENSION 384 
      DIST COSINE 
      TYPE F64 
      EFC 150 
      M 12;
    
    -- Regular indexes for filtering
    DEFINE INDEX IF NOT EXISTS clickable_elements_url ON clickable_elements FIELDS pageURL;
    DEFINE INDEX IF NOT EXISTS clickable_elements_session ON clickable_elements FIELDS sessionId;
    DEFINE INDEX IF NOT EXISTS clickable_elements_timestamp ON clickable_elements FIELDS timestamp;
    
    -- DOM updates table with HNSW vector index (stores incremental DOM changes)
    DEFINE TABLE IF NOT EXISTS dom_updates SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS pageURL ON dom_updates TYPE string;
    DEFINE FIELD IF NOT EXISTS pageTitle ON dom_updates TYPE string;
    DEFINE FIELD IF NOT EXISTS updateJSON ON dom_updates TYPE string;
    DEFINE FIELD IF NOT EXISTS summary ON dom_updates TYPE string;
    DEFINE FIELD IF NOT EXISTS embedding ON dom_updates TYPE array<float>;
    DEFINE FIELD IF NOT EXISTS sessionId ON dom_updates TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS timestamp ON dom_updates TYPE datetime;
    DEFINE FIELD IF NOT EXISTS recencyScore ON dom_updates TYPE float DEFAULT 1.0;
    
    -- HNSW vector index for DOM updates
    DEFINE INDEX IF NOT EXISTS hnsw_dom_idx ON dom_updates 
      FIELDS embedding 
      HNSW DIMENSION 384 
      DIST COSINE 
      TYPE F64 
      EFC 150 
      M 12;
    
    -- Regular indexes for filtering
    DEFINE INDEX IF NOT EXISTS dom_updates_url ON dom_updates FIELDS pageURL;
    DEFINE INDEX IF NOT EXISTS dom_updates_session ON dom_updates FIELDS sessionId;
    DEFINE INDEX IF NOT EXISTS dom_updates_timestamp ON dom_updates FIELDS timestamp;
    DEFINE INDEX IF NOT EXISTS dom_updates_recency ON dom_updates FIELDS recencyScore;
  `);

  console.log('[EmbeddingsStorage] ✅ Schema initialized with HNSW vector indexes (native vector search enabled)');
}

/**
 * Embeddings Storage Manager
 */
class EmbeddingsStorageManager {
  private isInitialized = false;

  /**
   * Initialize the embeddings storage
   */
  async initialize(useMemory = true): Promise<void> {
    if (this.isInitialized) {
      console.log('[EmbeddingsStorage] Already initialized');
      return;
    }

    try {
      // Connect to SurrealDB (in-memory for fast access)
      if (!surrealDB.isDBConnected()) {
        await surrealDB.connect('embeddings_db', useMemory);
      }

      // Initialize schema
      await initializeEmbeddingsSchema();

      this.isInitialized = true;
      console.log('[EmbeddingsStorage] Initialized successfully');
    } catch (error) {
      console.error('[EmbeddingsStorage] Failed to initialize:', error);
      throw error;
    }
  }

  // ========================================
  // LEGACY METHODS REMOVED
  // ========================================
  // The following legacy methods have been removed as we now use native vector search:
  // - storeEmbedding() - Replaced by storeHTMLChunks(), storeFormFields(), storeClickableElements()
  // - getByURL() - Use native vector search methods instead
  // - getBySession() - Not needed with new architecture
  // - getMostRecent() - Not needed with new architecture
  // - searchSimilar() - Replaced by searchHTMLChunks(), searchFormFields(), searchClickableElements()
  // - getAllEmbeddings() - Use native vector search with pagination instead
  // - pruneOldEmbeddings() - Handle cleanup per table if needed
  // - clearAll() - Handle cleanup per table if needed
  // - getStats() - Calculate stats from new tables if needed

  // ========================================
  // NEW: Native Vector Search Methods
  // ========================================

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
      const timestamp = new Date();
      const BATCH_SIZE = 200; // Large bulk insert batches for maximum performance

      // Delete old chunks for this page URL first
      await surrealDB.query(`
        DELETE FROM html_chunks WHERE pageURL = $url
      `, { url: data.pageURL });

      console.log(`[EmbeddingsStorage] 📦 Storing ${data.chunks.length} HTML chunks in batches of ${BATCH_SIZE}...`);

      // Insert in batches
      for (let i = 0; i < data.chunks.length; i += BATCH_SIZE) {
        const batchChunks = data.chunks.slice(i, i + BATCH_SIZE);
        
        const records = batchChunks.map(chunk => ({
          pageURL: data.pageURL,
          pageTitle: data.pageTitle,
          chunkIndex: chunk.index,
          text: chunk.text,
          html: chunk.html,
          embedding: chunk.embedding,
          sessionId: data.sessionId || undefined,
          timestamp,
        }));
        
        // Bulk insert using multiple CREATE statements in a single query
        // Build query with LET statements for each embedding
        const letStatements = records.map((_, idx) => `LET $emb${idx} = $embedding${idx};`).join('\n          ');
        const createStatements = records.map((record, idx) => `
          CREATE html_chunks SET
            pageURL = $pageURL${idx},
            pageTitle = $pageTitle${idx},
            chunkIndex = $chunkIndex${idx},
            text = $text${idx},
            html = $html${idx},
            embedding = $emb${idx},
            sessionId = $sessionId${idx},
            timestamp = $timestamp${idx};
        `).join('');
        
        // Build parameters object
        const params: Record<string, any> = {};
        records.forEach((record, idx) => {
          params[`pageURL${idx}`] = record.pageURL;
          params[`pageTitle${idx}`] = record.pageTitle;
          params[`chunkIndex${idx}`] = record.chunkIndex;
          params[`text${idx}`] = record.text;
          params[`html${idx}`] = record.html;
          params[`embedding${idx}`] = record.embedding;
          params[`sessionId${idx}`] = record.sessionId;
          params[`timestamp${idx}`] = record.timestamp;
        });
        
        // Execute bulk insert
        await surrealDB.query(`
          ${letStatements}
          ${createStatements}
        `, params);
      }

      console.log(`[EmbeddingsStorage] ✅ Stored ${data.chunks.length} HTML chunks with HNSW indexes`);
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
      const timestamp = new Date();

      // Delete old form fields for this page URL first
      await surrealDB.query(`
        DELETE FROM form_fields WHERE pageURL = $url
      `, { url: data.pageURL });

      // Insert all groups in one query (each group has embedding from JSON string)
      if (data.groups.length > 0) {
        const records = data.groups.map(group => ({
          pageURL: data.pageURL,
          groupIndex: group.groupIndex,
          fieldsJSON: group.fieldsJSON,
          embedding: group.embedding,
          sessionId: data.sessionId || undefined,
          timestamp,
        }));
        
        // Bulk insert using multiple CREATE statements
        const letStatements = records.map((_, idx) => `LET $emb${idx} = $embedding${idx};`).join('\n          ');
        const createStatements = records.map((_, idx) => `
          CREATE form_fields SET
            pageURL = $pageURL${idx},
            groupIndex = $groupIndex${idx},
            fieldsJSON = $fieldsJSON${idx},
            embedding = $emb${idx},
            sessionId = $sessionId${idx},
            timestamp = $timestamp${idx};
        `).join('');
        
        const params: Record<string, any> = {};
        records.forEach((record, idx) => {
          params[`pageURL${idx}`] = record.pageURL;
          params[`groupIndex${idx}`] = record.groupIndex;
          params[`fieldsJSON${idx}`] = record.fieldsJSON;
          params[`embedding${idx}`] = record.embedding;
          params[`sessionId${idx}`] = record.sessionId;
          params[`timestamp${idx}`] = record.timestamp;
        });
        
        await surrealDB.query(`${letStatements}${createStatements}`, params);
      }

      console.log(`[EmbeddingsStorage] ✅ Stored ${data.groups.length} form field groups with HNSW indexes (JSON string embeddings)`);
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
      const timestamp = new Date();

      // Delete old clickable elements for this page URL first
      await surrealDB.query(`
        DELETE FROM clickable_elements WHERE pageURL = $url
      `, { url: data.pageURL });

      // Insert all groups in one query (each group has embedding from JSON string)
      if (data.groups.length > 0) {
        const records = data.groups.map(group => ({
          pageURL: data.pageURL,
          groupIndex: group.groupIndex,
          elementsJSON: group.elementsJSON,
          embedding: group.embedding,
          sessionId: data.sessionId || undefined,
          timestamp,
        }));
        
        // Bulk insert using multiple CREATE statements
        const letStatements = records.map((_, idx) => `LET $emb${idx} = $embedding${idx};`).join('\n          ');
        const createStatements = records.map((_, idx) => `
          CREATE clickable_elements SET
            pageURL = $pageURL${idx},
            groupIndex = $groupIndex${idx},
            elementsJSON = $elementsJSON${idx},
            embedding = $emb${idx},
            sessionId = $sessionId${idx},
            timestamp = $timestamp${idx};
        `).join('');
        
        const params: Record<string, any> = {};
        records.forEach((record, idx) => {
          params[`pageURL${idx}`] = record.pageURL;
          params[`groupIndex${idx}`] = record.groupIndex;
          params[`elementsJSON${idx}`] = record.elementsJSON;
          params[`embedding${idx}`] = record.embedding;
          params[`sessionId${idx}`] = record.sessionId;
          params[`timestamp${idx}`] = record.timestamp;
        });
        
        await surrealDB.query(`${letStatements}${createStatements}`, params);
      }

      console.log(`[EmbeddingsStorage] ✅ Stored ${data.groups.length} clickable element groups with HNSW indexes (JSON string embeddings)`);
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
      console.warn('[EmbeddingsStorage] Skipping DOM update storage - invalid data');
      return;
    }

    try {
      const timestamp = new Date();
      const recencyScore = 1.0; // Most recent changes get highest score
      
      // Create a summary of the DOM update for better searchability
      const summary = this.createDOMUpdateSummary(data.domUpdate);
      
      // Store as JSON string
      const updateJSON = JSON.stringify(data.domUpdate);

      await surrealDB.query(`
        CREATE dom_updates SET
          pageURL = $pageURL,
          pageTitle = $pageTitle,
          updateJSON = $updateJSON,
          summary = $summary,
          embedding = $embedding,
          sessionId = $sessionId,
          timestamp = $timestamp,
          recencyScore = $recencyScore;
      `, {
        pageURL: data.pageURL,
        pageTitle: data.pageTitle,
        updateJSON,
        summary,
        embedding: data.embedding,
        sessionId: data.sessionId || undefined,
        timestamp,
        recencyScore,
      });

      // Decay recency scores of older updates for this page
      await this.decayOlderDOMUpdates(data.pageURL, timestamp);

      console.log('[EmbeddingsStorage] ✅ Stored DOM update with HNSW index and recency score');
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

  /**
   * Decay recency scores of older DOM updates (exponential decay)
   */
  private async decayOlderDOMUpdates(pageURL: string, currentTimestamp: Date): Promise<void> {
    try {
      // Get all older updates for this page
      const results = await surrealDB.query<any[]>(`
        SELECT id, timestamp, recencyScore
        FROM dom_updates
        WHERE pageURL = $url AND timestamp < $currentTime
        ORDER BY timestamp DESC;
      `, {
        url: pageURL,
        currentTime: currentTimestamp,
      });

      const updates = results[0] || [];
      
      if (updates.length === 0) {
        return;
      }

      // Apply exponential decay: each older update gets multiplied by 0.7
      // Recent update = 1.0, previous = 0.7, before that = 0.49, etc.
      for (let i = 0; i < updates.length; i++) {
        const decayFactor = Math.pow(0.7, i + 1);
        const newScore = decayFactor;
        
        await surrealDB.query(`
          UPDATE $id SET recencyScore = $score;
        `, {
          id: updates[i].id,
          score: newScore,
        });
      }

      console.log(`[EmbeddingsStorage] ⏰ Decayed recency scores for ${updates.length} older DOM updates`);
    } catch (error) {
      console.warn('[EmbeddingsStorage] Failed to decay older DOM updates:', error);
      // Don't throw - this is not critical
    }
  }

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
      console.log('[EmbeddingsStorage] 🔍 HNSW search - HTML chunks:', { pageURL, topK });

      // HNSW operator requires TWO parameters: <|K,EF|>
      // K = number of neighbors, EF = efSearch (search width, typically 2-4x K for better recall)
      const efSearch = Math.max(topK * 3, 100);
      
      const results = await surrealDB.query<any[]>(`
        LET $q = $embedding;
        SELECT 
          id,
          pageURL,
          pageTitle,
          chunkIndex,
          text,
          html,
          vector::distance::knn() AS distance
        FROM html_chunks
        WHERE 
          pageURL = $url
          AND embedding <|${topK},${efSearch}|> $q;
      `, {
        url: pageURL,
        embedding: queryEmbedding,
      });

      // Results are in index 1 (because of LET statement)
      if (results && results.length > 1 && results[1] && results[1].length > 0) {
        console.log(`[EmbeddingsStorage] ✅ HNSW: Found ${results[1].length} HTML chunks`);
        
        // Convert distance to similarity (similarity = 1 - distance) for consistency
        const resultsWithSimilarity = results[1].map((r: any) => ({
          ...r,
          similarity: 1 - r.distance,
        }));
        
        return resultsWithSimilarity;
      }

      console.log('[EmbeddingsStorage] ⚠️  No HTML chunks found');
      return [];
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
      console.log('[EmbeddingsStorage] 🔍 HNSW search - Form fields:', { pageURL, topK });

      // HNSW search for form field groups (each group contains ~100 fields as JSON string)
      const groupTopK = Math.ceil(topK / 10); // Fewer groups needed since each has multiple fields
      const efSearch = Math.max(groupTopK * 3, 50);
      
      const groupResults = await surrealDB.query<any[]>(`
        LET $q = $embedding;
        SELECT 
          id,
          pageURL,
          groupIndex,
          fieldsJSON,
          vector::distance::knn() AS distance
        FROM form_fields
        WHERE 
          pageURL = $url
          AND embedding <|${groupTopK},${efSearch}|> $q;
      `, {
        url: pageURL,
        embedding: queryEmbedding,
      });

      // Results are in index 1 (because of LET statement)
      if (!groupResults || groupResults.length < 2 || !groupResults[1] || groupResults[1].length === 0) {
        console.log('[EmbeddingsStorage] ⚠️  No form field groups found');
        return [];
      }

      // Parse JSON groups and flatten to individual fields
      const allFields: any[] = [];
      for (const group of groupResults[1]) {
        try {
          const fields = JSON.parse(group.fieldsJSON);
          // Add group distance to each field (for sorting later)
          fields.forEach((field: any) => {
            allFields.push({
              ...field,
              id: group.id,
              pageURL: group.pageURL,
              similarity: 1 - group.distance, // Convert distance to similarity
            });
          });
        } catch (e) {
          console.error('[EmbeddingsStorage] Failed to parse fieldsJSON:', e);
        }
      }

      console.log(`[EmbeddingsStorage] ✅ HNSW: Found ${allFields.length} form fields`);
      return allFields.slice(0, topK); // Return top K individual fields
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
      console.log('[EmbeddingsStorage] 🔍 HNSW search - Clickable elements:', { pageURL, topK });

      // HNSW search for clickable element groups (each group contains ~100 elements as JSON string)
      const groupTopK = Math.ceil(topK / 10); // Fewer groups needed since each has multiple elements
      const efSearch = Math.max(groupTopK * 3, 50);
      
      const groupResults = await surrealDB.query<any[]>(`
        LET $q = $embedding;
        SELECT 
          id,
          pageURL,
          groupIndex,
          elementsJSON,
          vector::distance::knn() AS distance
        FROM clickable_elements
        WHERE 
          pageURL = $url
          AND embedding <|${groupTopK},${efSearch}|> $q;
      `, {
        url: pageURL,
        embedding: queryEmbedding,
      });

      // Results are in index 1 (because of LET statement)
      if (!groupResults || groupResults.length < 2 || !groupResults[1] || groupResults[1].length === 0) {
        console.log('[EmbeddingsStorage] ⚠️  No clickable element groups found');
        return [];
      }

      // Parse JSON groups and flatten to individual elements
      const allElements: any[] = [];
      for (const group of groupResults[1]) {
        try {
          const elements = JSON.parse(group.elementsJSON);
          // Add group distance to each element (for sorting later)
          elements.forEach((element: any) => {
            allElements.push({
              ...element,
              id: group.id,
              pageURL: group.pageURL,
              similarity: 1 - group.distance, // Convert distance to similarity
            });
          });
        } catch (e) {
          console.error('[EmbeddingsStorage] Failed to parse elementsJSON:', e);
        }
      }

      console.log(`[EmbeddingsStorage] ✅ HNSW: Found ${allElements.length} clickable elements`);
      return allElements.slice(0, topK); // Return top K individual elements
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
      console.log('[EmbeddingsStorage] 🔍 HNSW search - DOM updates (with recency):', { pageURL, topK });

      // Get more results than needed so we can apply recency weighting
      const searchK = Math.min(topK * 3, 20);
      const efSearch = Math.max(searchK * 3, 100);
      
      const results = await surrealDB.query<any[]>(`
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
        console.log('[EmbeddingsStorage] ⚠️  No DOM updates found');
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

      console.log(`[EmbeddingsStorage] ✅ HNSW: Found ${topResults.length} DOM updates (semantic + recency weighted)`);
      return topResults;
    } catch (error) {
      console.error('[EmbeddingsStorage] Failed to search DOM updates:', error);
      return [];
    }
  }
}

// Export singleton instance
export const embeddingsStorage = new EmbeddingsStorageManager();

