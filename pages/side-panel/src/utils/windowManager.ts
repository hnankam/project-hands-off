/**
 * ================================================================================
 * Window Manager Utility
 * ================================================================================
 * 
 * Handles opening the side panel content in different contexts:
 * - Popup window (detached, resizable)
 * - New tab
 * - Fullscreen mode
 * 
 * @module windowManager
 * ================================================================================
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const SIDE_PANEL_HTML = 'side-panel/index.html';
const DEFAULT_POPUP_WIDTH = 1200;
const DEFAULT_POPUP_HEIGHT = 800;
const DEFAULT_ROUTE = '#/sessions';

// Window dimension constraints
const MIN_WINDOW_WIDTH = 400;
const MIN_WINDOW_HEIGHT = 300;
const MAX_WINDOW_WIDTH = 3840; // 4K width
const MAX_WINDOW_HEIGHT = 2160; // 4K height

// ============================================================================
// TYPES
// ============================================================================

/**
 * View mode for the application
 */
export type ViewMode = 'sidepanel' | 'popup' | 'newtab' | 'fullscreen';

/**
 * Options for opening a popup window
 */
export interface OpenInPopupOptions {
  width?: number;
  height?: number;
  sessionId?: string;
  state?: 'normal' | 'maximized' | 'fullscreen';
}

/**
 * Options for opening a new tab
 */
