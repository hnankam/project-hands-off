/**
 * Shared UI Constants
 * Central location for z-indices, animation durations, and other UI constants
 */

export const Z_INDEX = {
  dropdown: 9999,
  modalBackdrop: 10000,
  modal: 10001,
  skeletonOverlay: 20,
  skeletonTransition: 15,
} as const;

export const ANIMATION_DURATIONS = {
  dismiss: 300,
  scrollDelay: 100,
  modalDelay: 60,
  clipboardFeedback: 1500,
  printDialogDelay: 200,
} as const;

export const AUTO_DISMISS_DELAYS = {
  error: 8000,
  success: 5000,
  errorLong: 15000,
} as const;

export const SKELETON_TIMINGS = {
  minDisplayTime: 100,
  fallbackTimeout: 800,
} as const;

export const POLLING_INTERVALS = {
  teamCacheCheck: 500,
} as const;

export const SESSION_CACHE = {
  /** Maximum number of sessions to keep mounted (LRU eviction after this limit) */
  maxCachedSessions: 5,
} as const;

/**
 * Shiki syntax highlighting themes for Streamdown code blocks
 * Format: [lightTheme, darkTheme]
 * 
 * Available themes: https://shiki.style/themes
 * - one-dark-pro: One Dark Pro theme (matches VS Code extension)
 * - github-light: GitHub's light theme
 * - github-dark: GitHub's dark theme
 * - dracula: Popular dark theme
 * - nord: Arctic blue theme
 */
export const SHIKI_THEMES = ['github-light', 'one-dark-pro'] as const;

