# Semantic Search Refactoring - Manager Pattern

## Overview

Refactored the semantic search implementation from inline CopilotKit action handlers into a dedicated `SemanticSearchManager` class for better organization, reusability, and maintainability.

## Changes Made

### 1. New File: `SemanticSearchManager.ts`

**Location**: `/pages/side-panel/src/lib/SemanticSearchManager.ts`

**Purpose**: Centralized manager for all semantic search operations

**Features**:
- ✅ Type-safe search operations
- ✅ Consistent error handling
- ✅ Logging and debugging support
- ✅ Reusable across components
- ✅ Easy to test and maintain

**Class Structure**:

```typescript
class SemanticSearchManager {
  constructor(pageDataRef) { ... }
  
  // Search page content using embeddings
  async searchPageContent(query: string, topK: number): Promise<SearchResult>
  
  // Search form fields using embeddings
  async searchFormData(query: string, topK: number): Promise<SearchResult>
  
  // Search clickable elements using embeddings
  async searchClickableElements(query: string, topK: number): Promise<SearchResult>
}
```

**Type Definitions**:

```typescript
interface SearchResult {
  success: boolean;
  query?: string;
  resultsCount?: number;
  results?: any[];
  error?: string;
}

interface PageContentResult {
  rank: number;
  similarity: number;
  text: string;
  html: string;
}

interface FormFieldResult {
  rank: number;
  similarity: number;
  tagName: string;
  type: string;
  name: string;
  id: string;
  selector: string;
  placeholder?: string;
  value?: string;
  textContent?: string;
}

interface ClickableElementResult {
  rank: number;
  similarity: number;
  tagName: string;
  selector: string;
  text: string;
  ariaLabel?: string;
  title?: string;
  href?: string;
  role?: string;
}
```

### 2. Updated File: `ChatInner.tsx`

**Changes**:

1. **Import the manager**:
```typescript
import { SemanticSearchManager } from '../lib/SemanticSearchManager';
```

2. **Create manager instance**:
```typescript
// Create semantic search manager
const searchManager = useMemo(() => new SemanticSearchManager(pageDataRef), []);
```

3. **Simplified action handlers**:

**Before** (100+ lines per action):
```typescript
useCopilotAction({
  name: "searchPageContent",
  // ... 80+ lines of logic ...
  handler: async ({ query, topK = 3 }) => {
    try {
      // Check embeddings
      // Embed query
      // Calculate similarities
      // Sort and filter
      // Return results
    } catch (error) {
      // Handle error
    }
  },
});
```

**After** (3 lines per action):
```typescript
useCopilotAction({
  name: "searchPageContent",
  description: "...",
  parameters: [...],
  handler: async ({ query, topK = 3 }) => {
    return await searchManager.searchPageContent(query, topK);
  },
});
```

## Benefits

### 1. **Separation of Concerns**
- CopilotKit actions focus on API definition
- Business logic isolated in manager
- Easier to understand and modify

### 2. **Reduced Code Duplication**
- **Before**: ~300 lines in ChatInner.tsx (3 actions × 100 lines each)
- **After**: ~15 lines in ChatInner.tsx + 330 lines in SemanticSearchManager.ts
- Reusable logic in one place

### 3. **Better Testability**
```typescript
// Easy to test manager in isolation
import { SemanticSearchManager } from './SemanticSearchManager';

describe('SemanticSearchManager', () => {
  it('should search page content', async () => {
    const mockPageDataRef = { current: { ... } };
    const manager = new SemanticSearchManager(mockPageDataRef);
    const result = await manager.searchPageContent('query', 3);
    expect(result.success).toBe(true);
  });
});
```

### 4. **Improved Maintainability**
- Single source of truth for search logic
- Changes propagate to all actions automatically
- Easier to add new search methods

### 5. **Type Safety**
- Clear interfaces for all result types
- TypeScript catches errors at compile time
- Better IDE autocomplete

## Architecture

