import { isExtensionContext } from './runtime.js';

/**
 * Feature gates for extension-only capabilities (web app disables these).
 */
export const FEATURES = {
  browserTabs: (): boolean => isExtensionContext(),
  domAutomation: (): boolean => isExtensionContext(),
  embeddingWorker: (): boolean => isExtensionContext(),
  installHelper: (): boolean => isExtensionContext(),
  extensionMessaging: (): boolean => isExtensionContext(),
} as const;