export interface OpenInNewTabOptions {
  active?: boolean;
  sessionId?: string;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate and clamp window dimensions
 */
function validateDimension(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return Math.round(value);
}

/**
 * Validate session ID format (basic validation)
 */
function isValidSessionId(sessionId: string | undefined): sessionId is string {
  return (
    typeof sessionId === 'string' &&
    sessionId.length > 0 &&
    sessionId.length <= 100 &&
    /^[a-zA-Z0-9_-]+$/.test(sessionId)
  );
}

// ============================================================================
// VIEW MODE DETECTION
// ============================================================================

/**
 * Get the current view mode based on the context
 * 
 * @returns Current view mode
 * 
 * @example
 * ```typescript
 * const mode = getCurrentViewMode();
 * if (mode === 'popup') {
 *   // Apply popup-specific styles
 * }
 * ```
 */
export function getCurrentViewMode(): ViewMode {
  // Check URL parameters
  const params = new URLSearchParams(window.location.search);
  const modeParam = params.get('mode') as ViewMode | null;
  
  const validModes: ViewMode[] = ['sidepanel', 'popup', 'newtab', 'fullscreen'];
  if (modeParam && validModes.includes(modeParam)) {
    return modeParam;
  }
  
  // Check if we're in a popup window (has window.opener or specific dimensions)
  if (params.has('popup') || window.opener) {
    return 'popup';
  }
  
  // Check if we're in the new tab page
  if (window.location.pathname.includes('/new-tab/')) {
    return 'newtab';
  }
  
  // Check if we're in the side panel (default)
  if (window.location.pathname.includes('/side-panel/')) {
    return 'sidepanel';
  }
  
  return 'sidepanel'; // default
}

// ============================================================================
// WINDOW OPERATIONS
// ============================================================================

/**
 * Open the side panel content in a popup window
 * 
 * @param options - Popup window options
 * @returns Created window or null on error
 * @throws Error if Chrome APIs fail
 * 
 * @example
 * ```typescript
 * const window = await openInPopupWindow({
 *   width: 1200,
 *   height: 800,
 *   sessionId: 'abc123',
 *   state: 'normal'
 * });
 * ```
 */
export async function openInPopupWindow(options: OpenInPopupOptions = {}): Promise<chrome.windows.Window | null> {
  const {
    width = DEFAULT_POPUP_WIDTH,
    height = DEFAULT_POPUP_HEIGHT,
    sessionId,
    state = 'normal'
  } = options;
  
  try {
    // Validate dimensions
    const validatedWidth = validateDimension(width, MIN_WINDOW_WIDTH, MAX_WINDOW_WIDTH);
    const validatedHeight = validateDimension(height, MIN_WINDOW_HEIGHT, MAX_WINDOW_HEIGHT);
    
    // Build URL with query parameters
    const url = chrome.runtime.getURL(SIDE_PANEL_HTML);
    const params = new URLSearchParams({
      mode: 'popup',
    });
    
    // Add sessionId only if valid
    if (isValidSessionId(sessionId)) {
      params.set('sessionId', sessionId);
    }
    
    const fullUrl = `${url}?${params.toString()}`;
    
    // Get screen dimensions
    const screenWidth = window.screen.availWidth;
    const screenHeight = window.screen.availHeight;
    
    // Create window options
    const createOptions: chrome.windows.CreateData = {
      url: fullUrl,
      focused: true,
      type: 'popup', // Always use popup type for tabless windows
    };
    
    // For maximized or fullscreen states, set popup window to full screen dimensions
    // This creates a tabless maximized window
    if (state === 'maximized' || state === 'fullscreen') {
      // Set popup window to full screen dimensions for maximized effect
      createOptions.width = screenWidth;
      createOptions.height = screenHeight;
      createOptions.left = 0;
      createOptions.top = 0;
    } else {
      // Use specified dimensions for normal state, centered
      createOptions.width = validatedWidth;
      createOptions.height = validatedHeight;
      const left = Math.round((screenWidth - validatedWidth) / 2);
      const top = Math.round((screenHeight - validatedHeight) / 2);
      createOptions.left = Math.max(0, left);
      createOptions.top = Math.max(0, top);
    }
    
    const popupWindow = await chrome.windows.create(createOptions);
    
    if (!popupWindow) {
      throw new Error('Failed to create popup window - chrome.windows.create returned undefined');
    }
    
    console.log('[WindowManager] Popup window created:', popupWindow.id);
    return popupWindow;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[WindowManager] Failed to create popup window:', errorMessage);
    throw new Error(`[WindowManager] Popup window creation failed: ${errorMessage}`);
  }
}

/**
 * Open the side panel content in a new tab
 * 
 * @param options - New tab options
 * @returns Created tab, existing tab if found, or null on error
 * @throws Error if Chrome APIs fail
 * 
 * @example
 * ```typescript
 * const tab = await openInNewTab({
 *   active: true,
 *   sessionId: 'abc123'
 * });
 * ```
 */
export async function openInNewTab(options: OpenInNewTabOptions = {}): Promise<chrome.tabs.Tab | null> {
  const {
    active = true,
    sessionId
  } = options;
  
  try {
    // Build URL pointing to side-panel with query parameters
    const url = chrome.runtime.getURL(SIDE_PANEL_HTML);
    const params = new URLSearchParams({
      mode: 'newtab',
    });
    
    // Add sessionId only if valid
    if (isValidSessionId(sessionId)) {
      params.set('sessionId', sessionId);
    }
    
    const fullUrl = `${url}?${params.toString()}${DEFAULT_ROUTE}`;
    
    // Check if a tab with this URL already exists
    const searchPattern = `${chrome.runtime.getURL(SIDE_PANEL_HTML)}*`;
    const existingTabs = await chrome.tabs.query({ url: searchPattern });
    
    if (existingTabs.length > 0 && isValidSessionId(sessionId)) {
      // Check if any existing tab has the same sessionId
      const matchingTab = existingTabs.find(tab => tab.url?.includes(`sessionId=${sessionId}`));
      
      if (matchingTab?.id) {
        // Focus existing tab
        await chrome.tabs.update(matchingTab.id, { active: true });
        if (matchingTab.windowId) {
          await chrome.windows.update(matchingTab.windowId, { focused: true });
        }
        console.log('[WindowManager] Focused existing tab:', matchingTab.id);
        return matchingTab;
      }
    }
    
    // Create new tab
    const newTab = await chrome.tabs.create({
      url: fullUrl,
      active
    });
    
    if (!newTab) {
      throw new Error('Failed to create tab - chrome.tabs.create returned undefined');
    }
    
    console.log('[WindowManager] New tab created:', newTab.id);
    return newTab;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[WindowManager] Failed to create new tab:', errorMessage);
    throw new Error(`[WindowManager] Tab creation failed: ${errorMessage}`);
  }
}

// ============================================================================
// VIEW MODE CHECKS
// ============================================================================

/**
 * Check if the current window is a popup window
 * 
 * @returns True if in popup context
 * 
 * @example
 * ```typescript
 * if (isPopupWindow()) {
 *   // Show close button
 * }
 * ```
 */
export function isPopupWindow(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('mode') === 'popup' || !!window.opener;
}

/**
 * Check if we're in a new tab context
 * 
 * @returns True if in new tab context
 * 
 * @example
 * ```typescript
 * if (isNewTabContext()) {
 *   // Apply full-page layout
 * }
 * ```
 */
export function isNewTabContext(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('mode') === 'newtab' || window.location.hash === DEFAULT_ROUTE;
}

// ============================================================================
// URL UTILITIES
// ============================================================================

/**
 * Get session ID from URL parameters
 * 
 * @returns Session ID or null if not present or invalid
 * 
 * @example
 * ```typescript
 * const sessionId = getSessionIdFromUrl();
 * if (sessionId) {
 *   loadSession(sessionId);
 * }
 * ```
 */
export function getSessionIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('sessionId');
  
