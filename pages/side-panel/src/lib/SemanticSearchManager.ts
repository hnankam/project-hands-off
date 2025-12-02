/**
 * Semantic Search Manager
 * Handles all semantic search operations for page content, forms, and clickable elements
 * Uses SURREALDB NATIVE VECTOR SEARCH WITH HNSW INDEXES + FULL-TEXT SEARCH
 *
 * Supports three search modes:
 * - SEMANTIC: Pure vector similarity (HNSW index)
 * - FULLTEXT: Keyword-based BM25 search
 * - HYBRID (DEFAULT): Combines both for best results (70% semantic + 30% keyword)
 *
 * HNSW indexes for O(log n) vector search performance
 * BM25 indexes for fast full-text keyword matching
 * Hybrid mode leverages both for comprehensive search coverage
 */

import { embeddingService, embeddingsStorage } from '@extension/shared';
import type { PageContent } from '../hooks/usePageMetadata';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEBUG = (import.meta.env?.VITE_DEBUG_SEARCH === 'true') || false;

// Constants for topK limits by search type
const TOP_K_LIMITS = {
  pageContent: { min: 1, max: 10, default: 3 },
  formFields: { min: 1, max: 20, default: 5 },
  clickableElements: { min: 1, max: 20, default: 5 },
  domUpdates: { min: 1, max: 10, default: 5 },
} as const;

// Hybrid search weights (default: 70% semantic, 30% keyword)
const DEFAULT_SEMANTIC_WEIGHT = 0.7;
const DEFAULT_KEYWORD_WEIGHT = 0.3;

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

const getTimestamp = (): string => new Date().toISOString().split('T')[1].slice(0, -1);

class Logger {
  private enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  log(...args: unknown[]): void {
    if (this.enabled) console.log(`[${getTimestamp()}]`, ...args);
  }

  warn(...args: unknown[]): void {
    if (this.enabled) console.warn(`[${getTimestamp()}]`, ...args);
  }

  error(...args: unknown[]): void {
    console.error(`[${getTimestamp()}]`, ...args);
  }

  separator(): void {
    if (this.enabled) console.log('━'.repeat(60));
  }
}

const logger = new Logger(DEBUG);

// ============================================================================
// TYPES
// ============================================================================

export type SearchMode = 'semantic' | 'fulltext' | 'hybrid';

export interface SearchOptions {
  mode?: SearchMode;
  semanticWeight?: number;
  keywordWeight?: number;
  topK?: number;
  /** Specific page URL to search (overrides current page) */
  pageURL?: string;
  /** Array of page URLs to search across (overrides pageURL and current page) */
  pageURLs?: string[];
  /** Search all indexed pages (ignores pageURL and pageURLs) */
  searchAllPages?: boolean;
}

export interface SearchResult {
  success: boolean;
  query?: string;
  resultsCount?: number;
  results?: unknown[];
  error?: string;
  searchMode?: SearchMode;
  searchMetadata?: {
    semanticWeight?: number;
    keywordWeight?: number;
    duration?: number;
  };
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
  isUnique?: boolean;
  foundInShadowDOM?: boolean;
  shadowHostSelector?: string;
  shadowPath?: string;
  shadowDepth?: number;
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
  isUnique?: boolean;
  foundInShadowDOM?: boolean;
  shadowHostSelector?: string;
  shadowPath?: string;
  shadowDepth?: number;
}

export interface DOMUpdateResult {
  rank: number;
  summary: string;
  timestamp: string;
  timeAgo: string;
  recencyScore: string;
  semanticSimilarity: string;
  combinedScore: string;
  changes: {
    addedElements: number;
    removedElements: number;
    textChanges: number;
  };
  details: unknown;
}

interface PageDataRef {
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
  pageContent: unknown;
}

// ============================================================================
// SEMANTIC SEARCH MANAGER CLASS
// ============================================================================

export class SemanticSearchManager {
  private pageDataRef: React.MutableRefObject<PageDataRef>;

  constructor(pageDataRef: React.MutableRefObject<PageDataRef>) {
    this.pageDataRef = pageDataRef;
  }

  // ==========================================================================
  // PRIVATE HELPER METHODS
  // ==========================================================================

