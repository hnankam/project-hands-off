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
 * - Uses MutationObserver to detect new cards in real-time
 * - Includes interval fallback for reliability
 * 
 * @module useProgressCardCollapse
 * ================================================================================
 */

import { useEffect } from 'react';

/**
 * Hook to automatically collapse older progress cards and mark them as historical
 * 
 * This hook sets up a MutationObserver to watch for new TaskProgressCard elements
 * in the DOM and automatically collapses all but the most recent card. It also
 * marks older cards as "historical" for styling purposes.
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
    
    /**
     * Updates the state of all progress cards in the DOM
     * - Marks all cards except the last as historical
     * - Auto-collapses historical cards (only once per card)
     * - Keeps the latest card expanded and non-historical
     */
    const updateProgressCards = () => {
      const allCards = document.querySelectorAll('[data-task-progress="true"]');
      
      // Process each card
      allCards.forEach((card, index) => {
        const isLatestCard = index === allCards.length - 1;
        
        if (!isLatestCard) {
          // Mark as historical
          card.setAttribute('data-historical', 'true');
          
          // Auto-collapse card only once (don't interfere with manual expansion)
          if (!collapsedCards.has(card)) {
            const cardContainer = card as HTMLElement;
            // Find the collapse button if card is expanded and click it
            const collapseButton = cardContainer.querySelector('button[aria-label="Collapse"]');
            if (collapseButton) {
              (collapseButton as HTMLButtonElement).click();
              collapsedCards.add(card);
            }
          }
        } else {
          // Remove historical marker from the latest card
          card.removeAttribute('data-historical');
          // If this card was previously marked as collapsed, remove it from the set
          collapsedCards.delete(card);
        }
      });
    };

    // Run initially to process any existing cards
    updateProgressCards();

    // Observe DOM changes to catch new progress cards
    const observer = new MutationObserver(() => {
      updateProgressCards();
    });

    // Start observing the document body for child additions
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Also run on interval as a fallback (catches edge cases)
    const intervalId = setInterval(updateProgressCards, 100);

    // Cleanup: disconnect observer and clear interval
    return () => {
      observer.disconnect();
      clearInterval(intervalId);
    };
  }, []); // Empty deps - run once on mount
};

