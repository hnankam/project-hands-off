import { useState, useRef } from 'react';
import type { FC, KeyboardEvent, ChangeEvent } from 'react';
import { cn } from '../utils';
import { DropdownMenu, DropdownMenuItem } from './ui/dropdown-menu';

interface CursorChatInputProps {
  isLight?: boolean;
  onSend?: (message: string) => void;
  onImageUpload?: (file: File) => void;
  className?: string;
}

export const CursorChatInput: FC<CursorChatInputProps> = ({
  isLight = false,
  onSend,
  onImageUpload,
  className
}) => {
  const [inputValue, setInputValue] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('Agent');
  const [autoMode, setAutoMode] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (inputValue.trim() && onSend) {
      onSend(inputValue.trim());
      setInputValue('');
    }
  };

  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImageUpload) {
      onImageUpload(file);
    }
  };

  const triggerImageUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={cn('w-full', className)}>
      {/* Main Input Container */}
      <div className={cn(
        'flex items-center rounded-lg border px-3 py-2 transition-colors',
        isLight 
          ? 'border-gray-200 bg-gray-50 hover:border-gray-300' 
          : 'border-gray-600 bg-gray-800 hover:border-gray-500'
      )}>
        {/* @ Symbol */}
        <span className={cn(
          'text-sm font-medium mr-2',
          isLight ? 'text-gray-500' : 'text-gray-400'
        )}>
          @
        </span>

        {/* Tab Indicator */}
        <button className={cn(
          'text-sm font-medium hover:underline mr-2',
          isLight ? 'text-blue-600 hover:text-blue-700' : 'text-blue-400 hover:text-blue-300'
        )}>
          1 Tab
        </button>

        {/* Main Input */}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Plan, search, build anything"
          className={cn(
            'flex-1 bg-transparent text-sm outline-none placeholder:text-sm',
            isLight 
              ? 'text-gray-900 placeholder:text-gray-500' 
              : 'text-gray-100 placeholder:text-gray-400'
          )}
        />

        {/* Image Upload Button */}
        <button
          onClick={triggerImageUpload}
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded transition-colors mr-2',
            isLight 
              ? 'text-gray-500 hover:bg-gray-200 hover:text-gray-700' 
              : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
          )}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={!inputValue.trim()}
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded transition-colors',
            inputValue.trim()
              ? isLight
                ? 'text-gray-700 hover:bg-gray-200'
                : 'text-gray-300 hover:bg-gray-700'
              : isLight
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-600 cursor-not-allowed'
          )}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
        />
      </div>

      {/* Bottom Controls */}
      <div className="mt-2 flex items-center space-x-2 relative">
        {/* Agent Dropdown */}
        <DropdownMenu
          className="dropdown-menu"
          trigger={
            <button
              className={cn(
                'flex items-center text-xs font-medium transition-colors',
                isLight 
                  ? 'text-gray-700 hover:text-gray-900' 
                  : 'text-gray-300 hover:text-gray-100'
              )}
            >
              <svg className="mr-1 h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {selectedAgent}
              <svg className="ml-1 h-2 w-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          }
        >
          <div className="px-1.5 py-0.5 text-xs text-gray-500 dark:text-gray-400">
            ⌘. to switch modes
          </div>
          <DropdownMenuItem onClick={() => setSelectedAgent('Agent')}>
            <div className="flex items-center">
              <svg className="mr-1.5 h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Agent
              <span className="ml-auto text-xs text-gray-500">⌘I</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSelectedAgent('Background')}>
            <div className="flex items-center">
              <svg className="mr-1.5 h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
              Background
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSelectedAgent('Ask')}>
            <div className="flex items-center">
              <svg className="mr-1.5 h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Ask
            </div>
          </DropdownMenuItem>
        </DropdownMenu>

        {/* Auto Dropdown */}
        <DropdownMenu
          className="dropdown-menu"
          trigger={
            <button
              className={cn(
                'flex items-center text-xs font-medium transition-colors',
                isLight 
                  ? 'text-gray-700 hover:text-gray-900' 
                  : 'text-gray-300 hover:text-gray-100'
              )}
            >
              Auto
              <svg className="ml-1 h-2 w-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          }
        >
          <div className="px-1.5 py-0.5 text-xs text-gray-500 dark:text-gray-400">
            ⌘/ to switch models
          </div>
          <div className="flex items-center justify-between px-1.5 py-0.5">
            <span className="text-xs text-gray-700 dark:text-gray-300">Auto</span>
            <button
              onClick={() => setAutoMode(!autoMode)}
              className={cn(
                'relative inline-flex h-3 w-6 items-center rounded-full transition-colors',
                autoMode 
                  ? 'bg-green-500' 
                  : isLight 
                    ? 'bg-gray-300' 
                    : 'bg-gray-600'
              )}
            >
              <span
                className={cn(
                  'inline-block h-2 w-2 transform rounded-full bg-white transition-transform',
                  autoMode ? 'translate-x-2.5' : 'translate-x-0.5'
                )}
              />
            </button>
          </div>
          <div className="px-1.5 py-0.5 text-xs text-gray-500 dark:text-gray-400">
            Balanced quality and speed, recommended for most tasks
          </div>
        </DropdownMenu>
      </div>
    </div>
  );
};
