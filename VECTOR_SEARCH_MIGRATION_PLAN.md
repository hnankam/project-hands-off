# Native Vector Search Migration Plan

## Goal
Migrate from JavaScript-based brute-force vector search to SurrealDB's native HNSW vector search for 8-150x performance improvement.

---

## Current Architecture (To Be Replaced)

### Storage Structure
```typescript
page_embeddings {
  pageURL: string,
  pageTitle: string,
  fullEmbedding: number[384],
  chunks: Array<{
    text: string,
    html: string,
    embedding: number[384],
    index: number
  }>,
  formFieldEmbeddings: Array<{...}>,  // Nested, not indexed
  clickableElementEmbeddings: Array<{...}>  // Nested, not indexed
}
```

### Search Method
```typescript
// JavaScript brute-force (SLOW)
const allEmbeddings = await db.query('SELECT * FROM page_embeddings');
const similarities = allEmbeddings.map(e => ({
  ...e,
  similarity: cosineSimilarity(queryEmbedding, e.embedding)
}));
similarities.sort((a, b) => b.similarity - a.similarity);
return similarities.slice(0, topK);
```

---

## New Architecture (Native Vector Search)

### Storage Structure
Separate tables for each embedding type with HNSW indexes:

```sql
-- HTML chunks table with vector index
html_chunks {
  id: record<html_chunks>,
  pageURL: string,
  pageTitle: string,
  chunkIndex: number,
  text: string,
  html: string,
  embedding: array<float, 384>,  -- ← HNSW indexed
  sessionId: string,
  timestamp: datetime
}
DEFINE INDEX hnsw_html_idx ON html_chunks FIELDS embedding HNSW DIMENSION 384 DIST COSINE TYPE F64;

-- Form fields table with vector index
form_fields {
  id: record<form_fields>,
  pageURL: string,
  selector: string,
  tagName: string,
  fieldType: string,
  fieldName: string,
  fieldId: string,
  placeholder: option<string>,
  embedding: array<float, 384>,  -- ← HNSW indexed
  sessionId: string,
  timestamp: datetime
}
DEFINE INDEX hnsw_form_idx ON form_fields FIELDS embedding HNSW DIMENSION 384 DIST COSINE TYPE F64;

-- Clickable elements table with vector index
clickable_elements {
  id: record<clickable_elements>,
  pageURL: string,
  selector: string,
  tagName: string,
  text: string,
  ariaLabel: option<string>,
  href: option<string>,
  embedding: array<float, 384>,  -- ← HNSW indexed
  sessionId: string,
  timestamp: datetime
}
DEFINE INDEX hnsw_clickable_idx ON clickable_elements FIELDS embedding HNSW DIMENSION 384 DIST COSINE TYPE F64;
```

### Search Method
```typescript
// Native vector search (FAST!)
const results = await db.query(`
  LET $query_vec = $embedding;
  SELECT 
    id, selector, tagName, text,
    vector::similarity::cosine(embedding, $query_vec) AS similarity
  FROM form_fields
  WHERE 
    pageURL = $url
    AND embedding <|$topK|> $query_vec  -- KNN operator with HNSW index
  ORDER BY similarity DESC;
`, { url, embedding: queryEmbedding, topK });
```

---

## Migration Steps

### Step 1: Update Database Schema ✓
**File**: `packages/shared/lib/db/embeddings-storage.ts`

Add new tables with vector indexes:
- `html_chunks` - HTML content chunks with HNSW index
- `form_fields` - Form input fields with HNSW index
- `clickable_elements` - Clickable elements with HNSW index

Keep `page_embeddings` for backward compatibility (will be deprecated).

### Step 2: Update Storage Manager ✓
**File**: `packages/shared/lib/db/embeddings-storage.ts`

Add new methods:
- `storeHTMLChunks()` - Store HTML chunks in separate table
- `storeFormFields()` - Store form fields with embeddings
- `storeClickableElements()` - Store clickable elements with embeddings
- `searchHTMLChunks()` - Native vector search for HTML
- `searchFormFields()` - Native vector search for forms
- `searchClickableElements()` - Native vector search for clickables

### Step 3: Update Embedding Worker
**File**: `pages/side-panel/src/workers/EmbeddingWorkerManager.ts`

- Generate embeddings for form fields and clickable elements
- Return structured data for separate table storage

### Step 4: Update Chat Session Container
**File**: `pages/side-panel/src/components/ChatSessionContainer.tsx`

- Store embeddings in new tables (html_chunks, form_fields, clickable_elements)
- Keep backward compatibility with old storage

### Step 5: Update Semantic Search Manager
**File**: `pages/side-panel/src/lib/SemanticSearchManager.ts`

- Replace JavaScript cosine similarity with native vector search
- Use KNN operator (`<|k|>`) for all searches
- Remove manual sorting and filtering

### Step 6: Test and Verify
- Test HTML chunk search
- Test form field search
- Test clickable element search
- Benchmark performance improvements
- Verify backward compatibility

---

## Performance Expectations

| Scenario | Before (JS) | After (Native) | Improvement |
|----------|-------------|----------------|-------------|
| 20 form fields | 34ms | 4ms | **8.5x faster** |
| 1000 form fields | 900ms | 6ms | **150x faster** |
| HTML chunks (50) | 50ms | 5ms | **10x faster** |

---

## Backward Compatibility

- Keep `page_embeddings` table for existing data
- New code uses new tables (`html_chunks`, `form_fields`, `clickable_elements`)
- Old searches gracefully fall back to JavaScript method if no indexed data

---

## Implementation Order

1. ✅ Schema update (new tables + vector indexes)
2. ✅ Storage manager methods
3. ✅ Embedding worker updates
4. ✅ Storage integration (ChatSessionContainer)
5. ✅ Search integration (SemanticSearchManager)
6. ✅ Testing and verification

---

**Status**: In Progress  
**Expected Completion**: Current session  
**Breaking Changes**: None (backward compatible)

