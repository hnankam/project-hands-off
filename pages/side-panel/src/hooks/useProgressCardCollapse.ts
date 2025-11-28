/**
 * ================================================================================
 * useProgressCardCollapse Hook
 * ================================================================================
 * 
 * Custom hook that manages the automatic collapsing and historical marking
 * of TaskProgressCard components in the chat interface.
 * 
 * Features:
 * - Automatically collapses all progress cards except the most recent one
 * - Marks older cards as "historical" for visual differentiation
 * - Prevents redundant collapses (cards stay collapsed if user manually expands)
 * - Uses debounced MutationObserver to detect new cards efficiently
 * - Scoped to chat container (not entire document)
 * - Periodic cleanup to prevent memory leaks
 * 
 * @module useProgressCardCollapse
 * ================================================================================
 */

import { useEffect, useRef } from 'react';

// ============================================================================
// CONSTANTS
// ============================================================================

const SELECTOR_PROGRESS_CARD = '[data-task-progress="true"]';
const ATTR_HISTORICAL = 'data-historical';
const ARIA_LABEL_COLLAPSE = 'Collapse';
const MUTATION_DEBOUNCE_MS = 100; // Debounce MutationObserver callbacks
const CLEANUP_INTERVAL_MS = 10000; // Clean up orphaned cards every 10 seconds
const CHAT_CONTAINER_SELECTOR = '.copilotKitMessagesContainer';

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook to automatically collapse older progress cards and mark them as historical
 * 
 * This hook sets up a debounced MutationObserver to watch for new TaskProgressCard
 * elements in the chat container and automatically collapses all but the most recent
 * card. It also marks older cards as "historical" for styling purposes.
 * 
 * Performance optimizations:
 * - Scoped to chat container (not entire document)
 * - Debounced mutation handling
 * - Smart interval (only runs when cards exist)
 * - Periodic cleanup of orphaned card references
 * 
 * @example
 * ```tsx
 * function ChatComponent() {
 *   useProgressCardCollapse();
 *   return <div>...</div>;
 * }
 * ```
 */
export const useProgressCardCollapse = (): void => {
  useEffect(() => {
    // Track which cards have already been collapsed to avoid redundant actions
    const collapsedCards = new Set<Element>();
    
    // Debounce state for MutationObserver
    let debounceTimer: NodeJS.Timeout | null = null;
    
    /**
     * Updates the state of all progress cards in the DOM
     * - Marks all cards except the last as historical
     * - Auto-collapses historical cards (only once per card)
     * - Keeps the latest card expanded and non-historical
     */
    const updateProgressCards = () => {
      const allCards = document.querySelectorAll(SELECTOR_PROGRESS_CARD);
      
      if (allCards.length === 0) {
        return; // No cards to process
      }
      
      // Process each card
      allCards.forEach((card, index) => {
        const isLatestCard = index === allCards.length - 1;
        
        if (!isLatestCard) {
          // Mark as historical
          card.setAttribute(ATTR_HISTORICAL, 'true');
          
          // Auto-collapse card only once (don't interfere with manual expansion)
          if (!collapsedCards.has(card)) {
            const cardContainer = card as HTMLElement;
            // Find the collapse button if card is expanded and click it
            const collapseButton = cardContainer.querySelector(`button[aria-label="${ARIA_LABEL_COLLAPSE}"]`);
            if (collapseButton) {
              (collapseButton as HTMLButtonElement).click();
              collapsedCards.add(card);
            } else {
              // Card is already collapsed; mark as processed so we don't auto-collapse on first manual expand
              collapsedCards.add(card);
            }
          }
        } else {
          // Remove historical marker from the latest card
          card.removeAttribute(ATTR_HISTORICAL);
          // If this card was previously marked as collapsed, remove it from the set
          collapsedCards.delete(card);
        }
      });
    };

    /**
     * Cleanup orphaned cards from tracking set.
     * Removes references to cards that no longer exist in the DOM.
     */
    const cleanupOrphanedCards = () => {
      const currentCardsNodeList = document.querySelectorAll(SELECTOR_PROGRESS_CARD);
      const currentCards = new Set(Array.from(currentCardsNodeList));
      const orphanedCards: Element[] = [];
      
      collapsedCards.forEach(card => {
        if (!currentCards.has(card)) {
          orphanedCards.push(card);
        }
      });
      
      orphanedCards.forEach(card => collapsedCards.delete(card));
      
      if (orphanedCards.length > 0) {
        // Only log if we actually cleaned up something
        // debug.log('[useProgressCardCollapse] Cleaned up', orphanedCards.length, 'orphaned cards');
      }
    };

    // Run initially to process any existing cards
    updateProgressCards();

    // Find the chat container to scope the observer
    const chatContainer = document.querySelector(CHAT_CONTAINER_SELECTOR);
    const observerTarget = chatContainer || document.body;

    // Observe DOM changes to catch new progress cards (debounced)
    const observer = new MutationObserver(() => {
      // Clear previous debounce timer
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      
      // Debounce: Wait for mutations to settle before updating
      debounceTimer = setTimeout(() => {
        updateProgressCards();
      }, MUTATION_DEBOUNCE_MS);
    });

    // Start observing the chat container (or body as fallback)
    observer.observe(observerTarget, {
      childList: true,
      subtree: true,
    });

    // Smart interval: only run when cards exist
    const intervalId = setInterval(() => {
      const allCards = document.querySelectorAll(SELECTOR_PROGRESS_CARD);
      if (allCards.length > 0) {
        updateProgressCards();
      }
    }, 500); // Check every 500ms (reduced from 100ms for better performance)

    // Cleanup interval for orphaned card references
    const cleanupIntervalId = setInterval(() => {
      cleanupOrphanedCards();
    }, CLEANUP_INTERVAL_MS);

    // Cleanup: disconnect observer and clear intervals
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      observer.disconnect();
      clearInterval(intervalId);
      clearInterval(cleanupIntervalId);
    };
  }, []); // Empty deps - run once on mount
};
