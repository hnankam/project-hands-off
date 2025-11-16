/**
 * View Options Menu Component
 * 
 * Provides UI controls for opening the chat in different contexts:
 * - Popup window
 * - New tab
 * - Fullscreen mode
 */

import React, { useState } from 'react';
import { cn } from '@extension/ui';
import { openInPopupWindow, openInNewTab, getCurrentViewMode, isPopupWindow, closePopupWindow, toggleWindowMaximize } from '../utils/windowManager';

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
  const viewMode = getCurrentViewMode();
  const isInPopup = isPopupWindow();

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
    <div className={cn('relative', className)}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isProcessing}
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded transition-colors',
          isLight
            ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
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
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu */}
          <div
            className={cn(
              'absolute right-0 top-full mt-1 z-50 w-56 rounded-lg shadow-lg border',
              isLight
                ? 'bg-white border-gray-200'
                : 'bg-[#1C2128] border-gray-700'
            )}
          >
            <div className="py-1">
              {/* Current View Indicator */}
              <div className={cn(
                'px-3 py-2 text-xs font-medium border-b',
                isLight ? 'text-gray-500 border-gray-200' : 'text-gray-400 border-gray-700'
              )}>
                Current: {viewMode === 'sidepanel' && 'Side Panel'}
                {viewMode === 'popup' && 'Popup Window'}
                {viewMode === 'newtab' && 'New Tab'}
              </div>

              {/* Open in Popup Window */}
              {viewMode !== 'popup' && (
                <button
                  onClick={handleOpenInPopup}
                  disabled={isProcessing}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 text-xs transition-colors text-left',
                    isLight
                      ? 'text-gray-700 hover:bg-gray-50'
                      : 'text-gray-300 hover:bg-gray-700',
                    isProcessing && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <rect x="5" y="5" width="14" height="14" rx="2" />
                  </svg>
                  <div className="flex-1">
                    <div className="font-medium">Open in Window</div>
                    <div className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                      Detached, resizable window
                    </div>
                  </div>
                </button>
              )}

              {/* Open Maximized */}
              {viewMode !== 'popup' && (
                <button
                  onClick={handleOpenInMaximizedPopup}
                  disabled={isProcessing}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 text-xs transition-colors text-left',
                    isLight
                      ? 'text-gray-700 hover:bg-gray-50'
                      : 'text-gray-300 hover:bg-gray-700',
                    isProcessing && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                  </svg>
                  <div className="flex-1">
                    <div className="font-medium">Open Maximized</div>
                    <div className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                      Full screen window
                    </div>
                  </div>
                </button>
              )}

              {/* Open in New Tab */}
              <button
                onClick={handleOpenInNewTab}
                disabled={isProcessing}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 text-xs transition-colors text-left',
                  isLight
                    ? 'text-gray-700 hover:bg-gray-50'
                    : 'text-gray-300 hover:bg-gray-700',
                  isProcessing && 'opacity-50 cursor-not-allowed'
                )}
              >
                <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                <div className="flex-1">
                  <div className="font-medium">Open in New Tab</div>
                  <div className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                    Full browser tab
                  </div>
                </div>
              </button>

              {/* Popup-specific options */}
              {isInPopup && (
                <>
                  <div className={cn('border-t my-1', isLight ? 'border-gray-200' : 'border-gray-700')} />
                  
                  {/* Toggle Maximize */}
                  <button
                    onClick={handleToggleMaximize}
                    disabled={isProcessing}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 text-xs transition-colors text-left',
                      isLight
                        ? 'text-gray-700 hover:bg-gray-50'
                        : 'text-gray-300 hover:bg-gray-700',
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
                      'w-full flex items-center gap-3 px-3 py-2 text-xs transition-colors text-left',
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

