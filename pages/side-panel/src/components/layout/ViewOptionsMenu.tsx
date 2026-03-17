/**
 * View Options Menu Component
 * 
 * Provides UI controls for theme switching and opening the chat in different contexts:
 * - Popup window
 * - New tab
 * - Fullscreen mode
 */

import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@extension/ui';
import { openInPopupWindow, openInNewTab, getCurrentViewMode, isPopupWindow, closePopupWindow, toggleWindowMaximize } from '../../utils/windowManager';

interface ViewOptionsMenuProps {
  isLight: boolean;
  currentSessionId?: string | null;
  className?: string;
}

export const ViewOptionsMenu: React.FC<ViewOptionsMenuProps> = ({
  isLight,
  currentSessionId,
  className
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const viewMode = getCurrentViewMode();
  const isInPopup = isPopupWindow();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
    return undefined;
  }, [isOpen]);

  const handleOpenInPopup = async () => {
    setIsProcessing(true);
    try {
      await openInPopupWindow({
        width: 1200,
        height: 800,
        sessionId: currentSessionId || undefined,
        state: 'normal'
      });
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to open popup:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenInMaximizedPopup = async () => {
    setIsProcessing(true);
    try {
      await openInPopupWindow({
        sessionId: currentSessionId || undefined,
        state: 'maximized'
      });
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to open maximized popup:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenInNewTab = async () => {
    setIsProcessing(true);
    try {
      await openInNewTab({
        active: true,
        sessionId: currentSessionId || undefined
      });
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to open new tab:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleMaximize = async () => {
    setIsProcessing(true);
    try {
      await toggleWindowMaximize();
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to toggle maximize:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClosePopup = async () => {
    await closePopupWindow();
  };

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isProcessing}
        className={cn(
          'flex h-7 w-7 p-0 items-center justify-center rounded-md transition-colors',
          isLight
            ? 'text-gray-600 hover:bg-gray-200/70'
            : 'text-gray-400 hover:bg-gray-800/50',
          isOpen && (isLight ? 'bg-gray-200/70' : 'bg-gray-800/50'),
          isProcessing && 'opacity-50 cursor-not-allowed'
        )}
        title="View options"
      >
        {/* Window icon */}
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop - z-[60] to appear above ConfigPanel (z-50) when open */}
          <div
            className="fixed inset-0 z-[60]"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu - z-[60] to appear above ConfigPanel when open */}
          <div
            className={cn(
              'absolute right-0 top-full mt-1 z-[60] w-52 rounded-lg shadow-lg border overflow-hidden',
              isLight
                ? 'bg-white border-gray-200'
                : 'bg-[#1C2128] border-gray-700'
            )}
          >
            {/* View Options Header */}
            <div className={cn(
              'px-2.5 py-1.5 border-b',
              isLight ? 'border-gray-200' : 'border-gray-700'
            )}>
              <div className="flex items-center justify-between">
                <label className={cn(
                  'text-[11px] font-semibold uppercase tracking-wide',
                  isLight ? 'text-gray-500' : 'text-gray-400'
                )}>
                  View
                </label>
                <span className={cn(
                  'text-[11px]',
                  isLight ? 'text-gray-400' : 'text-gray-500'
                )}>
                  {viewMode === 'sidepanel' && 'Side Panel'}
                  {viewMode === 'popup' && 'Popup'}
                  {viewMode === 'newtab' && 'Tab'}
                </span>
              </div>
            </div>

            <div className="py-0.5">
              {/* Open in Window */}
              {viewMode !== 'popup' && (
                <button
                  onClick={handleOpenInPopup}
                  disabled={isProcessing}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-1.5 text-xs transition-colors text-left',
                    isLight
                      ? 'text-gray-700 hover:bg-gray-50'
                      : 'text-gray-300 hover:bg-gray-700/50',
                    isProcessing && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <rect x="5" y="5" width="14" height="14" rx="2" />
                  </svg>
                  <span>Open in Window</span>
                </button>
              )}

              {/* Open Maximized */}
              {viewMode !== 'popup' && (
                <button
                  onClick={handleOpenInMaximizedPopup}
                  disabled={isProcessing}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-2 text-xs transition-colors text-left',
                    isLight
                      ? 'text-gray-700 hover:bg-gray-50'
                      : 'text-gray-300 hover:bg-gray-700/50',
                    isProcessing && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                  </svg>
                  <span>Open Maximized</span>
                </button>
              )}

              {/* Open in New Tab */}
              <button
                onClick={handleOpenInNewTab}
                disabled={isProcessing}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-2 text-xs transition-colors text-left',
                  isLight
                    ? 'text-gray-700 hover:bg-gray-50'
                    : 'text-gray-300 hover:bg-gray-700/50',
                  isProcessing && 'opacity-50 cursor-not-allowed'
                )}
              >
                <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                <span>Open in New Tab</span>
              </button>

              {/* Popup-specific options */}
              {isInPopup && (
                <>
                  <div className={cn('border-t my-0.5', isLight ? 'border-gray-200' : 'border-gray-700')} />
                  
                  {/* Toggle Maximize */}
                  <button
                    onClick={handleToggleMaximize}
                    disabled={isProcessing}
                    className={cn(
                      'w-full flex items-center gap-2 px-2.5 py-2 text-xs transition-colors text-left',
                      isLight
                        ? 'text-gray-700 hover:bg-gray-50'
                        : 'text-gray-300 hover:bg-gray-700/50',
                      isProcessing && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                    </svg>
                    <span>Toggle Maximize</span>
                  </button>

                  {/* Close Window */}
                  <button
                    onClick={handleClosePopup}
                    disabled={isProcessing}
                    className={cn(
                      'w-full flex items-center gap-2 px-2.5 py-2 text-xs transition-colors text-left',
                      isLight
                        ? 'text-red-600 hover:bg-red-50'
                        : 'text-red-400 hover:bg-red-900/20',
                      isProcessing && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Close Window</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
