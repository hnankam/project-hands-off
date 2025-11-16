/**
 * Window Manager Utility
 * 
 * Handles opening the side panel content in different contexts:
 * - Popup window (detached, resizable)
 * - New tab
 * - Fullscreen mode
 */

export type ViewMode = 'sidepanel' | 'popup' | 'newtab' | 'fullscreen';

interface OpenInPopupOptions {
  width?: number;
  height?: number;
  sessionId?: string;
  state?: 'normal' | 'maximized' | 'fullscreen';
}

interface OpenInNewTabOptions {
  active?: boolean;
  sessionId?: string;
}

/**
 * Get the current view mode based on the context
 */
export function getCurrentViewMode(): ViewMode {
  // Check URL parameters
  const params = new URLSearchParams(window.location.search);
  const modeParam = params.get('mode') as ViewMode | null;
  
  if (modeParam && ['sidepanel', 'popup', 'newtab', 'fullscreen'].includes(modeParam)) {
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

/**
 * Open the side panel content in a popup window
 */
export async function openInPopupWindow(options: OpenInPopupOptions = {}): Promise<chrome.windows.Window | null> {
  const {
    width = 1200,
    height = 800,
    sessionId,
    state = 'normal'
  } = options;
  
  try {
    // Build URL with query parameters
    const url = chrome.runtime.getURL('side-panel/index.html');
    const params = new URLSearchParams({
      mode: 'popup',
      ...(sessionId && { sessionId })
    });
    
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
      createOptions.width = width;
      createOptions.height = height;
      const left = Math.round((screenWidth - width) / 2);
      const top = Math.round((screenHeight - height) / 2);
      createOptions.left = left;
      createOptions.top = top;
    }
    
    const popupWindow = await chrome.windows.create(createOptions);
    
    console.log('[WindowManager] Popup window created:', popupWindow.id);
    return popupWindow;
  } catch (error) {
    console.error('[WindowManager] Failed to create popup window:', error);
    return null;
  }
}

/**
 * Open the side panel content in a new tab
 */
export async function openInNewTab(options: OpenInNewTabOptions = {}): Promise<chrome.tabs.Tab | null> {
  const {
    active = true,
    sessionId
  } = options;
  
  try {
    // Build URL pointing to side-panel with query parameters
    const url = chrome.runtime.getURL('side-panel/index.html');
    const params = new URLSearchParams({
      mode: 'newtab',
      ...(sessionId && { sessionId })
    });
    
    const fullUrl = `${url}?${params.toString()}#/sessions`;
    
    // Check if a tab with this URL already exists
    const existingTabs = await chrome.tabs.query({ url: `${chrome.runtime.getURL('side-panel/index.html')}*` });
    
    if (existingTabs.length > 0 && sessionId) {
      // Check if any existing tab has the same sessionId
      const matchingTab = existingTabs.find(tab => tab.url?.includes(`sessionId=${sessionId}`));
      
      if (matchingTab && matchingTab.id) {
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
    
    console.log('[WindowManager] New tab created:', newTab.id);
    return newTab;
  } catch (error) {
    console.error('[WindowManager] Failed to create new tab:', error);
    return null;
  }
}

/**
 * Check if the current window is a popup window
 */
export function isPopupWindow(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('mode') === 'popup' || !!window.opener;
}

/**
 * Check if we're in a new tab context
 */
export function isNewTabContext(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('mode') === 'chat' || window.location.hash === '#chat';
}

/**
 * Get session ID from URL parameters
 */
export function getSessionIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('sessionId');
}

/**
 * Update URL with current session ID without page reload
 */
export function updateUrlWithSession(sessionId: string | null): void {
  const params = new URLSearchParams(window.location.search);
  
  if (sessionId) {
    params.set('sessionId', sessionId);
  } else {
    params.delete('sessionId');
  }
  
  const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  window.history.replaceState({}, '', newUrl);
}

/**
 * Close the current popup window (if it is one)
 */
export async function closePopupWindow(): Promise<void> {
  if (isPopupWindow()) {
    try {
      const currentWindow = await chrome.windows.getCurrent();
      if (currentWindow.id) {
        await chrome.windows.remove(currentWindow.id);
      }
    } catch (error) {
      console.error('[WindowManager] Failed to close popup window:', error);
    }
  }
}

/**
 * Maximize/restore the current window
 */
export async function toggleWindowMaximize(): Promise<void> {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    if (currentWindow.id) {
      const newState = currentWindow.state === 'maximized' ? 'normal' : 'maximized';
      await chrome.windows.update(currentWindow.id, { state: newState });
    }
  } catch (error) {
    console.error('[WindowManager] Failed to toggle window state:', error);
  }
}

