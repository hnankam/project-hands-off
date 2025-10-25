/**
 * ================================================================================
 * useDOMUpdateEmbedding Hook
 * ================================================================================
 * 
 * Custom hook that manages DOM update embedding and storage:
 * - Embeds summaries of DOM changes (added/removed/modified elements)
 * - Stores in SurrealDB with recency scores for temporal search
 * - Automatically processes new DOM updates when they occur
 * 
 * @module useDOMUpdateEmbedding
 * ================================================================================
 */

import { useEffect, useRef } from 'react';
import { embeddingsStorage } from '@extension/shared';

// Timestamp helper for consistent logging
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

interface UseDOMUpdateEmbeddingParams {
  latestDOMUpdate: any;
  isEmbeddingInitialized: boolean;
  currentPageContent: any;
  embedTexts: (texts: string[]) => Promise<number[][]>;
  sessionId: string;
}

/**
 * Helper function to create a summary for DOM update
 * Converts DOM update object into a searchable text summary
 */
const MAX_ITEMS = 6;
const MAX_TEXT_LEN = 80;

const safeSnippet = (value: any): string => {
  try {
    const s = typeof value === 'string' ? value : String(value ?? '');
    return s.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LEN);
  } catch {
    return '';
  }
};

const listElements = (arr: any[] | undefined): string => {
  if (!Array.isArray(arr) || arr.length === 0) return '';
  const shown = arr.slice(0, MAX_ITEMS);
  const parts = shown.map((el: any) => {
    const tag = el?.tagName || 'element';
    const text = el?.textContent ? `: "${safeSnippet(el.textContent)}"` : '';
    return `${tag}${text}`;
  });
  const more = arr.length > shown.length ? `, +${arr.length - shown.length} more` : '';
  return parts.join(', ') + more;
};

const createDOMUpdateSummary = (domUpdate: any): string => {
  const parts: string[] = [];

  if (domUpdate?.addedElements?.length) {
    parts.push(`Added ${domUpdate.addedElements.length} element(s): ${listElements(domUpdate.addedElements)}`);
  }
  if (domUpdate?.removedElements?.length) {
    parts.push(`Removed ${domUpdate.removedElements.length} element(s): ${listElements(domUpdate.removedElements)}`);
  }
  if (domUpdate?.textChanges?.length) {
    const shownChanges = domUpdate.textChanges.slice(0, MAX_ITEMS);
    const changes = shownChanges
      .map((c: any) => `${c?.type || 'change'}: "${safeSnippet(c?.text)}"`)
      .join(', ');
    const more = domUpdate.textChanges.length > shownChanges.length ? `, +${domUpdate.textChanges.length - shownChanges.length} more` : '';
    parts.push(`Text changes (${domUpdate.textChanges.length}): ${changes}${more}`);
  }
  if (domUpdate?.summary) {
    parts.push(`Summary: ${safeSnippet(JSON.stringify(domUpdate.summary))}`);
  }

  return parts.join('. ') || 'DOM update with no details';
};

const hasMeaningfulChanges = (u: any): boolean => {
  return !!(
    (u?.addedElements && u.addedElements.length) ||
    (u?.removedElements && u.removedElements.length) ||
    (u?.textChanges && u.textChanges.length) ||
    u?.summary
  );
};

/**
 * Hook to automatically embed and store DOM updates
 * 
 * @example
 * ```tsx
 * useDOMUpdateEmbedding({
 *   latestDOMUpdate,
 *   isEmbeddingInitialized,
 *   currentPageContent,
 *   embedTexts,
 *   sessionId,
 * });
 * ```
 */
export const useDOMUpdateEmbedding = ({
  latestDOMUpdate,
  isEmbeddingInitialized,
  currentPageContent,
  embedTexts,
  sessionId,
}: UseDOMUpdateEmbeddingParams) => {
  // Deduplicate by a simple signature of the latest processed update
  const lastSignatureRef = useRef<string>('');

  // Auto-embed DOM updates and store in database
  useEffect(() => {
    if (!latestDOMUpdate || !isEmbeddingInitialized || !currentPageContent) {
      return;
    }

    if (!hasMeaningfulChanges(latestDOMUpdate)) {
      return;
    }

    // Build a compact signature to avoid re-embedding identical updates
    const signature = (() => {
      try {
        return JSON.stringify({
          a: latestDOMUpdate.addedElements?.length || 0,
          r: latestDOMUpdate.removedElements?.length || 0,
          t: latestDOMUpdate.textChanges?.length || 0,
          s: !!latestDOMUpdate.summary,
        });
      } catch {
        return String(Date.now());
      }
    })();

    if (signature === lastSignatureRef.current) {
      return; // skip duplicate
    }

    const embedAndStoreDOMUpdate = async () => {
      try {
        console.log(ts(), '[useDOMUpdateEmbedding] 🔄 Embedding DOM update for storage...');

        // Create summary text for embedding
        const summary = createDOMUpdateSummary(latestDOMUpdate);

        // Embed the summary
        const embeddings = await embedTexts([summary]);

        if (!embeddings || embeddings.length === 0 || embeddings[0].length === 0) {
          console.warn(ts(), '[useDOMUpdateEmbedding] ⚠️  Failed to generate embedding for DOM update');
          return;
        }

        // Store in database with recency score
        await embeddingsStorage.storeDOMUpdate({
          pageURL: currentPageContent.url || window.location.href,
          pageTitle: currentPageContent.title || document.title,
          domUpdate: latestDOMUpdate,
          embedding: embeddings[0],
          sessionId,
        });

        console.log(ts(), '[useDOMUpdateEmbedding] ✅ DOM update embedded and stored');
        lastSignatureRef.current = signature;
      } catch (error) {
        console.error(ts(), '[useDOMUpdateEmbedding] ❌ Failed to embed/store DOM update:', error);
      }
    };

    embedAndStoreDOMUpdate();
  }, [latestDOMUpdate, isEmbeddingInitialized, currentPageContent, sessionId, embedTexts]);

  // This hook doesn't return anything - it only has side effects
  return null;
};

