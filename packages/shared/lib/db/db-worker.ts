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

// Timestamp helper for consistent logging
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

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
    DEBUG && console.log(`${ts()} [DB Worker] Already connected`);
    return;
  }

  try {
    // Initialize SurrealDB with WASM engines
    db = new Surreal({
      engines: surrealdbWasmEngines(),
    });

    // Connect to memory or IndexedDB
    const connectionString = useMemory ? 'mem://' : `indxdb://${dbName}`;
    
    DEBUG && console.log(`${ts()} [DB Worker] 🔌 Connecting to SurrealDB...`);
    DEBUG && console.log(`${ts()} [DB Worker]    Mode: ${useMemory ? 'IN-MEMORY (fast, no persistence)' : 'IndexedDB (persistent)'}`);
    DEBUG && console.log(`${ts()} [DB Worker]    Connection: ${connectionString}`);
    
    await db.connect(connectionString);

    // Set namespace and database
    await db.use({
      namespace: 'app',
      database: 'main',
    });

    isConnected = true;
    DEBUG && console.log(`${ts()} [DB Worker] ✅ Connected successfully`);
    DEBUG && console.log(`${ts()} [DB Worker] ℹ️  Storage: ${useMemory ? 'RAM (cleared on refresh)' : 'IndexedDB (persistent across sessions)'}`);
  } catch (error) {
    console.error(`${ts()} [DB Worker] ❌ Failed to connect:`, error);
    throw error;
  }
}

/**
 * Initialize embeddings schema with HNSW indexes
 */
async function initializeEmbeddingsSchema(): Promise<void> {
  if (!db) throw new Error('Database not connected');

  await db.query(`
    -- ========================================
    -- Separate tables with HNSW vector indexes for native vector search
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
    
    -- HNSW vector index for HTML chunks
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
    
    -- Form fields table with GROUPED storage
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
    
    -- Clickable elements table with GROUPED storage
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

  DEBUG && console.log(`${ts()} [DB Worker] ✅ Schema initialized with HNSW indexes`);
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

  DEBUG && console.log(`${ts()} [DB Worker] Storing ${payload.chunks.length} HTML chunks in batches of ${BATCH_SIZE} (parallel)...`);

  // Create batches
  const batches: Array<typeof payload.chunks> = [];
  for (let i = 0; i < payload.chunks.length; i += BATCH_SIZE) {
    batches.push(payload.chunks.slice(i, i + BATCH_SIZE));
  }

  // Process ALL batches in parallel
  await Promise.all(batches.map(async (batchChunks, batchIndex) => {
    if (!db) throw new Error('Database not connected');
    const batchNum = batchIndex + 1;
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
    DEBUG && console.log(`${ts()} [DB Worker] Batch ${batchNum}/${batches.length} complete`);
  }));

  DEBUG && console.log(`${ts()} [DB Worker] ✅ Stored ${payload.chunks.length} HTML chunks`);
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

    // Process ALL batches in parallel
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
      DEBUG && console.log(`${ts()} [DB Worker] Form fields batch ${batchIndex + 1}/${batches.length} complete`);
    }));
  }

  DEBUG && console.log(`${ts()} [DB Worker] ✅ Stored ${payload.groups.length} form field groups`);
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

    // Process ALL batches in parallel
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
      DEBUG && console.log(`${ts()} [DB Worker] Clickable elements batch ${batchIndex + 1}/${batches.length} complete`);
    }));
  }

  DEBUG && console.log(`${ts()} [DB Worker] ✅ Stored ${payload.groups.length} clickable element groups`);
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

    DEBUG && console.log(`${ts()} [DB Worker] ✅ Stored DOM update and decayed older entries`);
  } catch (error) {
    console.error(`${ts()} [DB Worker] ❌ Failed to store DOM update:`, error);
    throw error;
  }
}

/**
 * Search HTML chunks using HNSW index
 */
async function searchHTMLChunks(payload: {
  pageURL: string;
  queryEmbedding: number[];
  topK: number;
}): Promise<any[]> {
  if (!db) throw new Error('Database not connected');

  const efSearch = Math.max(payload.topK * 3, 100);
  
  const results = await db.query<any[]>(`
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
    url: payload.pageURL,
    embedding: payload.queryEmbedding,
  });

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
 */
async function searchFormFields(payload: {
  pageURL: string;
  queryEmbedding: number[];
  topK: number;
}): Promise<any[]> {
  if (!db) throw new Error('Database not connected');

  DEBUG && console.log(`${ts()} [DB Worker] 🔍 searchFormFields called:`, { pageURL: payload.pageURL, topK: payload.topK });

  const groupTopK = Math.ceil(payload.topK / 10);
  const efSearch = Math.max(groupTopK * 3, 50);
  
  DEBUG && console.log(`${ts()} [DB Worker] Executing form fields query...`);
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
    url: payload.pageURL,
    embedding: payload.queryEmbedding,
  });
  
  DEBUG && console.log(`${ts()} [DB Worker] Query complete, results:`, groupResults?.length);

  if (!groupResults || groupResults.length < 2 || !groupResults[1] || groupResults[1].length === 0) {
    return [];
  }

  // Parse JSON groups and flatten
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
      console.error(`${ts()} [DB Worker] Failed to parse fieldsJSON:`, e);
    }
  }

  return allFields.slice(0, payload.topK);
}

/**
 * Search clickable elements using HNSW index
 */
async function searchClickableElements(payload: {
  pageURL: string;
  queryEmbedding: number[];
  topK: number;
}): Promise<any[]> {
  if (!db) throw new Error('Database not connected');

  const groupTopK = Math.ceil(payload.topK / 10);
  const efSearch = Math.max(groupTopK * 3, 50);
  
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
    url: payload.pageURL,
    embedding: payload.queryEmbedding,
  });

  if (!groupResults || groupResults.length < 2 || !groupResults[1] || groupResults[1].length === 0) {
    return [];
  }

  // Parse JSON groups and flatten
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
      console.error(`${ts()} [DB Worker] Failed to parse elementsJSON:`, e);
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

      case 'query':
        data = await executeQuery(message.payload);
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
    console.error(`${ts()} [DB Worker] Error handling message:`, error);
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
DEBUG && console.log(`${ts()} [DB Worker] 🚀 Worker initialized and ready`);
self.postMessage({ type: 'ready' });