  /**
   * Get current page URL from ref or fallback to window.location
   */
  private getPageURL(): string {
    const pageContent = this.pageDataRef.current.pageContent as PageContent | null;
    return pageContent?.url || window.location.href;
  }

  /**
   * Validate and limit topK parameter
   */
  private limitTopK(topK: number, searchType: keyof typeof TOP_K_LIMITS): number {
    const limits = TOP_K_LIMITS[searchType];
    return Math.min(Math.max(limits.min, topK), limits.max);
  }

  /**
   * Embed query text with error handling
   */
  private async embedQuery(query: string): Promise<{ success: true; embedding: number[] } | { success: false; error: string }> {
    try {
      if (!embeddingService.isReady()) {
        await embeddingService.initialize();
      }
      logger.log('[SemanticSearchManager] Generating query embedding...');
      const embedding = await embeddingService.embed(query);
      logger.log('[SemanticSearchManager] Query embedding generated');
      return { success: true, embedding };
    } catch (error) {
      logger.error('[SemanticSearchManager] Failed to embed query:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process search query'
      };
    }
  }

  /**
   * Validate query is not empty
   */
  private validateQuery(query: string): boolean {
    return Boolean(query && query.trim().length > 0);
  }

  /**
   * Create empty result for invalid queries
   */
  private createEmptyResult(query: string): SearchResult {
    return { success: true, query, resultsCount: 0, results: [] };
  }

  /**
   * Create error result
   */
  private createErrorResult(error: string | Error): SearchResult {
    return {
      success: false,
      error: error instanceof Error ? error.message : error,
      results: [],
    };
  }

  // ==========================================================================
  // PUBLIC SEARCH METHODS
  // ==========================================================================

