/**
 * Login Settings Dropdown Component
 * 
 * Provides theme selector and view options for the login page.
 * Combines theme switching (Light/Dark/System) with window management options.
 */

import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@extension/ui';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { 
  openInPopupWindow, 
  openInNewTab, 
  getCurrentViewMode, 
  isPopupWindow, 
  closePopupWindow, 
  toggleWindowMaximize 
} from '../../utils/windowManager';

interface LoginSettingsDropdownProps {
  isLight: boolean;
}

export const LoginSettingsDropdown: React.FC<LoginSettingsDropdownProps> = ({ isLight }) => {
  const { theme } = useStorage(themeStorage);
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

  // View option handlers
  const handleOpenInPopup = async () => {
    setIsProcessing(true);
    try {
      await openInPopupWindow({
        width: 1200,
        height: 800,
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
        active: true
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
    <div className="relative" ref={dropdownRef}>
      {/* Settings Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center justify-center h-7 w-7 rounded-md transition-colors',
          isLight
            ? 'text-gray-400 hover:bg-gray-200/70 hover:text-gray-600'
            : 'text-gray-500 hover:bg-white/10 hover:text-gray-300',
          isOpen && (isLight ? 'bg-gray-200/70 text-gray-600' : 'bg-white/10 text-gray-300')
        )}
        title="Settings"
      >
        <svg 
          width="16"
          height="16"
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
              'absolute right-0 top-full mt-1 z-50 w-52 rounded-lg shadow-lg border overflow-hidden',
              isLight
                ? 'bg-white border-gray-200'
                : 'bg-[#1C2128] border-gray-700'
            )}
          >
            {/* Theme Section */}
            <div className={cn(
              'px-2.5 py-2 border-b',
              isLight ? 'border-gray-200' : 'border-gray-700'
            )}>
              <label className={cn(
                'text-[11px] font-medium uppercase tracking-wide block mb-1.5',
                isLight ? 'text-gray-500' : 'text-gray-400'
              )}>
                Theme
              </label>
              <div className="flex gap-0.5">
                {/* Light */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    themeStorage.setTheme('light');
                  }}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 rounded text-[11px] font-medium transition-all',
                    theme === 'light'
                      ? 'bg-blue-500 text-white'
                      : isLight
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                  )}
                  title="Light theme"
                >
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <span>Light</span>
                </button>
                
                {/* Dark */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    themeStorage.setTheme('dark');
                  }}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 rounded text-[11px] font-medium transition-all',
                    theme === 'dark'
                      ? 'bg-blue-500 text-white'
                      : isLight
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                  )}
                  title="Dark theme"
                >
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                  <span>Dark</span>
                </button>
                
                {/* System */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    themeStorage.setTheme('system');
                  }}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 rounded text-[11px] font-medium transition-all',
                    theme === 'system'
                      ? 'bg-blue-500 text-white'
                      : isLight
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                  )}
                  title="System theme"
                >
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>Auto</span>
                </button>
              </div>
            </div>

            {/* View Options Section */}
            <div className={cn(
              'px-2.5 py-1.5 border-b',
              isLight ? 'border-gray-200' : 'border-gray-700'
            )}>
              <div className="flex items-center justify-between">
                <label className={cn(
                  'text-[11px] font-medium uppercase tracking-wide',
                  isLight ? 'text-gray-500' : 'text-gray-400'
                )}>
                  View
                </label>
                <span className={cn(
                  'text-[10px]',
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
                    'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors text-left',
                    isLight
                      ? 'text-gray-700 hover:bg-gray-50'
                      : 'text-gray-300 hover:bg-gray-700/50',
                    isProcessing && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
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
                    'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors text-left',
                    isLight
                      ? 'text-gray-700 hover:bg-gray-50'
                      : 'text-gray-300 hover:bg-gray-700/50',
                    isProcessing && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
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
                  'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors text-left',
                  isLight
                    ? 'text-gray-700 hover:bg-gray-50'
                    : 'text-gray-300 hover:bg-gray-700/50',
                  isProcessing && 'opacity-50 cursor-not-allowed'
                )}
              >
                <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
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
                      'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors text-left',
                      isLight
                        ? 'text-gray-700 hover:bg-gray-50'
                        : 'text-gray-300 hover:bg-gray-700/50',
                      isProcessing && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                    </svg>
                    <span>Toggle Maximize</span>
                  </button>

                  {/* Close Window */}
                  <button
                    onClick={handleClosePopup}
                    disabled={isProcessing}
                    className={cn(
                      'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors text-left',
                      isLight
                        ? 'text-red-600 hover:bg-red-50'
                        : 'text-red-400 hover:bg-red-900/20',
                      isProcessing && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
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

