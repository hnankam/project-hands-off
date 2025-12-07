/**
 * @fileoverview About Modal Component
 * 
 * Displays extension information including version, Chromium version, and OS.
 */

import React from 'react';
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
    const manifest = chrome.runtime?.getManifest?.();
    const name = manifest?.name || 'Project Hands-Off';
    const version = manifest?.version || 'unknown';
    const ua = navigator.userAgent;
    const chromeMatch = ua.match(/Chrom[e|ium]\/(\d+\.\d+\.\d+\.\d+|\d+\.\d+\.\d+|\d+\.\d+)/);
    const chromium = chromeMatch ? chromeMatch[1] : 'unknown';
    const os = (navigator as any).userAgentData?.platform || navigator.platform || 'unknown';
    return `${name}\nVersion: ${version}\nChromium: ${chromium}\nOS: ${os}`;
  } catch (e) {
    return 'Project Hands-Off\nVersion: unknown';
  }
}

export const AboutModal: React.FC<AboutModalProps> = ({
  isOpen,
  onClose,
  isLight,
}) => {
  const aboutText = getExtensionInfo();
  
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      isLight={isLight}
      widthClass="max-w-xs"
      hideCloseButton={false}
    >
      <div className="space-y-3 text-center">
        <div className="flex items-center justify-center">
          <img src={'/icon-128.png'} alt="Project Hands-Off" className="h-12 w-12" />
        </div>
        <div>
          <pre
            className={cn(
              'whitespace-pre-wrap break-words text-xs',
              isLight ? 'text-gray-800' : 'text-gray-200',
            )}
          >
            {aboutText}
          </pre>
          <div className="mt-2">
            <a
              href={PROJECT_URL_OBJECT.url}
              target="_blank"
              rel="noreferrer"
              className={cn(
                'break-all text-xs underline',
                isLight ? 'text-blue-600 hover:text-blue-700' : 'text-blue-400 hover:text-blue-300',
              )}
            >
              {PROJECT_URL_OBJECT.url}
            </a>
          </div>
        </div>
      </div>
    </Modal>
  );
};

