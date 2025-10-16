# Embedding Storage Comparison

## Two Different Approaches to Semantic Search

### ✅ Pre-Embedded & Stored (HTML + Shadow DOM)

**What Gets Embedded:**
- Main HTML content (`fullHTML`)
- Shadow DOM content (`shadowContent`)
- Text content extracted from page

**When Embedded:**
- Automatically on page load/refresh
- Triggered by `ChatSessionContainer` useEffect

**Where Stored:**
```
SurrealDB in-memory (page_embeddings table)
├── pageURL: string
├── pageTitle: string
├── sessionId: string
├── fullEmbedding: number[]  ← Pre-computed
└── chunks: Array<{
    ├── text: string
    ├── html: string            ← Includes Shadow DOM
    └── embedding: number[]     ← Pre-computed
}>
```

**Advantages:**
- ✅ Fast search (embeddings already computed)
- ✅ No delay when searching
- ✅ Persistent across searches
- ✅ Can search historical pages

**Use Case:** Searching page content/structure

---

### ❌ On-Demand Embedding (Form Data + Clickable Elements)

**What Gets Embedded:**
- Form fields (`allFormData`)
- Clickable elements (`clickableElements`)

**When Embedded:**
- Only when `searchFormData()` or `searchClickableElements()` is called
- Generated fresh each time

**Where Stored:**
```
NOT stored in database ❌
Only kept in React state (pageDataRef.current.pageContent)

pageContent.allDOMContent {
  fullHTML: string,              ← Embedded & stored ✅
  shadowContent: Array<...>,     ← Embedded & stored ✅
  allFormData: Array<...>,       ← NOT embedded ❌
  clickableElements: Array<...>  ← NOT embedded ❌
}
```

**How It Works:**
```typescript
async searchFormData(query: string, topK: number = 5) {
  // 1. Get raw data from pageContent (in-memory)
  const allFormData = pageContent.allDOMContent.allFormData;
  
  // 2. Generate query embedding
  const queryEmbedding = await embeddingService.embed(query);
  
  // 3. Generate embeddings for ALL form fields (ON-DEMAND)
  const formTexts = allFormData.map(field => 
    `${field.tagName} ${field.type} ${field.name}...`
  );
  const formEmbeddings = await embeddingService.embedBatch(formTexts);
  
  // 4. Calculate similarities and return results
  // 5. Embeddings are discarded after search completes
}
```

**Disadvantages:**
- ⏱️ Slower (embeddings computed on every search)
- 🔄 No caching (re-computed each time)
- 💾 Not persistent (lost when page changes)

**Advantages:**
- 💡 Always fresh (reflects current page state)
- 💾 Less storage (no pre-computed embeddings)
- 🔄 Dynamic (works with changing forms)

**Use Case:** Searching interactive elements

---

## Why The Difference?

### HTML Content (Pre-Embedded)
- **Static**: Doesn't change frequently
- **Large**: Thousands of lines of HTML
- **Reusable**: Same embeddings needed for multiple searches
- **Worth caching**: Large computational cost

### Form Data / Clickable Elements (On-Demand)
- **Dynamic**: Can change (values, visibility)
- **Small**: Usually 10-50 form fields, 20-100 buttons
- **Context-specific**: Different searches need different fields
- **Fast to compute**: Small datasets, quick embedding

---

## Storage Schema Comparison

### page_embeddings Table (SurrealDB)
```sql
DEFINE TABLE IF NOT EXISTS page_embeddings SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS pageURL ON page_embeddings TYPE string;
DEFINE FIELD IF NOT EXISTS pageTitle ON page_embeddings TYPE string;
DEFINE FIELD IF NOT EXISTS sessionId ON page_embeddings TYPE option<string>;
DEFINE FIELD IF NOT EXISTS fullEmbedding ON page_embeddings TYPE array;
DEFINE FIELD IF NOT EXISTS chunks ON page_embeddings TYPE option<array>;
DEFINE FIELD IF NOT EXISTS timestamp ON page_embeddings TYPE datetime;
```