```
┌─────────────────────────────────────────────┐
│           ChatInner.tsx                      │
│                                              │
│  • useCopilotAction definitions             │
│  • Action handlers (delegate to manager)    │
│  • UI and component logic                   │
└──────────────┬──────────────────────────────┘
               │
               │ delegates to
               ↓
┌─────────────────────────────────────────────┐
│      SemanticSearchManager.ts               │
│                                              │
│  • searchPageContent()                      │
│  • searchFormData()                         │
│  • searchClickableElements()                │
│                                              │
│  • Embedding generation                     │
│  • Similarity calculations                  │
│  • Result filtering and ranking             │
│  • Error handling                           │
└──────────────┬──────────────────────────────┘
               │
               │ uses
               ↓
┌─────────────────────────────────────────────┐
│         Dependencies                        │
│                                              │
│  • embeddingService (from @extension/shared)│
│  • cosineSimilarity (from @extension/shared)│
│  • pageDataRef (embeddings + page content)  │
└─────────────────────────────────────────────┘
```

## Code Comparison

### Before: Inline Logic

```typescript
// 🪁 Action: Search Page Content (OLD)
useCopilotAction({
  name: "searchPageContent",
  handler: async ({ query, topK = 3 }) => {
    try {
      // 1. Check embeddings
      const embeddings = pageDataRef.current.embeddings;
      if (!embeddings) {
        return { success: false, error: "...", results: [] };
      }
      
      // 2. Validate chunks
      if (!embeddings.chunks || embeddings.chunks.length === 0) {
        return { success: false, error: "...", results: [] };
      }
      
      // 3. Limit topK
      const limitedTopK = Math.min(Math.max(1, topK), 10);
      
      // 4. Embed query
      if (!embeddingService.isReady()) {
        await embeddingService.initialize();
      }
      const queryEmbedding = await embeddingService.embed(query);
      
      // 5. Calculate similarities
      const similarities = embeddings.chunks.map((chunk, index) => ({
        index,
        text: chunk.text,
        similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
      }));
      
      // 6. Sort and filter
      similarities.sort((a, b) => b.similarity - a.similarity);
      const topResults = similarities.slice(0, limitedTopK);
      
      // 7. Format results
      return {
        success: true,
        query,
        resultsCount: topResults.length,
        results: topResults.map((result, i) => ({
          rank: i + 1,
          similarity: Math.round(result.similarity * 100) / 100,
          text: result.text,
          html: embeddings.chunks?.[result.index]?.html || result.text,
        }))
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        results: []
      };
    }
  },
});
```

### After: Manager Pattern

```typescript
// 🪁 Action: Search Page Content (NEW)
useCopilotAction({
  name: "searchPageContent",
  description: "...",
  parameters: [...],
  handler: async ({ query, topK = 3 }) => {
    return await searchManager.searchPageContent(query, topK);
  },
});
```

## File Structure

```
pages/side-panel/src/
├── components/
│   └── ChatInner.tsx          ← Uses manager
├── lib/
│   └── SemanticSearchManager.ts  ← New manager
└── ...
```

## Usage Example

```typescript
// In any component
import { SemanticSearchManager } from '../lib/SemanticSearchManager';

function MyComponent() {
  const pageDataRef = useRef({ embeddings: null, pageContent: null });
  const searchManager = useMemo(() => new SemanticSearchManager(pageDataRef), []);
  
  // Search page content
  const results = await searchManager.searchPageContent('login form', 5);
  
  // Search form fields
  const fields = await searchManager.searchFormData('email input', 5);
  
  // Search clickable elements
  const buttons = await searchManager.searchClickableElements('submit button', 5);
}
```

## Future Enhancements

With this refactoring, we can easily add:

1. **Caching layer**:
```typescript
class SemanticSearchManager {
  private cache = new Map<string, SearchResult>();
  
  async searchPageContent(query: string, topK: number) {
    const cacheKey = `${query}-${topK}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    // ... perform search
    this.cache.set(cacheKey, result);
    return result;
  }
}
```

2. **Search analytics**:
```typescript
class SemanticSearchManager {
  private analytics = new SearchAnalytics();
  
