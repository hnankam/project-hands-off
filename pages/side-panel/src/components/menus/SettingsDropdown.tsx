import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@extension/ui';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';

interface SettingsDropdownProps {
  isLight: boolean;
  showSuggestions: boolean;
  showThoughtBlocks: boolean;
  onShowSuggestionsChange: (show: boolean) => void;
  onShowThoughtBlocksChange: (show: boolean) => void;
  onExpandClick: () => void;
}

export const SettingsDropdown: React.FC<SettingsDropdownProps> = ({
  isLight,
  showSuggestions,
  showThoughtBlocks,
  onShowSuggestionsChange,
  onShowThoughtBlocksChange,
  onExpandClick,
}) => {
  const { theme } = useStorage(themeStorage);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center justify-center h-[26px] w-[26px] rounded-md transition-colors flex-shrink-0',
          isLight
            ? 'text-gray-600 hover:bg-gray-200 hover:text-gray-900'
            : 'text-gray-400 hover:bg-gray-700 hover:text-gray-100',
          isOpen && (isLight ? 'bg-gray-200' : 'bg-gray-700')
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

      {/* Dropdown - Always mounted, visibility controlled with CSS */}
      <div
        className={cn(
          'absolute bottom-full right-0 mb-1 w-64 rounded-md border shadow-lg z-[9999] transition-opacity',
          isLight
            ? 'bg-gray-50 border-gray-200'
            : 'bg-[#151C24] border-gray-700',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      >
          {/* Header */}
          <div
            className={cn(
              'px-3 py-2 border-b',
              isLight ? 'border-gray-200' : 'border-gray-700'
            )}
          >
            <h3
              className={cn(
                'text-xs font-semibold',
                isLight ? 'text-gray-700' : 'text-gray-300'
              )}
            >
              Settings
            </h3>
          </div>

          {/* Theme Selection */}
          <div
            className={cn(
              'px-3 py-2.5 border-b',
              isLight ? 'border-gray-200' : 'border-gray-700'
            )}
          >
            <label
              className={cn(
                'text-xs font-medium block mb-2',
                isLight ? 'text-gray-900' : 'text-gray-100'
              )}
            >
              Theme
            </label>
            <div className="flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  themeStorage.setTheme('light');
                }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                  theme === 'light'
                    ? 'bg-blue-500 text-white'
                    : isLight
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                )}
                title="Light theme"
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span>Light</span>
              </button>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  themeStorage.setTheme('dark');
                }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                  theme === 'dark'
                    ? 'bg-blue-500 text-white'
                    : isLight
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                )}
                title="Dark theme"
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                <span>Dark</span>
              </button>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  themeStorage.setTheme('system');
                }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                  theme === 'system'
                    ? 'bg-blue-500 text-white'
                    : isLight
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                )}
                title="System theme"
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>System</span>
              </button>
            </div>
          </div>

          {/* Show Suggestions Toggle */}
          <div
            className={cn(
              'px-3 py-2.5 border-b',
              isLight ? 'border-gray-200 hover:bg-gray-50' : 'border-gray-700 hover:bg-gray-700/50'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 pr-3">
                <label
                  htmlFor="show-suggestions-dropdown"
                  className={cn(
                    'text-xs font-medium cursor-pointer block',
                    isLight ? 'text-gray-900' : 'text-gray-100'
                  )}
                >
                  Show Suggestions
                </label>
                <p
                  className={cn(
                    'text-xs mt-0.5',
                    isLight ? 'text-gray-500' : 'text-gray-400'
                  )}
                >
                  Display contextual suggestions
                </p>
              </div>
              <button
                id="show-suggestions-dropdown"
                role="switch"
                aria-checked={showSuggestions}
                onClick={(e) => {
                  e.stopPropagation();
                  onShowSuggestionsChange(!showSuggestions);
                }}
                className={cn(
                  'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-1',
                  showSuggestions
                    ? 'bg-blue-600 focus:ring-blue-500'
                    : isLight
                    ? 'bg-gray-200 focus:ring-gray-300'
                    : 'bg-gray-600 focus:ring-gray-500'
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                    showSuggestions ? 'translate-x-4' : 'translate-x-0'
                  )}
                />
              </button>
            </div>
          </div>

          {/* Show Thought Blocks Toggle */}
          <div
            className={cn(
              'px-3 py-2.5',
              isLight ? 'hover:bg-gray-50' : 'hover:bg-gray-700/50'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 pr-3">
                <label
                  htmlFor="show-thought-blocks-dropdown"
                  className={cn(
                    'text-xs font-medium cursor-pointer block',
                    isLight ? 'text-gray-900' : 'text-gray-100'
                  )}
                >
                  Show Thought Blocks
                </label>
                <p
                  className={cn(
                    'text-xs mt-0.5',
                    isLight ? 'text-gray-500' : 'text-gray-400'
                  )}
                >
                  Display the assistant's hidden reasoning
                </p>
              </div>
              <button
                id="show-thought-blocks-dropdown"
                role="switch"
                aria-checked={showThoughtBlocks}
                onClick={(e) => {
                  e.stopPropagation();
                  onShowThoughtBlocksChange(!showThoughtBlocks);
                }}
                className={cn(
                  'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-1',
                  showThoughtBlocks
                    ? 'bg-blue-600 focus:ring-blue-500'
                    : isLight
                    ? 'bg-gray-200 focus:ring-gray-300'
                    : 'bg-gray-600 focus:ring-gray-500'
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                    showThoughtBlocks ? 'translate-x-4' : 'translate-x-0'
                  )}
                />
              </button>
            </div>
          </div>

          {/* Divider */}
          <div
            className={cn(
              'border-t',
              isLight ? 'border-gray-200' : 'border-gray-700'
            )}
          />

          {/* More Settings Button */}
          <button
            onClick={() => {
              setIsOpen(false);
              onExpandClick();
            }}
            className={cn(
              'w-full px-3 py-2 text-xs font-medium text-left transition-colors flex items-center gap-2',
              isLight
                ? 'text-gray-700 hover:bg-gray-50'
                : 'text-gray-200 hover:bg-gray-700/50'
            )}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            More Settings
          </button>
      </div>
    </div>
  );
};