**Notice:** No fields for `allFormData` or `clickableElements`!

### What's Actually Stored
```typescript
interface PageEmbeddingRecord {
  pageURL: string;
  pageTitle: string;
  sessionId?: string;
  fullEmbedding: number[];         // ← Page text embedding
  chunks?: Array<{
    text: string;                  // ← Chunk text
    html: string;                  // ← Chunk HTML (includes shadow DOM)
    embedding: number[];           // ← Chunk embedding
    index: number;
  }>;
  timestamp: string;
}

// Missing:
// - formFieldsEmbeddings ❌
// - clickableElementsEmbeddings ❌
```

---

## Performance Comparison

### Pre-Embedded (HTML)
```
Page Load:
├── Extract HTML (50ms)
├── Generate embeddings (2000ms) ← One-time cost
└── Store in DB (10ms)

First Search:
└── Calculate similarity (5ms) ← Very fast!

Subsequent Searches:
└── Calculate similarity (5ms) ← Still very fast!

Total for 10 searches: 2065ms (2.06s)
```

### On-Demand (Form Data)
```
Page Load:
└── Extract form data (10ms)
    (No embedding yet)

First Search:
├── Generate query embedding (50ms)
├── Generate field embeddings (200ms) ← Computed on-demand
└── Calculate similarity (5ms)
Total: 255ms

Second Search:
├── Generate query embedding (50ms)
├── Generate field embeddings (200ms) ← Re-computed!
└── Calculate similarity (5ms)
Total: 255ms

Total for 10 searches: 2550ms (2.55s)
```

**For many searches:** Pre-embedding is faster  
**For single search:** On-demand is faster (no upfront cost)

---

## Could We Pre-Embed Form Data?

### Yes, but...

**Pros:**
- ✅ Faster repeated searches
- ✅ Consistent with HTML approach

**Cons:**
- ❌ Forms can change dynamically (JavaScript updates)
- ❌ Input values change (need re-embedding)
- ❌ More storage needed
- ❌ Added complexity
- ❌ Stale embeddings risk

**Conclusion:** On-demand is better for interactive elements

---

## Summary Table

| Aspect | HTML/Shadow DOM | Form Data/Clickables |
|--------|----------------|---------------------|
| **Pre-Embedded** | ✅ Yes | ❌ No |
| **Stored in DB** | ✅ Yes (SurrealDB) | ❌ No |
| **When Embedded** | On page load | On search call |
| **Persistence** | In-memory DB | None (re-computed) |
| **First Search Speed** | Fast (pre-computed) | Slower (compute first) |
| **Subsequent Searches** | Fast (cached) | Slower (re-compute) |
| **Storage Space** | High (~2MB per page) | Low (0 bytes) |
| **Freshness** | Static snapshot | Always current |
| **Best For** | Content/structure search | Interactive element search |

---

## Code References

### Pre-Embedding (HTML)
- **Trigger**: `ChatSessionContainer.tsx` lines 342-423
- **Storage**: `embeddings-storage.ts` lines 85-109
- **Schema**: `embeddings-storage.ts` lines 26-48

### On-Demand (Form Data)
- **Search**: `SemanticSearchManager.ts` lines 184-264
- **No storage code** (not stored anywhere)

### On-Demand (Clickable Elements)
- **Search**: `SemanticSearchManager.ts` lines 270-349
- **No storage code** (not stored anywhere)

---

## Impact Assessment

### Current System
- ✅ HTML searches are VERY fast
- ✅ Shadow DOM now included (after fix)
- ⚠️ Form/clickable searches are slower (acceptable)
- ⚠️ Form/clickable searches don't work on historical pages

### If We Pre-Embed Everything
- ✅ All searches would be fast
- ❌ Much more storage needed
- ❌ Risk of stale data
- ❌ More complex implementation

**Recommendation:** Keep current approach - it's optimal for each use case.

---

**Date**: January 2025  
**Status**: Current Design Analysis  
**Decision**: On-demand embedding for form data and clickable elements is intentional and optimal

