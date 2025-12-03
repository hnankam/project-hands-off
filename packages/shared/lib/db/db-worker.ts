/**
 * Database Worker - Runs SurrealDB operations in a Web Worker
 * This prevents WASM processing from blocking the main UI thread
 * 
 * Architecture:
 * - All SurrealDB operations run in this worker
 * - Main thread communicates via postMessage
 * - Completely non-blocking for UI
 */

import { Surreal } from 'surrealdb';
import { surrealdbWasmEngines } from '@surrealdb/wasm';

// Debug logging toggle (set to true for development)
const DEBUG = true;

// Simple logging helper for worker context
const log = (...args: any[]) => DEBUG && console.log(...args);
const logError = (...args: any[]) => console.error(...args);

// Worker state
let db: Surreal | null = null;
let isConnected = false;
let initializationPromise: Promise<void> | null = null;

// Message types for type safety
interface WorkerMessage {
  id: string;
  type: string;
  payload?: any;
}

interface WorkerResponse {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Initialize SurrealDB connection in worker
 */
async function initializeDB(dbName: string, useMemory: boolean): Promise<void> {
  if (isConnected && db) {
    log('[DB Worker] Already connected');
    return;
  }

  try {
    // Initialize SurrealDB with WASM engines
    db = new Surreal({
      engines: surrealdbWasmEngines(),
    });

    // Connect to memory or IndexedDB
    const connectionString = useMemory ? 'mem://' : `indxdb://${dbName}`;
    
    log('[DB Worker]  Connecting to SurrealDB...');
    log(`[DB Worker]    Mode: ${useMemory ? 'IN-MEMORY (fast, no persistence)' : 'IndexedDB (persistent)'}`);
    log(`[DB Worker]    Connection: ${connectionString}`);
    
    await db.connect(connectionString);

    // Set namespace and database
    await db.use({
      namespace: 'app',
      database: 'main',
    });

    isConnected = true;
    log('[DB Worker] Connected successfully');
    log(`[DB Worker] Storage: ${useMemory ? 'RAM (cleared on refresh)' : 'IndexedDB (persistent across sessions)'}`);
  } catch (error) {
    logError('[DB Worker] Failed to connect:', error);
    throw error;
  }
}

/**
 * Initialize embeddings schema with HNSW indexes and full-text search
 */
async function initializeEmbeddingsSchema(): Promise<void> {
  if (!db) throw new Error('Database not connected');

  await db.query(`
    -- Define analyzers for full-text search
    DEFINE ANALYZER IF NOT EXISTS english_analyzer TOKENIZERS class FILTERS lowercase, snowball(english);
    DEFINE ANALYZER IF NOT EXISTS simple_analyzer TOKENIZERS class FILTERS lowercase;
    
    -- HTML chunks table with HNSW vector index AND full-text search
    DEFINE TABLE IF NOT EXISTS html_chunks SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS pageURL ON html_chunks TYPE string;
    DEFINE FIELD IF NOT EXISTS pageTitle ON html_chunks TYPE string;
    DEFINE FIELD IF NOT EXISTS chunkIndex ON html_chunks TYPE int;
    DEFINE FIELD IF NOT EXISTS text ON html_chunks TYPE string;
    DEFINE FIELD IF NOT EXISTS html ON html_chunks TYPE string;
    DEFINE FIELD IF NOT EXISTS embedding ON html_chunks TYPE array<float>;
    DEFINE FIELD IF NOT EXISTS sessionId ON html_chunks TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS timestamp ON html_chunks TYPE datetime;
    DEFINE INDEX IF NOT EXISTS hnsw_html_idx ON html_chunks FIELDS embedding HNSW DIMENSION 384 DIST COSINE TYPE F64 EFC 150 M 12;
    DEFINE INDEX IF NOT EXISTS fts_html_text_idx ON html_chunks FIELDS text SEARCH ANALYZER english_analyzer BM25;
    DEFINE INDEX IF NOT EXISTS fts_html_title_idx ON html_chunks FIELDS pageTitle SEARCH ANALYZER english_analyzer BM25;
    DEFINE INDEX IF NOT EXISTS html_chunks_url ON html_chunks FIELDS pageURL;
    DEFINE INDEX IF NOT EXISTS html_chunks_session ON html_chunks FIELDS sessionId;
    DEFINE INDEX IF NOT EXISTS html_chunks_timestamp ON html_chunks FIELDS timestamp;
    
    -- Form fields table with GROUPED storage
    DEFINE TABLE IF NOT EXISTS form_fields SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS pageURL ON form_fields TYPE string;
    DEFINE FIELD IF NOT EXISTS groupIndex ON form_fields TYPE int;
    DEFINE FIELD IF NOT EXISTS fieldsJSON ON form_fields TYPE string;
    DEFINE FIELD IF NOT EXISTS embedding ON form_fields TYPE array<float>;
    DEFINE FIELD IF NOT EXISTS sessionId ON form_fields TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS timestamp ON form_fields TYPE datetime;
    DEFINE INDEX IF NOT EXISTS hnsw_form_idx ON form_fields FIELDS embedding HNSW DIMENSION 384 DIST COSINE TYPE F64 EFC 150 M 12;
    DEFINE INDEX IF NOT EXISTS fts_form_json_idx ON form_fields FIELDS fieldsJSON SEARCH ANALYZER simple_analyzer BM25;
    DEFINE INDEX IF NOT EXISTS form_fields_url ON form_fields FIELDS pageURL;
    DEFINE INDEX IF NOT EXISTS form_fields_session ON form_fields FIELDS sessionId;
    DEFINE INDEX IF NOT EXISTS form_fields_timestamp ON form_fields FIELDS timestamp;
    
    -- Clickable elements table with GROUPED storage
    DEFINE TABLE IF NOT EXISTS clickable_elements SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS pageURL ON clickable_elements TYPE string;
    DEFINE FIELD IF NOT EXISTS groupIndex ON clickable_elements TYPE int;
    DEFINE FIELD IF NOT EXISTS elementsJSON ON clickable_elements TYPE string;
    DEFINE FIELD IF NOT EXISTS embedding ON clickable_elements TYPE array<float>;
    DEFINE FIELD IF NOT EXISTS sessionId ON clickable_elements TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS timestamp ON clickable_elements TYPE datetime;
    DEFINE INDEX IF NOT EXISTS hnsw_clickable_idx ON clickable_elements FIELDS embedding HNSW DIMENSION 384 DIST COSINE TYPE F64 EFC 150 M 12;
    DEFINE INDEX IF NOT EXISTS fts_clickable_json_idx ON clickable_elements FIELDS elementsJSON SEARCH ANALYZER simple_analyzer BM25;
    DEFINE INDEX IF NOT EXISTS clickable_elements_url ON clickable_elements FIELDS pageURL;
    DEFINE INDEX IF NOT EXISTS clickable_elements_session ON clickable_elements FIELDS sessionId;
    DEFINE INDEX IF NOT EXISTS clickable_elements_timestamp ON clickable_elements FIELDS timestamp;
  `);

  log('[DB Worker] Schema initialized with HNSW indexes and full-text search');
}

/**
 * Store HTML chunks with batching to prevent blocking
 */
async function storeHTMLChunks(payload: {
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
  if (!db) throw new Error('Database not connected');

  const timestamp = new Date();
  const BATCH_SIZE = 100; // Increased to 100 for maximum throughput

  // Delete old chunks first
  await db.query(`DELETE FROM html_chunks WHERE pageURL = $url`, { 
    url: payload.pageURL 
  });

  log(`[DB Worker] Storing ${payload.chunks.length} HTML chunks in batches of ${BATCH_SIZE}...`);

  // Create batches
  const batches: Array<typeof payload.chunks> = [];
  for (let i = 0; i < payload.chunks.length; i += BATCH_SIZE) {
    batches.push(payload.chunks.slice(i, i + BATCH_SIZE));
  }

  // Process batches in parallel (WASM can handle concurrent operations)
  await Promise.all(batches.map(async (batchChunks, batchIndex) => {
    if (!db) throw new Error('Database not connected');
    const records = batchChunks.map(chunk => ({
      pageURL: payload.pageURL,
      pageTitle: payload.pageTitle,
      chunkIndex: chunk.index,
      text: chunk.text,
      html: chunk.html,
      embedding: chunk.embedding,
      sessionId: payload.sessionId || undefined,
      timestamp,
    }));
    
    await db.query(`INSERT INTO html_chunks $records`, { records });
    log(`[DB Worker] Batch ${batchIndex + 1}/${batches.length} complete`);
  }));

  log(`[DB Worker] Stored ${payload.chunks.length} HTML chunks`);
}

/**
 * Store form field groups
 */
async function storeFormFields(payload: {
  pageURL: string;
  groups: Array<{
    groupIndex: number;
    fieldsJSON: string;
    embedding: number[];
  }>;
  sessionId?: string;
}): Promise<void> {
  if (!db) throw new Error('Database not connected');

  const timestamp = new Date();
  const BATCH_SIZE = 100; // Increased to 100 for maximum throughput

  // Delete old form fields first
  await db.query(`DELETE FROM form_fields WHERE pageURL = $url`, { 
    url: payload.pageURL 
  });

  if (payload.groups.length > 0) {
    // Create batches
    const batches: Array<typeof payload.groups> = [];
    for (let i = 0; i < payload.groups.length; i += BATCH_SIZE) {
      batches.push(payload.groups.slice(i, i + BATCH_SIZE));
    }

    // Process batches in parallel
    await Promise.all(batches.map(async (batchGroups, batchIndex) => {
      if (!db) throw new Error('Database not connected');
      const records = batchGroups.map(group => ({
        pageURL: payload.pageURL,
        groupIndex: group.groupIndex,
        fieldsJSON: group.fieldsJSON,
        embedding: group.embedding,
        sessionId: payload.sessionId || undefined,
        timestamp,
      }));
      
      await db.query(`INSERT INTO form_fields $records`, { records });
      log(`[DB Worker] Form fields batch ${batchIndex + 1}/${batches.length} complete`);
    }));
  }

  log(`[DB Worker] Stored ${payload.groups.length} form field groups`);
}

/**
 * Store clickable element groups
 */
async function storeClickableElements(payload: {
  pageURL: string;
  groups: Array<{
    groupIndex: number;
    elementsJSON: string;
    embedding: number[];
  }>;
  sessionId?: string;
}): Promise<void> {
  if (!db) throw new Error('Database not connected');

  const timestamp = new Date();
  const BATCH_SIZE = 100; // Increased to 100 for maximum throughput

  // Delete old clickable elements first
  await db.query(`DELETE FROM clickable_elements WHERE pageURL = $url`, { 
    url: payload.pageURL 
  });

  if (payload.groups.length > 0) {
    // Create batches
    const batches: Array<typeof payload.groups> = [];
    for (let i = 0; i < payload.groups.length; i += BATCH_SIZE) {
      batches.push(payload.groups.slice(i, i + BATCH_SIZE));
    }

    // Process batches in parallel
    await Promise.all(batches.map(async (batchGroups, batchIndex) => {
      if (!db) throw new Error('Database not connected');
      const records = batchGroups.map(group => ({
        pageURL: payload.pageURL,
        groupIndex: group.groupIndex,
        elementsJSON: group.elementsJSON,
        embedding: group.embedding,
        sessionId: payload.sessionId || undefined,
        timestamp,
      }));
      
      await db.query(`INSERT INTO clickable_elements $records`, { records });
      log(`[DB Worker] Clickable elements batch ${batchIndex + 1}/${batches.length} complete`);
    }));
  }

  log(`[DB Worker] Stored ${payload.groups.length} clickable element groups`);
}

/**
 * Delete all embeddings for a specific page URL
 */
async function deletePageEmbeddings(payload: {
  pageURL: string;
}): Promise<{ deleted: boolean; counts: { htmlChunks: number; formFields: number; clickableElements: number; domUpdates: number } }> {
  if (!db) throw new Error('Database not connected');

  log(`[DB Worker] Deleting embeddings for page: ${payload.pageURL}`);

  // Get counts before deletion for reporting
  const htmlResult = await db.query<[{ count: number }[]]>(`SELECT count() as count FROM html_chunks WHERE pageURL = $url GROUP ALL`, { url: payload.pageURL });
  const formResult = await db.query<[{ count: number }[]]>(`SELECT count() as count FROM form_fields WHERE pageURL = $url GROUP ALL`, { url: payload.pageURL });
  const clickResult = await db.query<[{ count: number }[]]>(`SELECT count() as count FROM clickable_elements WHERE pageURL = $url GROUP ALL`, { url: payload.pageURL });
  const domResult = await db.query<[{ count: number }[]]>(`SELECT count() as count FROM dom_updates WHERE pageURL = $url GROUP ALL`, { url: payload.pageURL });

  const counts = {
    htmlChunks: htmlResult[0]?.[0]?.count || 0,
    formFields: formResult[0]?.[0]?.count || 0,
    clickableElements: clickResult[0]?.[0]?.count || 0,
    domUpdates: domResult[0]?.[0]?.count || 0,
  };

  // Delete from all tables
  await db.query(`DELETE FROM html_chunks WHERE pageURL = $url`, { url: payload.pageURL });
  await db.query(`DELETE FROM form_fields WHERE pageURL = $url`, { url: payload.pageURL });
  await db.query(`DELETE FROM clickable_elements WHERE pageURL = $url`, { url: payload.pageURL });
  await db.query(`DELETE FROM dom_updates WHERE pageURL = $url`, { url: payload.pageURL });

  log(`[DB Worker] Deleted embeddings for page: ${payload.pageURL} - HTML: ${counts.htmlChunks}, Forms: ${counts.formFields}, Clickable: ${counts.clickableElements}, DOM: ${counts.domUpdates}`);

  return { deleted: true, counts };
}

/**
 * Store DOM update with embedding, recency score, and parallel batching
 */
async function storeDOMUpdate(payload: {
  pageURL: string;
  pageTitle: string;
  updateJSON: string;
  summary: string;
  embedding: number[];
  sessionId?: string;
}): Promise<void> {
  if (!db) throw new Error('Database not connected');

  const timestamp = new Date();
  const recencyScore = 1.0;

  try {
    // Insert the DOM update
    await db.query(`
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
      pageURL: payload.pageURL,
      pageTitle: payload.pageTitle,
      updateJSON: payload.updateJSON,
      summary: payload.summary,
      embedding: payload.embedding,
      sessionId: payload.sessionId || undefined,
      timestamp,
      recencyScore,
    });

    // Decay older DOM updates (reduce their recency scores)
    await db.query(`
      UPDATE dom_updates 
      SET recencyScore = recencyScore * 0.95 
      WHERE pageURL = $pageURL 
        AND timestamp < $currentTimestamp;
    `, {
      pageURL: payload.pageURL,
      currentTimestamp: timestamp,
    });

    log('[DB Worker] Stored DOM update and decayed older entries');
  } catch (error) {
    logError('[DB Worker] Failed to store DOM update:', error);
    throw error;
  }
}

/**
 * Search HTML chunks using HNSW index
 * Supports single pageURL, array of pageURLs, or all pages (when pageURLs is empty/undefined)
 */
async function searchHTMLChunks(payload: {
  pageURL?: string;
  pageURLs?: string[];
  queryEmbedding: number[];
  topK: number;
}): Promise<any[]> {
  if (!db) throw new Error('Database not connected');

  const efSearch = Math.max(payload.topK * 3, 100);
  
  // Determine which pages to search
  const urls = payload.pageURLs?.length 
    ? payload.pageURLs 
    : payload.pageURL 
      ? [payload.pageURL] 
      : null; // null means search all pages
  
  let results: any[];
  
  if (urls === null) {
    // Search all pages
    results = await db.query<any[]>(`
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
      WHERE embedding <|${payload.topK},${efSearch}|> $q;
    `, {
      embedding: payload.queryEmbedding,
    });
  } else if (urls.length === 1) {
    // Single page search (original behavior)
    results = await db.query<any[]>(`
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
      AND embedding <|${payload.topK},${efSearch}|> $q;
  `, {
      url: urls[0],
      embedding: payload.queryEmbedding,
    });
  } else {
    // Multiple pages - search each and merge results
    const allResults: any[] = [];
    for (const url of urls) {
      const pageResults = await db.query<any[]>(`
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
          AND embedding <|${payload.topK},${efSearch}|> $q;
      `, {
        url,
    embedding: payload.queryEmbedding,
  });
      
      if (pageResults && pageResults.length > 1 && pageResults[1]) {
        allResults.push(...pageResults[1]);
      }
    }
    
    // Sort by distance and take top K
    allResults.sort((a, b) => a.distance - b.distance);
    return allResults.slice(0, payload.topK).map((r: any) => ({
      ...r,
      similarity: 1 - r.distance,
    }));
  }

  if (results && results.length > 1 && results[1] && results[1].length > 0) {
    return results[1].map((r: any) => ({
      ...r,
      similarity: 1 - r.distance,
    }));
  }

  return [];
}

/**
 * Search form fields using HNSW index
 * Supports single pageURL, array of pageURLs, or all pages (when pageURLs is empty/undefined)
 */
async function searchFormFields(payload: {
  pageURL?: string;
  pageURLs?: string[];
  queryEmbedding: number[];
  topK: number;
}): Promise<any[]> {
  if (!db) throw new Error('Database not connected');

  // Determine which pages to search
  const urls = payload.pageURLs?.length 
    ? payload.pageURLs 
    : payload.pageURL 
      ? [payload.pageURL] 
      : null; // null means search all pages

  log('[DB Worker] searchFormFields called:', { urls, topK: payload.topK });

  const groupTopK = Math.ceil(payload.topK / 10);
  const efSearch = Math.max(groupTopK * 3, 50);
  
  const processResults = (groupResults: any[]): any[] => {
    if (!groupResults || groupResults.length < 2 || !groupResults[1] || groupResults[1].length === 0) {
      return [];
    }

    const allFields: any[] = [];
    for (const group of groupResults[1]) {
      try {
        const fields = JSON.parse(group.fieldsJSON);
        fields.forEach((field: any) => {
          allFields.push({
            ...field,
            id: group.id,
            pageURL: group.pageURL,
            similarity: 1 - group.distance,
          });
        });
      } catch (e) {
        logError('[DB Worker] Failed to parse fieldsJSON:', e);
      }
    }
    return allFields;
  };
  
  log('[DB Worker] Executing form fields query...');
  
  if (urls === null) {
    // Search all pages
    const groupResults = await db.query<any[]>(`
      LET $q = $embedding;
      SELECT 
        id,
        pageURL,
        groupIndex,
        fieldsJSON,
        vector::distance::knn() AS distance
      FROM form_fields
      WHERE embedding <|${groupTopK},${efSearch}|> $q;
    `, {
      embedding: payload.queryEmbedding,
    });
    
    return processResults(groupResults).slice(0, payload.topK);
  } else if (urls.length === 1) {
    // Single page search
  const groupResults = await db.query<any[]>(`
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
      url: urls[0],
    embedding: payload.queryEmbedding,
  });
  
  log('[DB Worker] Query complete, results:', groupResults?.length);
    return processResults(groupResults).slice(0, payload.topK);
  } else {
    // Multiple pages - search each and merge
    const allFields: any[] = [];
    for (const url of urls) {
      const groupResults = await db.query<any[]>(`
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
        url,
        embedding: payload.queryEmbedding,
      });
      
      allFields.push(...processResults(groupResults));
    }
    
    // Sort by similarity and take top K
    allFields.sort((a, b) => b.similarity - a.similarity);
    return allFields.slice(0, payload.topK);
  }
}

/**
 * Search clickable elements using HNSW index
 * Supports single pageURL, array of pageURLs, or all pages (when pageURLs is empty/undefined)
 */
async function searchClickableElements(payload: {
  pageURL?: string;
  pageURLs?: string[];
  queryEmbedding: number[];
  topK: number;
}): Promise<any[]> {
  if (!db) throw new Error('Database not connected');

  // Determine which pages to search
  const urls = payload.pageURLs?.length 
    ? payload.pageURLs 
    : payload.pageURL 
      ? [payload.pageURL] 
      : null; // null means search all pages

  const groupTopK = Math.ceil(payload.topK / 10);
  const efSearch = Math.max(groupTopK * 3, 50);
  
  const processResults = (groupResults: any[]): any[] => {
  if (!groupResults || groupResults.length < 2 || !groupResults[1] || groupResults[1].length === 0) {
      return [];
    }

    const allElements: any[] = [];
    for (const group of groupResults[1]) {
      try {
        const elements = JSON.parse(group.elementsJSON);
        elements.forEach((element: any) => {
          allElements.push({
            ...element,
            id: group.id,
            pageURL: group.pageURL,
            similarity: 1 - group.distance,
          });
        });
      } catch (e) {
        logError('[DB Worker] Failed to parse elementsJSON:', e);
      }
    }
    return allElements;
  };
  
  if (urls === null) {
    // Search all pages
    const groupResults = await db.query<any[]>(`
      LET $q = $embedding;
      SELECT 
        id,
        pageURL,
        groupIndex,
        elementsJSON,
        vector::distance::knn() AS distance
      FROM clickable_elements
      WHERE embedding <|${groupTopK},${efSearch}|> $q;
    `, {
      embedding: payload.queryEmbedding,
    });
    
    return processResults(groupResults).slice(0, payload.topK);
  } else if (urls.length === 1) {
    // Single page search
    const groupResults = await db.query<any[]>(`
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
      url: urls[0],
      embedding: payload.queryEmbedding,
    });
    
    return processResults(groupResults).slice(0, payload.topK);
  } else {
    // Multiple pages - search each and merge
    const allElements: any[] = [];
    for (const url of urls) {
      const groupResults = await db.query<any[]>(`
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
        url,
        embedding: payload.queryEmbedding,
      });
      
      allElements.push(...processResults(groupResults));
    }
    
    // Sort by similarity and take top K
    allElements.sort((a, b) => b.similarity - a.similarity);
    return allElements.slice(0, payload.topK);
  }
}

/**
 * Full-text search for HTML chunks using BM25
 * Supports single pageURL, array of pageURLs, or all pages (when pageURLs is empty/undefined)
 */
async function fullTextSearchHTMLChunks(payload: {
  pageURL?: string;
  pageURLs?: string[];
  query: string;
  topK: number;
}): Promise<any[]> {
  if (!db) throw new Error('Database not connected');

  // Determine which pages to search
  const urls = payload.pageURLs?.length 
    ? payload.pageURLs 
    : payload.pageURL 
      ? [payload.pageURL] 
      : null; // null means search all pages

  const processResults = (results: any[]): any[] => {
    if (results && results.length > 0 && results[0] && results[0].length > 0) {
      return results[0].map((r: any) => ({
        ...r,
        similarity: r.score || 0,
      }));
    }
    return [];
  };

  if (urls === null) {
    // Search all pages
    const results = await db.query<any[]>(`
      SELECT 
        id,
        pageURL,
        pageTitle,
        chunkIndex,
        text,
        html,
        search::score(1) AS score
      FROM html_chunks
      WHERE text @1@ $query
      ORDER BY score DESC
      LIMIT $limit;
    `, {
      query: payload.query,
      limit: payload.topK,
    });
    
    return processResults(results);
  } else if (urls.length === 1) {
    // Single page search
    const results = await db.query<any[]>(`
      SELECT 
        id,
        pageURL,
        pageTitle,
        chunkIndex,
        text,
        html,
        search::score(1) AS score
      FROM html_chunks
      WHERE 
        pageURL = $url
        AND text @1@ $query
      ORDER BY score DESC
      LIMIT $limit;
    `, {
      url: urls[0],
      query: payload.query,
      limit: payload.topK,
    });
    
    return processResults(results);
  } else {
    // Multiple pages - search each and merge
    const allResults: any[] = [];
    for (const url of urls) {
      const results = await db.query<any[]>(`
        SELECT 
          id,
          pageURL,
          pageTitle,
          chunkIndex,
          text,
          html,
          search::score(1) AS score
        FROM html_chunks
        WHERE 
          pageURL = $url
          AND text @1@ $query
        ORDER BY score DESC
        LIMIT $limit;
      `, {
        url,
        query: payload.query,
        limit: payload.topK,
      });
      
      allResults.push(...processResults(results));
    }
    
    // Sort by score and take top K
    allResults.sort((a, b) => b.similarity - a.similarity);
    return allResults.slice(0, payload.topK);
  }
}

/**
 * Hybrid search for HTML chunks combining vector and full-text search
 * Supports single pageURL, array of pageURLs, or all pages (when pageURLs is empty/undefined)
 */
async function hybridSearchHTMLChunks(payload: {
  pageURL?: string;
  pageURLs?: string[];
  query: string;
  queryEmbedding: number[];
  topK: number;
  semanticWeight?: number;
  keywordWeight?: number;
}): Promise<any[]> {
  if (!db) throw new Error('Database not connected');

  const semanticWeight = payload.semanticWeight ?? 0.7;
  const keywordWeight = payload.keywordWeight ?? 0.3;
  const efSearch = Math.max(payload.topK * 3, 100);

  // Determine which pages to search
  const urls = payload.pageURLs?.length 
    ? payload.pageURLs 
    : payload.pageURL 
      ? [payload.pageURL] 
      : null; // null means search all pages

  // Get more results than needed for better merging
  const searchK = Math.min(payload.topK * 2, 20);

  // Helper to merge vector and FTS results
  const mergeResults = (vectorResults: any[], ftsResults: any[]): any[] => {
    const vectorMap = new Map<string, any>();
    
    // Process vector results
    if (vectorResults && vectorResults.length > 1 && vectorResults[1] && vectorResults[1].length > 0) {
      for (const r of vectorResults[1]) {
        const semanticScore = 1 - r.distance;
        vectorMap.set(r.id, {
          ...r,
          semanticScore,
          keywordScore: 0,
        });
      }
    }

    // Process FTS results and merge
    if (ftsResults && ftsResults.length > 0 && ftsResults[0] && ftsResults[0].length > 0) {
      for (const r of ftsResults[0]) {
        const keywordScore = r.score || 0;
        if (vectorMap.has(r.id)) {
          const existing = vectorMap.get(r.id);
          existing.keywordScore = keywordScore;
        } else {
          vectorMap.set(r.id, {
            ...r,
            semanticScore: 0,
            keywordScore,
            distance: 1,
          });
        }
      }
    }

    // Calculate combined scores
    return Array.from(vectorMap.values()).map(r => {
      const normalizedSemantic = Math.max(0, Math.min(1, r.semanticScore));
      const normalizedKeyword = Math.max(0, Math.min(1, r.keywordScore / 10));
      const combinedScore = (normalizedSemantic * semanticWeight) + (normalizedKeyword * keywordWeight);
      
      return {
        ...r,
        similarity: combinedScore,
        semanticScore: normalizedSemantic,
        keywordScore: normalizedKeyword,
      };
    });
  };

  if (urls === null) {
    // Search all pages
    const [vectorResults, ftsResults] = await Promise.all([
      db.query<any[]>(`
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
        WHERE embedding <|${searchK},${efSearch}|> $q;
      `, {
        embedding: payload.queryEmbedding,
      }),
      db.query<any[]>(`
        SELECT 
          id,
          pageURL,
          pageTitle,
          chunkIndex,
          text,
          html,
          search::score(1) AS score
        FROM html_chunks
        WHERE text @1@ $query
        ORDER BY score DESC
        LIMIT $limit;
      `, {
        query: payload.query,
        limit: searchK,
      })
    ]);
    
    const combinedResults = mergeResults(vectorResults, ftsResults);
    combinedResults.sort((a, b) => b.similarity - a.similarity);
    return combinedResults.slice(0, payload.topK);
  } else if (urls.length === 1) {
    // Single page search (original behavior)
    const [vectorResults, ftsResults] = await Promise.all([
      db.query<any[]>(`
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
          AND embedding <|${searchK},${efSearch}|> $q;
      `, {
        url: urls[0],
        embedding: payload.queryEmbedding,
      }),
      db.query<any[]>(`
        SELECT 
          id,
          pageURL,
          pageTitle,
          chunkIndex,
          text,
          html,
          search::score(1) AS score
        FROM html_chunks
        WHERE 
          pageURL = $url
          AND text @1@ $query
        ORDER BY score DESC
        LIMIT $limit;
      `, {
        url: urls[0],
        query: payload.query,
        limit: searchK,
      })
    ]);
    
    const combinedResults = mergeResults(vectorResults, ftsResults);
    combinedResults.sort((a, b) => b.similarity - a.similarity);
    return combinedResults.slice(0, payload.topK);
  } else {
    // Multiple pages - search each and merge all results
    const allResults: any[] = [];
    
    for (const url of urls) {
      const [vectorResults, ftsResults] = await Promise.all([
        db.query<any[]>(`
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
            AND embedding <|${searchK},${efSearch}|> $q;
        `, {
          url,
          embedding: payload.queryEmbedding,
        }),
        db.query<any[]>(`
          SELECT 
            id,
            pageURL,
            pageTitle,
            chunkIndex,
            text,
            html,
            search::score(1) AS score
          FROM html_chunks
          WHERE 
            pageURL = $url
            AND text @1@ $query
          ORDER BY score DESC
          LIMIT $limit;
        `, {
          url,
          query: payload.query,
          limit: searchK,
        })
      ]);
      
      allResults.push(...mergeResults(vectorResults, ftsResults));
    }
    
    // Sort all results by combined score and return top K
    allResults.sort((a, b) => b.similarity - a.similarity);
    return allResults.slice(0, payload.topK);
  }
}

/**
 * Full-text search for form fields
 */
async function fullTextSearchFormFields(payload: {
  pageURL: string;
  query: string;
  topK: number;
}): Promise<any[]> {
  if (!db) throw new Error('Database not connected');

  const groupResults = await db.query<any[]>(`
    SELECT 
      id,
      pageURL,
      groupIndex,
      fieldsJSON,
      search::score(1) AS score
    FROM form_fields
    WHERE 
      pageURL = $url
      AND fieldsJSON @1@ $query
    ORDER BY score DESC
    LIMIT $limit;
  `, {
    url: payload.pageURL,
    query: payload.query,
    limit: Math.ceil(payload.topK / 10),
  });

  if (!groupResults || groupResults.length === 0 || !groupResults[0] || groupResults[0].length === 0) {
    return [];
  }

  // Parse JSON groups and flatten
  const allFields: any[] = [];
  for (const group of groupResults[0]) {
    try {
      const fields = JSON.parse(group.fieldsJSON);
      fields.forEach((field: any) => {
        allFields.push({
          ...field,
          id: group.id,
          pageURL: group.pageURL,
          similarity: group.score || 0,
        });
      });
    } catch (e) {
      logError('[DB Worker] Failed to parse fieldsJSON:', e);
    }
  }

  return allFields.slice(0, payload.topK);
}

/**
 * Full-text search for clickable elements
 */
async function fullTextSearchClickableElements(payload: {
  pageURL: string;
  query: string;
  topK: number;
}): Promise<any[]> {
  if (!db) throw new Error('Database not connected');
  
  const groupResults = await db.query<any[]>(`
    SELECT 
      id,
      pageURL,
      groupIndex,
      elementsJSON,
      search::score(1) AS score
    FROM clickable_elements
    WHERE 
      pageURL = $url
      AND elementsJSON @1@ $query
    ORDER BY score DESC
    LIMIT $limit;
  `, {
    url: payload.pageURL,
    query: payload.query,
    limit: Math.ceil(payload.topK / 10),
  });

  if (!groupResults || groupResults.length === 0 || !groupResults[0] || groupResults[0].length === 0) {
    return [];
  }

  // Parse JSON groups and flatten
  const allElements: any[] = [];
  for (const group of groupResults[0]) {
    try {
      const elements = JSON.parse(group.elementsJSON);
      elements.forEach((element: any) => {
        allElements.push({
          ...element,
          id: group.id,
          pageURL: group.pageURL,
          similarity: group.score || 0,
        });
      });
    } catch (e) {
      logError('[DB Worker] Failed to parse elementsJSON:', e);
    }
  }

  return allElements.slice(0, payload.topK);
}

/**
 * Execute custom query
 */
async function executeQuery(payload: {
  sql: string;
  vars?: Record<string, unknown>;
}): Promise<any> {
  if (!db) throw new Error('Database not connected');
  return await db.query(payload.sql, payload.vars);
}

/**
 * Main message handler
 */
async function handleMessage(message: WorkerMessage): Promise<WorkerResponse> {
  try {
    let data: any;

    switch (message.type) {
      case 'initialize':
        // Prevent duplicate initialization
        if (!initializationPromise) {
          initializationPromise = initializeDB(
            message.payload.dbName || 'embeddings_db',
            message.payload.useMemory ?? true // Use nullish coalescing to ensure true is default
          ).then(() => initializeEmbeddingsSchema());
        }
        await initializationPromise;
        data = { initialized: true };
        break;

      case 'storeHTMLChunks':
        await storeHTMLChunks(message.payload);
        data = { stored: true };
        break;

      case 'storeFormFields':
        await storeFormFields(message.payload);
        data = { stored: true };
        break;

      case 'storeClickableElements':
        await storeClickableElements(message.payload);
        data = { stored: true };
        break;

      case 'storeDOMUpdate':
        await storeDOMUpdate(message.payload);
        data = { stored: true };
        break;

      case 'searchHTMLChunks':
        data = await searchHTMLChunks(message.payload);
        break;

      case 'searchFormFields':
        data = await searchFormFields(message.payload);
        break;

      case 'searchClickableElements':
        data = await searchClickableElements(message.payload);
        break;

      case 'fullTextSearchHTMLChunks':
        data = await fullTextSearchHTMLChunks(message.payload);
        break;

      case 'hybridSearchHTMLChunks':
        data = await hybridSearchHTMLChunks(message.payload);
        break;

      case 'fullTextSearchFormFields':
        data = await fullTextSearchFormFields(message.payload);
        break;

      case 'fullTextSearchClickableElements':
        data = await fullTextSearchClickableElements(message.payload);
        break;

      case 'deletePageEmbeddings':
        data = await deletePageEmbeddings(message.payload);
        break;

      case 'query':
        data = await executeQuery(message.payload);
        break;

      case 'terminate':
        // Gracefully close database connection
        if (db && isConnected) {
          await db.close();
          db = null;
          isConnected = false;
          initializationPromise = null;
          log('[DB Worker] Database connection closed');
        }
        data = { terminated: true };
        break;

      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }

    return {
      id: message.id,
      success: true,
      data,
    };
  } catch (error) {
    logError('[DB Worker] Error handling message:', error);
    return {
      id: message.id,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Set up message listener
self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  const response = await handleMessage(event.data);
  self.postMessage(response);
});

// Signal that worker is ready
log('[DB Worker] Worker initialized and ready');
self.postMessage({ type: 'ready' });

