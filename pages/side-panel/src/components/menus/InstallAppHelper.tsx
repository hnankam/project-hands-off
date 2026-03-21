/**
 * Install App Helper Component
 *
 * Provides instructions and commands for installing the extension as a desktop app
 */

import * as React from 'react';
import { useState, useEffect } from 'react';
import { FEATURES } from '@extension/platform';
import { cn } from '@extension/ui';

interface InstallAppHelperProps {
  isLight: boolean;
}

type OS = 'windows' | 'mac' | 'linux' | 'unknown';

export function InstallAppHelper({ isLight }: InstallAppHelperProps) {
  const [os, setOs] = useState<OS>('unknown');
  const [extensionId, setExtensionId] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'chrome' | 'shortcut'>('chrome');

  useEffect(() => {
    if (!FEATURES.installHelper()) {
      return;
    }

    // Detect OS
    const platform = navigator.platform.toLowerCase();
    const userAgent = navigator.userAgent.toLowerCase();

    if (platform.includes('win')) {
      setOs('windows');
    } else if (platform.includes('mac')) {
      setOs('mac');
    } else if (platform.includes('linux') || userAgent.includes('linux')) {
      setOs('linux');
    }

    // Get extension ID
    const id = chrome.runtime.id;
    setExtensionId(id);
  }, []);

  const getAppUrl = () => {
    return `chrome-extension://${extensionId}/side-panel/index.html?mode=newtab`;
  };

  const getShortcutCommand = () => {
    const url = getAppUrl();

    switch (os) {
      case 'windows':
        return `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --app="${url}"`;
      case 'mac':
        return `/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --app="${url}"`;
      case 'linux':
        return `google-chrome --app="${url}"`;
      default:
        return `chrome --app="${url}"`;
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const getOSIcon = () => {
    switch (os) {
      case 'windows':
        return (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M0,0 L10,0 L10,10 L0,10 Z M11,0 L24,0 L24,10 L11,10 Z M0,11 L10,11 L10,24 L0,24 Z M11,11 L24,11 L24,24 L11,24 Z" />
          </svg>
        );
      case 'mac':
        return (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71,19.5C17.88,20.74 17,21.95 15.66,21.97C14.32,22 13.89,21.18 12.37,21.18C10.84,21.18 10.37,21.95 9.1,22C7.79,22.05 6.8,20.68 5.96,19.47C4.25,17 2.94,12.45 4.7,9.39C5.57,7.87 7.13,6.91 8.82,6.88C10.1,6.86 11.32,7.75 12.11,7.75C12.89,7.75 14.37,6.68 15.92,6.84C16.57,6.87 18.39,7.1 19.56,8.82C19.47,8.88 17.39,10.1 17.41,12.63C17.44,15.65 20.06,16.66 20.09,16.67C20.06,16.74 19.67,18.11 18.71,19.5M13,3.5C13.73,2.67 14.94,2.04 15.94,2C16.07,3.17 15.6,4.35 14.9,5.19C14.21,6.04 13.07,6.7 11.95,6.61C11.8,5.46 12.36,4.26 13,3.5Z" />
          </svg>
        );
      case 'linux':
        return (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14.62,8.35C14.2,8.63 12.87,9.39 12.67,9.54C12.28,9.85 11.92,9.83 11.53,9.53C11.33,9.37 10,8.61 9.58,8.34C9.1,8.03 9.13,7.64 9.66,7.42C11.3,6.73 12.94,6.78 14.57,7.45C15.06,7.66 15.08,8.05 14.62,8.35M21.84,15.63C20.91,13.54 19.64,11.64 18,9.97C17.47,9.42 17.14,8.8 16.94,8.09C16.84,7.76 16.77,7.42 16.7,7.08C16.5,6.2 16.41,5.3 16,4.47C15.27,2.89 14,2.07 12.16,2C10.35,2.05 9.05,2.86 8.3,4.44C7.84,5.37 7.78,6.35 7.59,7.32C7.5,7.73 7.39,8.14 7.25,8.53C7,9.21 6.67,9.85 6.13,10.38C4.42,12.05 3.06,14 2.07,16.15C1.88,16.59 1.69,17.03 1.5,17.47C1.26,18 1.29,18.55 1.62,19.04C2.11,19.73 2.91,20 3.72,20C4.23,20 4.73,19.84 5.19,19.57C5.77,19.23 6.26,18.76 6.73,18.27C7.91,17.06 9.11,15.87 10.29,14.67C10.43,14.53 10.54,14.34 10.73,14.27C11.26,14.08 11.78,14.27 12,14.78C12.18,15.18 12.13,15.59 11.89,15.93C11.74,16.13 11.57,16.32 11.4,16.5C10.18,17.76 9,19.05 7.75,20.3C7.32,20.73 6.86,21.13 6.32,21.43C4.89,22.22 2.75,22.06 1.57,20.87C0.5,19.78 0.41,18.09 1.27,16.91C1.83,16.15 2.44,15.43 3.08,14.75C4.89,12.81 6.7,10.86 8.5,8.91L8.5,3.5C8.5,2.67 9.17,2 10,2H14C14.83,2 15.5,2.67 15.5,3.5V8.91C17.3,10.86 19.11,12.81 20.92,14.75C21.56,15.43 22.17,16.15 22.73,16.91C23.59,18.09 23.5,19.78 22.43,20.87C21.25,22.06 19.11,22.22 17.68,21.43C17.14,21.13 16.68,20.73 16.25,20.3C15,19.05 13.82,17.76 12.6,16.5C12.43,16.32 12.26,16.13 12.11,15.93C11.87,15.59 11.82,15.18 12,14.78C12.22,14.27 12.74,14.08 13.27,14.27C13.46,14.34 13.57,14.53 13.71,14.67C14.89,15.87 16.09,17.06 17.27,18.27C17.74,18.76 18.23,19.23 18.81,19.57C19.27,19.84 19.77,20 20.28,20C21.09,20 21.89,19.73 22.38,19.04C22.71,18.55 22.74,18 22.5,17.47C22.31,17.03 22.12,16.59 21.93,16.15C21.91,16.11 21.88,16.07 21.84,15.63Z" />
          </svg>
        );
      default:
        return null;
    }
  };

  if (!FEATURES.installHelper()) {
    return null;
  }

  return (
    <div className={cn('space-y-3')}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full',
            isLight ? 'bg-blue-100 text-blue-600' : 'bg-blue-900/30 text-blue-400',
          )}>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
        </div>
        <div>
          <h3 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
            Install as Desktop App
          </h3>
          <p className={cn('text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
            Access Project Hands-Off directly from your desktop
          </p>
        </div>
      </div>

      {/* OS Detection */}
      {os !== 'unknown' && (
        <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2', isLight ? 'bg-gray-50' : 'bg-gray-800/50')}>
          <div className={cn(isLight ? 'text-gray-600' : 'text-gray-400')}>{getOSIcon()}</div>
          <span className={cn('text-xs', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Detected: <span className="font-medium capitalize">{os === 'mac' ? 'macOS' : os}</span>
          </span>
        </div>
      )}

      {/* Tab Selector */}
      <div className={cn('flex rounded-lg p-1', isLight ? 'bg-gray-100' : 'bg-gray-800')}>
        <button
          onClick={() => setActiveTab('chrome')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            activeTab === 'chrome'
              ? isLight
                ? 'bg-white text-gray-900 shadow-sm'
                : 'bg-gray-700 text-gray-100'
              : isLight
                ? 'text-gray-600 hover:text-gray-900'
                : 'text-gray-400 hover:text-gray-200',
          )}>
          Chrome Menu
        </button>
        <button
          onClick={() => setActiveTab('shortcut')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            activeTab === 'shortcut'
              ? isLight
                ? 'bg-white text-gray-900 shadow-sm'
                : 'bg-gray-700 text-gray-100'
              : isLight
                ? 'text-gray-600 hover:text-gray-900'
                : 'text-gray-400 hover:text-gray-200',
          )}>
          Desktop Shortcut
        </button>
      </div>

      {/* Chrome Menu Method */}
      {activeTab === 'chrome' && (
        <div className="space-y-2.5">
          <div className={cn('space-y-2.5 rounded-lg p-3', isLight ? 'bg-blue-50' : 'bg-blue-900/10')}>
            <div className="flex items-start gap-2">
              <div
                className={cn(
                  'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  isLight ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white',
                )}>
                1
              </div>
              <p className={cn('text-xs', isLight ? 'text-gray-700' : 'text-gray-300')}>
                Click on the <span className="font-semibold">View Options</span> menu button in the header
              </p>
            </div>
            <div className="flex items-start gap-2">
              <div
                className={cn(
                  'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  isLight ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white',
                )}>
                2
              </div>
              <p className={cn('text-xs', isLight ? 'text-gray-700' : 'text-gray-300')}>
                Select <span className="font-semibold">"Open in New Tab"</span>
              </p>
            </div>
            <div className="flex items-start gap-2">
              <div
                className={cn(
                  'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  isLight ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white',
                )}>
                3
              </div>
              <p className={cn('text-xs', isLight ? 'text-gray-700' : 'text-gray-300')}>
                In the new tab, click the <span className="font-semibold">Chrome menu</span> (⋮) →{' '}
                <span className="font-semibold">Save and share</span> →{' '}
                <span className="font-semibold">Create shortcut</span>
              </p>
            </div>
            <div className="flex items-start gap-2">
              <div
                className={cn(
                  'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  isLight ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white',
                )}>
                4
              </div>
              <p className={cn('text-xs', isLight ? 'text-gray-700' : 'text-gray-300')}>
                Check <span className="font-semibold">"Open as window"</span> and click{' '}
                <span className="font-semibold">Create</span>
              </p>
            </div>
          </div>

          <div className={cn('flex items-start gap-2 rounded-lg px-3 py-2', isLight ? 'bg-gray-50' : 'bg-gray-800/50')}>
            <svg
              className={cn('mt-0.5 h-4 w-4 flex-shrink-0', isLight ? 'text-blue-600' : 'text-blue-400')}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className={cn('text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
              This will create a desktop shortcut that opens Project Hands-Off in its own window without browser UI
            </p>
          </div>
        </div>
      )}

      {/* Desktop Shortcut Method */}
      {activeTab === 'shortcut' && (
        <div className="space-y-2.5">
          <div className={cn('space-y-2.5 rounded-lg p-3', isLight ? 'bg-amber-50' : 'bg-amber-900/10')}>
            <p className={cn('text-xs font-medium', isLight ? 'text-gray-900' : 'text-gray-100')}>
              Command to create app-mode shortcut:
            </p>

            <div
              className={cn(
                'rounded-md border p-2.5 font-mono text-xs break-all',
                isLight ? 'border-gray-300 bg-white text-gray-800' : 'border-gray-700 bg-gray-900 text-gray-200',
              )}>
              {getShortcutCommand()}
            </div>

            <button
              onClick={() => copyToClipboard(getShortcutCommand())}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-md px-4 py-1.5 text-xs font-medium transition-colors',
                isLight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-600 text-white hover:bg-blue-700',
              )}>
              {copied ? (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Copy Command
                </>
              )}
            </button>
          </div>

          {/* Instructions based on OS */}
          <div className={cn('space-y-2.5 rounded-lg p-3', isLight ? 'bg-gray-50' : 'bg-gray-800/50')}>
            <p className={cn('text-xs font-medium', isLight ? 'text-gray-900' : 'text-gray-100')}>
              How to use this command:
            </p>

            {os === 'windows' && (
              <ol
                className={cn(
                  'list-inside list-decimal space-y-1.5 text-xs',
                  isLight ? 'text-gray-700' : 'text-gray-300',
                )}>
                <li>
                  Right-click on your desktop → <span className="font-semibold">New</span> →{' '}
                  <span className="font-semibold">Shortcut</span>
                </li>
                <li>Paste the command above into the location field</li>
                <li>
                  Click <span className="font-semibold">Next</span>, name it "Project Hands-Off"
                </li>
                <li>
                  Click <span className="font-semibold">Finish</span>
                </li>
              </ol>
            )}

            {os === 'mac' && (
              <ol
                className={cn(
                  'list-inside list-decimal space-y-1.5 text-xs',
                  isLight ? 'text-gray-700' : 'text-gray-300',
                )}>
                <li>
                  Open <span className="font-semibold">Automator</span> and create a new{' '}
                  <span className="font-semibold">Application</span>
                </li>
                <li>
                  Add a <span className="font-semibold">Run Shell Script</span> action
                </li>
                <li>Paste the command above</li>
                <li>Save as "Project Hands-Off" to Applications or Desktop</li>
              </ol>
            )}

            {os === 'linux' && (
              <ol
                className={cn(
                  'list-inside list-decimal space-y-1.5 text-xs',
                  isLight ? 'text-gray-700' : 'text-gray-300',
                )}>
                <li>
                  Create a new file:{' '}
                  <span className="font-mono text-xs">~/.local/share/applications/project-hands-off.desktop</span>
                </li>
                <li>Add the desktop entry with the Exec line pointing to the command above</li>
                <li>
                  Make it executable:{' '}
                  <span className="font-mono text-xs">
                    chmod +x ~/.local/share/applications/project-hands-off.desktop
                  </span>
                </li>
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
