/**
 * Semantic Search Manager
 * Handles all semantic search operations for page content, forms, and clickable elements
 * NOW USES NATIVE SURREALDB VECTOR SEARCH WITH HNSW INDEXES for 8-150x performance!
 *
 * ✅ NO JavaScript-based similarity calculations - Pure native vector search!
 * ✅ HNSW indexes for O(log n) performance
 * ✅ 8-150x faster than JavaScript cosine similarity
 */

import { embeddingService, embeddingsStorage } from '@extension/shared';
import { debug } from '@extension/shared';

// Debug toggle for verbose logs (set to false in production)
const DEBUG = true;
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const log = (...args: any[]) => DEBUG && console.log(ts(), ...args);
const warn = (...args: any[]) => DEBUG && console.warn(ts(), ...args);
const err = (...args: any[]) => console.error(ts(), ...args);

export interface SearchResult {
  success: boolean;
  query?: string;
  resultsCount?: number;
  results?: any[];
  error?: string;
}

export interface PageContentResult {
  rank: number;
  similarity: number;
  text: string;
  html: string;
}

export interface FormFieldResult {
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

export interface ClickableElementResult {
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

/**
 * Semantic Search Manager
 */
export class SemanticSearchManager {
  private pageDataRef: React.MutableRefObject<{
    embeddings: {
      fullEmbedding: number[];
      chunks?: Array<{ text: string; html?: string; embedding: number[] }>;
      formFieldEmbeddings?: Array<{
        selector: string;
        tagName: string;
        type: string;
        name: string;
        id: string;
        placeholder?: string;
        embedding: number[];
        index: number;
      }>;
      clickableElementEmbeddings?: Array<{
        selector: string;
        tagName: string;
        text: string;
        ariaLabel?: string;
        href?: string;
        embedding: number[];
        index: number;
      }>;
      timestamp: number;
    } | null;
    pageContent: any;
  }>;

  constructor(
    pageDataRef: React.MutableRefObject<{
      embeddings: any;
      pageContent: any;
    }>,
  ) {
    this.pageDataRef = pageDataRef;
  }

  /**
   * Search page content semantically using NATIVE VECTOR SEARCH with HNSW index
   */
  async searchPageContent(query: string, topK: number = 3): Promise<SearchResult> {
    const startTime = performance.now();

    try {
      if (!query || query.trim().length === 0) {
        return { success: true, query, resultsCount: 0, results: [] };
      }

      log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      log('[SemanticSearchManager] 🚀 NATIVE VECTOR SEARCH - PAGE CONTENT (HNSW INDEX)');
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      log('[SemanticSearchManager]    Query:', query);
      log('[SemanticSearchManager]    Top K:', topK);

      // Get current page URL
      const pageContent = this.pageDataRef.current.pageContent;
      const pageURL = pageContent?.url || window.location.href;

      // Limit topK
      const limitedTopK = Math.min(Math.max(1, topK), 10);

      // Embed the query
      let queryEmbedding: number[];
      try {
        if (!embeddingService.isReady()) {
          await embeddingService.initialize();
        }
        log('[SemanticSearchManager]    Generating query embedding...');
        queryEmbedding = await embeddingService.embed(query);
        log(
          '[SemanticSearchManager]    Query embedding:',
          queryEmbedding
            .slice(0, 5)
            .map(v => v.toFixed(4))
            .join(', ') + '...',
        );
      } catch (error) {
        err('[SemanticSearchManager] ❌ Failed to embed query:', error);
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        return {
          success: false,
          error: 'Failed to process search query. Please try again.',
          results: [],
        };
      }

      // 🚀 USE NATIVE VECTOR SEARCH with HNSW index (8-150x faster!)
      log('[SemanticSearchManager]    🚀 Using SurrealDB native vector search with HNSW index...');
      const topResults = await embeddingsStorage.searchHTMLChunks(pageURL, queryEmbedding, limitedTopK);

      if (!topResults || topResults.length === 0) {
        log('[SemanticSearchManager] ❌ No results found');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        return {
          success: false,
          error: 'No page content found in database. Please wait for the page to be indexed.',
          results: [],
        };
      }
      const duration = performance.now() - startTime;

      log('[SemanticSearchManager] ✅ NATIVE VECTOR SEARCH COMPLETE in', duration.toFixed(2), 'ms');
      log('[SemanticSearchManager]    Method: SurrealDB HNSW (8-150x faster!)');
      log('[SemanticSearchManager]    Results found:', topResults.length);
      log('[SemanticSearchManager]    Top similarities:', topResults.map(r => r.similarity.toFixed(3)).join(', '));
      if (topResults.length > 0) {
        log(
          '[SemanticSearchManager]    Best match preview:',
          topResults[0].text.substring(0, 100).replace(/\n/g, ' ') + '...',
        );
        log('[SemanticSearchManager]    Best match HTML length:', topResults[0].html?.length || 0, 'chars');
      }
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      return {
        success: true,
        query,
        resultsCount: topResults.length,
        results: topResults.map(
          (result, i): PageContentResult => ({
            rank: i + 1,
            similarity: Math.round(result.similarity * 100) / 100,
            text: result.text,
            html: result.html || '',
          }),
        ),
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      err('[SemanticSearchManager] ❌ Error in searchPageContent after', duration.toFixed(2), 'ms:', error);
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        results: [],
      };
    }
  }

