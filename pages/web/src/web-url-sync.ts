/**
 * Run before the rest of the app loads so view-mode detection matches the extension
 * "Open in tab" URL: `side-panel/index.html?mode=newtab`
 */
import { isExtensionContext } from '@extension/platform';

const VIEW_MODES = ['sidepanel', 'popup', 'newtab', 'fullscreen'] as const;

if (typeof window !== 'undefined' && !isExtensionContext()) {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  if (!mode || !(VIEW_MODES as readonly string[]).includes(mode)) {
    params.set('mode', 'newtab');
    const qs = params.toString();
    const path = window.location.pathname;
    const hash = window.location.hash;
    window.history.replaceState({}, '', `${path}?${qs}${hash}`);
  }
}
