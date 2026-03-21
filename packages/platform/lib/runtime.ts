/**
 * True when running inside a Chromium extension page (side panel, popup, etc.).
 */
export function isExtensionContext(): boolean {
  return typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined' && !!chrome.runtime?.id;
}

const FALLBACK_VERSION = '0.0.0-web';

/**
 * Injected by the standalone web Vite build (`pages/web/vite.config.mts`) from
 * `chrome-extension/package.json` so the web UI matches the extension manifest version.
 */
declare const __HANDS_OFF_APP_VERSION__: string | undefined;

/**
 * Extension manifest version (`chrome-extension/package.json`), or the same value
 * baked into the web bundle, or a dev fallback.
 */
export function getAppVersion(): string {
  try {
    const v = chrome?.runtime?.getManifest?.()?.version;
    if (v && typeof v === 'string') return v;
  } catch {
    // ignore
  }
  if (typeof __HANDS_OFF_APP_VERSION__ !== 'undefined' && __HANDS_OFF_APP_VERSION__) {
    return __HANDS_OFF_APP_VERSION__;
  }
  return FALLBACK_VERSION;
}

const SIDE_PANEL_PATH = 'side-panel/index.html';

/**
 * Absolute URL to the side panel HTML in extension, or current origin for web.
 */
export function getSidePanelUrl(): string {
  if (isExtensionContext()) {
    return chrome.runtime.getURL(SIDE_PANEL_PATH);
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}
