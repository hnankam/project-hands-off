/**
 * useMultiPageMetadata Hook
 * 
 * Generates lightweight summaries for multiple selected pages
 * to be shared with the AI agent via useCopilotReadable.
 * 
 * Features:
 * - Fetches summaries for selected pages
 * - Includes current page with full metadata
 * - Provides aggregated statistics across all pages
 * - Optimized for token efficiency (summaries only, no content)
 * - Memoized to prevent unnecessary recalculations
 */

import { useMemo, useEffect, useState } from 'react';
import { embeddingsStorage, debug } from '@extension/shared';

export interface PageSummary {
  pageURL: string;
  pageTitle: string;
  htmlChunkCount: number;
  formChunkCount: number;
  clickableChunkCount: number;
  lastIndexed: Date;
  isCurrentPage: boolean;
}

export interface MultiPageMetadata {
  currentPage: {
    pageTitle: string;
    pageURL: string;
    hasContent: boolean;
    hasEmbeddings: boolean;
    totalHtmlChunks: number;
    totalClickableChunks: number;
    totalFormChunks: number;
    documentInfo: Record<string, unknown>;
    windowInfo: Record<string, unknown>;
    timestamp: number;
    dataSource: 'chrome-extension-live-extraction' | 'no-content';
  };
  selectedPages: {
    count: number;
    pages: PageSummary[];
    totalChunks: number;
    totalForms: number;
    totalClickables: number;
  };
  instructions: string;
}

interface UseMultiPageMetadataParams {
  selectedPageURLs: string[];
  currentPageURL: string | null;
  currentPageContent: any;
  pageContentEmbedding: any;
  currentPageTotals: {
    html: number;
    form: number;
    click: number;
  };
  enableLogging?: boolean;
}

/**
 * Hook to generate multi-page metadata for agent context
 */
export const useMultiPageMetadata = ({
  selectedPageURLs,
  currentPageURL,
  currentPageContent,
  pageContentEmbedding,
  currentPageTotals,
  enableLogging = true,
}: UseMultiPageMetadataParams): MultiPageMetadata | null => {
  const [pagesSummary, setPagesSummary] = useState<any>(null);

  // Fetch summaries for selected pages
  useEffect(() => {
    const fetchSummaries = async () => {
      if (selectedPageURLs.length === 0) {
        setPagesSummary(null);
        return;
      }

      try {
        const summary = await embeddingsStorage.getPagesSummary(selectedPageURLs);
        setPagesSummary(summary);
        // if (enableLogging) {
        //   debug.log('[useMultiPageMetadata] Fetched summaries for', selectedPageURLs.length, 'pages');
        // }
      } catch (error) {
        debug.error('[useMultiPageMetadata] Failed to fetch page summaries:', error);
        setPagesSummary(null);
      }
    };

    fetchSummaries();
  }, [selectedPageURLs, enableLogging]);

  // Construct multi-page metadata
  const multiPageMetadata = useMemo(() => {
    // Current page metadata (same as single-page version)
    const currentPage = !currentPageContent
      ? {
          pageTitle: 'No page loaded',
          pageURL: '',
          hasContent: false,
          hasEmbeddings: false,
          totalHtmlChunks: 0,
          totalClickableChunks: 0,
          totalFormChunks: 0,
          documentInfo: {},
          windowInfo: {},
          timestamp: 0,
          dataSource: 'no-content' as const,
        }
      : {
          pageTitle: String(currentPageContent.title || 'Untitled Page'),
          pageURL: String(currentPageContent.url || ''),
          hasContent: true,
          hasEmbeddings: !!pageContentEmbedding,
          totalHtmlChunks: currentPageTotals.html || 0,
          totalClickableChunks: currentPageTotals.click || 0,
          totalFormChunks: currentPageTotals.form || 0,
          documentInfo: currentPageContent.allDOMContent?.documentInfo || {},
          windowInfo: currentPageContent.allDOMContent?.windowInfo || {},
          timestamp: currentPageContent.timestamp || Date.now(),
          dataSource: 'chrome-extension-live-extraction' as const,
        };

    // Selected pages summaries
    const selectedPages =
      !pagesSummary || selectedPageURLs.length === 0
        ? {
            count: 0,
            pages: [],
            totalChunks: 0,
            totalForms: 0,
            totalClickables: 0,
          }
        : {
            count: pagesSummary.pages.length,
            pages: pagesSummary.pages.map((page: any) => ({
              pageURL: page.pageURL,
              pageTitle: page.pageTitle,
              htmlChunkCount: page.htmlChunkCount,
              formChunkCount: page.formChunkCount,
              clickableChunkCount: page.clickableChunkCount,
              lastIndexed: page.lastIndexed,
              isCurrentPage: page.pageURL === currentPageURL,
            })),
            totalChunks: pagesSummary.totalChunks,
            totalForms: pagesSummary.totalForms,
            totalClickables: pagesSummary.totalClickables,
          };

    return {
      currentPage,
      selectedPages,
      instructions:
        selectedPages.count > 0
          ? `You have access to ${selectedPages.count} indexed page(s) including the current page. Use searchPageContent to query the current page. To search across all selected pages, request that functionality or search each page individually by URL.`
          : 'Only the current page is available. Use searchPageContent to query it.',
    };
  }, [
    currentPageContent,
    pageContentEmbedding,
    currentPageTotals,
    pagesSummary,
    selectedPageURLs.length,
    currentPageURL,
  ]);

  // Logging effect
  useEffect(() => {
    if (!enableLogging) return;

    if (multiPageMetadata) {
      // debug.log('[useMultiPageMetadata] Multi-page metadata prepared:', {
      //   currentPageTitle: multiPageMetadata.currentPage.pageTitle,
      //   currentPageURL: multiPageMetadata.currentPage.pageURL,
      //   selectedPagesCount: multiPageMetadata.selectedPages.count,
      //   totalChunksAcrossPages: multiPageMetadata.selectedPages.totalChunks,
      // });
    }
  }, [multiPageMetadata, enableLogging]);

  return multiPageMetadata;
};

