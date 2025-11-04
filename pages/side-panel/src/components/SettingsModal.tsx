import React, { useEffect } from 'react';
import { cn } from '@extension/ui';
import { useStorage } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';

interface SettingsModalProps {
  isOpen: boolean;
  isLight: boolean;
  showAgentCursor: boolean;
  showSuggestions: boolean;
  showThoughtBlocks: boolean;
  onClose: () => void;
  onShowAgentCursorChange: (show: boolean) => void;
  onShowSuggestionsChange: (show: boolean) => void;
  onShowThoughtBlocksChange: (show: boolean) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  isLight,
  showAgentCursor,
  showSuggestions,
  showThoughtBlocks,
  onClose,
  onShowAgentCursorChange,
  onShowSuggestionsChange,
  onShowThoughtBlocksChange,
}) => {
  const { theme } = useStorage(exampleThemeStorage);

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[10000] backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
        <div
          className={cn(
            'w-full max-w-sm rounded-lg shadow-xl',
            isLight
              ? 'bg-gray-50 border border-gray-200'
              : 'bg-[#151C24] border border-gray-700'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className={cn(
              'flex items-center justify-between px-3 py-2 border-b',
              isLight ? 'border-gray-200' : 'border-gray-700'
            )}
          >
            <h2
              className={cn(
                'text-sm font-semibold',
                isLight ? 'text-gray-900' : 'text-gray-100'
              )}
            >
              Settings
            </h2>
            <button
              onClick={onClose}
              className={cn(
                'p-0.5 rounded-md transition-colors',
                isLight
                  ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
              )}
            >
              <svg
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="px-3 py-3 space-y-3">
            {/* Theme Selection */}
            <div className="space-y-1.5">
              <label
                className={cn(
                  'text-xs font-medium',
                  isLight ? 'text-gray-900' : 'text-gray-100'
                )}
              >
                Theme
              </label>
              <div className="flex gap-1.5">
                <button
                  onClick={() => exampleThemeStorage.setTheme('light')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                    theme === 'light'
                      ? 'bg-blue-500 text-white'
                      : isLight
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600'
                  )}
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <span>Light</span>
                </button>
                
                <button
                  onClick={() => exampleThemeStorage.setTheme('dark')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                    theme === 'dark'
                      ? 'bg-blue-500 text-white'
                      : isLight
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600'
                  )}
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                  <span>Dark</span>
                </button>
                
                <button
                  onClick={() => exampleThemeStorage.setTheme('system')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                    theme === 'system'
                      ? 'bg-blue-500 text-white'
                      : isLight
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600'
                  )}
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>System</span>
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className={cn('border-t', isLight ? 'border-gray-200' : 'border-gray-700')} />

            {/* Show Agent Cursor Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <label
                  htmlFor="show-agent-cursor"
                  className={cn(
                    'text-xs font-medium cursor-pointer',
                    isLight ? 'text-gray-900' : 'text-gray-100'
                  )}
                >
                  Show Agent Cursor
                </label>
                <p
                  className={cn(
                    'text-xs mt-0.5',
                    isLight ? 'text-gray-500' : 'text-gray-400'
                  )}
                >
                  Display typing indicator
                </p>
              </div>
              <button
                id="show-agent-cursor"
                role="switch"
                aria-checked={showAgentCursor}
                onClick={() => onShowAgentCursorChange(!showAgentCursor)}
                className={cn(
                  'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-1 ml-3',
                  showAgentCursor
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
                    showAgentCursor ? 'translate-x-4' : 'translate-x-0'
                  )}
                />
              </button>
            </div>

            {/* Divider */}
            <div className={cn('border-t', isLight ? 'border-gray-200' : 'border-gray-700')} />

            {/* Show Suggestions Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <label
                  htmlFor="show-suggestions"
                  className={cn(
                    'text-xs font-medium cursor-pointer',
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
                id="show-suggestions"
                role="switch"
                aria-checked={showSuggestions}
                onClick={() => onShowSuggestionsChange(!showSuggestions)}
                className={cn(
                  'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-1 ml-3',
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

            {/* Divider */}
            <div className={cn('border-t', isLight ? 'border-gray-200' : 'border-gray-700')} />

            {/* Show Thought Blocks Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <label
                  htmlFor="show-thought-blocks"
                  className={cn(
                    'text-xs font-medium cursor-pointer',
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
                  Reveal the assistant's hidden reasoning
                </p>
              </div>
              <button
                id="show-thought-blocks"
                role="switch"
                aria-checked={showThoughtBlocks}
                onClick={() => onShowThoughtBlocksChange(!showThoughtBlocks)}
                className={cn(
                  'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-1 ml-3',
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

          {/* Footer */}
          <div
            className={cn(
              'flex items-center justify-end gap-2 px-3 py-2 border-t',
              isLight ? 'border-gray-200' : 'border-gray-700'
            )}
          >
            <button
              onClick={onClose}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                isLight
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              )}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

