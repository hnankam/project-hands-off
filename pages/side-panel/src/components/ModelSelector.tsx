import React from 'react';
import { cn } from '@extension/ui';

interface ModelSelectorProps {
  isLight: boolean;
  selectedModel: string;
  onModelChange: (model: string) => void;
}

const models = [
  { id: 'claude-4.5-haiku', label: 'Claude 4.5 Haiku', provider: 'Anthropic' },
  { id: 'claude-4.5-sonnet', label: 'Claude 4.5 Sonnet', provider: 'Anthropic' },
  { id: 'claude-4.1-opus', label: 'Claude 4.1 Opus', provider: 'Anthropic' },
  { id: 'claude-3.7-sonnet', label: 'Claude 3.7 Sonnet', provider: 'Anthropic' },
  { id: 'claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'Google' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'Google' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', provider: 'Google' },
  { id: 'gpt-5', label: 'GPT-5', provider: 'OpenAI' },
];

export const ModelSelector: React.FC<ModelSelectorProps> = ({ isLight, selectedModel, onModelChange }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
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

  const selectedModelData = models.find(m => m.id === selectedModel) || models[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex h-[26px] min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs',
          isLight ? 'text-gray-700' : 'text-gray-200',
        )}>
        <svg
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}>
          <path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
        <span className="relative min-w-0 flex-1 overflow-hidden truncate font-medium">
          <span className="block truncate">{selectedModelData.label}</span>
          <span
            className={cn(
              'pointer-events-none absolute bottom-0 right-0 top-0 w-8',
              isLight
                ? 'bg-gradient-to-l from-gray-50 via-gray-50/80 to-transparent'
                : 'bg-gradient-to-l from-[#151C24] via-[#151C24]/80 to-transparent',
            )}
          />
        </span>
        <svg
          className={cn('flex-shrink-0 transition-transform', isOpen ? 'rotate-180' : '')}
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round">
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute bottom-full left-0 z-[9999] mb-1 max-h-64 w-full min-w-[200px] overflow-y-auto rounded-md border shadow-lg',
            isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
          )}>
          {models.map(model => (
            <button
              key={model.id}
              onClick={() => {
                onModelChange(model.id);
                setIsOpen(false);
              }}
              className={cn(
                'flex w-full flex-col items-start px-2.5 py-1.5 text-xs transition-colors',
                selectedModel === model.id
                  ? isLight
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-blue-900/30 text-blue-300'
                  : isLight
                    ? 'text-gray-700 hover:bg-gray-100'
                    : 'text-gray-200 hover:bg-gray-700',
              )}>
              <div className="flex w-full items-center justify-between">
                <span className={cn(selectedModel === model.id && 'font-medium')}>{model.label}</span>
                {selectedModel === model.id && (
                  <svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
              <span className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>{model.provider}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