  /**
   * Search page content using HYBRID search by default (semantic + full-text)
   * Modes: 'semantic' (vector only), 'fulltext' (keyword only), 'hybrid' (both - default)
   * 
   * Page targeting:
   * - searchAllPages: true - Search all indexed pages
   * - pageURLs: [...] - Search specific pages
   * - pageURL: '...' - Search single page
   * - (none) - Search current page only
   */
  async searchPageContent(
    query: string, 
    options?: SearchOptions | number // Support legacy number parameter for topK
  ): Promise<SearchResult> {
    // Handle legacy parameter format
    const opts: SearchOptions = typeof options === 'number' 
      ? { topK: options, mode: 'hybrid' }
      : { mode: 'hybrid', ...options };

    const mode = opts.mode || 'hybrid';
    const topK = opts.topK || TOP_K_LIMITS.pageContent.default;
    const semanticWeight = opts.semanticWeight ?? DEFAULT_SEMANTIC_WEIGHT;
    const keywordWeight = opts.keywordWeight ?? DEFAULT_KEYWORD_WEIGHT;

    const startTime = performance.now();

    try {
      if (!this.validateQuery(query)) {
        return this.createEmptyResult(query);
      }

      // Determine page targeting
      let pageURL: string | undefined;
      let pageURLs: string[] | undefined;
      
      if (opts.searchAllPages) {
        // Search all pages - leave both undefined
        pageURL = undefined;
        pageURLs = undefined;
      } else if (opts.pageURLs && opts.pageURLs.length > 0) {
        // Search specific pages
        pageURLs = opts.pageURLs;
        pageURL = undefined;
      } else if (opts.pageURL) {
        // Search single specific page
        pageURL = opts.pageURL;
      } else {
        // Default: search current page
        pageURL = this.getPageURL();
      }

      logger.separator();
      logger.log(`[SemanticSearchManager] ${mode.toUpperCase()} SEARCH - PAGE CONTENT`);
      logger.log('[SemanticSearchManager]    Query:', query);
      logger.log('[SemanticSearchManager]    Mode:', mode);
      logger.log('[SemanticSearchManager]    Top K:', topK);
      logger.log('[SemanticSearchManager]    Pages:', opts.searchAllPages ? 'ALL' : (pageURLs?.length || (pageURL ? 1 : 'current')));
      if (mode === 'hybrid') {
        logger.log('[SemanticSearchManager]    Weights:', `${(semanticWeight * 100).toFixed(0)}% semantic, ${(keywordWeight * 100).toFixed(0)}% keyword`);
      }

      const limitedTopK = this.limitTopK(topK, 'pageContent');

      let topResults: any[];

      // Execute search based on mode
      if (mode === 'fulltext') {
        // Pure full-text search
        logger.log('[SemanticSearchManager]    Using BM25 full-text search...');
        topResults = await embeddingsStorage.fullTextSearchHTMLChunks(pageURL, query, limitedTopK, pageURLs);
      } else {
        // Semantic or hybrid - need embeddings
        const embeddingResult = await this.embedQuery(query);
        if (!embeddingResult.success) {
          logger.separator();
          return this.createErrorResult(embeddingResult.error);
        }

        if (mode === 'semantic') {
          // Pure semantic search
          logger.log('[SemanticSearchManager]    Using HNSW vector search...');
          topResults = await embeddingsStorage.searchHTMLChunks(pageURL, embeddingResult.embedding, limitedTopK, pageURLs);
        } else {
          // Hybrid search (default)
          logger.log('[SemanticSearchManager]    Using HYBRID search (HNSW + BM25)...');
          topResults = await embeddingsStorage.hybridSearchHTMLChunks(
            pageURL, 
            query,
            embeddingResult.embedding, 
            limitedTopK,
            semanticWeight,
            keywordWeight,
            pageURLs
          );
        }
      }

      if (!topResults || topResults.length === 0) {
        logger.log('[SemanticSearchManager] No results found');
        logger.separator();
        return this.createErrorResult('No page content found in database. Please wait for the page to be indexed.');
      }

      const duration = performance.now() - startTime;
      logger.log(`[SemanticSearchManager] ${mode.toUpperCase()} SEARCH COMPLETE in`, duration.toFixed(2), 'ms');
      logger.log('[SemanticSearchManager]    Results found:', topResults.length);
      logger.log('[SemanticSearchManager]    Top scores:', topResults.map(r => r.similarity.toFixed(3)).join(', '));
      
      if (topResults.length > 0) {
        logger.log('[SemanticSearchManager]    Best match preview:', 
          topResults[0].text.substring(0, 100).replace(/\n/g, ' ') + '...');
        if (mode === 'hybrid' && topResults[0].semanticScore !== undefined) {
          logger.log('[SemanticSearchManager]    Best match breakdown:', 
            `semantic=${topResults[0].semanticScore.toFixed(3)}, keyword=${topResults[0].keywordScore.toFixed(3)}`);
        }
      }
      logger.separator();

      return {
        success: true,
        query,
        resultsCount: topResults.length,
        searchMode: mode,
        searchMetadata: {
          semanticWeight,
          keywordWeight,
          duration,
        },
        results: topResults.map((result, i): PageContentResult => ({
          rank: i + 1,
          similarity: Math.round(result.similarity * 100) / 100,
          text: result.text,
          html: result.html || '',
        })),
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error('[SemanticSearchManager] Error in searchPageContent after', duration.toFixed(2), 'ms:', error);
      logger.separator();
      return this.createErrorResult(error as Error);
    }
  }

  /**
   * Search form data using NATIVE VECTOR SEARCH with HNSW index
   * Supports searching across multiple pages via options
   */
  async searchFormData(query: string, topKOrOptions?: number | SearchOptions): Promise<SearchResult> {
    const startTime = performance.now();

    // Handle both legacy number parameter and new options object
    const opts: SearchOptions = typeof topKOrOptions === 'number'
      ? { topK: topKOrOptions }
      : topKOrOptions || {};
    
    const topK = opts.topK || TOP_K_LIMITS.formFields.default;

    try {
      if (!this.validateQuery(query)) {
        return this.createEmptyResult(query);
      }

      // Determine page targeting
      let pageURL: string | undefined;
      let pageURLs: string[] | undefined;
      
      if (opts.searchAllPages) {
        pageURL = undefined;
        pageURLs = undefined;
      } else if (opts.pageURLs && opts.pageURLs.length > 0) {
        pageURLs = opts.pageURLs;
        pageURL = undefined;
      } else if (opts.pageURL) {
        pageURL = opts.pageURL;
      } else {
        pageURL = this.getPageURL();
      }

      logger.separator();
      logger.log('[SemanticSearchManager] NATIVE VECTOR SEARCH - FORM FIELDS (HNSW INDEX)');
      logger.log('[SemanticSearchManager]    Query:', query);
      logger.log('[SemanticSearchManager]    Pages:', opts.searchAllPages ? 'ALL' : (pageURLs?.length || (pageURL ? 1 : 'current')));

      const limitedTopK = this.limitTopK(topK, 'formFields');

      // Embed query
      const embeddingResult = await this.embedQuery(query);
      if (!embeddingResult.success) {
        logger.separator();
        return this.createErrorResult(embeddingResult.error);
      }

      // Native vector search
      logger.log('[SemanticSearchManager]    Using SurrealDB native vector search with HNSW index...');
      const topResults = await embeddingsStorage.searchFormFields(pageURL, embeddingResult.embedding, limitedTopK, pageURLs);

      if (!topResults || topResults.length === 0) {
        logger.log('[SemanticSearchManager] No form fields found');
        logger.separator();
        return this.createErrorResult("No form fields found in database. Either the page has no forms or they haven't been indexed yet.");
      }

      const duration = performance.now() - startTime;
      logger.log('[SemanticSearchManager] NATIVE VECTOR SEARCH COMPLETE in', duration.toFixed(2), 'ms');
      logger.log('[SemanticSearchManager]    Method: SurrealDB HNSW (8-150x faster!)');
      logger.log('[SemanticSearchManager]    Results found:', topResults.length);
      logger.log('[SemanticSearchManager]    Top similarities:', topResults.map(r => r.similarity.toFixed(3)).join(', '));
      logger.separator();

      return {
        success: true,
        query,
        resultsCount: topResults.length,
        results: topResults.map((field, i): FormFieldResult => ({
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
          isUnique: (field as any).isUnique,
          foundInShadowDOM: (field as any).foundInShadowDOM,
          shadowHostSelector: (field as any).shadowHostSelector,
          shadowPath: (field as any).shadowPath,
          shadowDepth: (field as any).shadowDepth,
        })),
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error('[SemanticSearchManager] Error in searchFormData after', duration.toFixed(2), 'ms:', error);
      logger.separator();
      return this.createErrorResult(error as Error);
    }
  }

  /**
   * Search clickable elements using NATIVE VECTOR SEARCH with HNSW index
   * Supports searching across multiple pages via options
   */
  async searchClickableElements(query: string, topKOrOptions?: number | SearchOptions): Promise<SearchResult> {
    const startTime = performance.now();

    // Handle both legacy number parameter and new options object
    const opts: SearchOptions = typeof topKOrOptions === 'number'
      ? { topK: topKOrOptions }
      : topKOrOptions || {};
    
    const topK = opts.topK || TOP_K_LIMITS.clickableElements.default;

    try {
      if (!this.validateQuery(query)) {
        return this.createEmptyResult(query);
      }

      // Determine page targeting
      let pageURL: string | undefined;
      let pageURLs: string[] | undefined;
      
      if (opts.searchAllPages) {
        pageURL = undefined;
        pageURLs = undefined;
      } else if (opts.pageURLs && opts.pageURLs.length > 0) {
        pageURLs = opts.pageURLs;
        pageURL = undefined;
      } else if (opts.pageURL) {
        pageURL = opts.pageURL;
      } else {
        pageURL = this.getPageURL();
      }

      logger.separator();
      logger.log('[SemanticSearchManager] NATIVE VECTOR SEARCH - CLICKABLE ELEMENTS (HNSW INDEX)');
      logger.log('[SemanticSearchManager]    Query:', query);
      logger.log('[SemanticSearchManager]    Pages:', opts.searchAllPages ? 'ALL' : (pageURLs?.length || (pageURL ? 1 : 'current')));

      const limitedTopK = this.limitTopK(topK, 'clickableElements');

      // Embed query
      const embeddingResult = await this.embedQuery(query);
      if (!embeddingResult.success) {
        logger.separator();
        return this.createErrorResult(embeddingResult.error);
      }

      // Native vector search
      logger.log('[SemanticSearchManager]    Using SurrealDB native vector search with HNSW index...');
      const topResults = await embeddingsStorage.searchClickableElements(pageURL, embeddingResult.embedding, limitedTopK, pageURLs);

      if (!topResults || topResults.length === 0) {
        logger.log('[SemanticSearchManager] No clickable elements found');
        logger.separator();
        return this.createErrorResult("No clickable elements found in database. Either the page has no interactive elements or they haven't been indexed yet.");
      }

      const duration = performance.now() - startTime;
      logger.log('[SemanticSearchManager] NATIVE VECTOR SEARCH COMPLETE in', duration.toFixed(2), 'ms');
      logger.log('[SemanticSearchManager]    Method: SurrealDB HNSW (8-150x faster!)');
      logger.log('[SemanticSearchManager]    Results found:', topResults.length);
      logger.log('[SemanticSearchManager]    Top similarities:', topResults.map(r => r.similarity.toFixed(3)).join(', '));
      logger.separator();

      return {
        success: true,
        query,
        resultsCount: topResults.length,
        results: topResults.map((element, i): ClickableElementResult => ({
          rank: i + 1,
          similarity: Math.round(element.similarity * 100) / 100,
          tagName: element.tagName,
          selector: element.selector,
          text: element.text,
          ariaLabel: element.ariaLabel,
          title: undefined,
          href: element.href,
          role: undefined,
          isUnique: (element as any).isUnique,
          foundInShadowDOM: (element as any).foundInShadowDOM,
          shadowHostSelector: (element as any).shadowHostSelector,
          shadowPath: (element as any).shadowPath,
          shadowDepth: (element as any).shadowDepth,
        })),
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error('[SemanticSearchManager] Error in searchClickableElements after', duration.toFixed(2), 'ms:', error);
      logger.separator();
      return this.createErrorResult(error as Error);
    }
  }

  /**
   * Search recent DOM updates using native vector search with recency weighting
   */
  async searchDOMUpdates(query: string, topK: number = TOP_K_LIMITS.domUpdates.default): Promise<SearchResult> {
    const startTime = performance.now();

    try {
      if (!this.validateQuery(query)) {
        return this.createEmptyResult(query);
      }

      logger.separator();
      logger.log('[SemanticSearchManager] NATIVE VECTOR SEARCH - DOM UPDATES (HNSW INDEX + RECENCY)');
      logger.log('[SemanticSearchManager]    Query:', query);
      logger.log('[SemanticSearchManager]    Top K:', topK);

      const limitedTopK = this.limitTopK(topK, 'domUpdates');
      const pageURL = this.getPageURL();
      logger.log('[SemanticSearchManager]    Page URL:', pageURL);

      // Embed query
      const embeddingResult = await this.embedQuery(query);
      if (!embeddingResult.success) {
        logger.separator();
        return this.createErrorResult(embeddingResult.error);
      }

      // Search DOM updates with HNSW index and recency weighting
      const topResults = await embeddingsStorage.searchDOMUpdates(pageURL, embeddingResult.embedding, limitedTopK);

      if (!topResults || topResults.length === 0) {
        logger.log('[SemanticSearchManager] No DOM updates found');
        logger.separator();
        return this.createErrorResult('No DOM updates found for this page');
      }

      logger.log('[SemanticSearchManager] Found', topResults.length, 'DOM updates');

      // Format results with time information
      const formattedResults: DOMUpdateResult[] = topResults.map((result, index) => {
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
      logger.log('[SemanticSearchManager] Search completed in', duration.toFixed(2), 'ms');
      logger.log('[SemanticSearchManager]    Results returned:', formattedResults.length);
      logger.log('[SemanticSearchManager]    Most recent:', formattedResults[0]?.timeAgo || 'N/A');
      logger.separator();

      return {
        success: true,
        results: formattedResults,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error('[SemanticSearchManager] Error in searchDOMUpdates after', duration.toFixed(2), 'ms:', error);
      logger.separator();
      return this.createErrorResult(error as Error);
    }
  }
}
