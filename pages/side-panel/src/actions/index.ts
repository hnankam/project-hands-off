/**
 * CopilotKit Actions
 *
 * All action handlers for web page interactions through the Chrome extension.
 * Organized by category for better maintainability.
 */

// DOM Manipulation Actions
export { handleMoveCursorToElement } from './dom/moveCursor';
export { handleCleanupExtensionUI } from './dom/cleanupUI';
export { handleClickElement } from './dom/clickElement';
export { handleScroll } from './dom/scroll';
export { handleVerifySelector } from './dom/verifySelector';
export { handleGetSelectorAtPoint, handleGetSelectorsAtPoints } from './dom/selectorAtPoints';

// Form Actions
export { handleInputData } from './forms/inputData';

// Navigation Actions
export { handleOpenNewTab } from './navigation/openNewTab';

// Interaction Actions
export { handleDragAndDrop } from './interactions/dragAndDrop';

// Content Actions
export { handleRefreshPageContent } from './content/refreshPageContent';
export { handleTakeScreenshot } from './content/takeScreenshot';