  // Return only if valid
  return isValidSessionId(sessionId || '') ? sessionId : null;
}

/**
 * Update URL with current session ID without page reload
 * 
 * @param sessionId - Session ID to set, or null to remove
 * 
 * @example
 * ```typescript
 * // Set session ID
 * updateUrlWithSession('abc123');
 * 
 * // Clear session ID
 * updateUrlWithSession(null);
 * ```
 */
export function updateUrlWithSession(sessionId: string | null): void {
  const params = new URLSearchParams(window.location.search);
  
  if (sessionId && isValidSessionId(sessionId)) {
    params.set('sessionId', sessionId);
  } else {
    params.delete('sessionId');
  }
  
  const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  
  try {
  window.history.replaceState({}, '', newUrl);
  } catch (error) {
    console.error('[WindowManager] Failed to update URL:', error);
  }
}

// ============================================================================
// WINDOW CONTROL
// ============================================================================

/**
 * Close the current popup window (if it is one)
 * 
 * @throws Error if Chrome APIs fail
 * 
 * @example
 * ```typescript
 * if (isPopupWindow()) {
 *   await closePopupWindow();
 * }
 * ```
 */
export async function closePopupWindow(): Promise<void> {
  if (!isPopupWindow()) {
    return;
  }
  
    try {
      const currentWindow = await chrome.windows.getCurrent();
    if (!currentWindow.id) {
      throw new Error('Current window has no ID');
    }
    
        await chrome.windows.remove(currentWindow.id);
    console.log('[WindowManager] Popup window closed:', currentWindow.id);
    } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[WindowManager] Failed to close popup window:', errorMessage);
    throw new Error(`[WindowManager] Window close failed: ${errorMessage}`);
  }
}

/**
 * Maximize/restore the current window
 * 
 * @throws Error if Chrome APIs fail
 * 
 * @example
 * ```typescript
 * await toggleWindowMaximize(); // Maximizes or restores
 * ```
 */
export async function toggleWindowMaximize(): Promise<void> {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    if (!currentWindow.id) {
      throw new Error('Current window has no ID');
    }
    
      const newState = currentWindow.state === 'maximized' ? 'normal' : 'maximized';
      await chrome.windows.update(currentWindow.id, { state: newState });
    
    console.log('[WindowManager] Window state changed to:', newState);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[WindowManager] Failed to toggle window state:', errorMessage);
    throw new Error(`[WindowManager] Window toggle failed: ${errorMessage}`);
  }
}