  /**
   * Search form data using NATIVE VECTOR SEARCH with HNSW index
   */
  async searchFormData(query: string, topK: number = 5): Promise<SearchResult> {
    const startTime = performance.now();

    try {
      if (!query || query.trim().length === 0) {
        return { success: true, query, resultsCount: 0, results: [] };
      }
      log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      log('[SemanticSearchManager] 🚀 NATIVE VECTOR SEARCH - FORM FIELDS (HNSW INDEX)');
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      log('[SemanticSearchManager]    Query:', query);

      const pageContent = this.pageDataRef.current.pageContent;
      const pageURL = pageContent?.url || window.location.href;

      const limitedTopK = Math.min(Math.max(1, topK), 20);

      // Embed the query
      if (!embeddingService.isReady()) {
        await embeddingService.initialize();
      }
      const queryEmbedding = await embeddingService.embed(query);
      log('[SemanticSearchManager]    Query embedding generated');

      // 🚀 USE NATIVE VECTOR SEARCH with HNSW index
      log('[SemanticSearchManager]    🚀 Using SurrealDB native vector search with HNSW index...');
      const topResults = await embeddingsStorage.searchFormFields(pageURL, queryEmbedding, limitedTopK);

      if (!topResults || topResults.length === 0) {
        log('[SemanticSearchManager] ❌ No form fields found');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        return {
          success: false,
          error: "No form fields found in database. Either the page has no forms or they haven't been indexed yet.",
          results: [],
        };
      }
      const duration = performance.now() - startTime;

      log('[SemanticSearchManager] ✅ NATIVE VECTOR SEARCH COMPLETE in', duration.toFixed(2), 'ms');
      log('[SemanticSearchManager]    Method: SurrealDB HNSW (8-150x faster!)');
      log('[SemanticSearchManager]    Results found:', topResults.length);
      log(
        '[SemanticSearchManager]    Top similarities:',
        topResults.map((r: any) => r.similarity.toFixed(3)).join(', '),
      );
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      return {
        success: true,
        query,
        resultsCount: topResults.length,
        results: topResults.map(
          (field: any, i: number): FormFieldResult => ({
            rank: i + 1,
            similarity: Math.round(field.similarity * 100) / 100,
            tagName: field.tagName,
            type: field.fieldType,
            name: field.fieldName,
            id: field.fieldId,
            selector: field.selector,
            placeholder: field.placeholder,
            value: field.fieldValue,
            textContent: undefined,
          }),
        ),
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      err('[SemanticSearchManager] ❌ Error in searchFormData after', duration.toFixed(2), 'ms:', error);
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        results: [],
      };
    }
  }

  /**
   * Search clickable elements using NATIVE VECTOR SEARCH with HNSW index
   */
  async searchClickableElements(query: string, topK: number = 5): Promise<SearchResult> {
    const startTime = performance.now();

    try {
      if (!query || query.trim().length === 0) {
        return { success: true, query, resultsCount: 0, results: [] };
      }
      log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      log('[SemanticSearchManager] 🚀 NATIVE VECTOR SEARCH - CLICKABLE ELEMENTS (HNSW INDEX)');
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      log('[SemanticSearchManager]    Query:', query);

      const pageContent = this.pageDataRef.current.pageContent;
      const pageURL = pageContent?.url || window.location.href;

      const limitedTopK = Math.min(Math.max(1, topK), 20);

      // Embed the query
      if (!embeddingService.isReady()) {
        await embeddingService.initialize();
      }
      const queryEmbedding = await embeddingService.embed(query);
      log('[SemanticSearchManager]    Query embedding generated');

      // 🚀 USE NATIVE VECTOR SEARCH with HNSW index
      log('[SemanticSearchManager]    🚀 Using SurrealDB native vector search with HNSW index...');
      const topResults = await embeddingsStorage.searchClickableElements(pageURL, queryEmbedding, limitedTopK);

      if (!topResults || topResults.length === 0) {
        log('[SemanticSearchManager] ❌ No clickable elements found');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        return {
          success: false,
          error:
            "No clickable elements found in database. Either the page has no interactive elements or they haven't been indexed yet.",
          results: [],
        };
      }

      const duration = performance.now() - startTime;
      log('[SemanticSearchManager] ✅ NATIVE VECTOR SEARCH COMPLETE in', duration.toFixed(2), 'ms');
      log('[SemanticSearchManager]    Method: SurrealDB HNSW (8-150x faster!)');
      log('[SemanticSearchManager]    Results found:', topResults.length);
      log(
        '[SemanticSearchManager]    Top similarities:',
        topResults.map((r: any) => r.similarity.toFixed(3)).join(', '),
      );
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      return {
        success: true,
        query,
        resultsCount: topResults.length,
        results: topResults.map(
          (element: any, i: number): ClickableElementResult => ({
            rank: i + 1,
            similarity: Math.round(element.similarity * 100) / 100,
            tagName: element.tagName,
            selector: element.selector,
            text: element.text,
            ariaLabel: element.ariaLabel,
            title: undefined,
            href: element.href,
            role: undefined,
          }),
        ),
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      err('[SemanticSearchManager] ❌ Error in searchClickableElements after', duration.toFixed(2), 'ms:', error);
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        results: [],
      };
    }
  }

