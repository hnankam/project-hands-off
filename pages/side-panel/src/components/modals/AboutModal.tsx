/**
 * @fileoverview About Modal Component
 *
 * Displays extension information including version, Chromium version, and OS.
 */

import * as React from 'react';
import { getAppVersion, isExtensionContext } from '@extension/platform';
import { cn } from '@extension/ui';
import { PROJECT_URL_OBJECT } from '@extension/shared';
import { Modal } from './Modal';

export interface AboutModalProps {
  /** Whether the modal is open */
  isOpen: boolean;

  /** Called when the modal should close */
  onClose: () => void;

  /** Light/dark theme */
  isLight: boolean;
}

/**
 * Get extension information
 */
function getExtensionInfo(): string {
  try {
    const manifest =
      typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.() ? chrome.runtime.getManifest() : null;
    const name = manifest?.name || 'Project Hands-Off';
    const version = manifest?.version || getAppVersion();
    const ua = navigator.userAgent;
    const chromeMatch = ua.match(/Chrom[e|ium]\/(\d+\.\d+\.\d+\.\d+|\d+\.\d+\.\d+|\d+\.\d+)/);
    const chromium = chromeMatch ? chromeMatch[1] : 'unknown';
    const os = (navigator as any).userAgentData?.platform || navigator.platform || 'unknown';
    return `${name}\nVersion: ${version}\nChromium: ${chromium}\nOS: ${os}`;
  } catch (e) {
    return 'Project Hands-Off\nVersion: unknown';
  }
}

/** Packaged extension icon vs Vite `public/` (web + side-panel dev). */
function getAboutLogoSrc(): string {
  if (isExtensionContext()) {
    try {
      return chrome.runtime.getURL('icon-128.png');
    } catch {
      // fall through
    }
  }
  const base = import.meta.env.BASE_URL || '/';
  return `${base}icon-128.png`;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, isLight }) => {
  const aboutText = getExtensionInfo();

  return (
    <Modal isOpen={isOpen} onClose={onClose} isLight={isLight} widthClass="max-w-xs" hideCloseButton={false}>
      <div className="space-y-3 text-center">
        <div className="flex items-center justify-center">
          <img src={getAboutLogoSrc()} alt="" className="h-12 w-12" />
        </div>
        <div>
          <pre className={cn('text-xs break-words whitespace-pre-wrap', isLight ? 'text-gray-800' : 'text-gray-200')}>
            {aboutText}
          </pre>
          <div className="mt-2">
            <a
              href={PROJECT_URL_OBJECT.url}
              target="_blank"
              rel="noreferrer"
              className={cn(
                'text-xs break-all underline',
                isLight ? 'text-blue-600 hover:text-blue-700' : 'text-blue-400 hover:text-blue-300',
              )}>
              {PROJECT_URL_OBJECT.url}
            </a>
          </div>
        </div>
      </div>
    </Modal>
  );
};