  async searchPageContent(query: string, topK: number) {
    this.analytics.trackSearch(query);
    const result = await this._searchPageContent(query, topK);
    this.analytics.trackResults(result);
    return result;
  }
}
```

3. **Custom embeddings**:
```typescript
class SemanticSearchManager {
  constructor(
    pageDataRef,
    private customEmbedder?: EmbeddingService
  ) {}
  
  private async embedQuery(query: string) {
    return this.customEmbedder 
      ? await this.customEmbedder.embed(query)
      : await embeddingService.embed(query);
  }
}
```

4. **Result filtering**:
```typescript
class SemanticSearchManager {
  async searchPageContent(
    query: string, 
    topK: number,
    filters?: { minSimilarity?: number; tags?: string[] }
  ) {
    let results = await this._searchPageContent(query, topK);
    
    if (filters?.minSimilarity) {
      results = results.filter(r => r.similarity >= filters.minSimilarity);
    }
    
    return results;
  }
}
```

## Testing

```typescript
// SemanticSearchManager.test.ts
import { SemanticSearchManager } from './SemanticSearchManager';
import { embeddingService } from '@extension/shared';

jest.mock('@extension/shared', () => ({
  embeddingService: {
    isReady: jest.fn(),
    initialize: jest.fn(),
    embed: jest.fn(),
    embedBatch: jest.fn(),
  },
  cosineSimilarity: jest.fn((a, b) => 0.85),
  debug: { log: jest.fn(), error: jest.fn() },
}));

describe('SemanticSearchManager', () => {
  let manager: SemanticSearchManager;
  let mockPageDataRef: any;

  beforeEach(() => {
    mockPageDataRef = {
      current: {
        embeddings: {
          fullEmbedding: [0.1, 0.2, 0.3],
          chunks: [
            { text: 'Test content', html: '<div>Test</div>', embedding: [0.1, 0.2] },
          ],
          timestamp: Date.now(),
        },
        pageContent: {
          allDOMContent: {
            allFormData: [],
            clickableElements: [],
          },
        },
      },
    };
    manager = new SemanticSearchManager(mockPageDataRef);
  });

  describe('searchPageContent', () => {
    it('should return results for valid query', async () => {
      (embeddingService.isReady as jest.Mock).mockReturnValue(true);
      (embeddingService.embed as jest.Mock).mockResolvedValue([0.1, 0.2]);

      const result = await manager.searchPageContent('test query', 3);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toHaveProperty('html');
    });

    it('should return error when embeddings not available', async () => {
      mockPageDataRef.current.embeddings = null;

      const result = await manager.searchPageContent('test query', 3);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });
  });
});
```

## Migration Guide

If you want to add more search methods:

1. **Add method to SemanticSearchManager**:
```typescript
async searchCustomType(query: string, topK: number): Promise<SearchResult> {
  // Implementation
}
```

2. **Add CopilotKit action**:
```typescript
useCopilotAction({
  name: "searchCustomType",
  description: "...",
  parameters: [...],
  handler: async ({ query, topK }) => {
    return await searchManager.searchCustomType(query, topK);
  },
});
```

That's it! The manager handles all the complexity.

## Summary

✅ **Created**: `SemanticSearchManager.ts` - Centralized search logic  
✅ **Updated**: `ChatInner.tsx` - Simplified action handlers  
✅ **Improved**: Code organization and maintainability  
✅ **Maintained**: All existing functionality  
✅ **Zero**: Linter errors  
✅ **Enhanced**: Type safety and testability  

**Lines of Code**:
- Before: ~300 lines in ChatInner.tsx
- After: ~15 lines in ChatInner.tsx + 330 lines in SemanticSearchManager.ts
- **Net**: More organized, same functionality, easier to maintain

---

**Date**: October 15, 2025  
**Status**: ✅ Complete  
**Pattern**: Manager Pattern  
**Benefits**: Better organization, reusability, testability, maintainability