  /**
   * Search recent DOM updates using native vector search with recency weighting
   */
  async searchDOMUpdates(query: string, topK: number = 5): Promise<SearchResult> {
    const startTime = performance.now();

    try {
      if (!query || query.trim().length === 0) {
        return { success: true, query, resultsCount: 0, results: [] };
      }
      log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      log('[SemanticSearchManager] 🚀 NATIVE VECTOR SEARCH - DOM UPDATES (HNSW INDEX + RECENCY)');
      log('[SemanticSearchManager]    Query:', query);
      log('[SemanticSearchManager]    Top K:', topK);

      // Get current page URL
      const pageContent = this.pageDataRef.current.pageContent;
      const pageURL = pageContent?.url || window.location.href;
      log('[SemanticSearchManager]    Page URL:', pageURL);

      // Embed the query
      let queryEmbedding: number[];
      try {
        if (!embeddingService.isReady()) {
          await embeddingService.initialize();
        }
        log('[SemanticSearchManager]    Generating query embedding...');
        queryEmbedding = await embeddingService.embed(query);
        log('[SemanticSearchManager]    ✅ Query embedding generated');
      } catch (error) {
        err('[SemanticSearchManager] ❌ Failed to embed query:', error);
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        return {
          success: false,
          error: 'Failed to process search query. Please try again.',
          results: [],
        };
      }

      // Search DOM updates using HNSW index with recency weighting
      const limitedTopK = Math.min(topK, 10);
      const topResults = await embeddingsStorage.searchDOMUpdates(pageURL, queryEmbedding, limitedTopK);

      if (!topResults || topResults.length === 0) {
        log('[SemanticSearchManager] ❌ No DOM updates found');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        return {
          success: false,
          error: 'No DOM updates found for this page',
          results: [],
        };
      }

      log('[SemanticSearchManager] ✅ Found', topResults.length, 'DOM updates');

      // Format results for agent
      const formattedResults = topResults.map((result, index) => {
        const timeSinceUpdate = Date.now() - result.timestamp.getTime();
        const secondsAgo = Math.floor(timeSinceUpdate / 1000);
        const timeAgoStr =
          secondsAgo < 60
            ? `${secondsAgo}s ago`
            : secondsAgo < 3600
              ? `${Math.floor(secondsAgo / 60)}m ago`
              : `${Math.floor(secondsAgo / 3600)}h ago`;

        return {
          rank: index + 1,
          summary: result.summary,
          timestamp: result.timestamp.toISOString(),
          timeAgo: timeAgoStr,
          recencyScore: result.recencyScore.toFixed(3),
          semanticSimilarity: result.similarity.toFixed(3),
          combinedScore: result.combinedScore.toFixed(3),
          changes: {
            addedElements: result.domUpdate?.addedElements?.length || 0,
            removedElements: result.domUpdate?.removedElements?.length || 0,
            textChanges: result.domUpdate?.textChanges?.length || 0,
          },
          details: result.domUpdate,
        };
      });

      const duration = performance.now() - startTime;
      log('[SemanticSearchManager] ✅ Search completed in', duration.toFixed(2), 'ms');
      log('[SemanticSearchManager]    Results returned:', formattedResults.length);
      log('[SemanticSearchManager]    Most recent:', formattedResults[0]?.timeAgo || 'N/A');
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      return {
        success: true,
        results: formattedResults,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      err('[SemanticSearchManager] ❌ Error in searchDOMUpdates after', duration.toFixed(2), 'ms:', error);
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        results: [],
      };
    }
  }
}
