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

      // Delete old chunks for this page URL first
      await surrealDB.query(`
        DELETE FROM html_chunks WHERE pageURL = $url
      `, { url: data.pageURL });

      // OPTIMIZED: Batch insert all HTML chunks in one query (much faster!)
      if (data.chunks.length > 0) {
        const records = data.chunks.map(chunk => ({
          pageURL: data.pageURL,
          pageTitle: data.pageTitle,
          chunkIndex: chunk.index,
          text: chunk.text,
          html: chunk.html,
          embedding: chunk.embedding,
          sessionId: data.sessionId || undefined,
          timestamp,
        }));
        
        // Single batch insert instead of loop (prevents UI freeze!)
        await surrealDB.query(`INSERT INTO html_chunks $records`, { records });
      }

      console.log(`[EmbeddingsStorage] ✅ Stored ${data.chunks.length} HTML chunks with HNSW indexes (batch insert)`);
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
        
        await surrealDB.query(`INSERT INTO form_fields $records`, { records });
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
        
        await surrealDB.query(`INSERT INTO clickable_elements $records`, { records });
      }

      console.log(`[EmbeddingsStorage] ✅ Stored ${data.groups.length} clickable element groups with HNSW indexes (JSON string embeddings)`);
    } catch (error) {
      console.error('[EmbeddingsStorage] Failed to store clickable elements:', error);
      throw error;
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
}

// Export singleton instance
export const embeddingsStorage = new EmbeddingsStorageManager();

