import { isExtensionContext } from '@extension/platform';

/** Thrown when an action requires the browser extension (MV3). */
export class ExtensionOnlyError extends Error {
  constructor(feature = 'This action') {
    super(`${feature} is only available in the browser extension`);
    this.name = 'ExtensionOnlyError';
  }
}

export function assertExtensionContext(feature?: string): void {
  if (!isExtensionContext()) {
    throw new ExtensionOnlyError(feature);
  }
}
