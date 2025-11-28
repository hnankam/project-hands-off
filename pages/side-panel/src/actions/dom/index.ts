/**
 * DOM Manipulation Actions
 * Actions for interacting with DOM elements (cursor, clicks, scrolling, keyboard)
 */

export { handleMoveCursorToElement } from './moveCursor';
export type { MoveCursorResult } from './moveCursor';

export { handleCleanupExtensionUI } from './cleanupUI';
export type { CleanupUIResult } from './cleanupUI';

export { handleVerifySelector } from './verifySelector';
export type { VerifySelectorResult } from './verifySelector';

export { handleClickElement } from './clickElement';
export type { ClickElementResult } from './clickElement';

export { handleScroll } from './scroll';
export type { ScrollOperationResult } from './scroll';

export { handleGetSelectorAtPoint, handleGetSelectorsAtPoints } from './selectorAtPoints';
export type {
  SelectorAtPointResult,
  Point,
  BatchSelectorResultItem,
  BatchSelectorAtPointsResult,
} from './selectorAtPoints';

export { handleKeystrokeSequence } from './keyboard';
export type { Keystroke, KeystrokeSequenceRequest, KeystrokeResult, KeyInput } from './keyboard';

// Shadow DOM helpers (for use in content scripts)
export {
  querySelectorWithShadowDOM,
  querySelectorAllWithShadowDOM,
  getSelectorMetadata,
  CSS_ESCAPE_POLYFILL,
  QUERY_SELECTOR_SHADOW_DOM_CODE,
  createBuildSelectorCode,
} from './shadowDOMHelper';
export type { SelectorMetadata, ElementInfo, BuildSelectorResult } from './shadowDOMHelper';
