/**
 * State Caches for GraphStateCard Components
 * 
 * These caches persist expanded/collapsed state across component remounts,
 * which is essential for Virtua virtualization where components are
 * unmounted and remounted as the user scrolls.
 */

/** Persist expanded state of the main card across remounts */
export const expandedStateCache: Map<string, boolean> = new Map();

/** Track if user has manually closed a card (prevents auto-open) */
export const userClosedCache: Map<string, boolean> = new Map();

/** Persist step result expanded state across remounts */
export const stepResultExpandedCache: Map<string, boolean> = new Map();

/** Persist step process expanded state across remounts */
export const stepProcessExpandedCache: Map<string, boolean> = new Map();

