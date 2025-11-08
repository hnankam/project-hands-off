import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@extension/ui';

interface ModelOption {
  id: string;
  name: string;
  enabled?: boolean;
  modelKey?: string;
}

interface ModelMultiSelectorProps {
  isLight: boolean;
  models: ModelOption[];
  selectedModelIds: string[];
  onChange: (modelIds: string[]) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  loading?: boolean;
}

const ModelIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

export const ModelMultiSelector: React.FC<ModelMultiSelectorProps> = ({
  isLight,
  models,
  selectedModelIds,
  onChange,
  placeholder = 'All models',
  allowEmpty = true,
  disabled = false,
  loading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

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

  // Detect if dropdown should open upward
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - buttonRect.bottom;
      const dropdownHeight = 240; // Max height of dropdown
      
      setOpenUpward(spaceBelow < dropdownHeight && buttonRect.top > dropdownHeight);
    }
  }, [isOpen]);

  if (loading) {
    return (
      <div
        className={cn(
          'h-[34px] w-full rounded-md border animate-pulse',
          isLight ? 'border-gray-200 bg-gray-100' : 'border-gray-700 bg-gray-800',
        )}
      />
    );
  }

  if (disabled) {
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md min-h-[32px] border opacity-60',
          isLight ? 'bg-white border-gray-300 text-gray-500' : 'bg-[#151C24] border-gray-600 text-gray-400',
        )}
      >
        <span className="flex-shrink-0 mt-0.5">
          <ModelIcon />
        </span>
        <span className="truncate flex-1 text-left">{placeholder}</span>
      </div>
    );
  }

  const toggleModel = (modelId: string) => {
    const newSelection = selectedModelIds.includes(modelId)
      ? selectedModelIds.filter(id => id !== modelId)
      : [...selectedModelIds, modelId];
    onChange(newSelection);
  };

  const removeModel = (modelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelection = selectedModelIds.filter(id => id !== modelId);
    onChange(newSelection);
  };

  const selectedModels = models.filter(model => selectedModelIds.includes(model.id));

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-start gap-1.5 px-2 py-1.5 text-xs rounded-md min-h-[32px] min-w-0 w-full border',
          isLight
            ? 'text-gray-700 hover:bg-gray-100 border-gray-300 bg-white'
            : 'text-gray-200 hover:bg-gray-700 border-gray-600 bg-[#151C24]',
        )}
      >
        <span className="flex-shrink-0 mt-0.5">
          <ModelIcon />
        </span>
        
        {selectedModels.length > 0 ? (
          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
            {selectedModels.map(model => (
              <span
                key={model.id}
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
                  isLight
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-blue-900/30 text-blue-400'
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {model.name}
                <button
                  type="button"
                  onClick={(e) => removeModel(model.id, e)}
                  className={cn(
                    'hover:bg-black/10 rounded-full p-0.5 transition-colors',
                    isLight ? 'text-blue-600' : 'text-blue-300'
                  )}
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        ) : (
          <span className={cn('flex-1 min-w-0 text-left', isLight ? 'text-gray-500' : 'text-gray-400')}>
            {placeholder}
          </span>
        )}
        
        <svg
          className={cn(
            'transition-transform flex-shrink-0 mt-0.5',
            isOpen ? 'rotate-180' : ''
          )}
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute left-0 w-full min-w-[180px] rounded-md border shadow-lg z-[9999] max-h-[240px] overflow-y-auto',
            openUpward ? 'bottom-full mb-1' : 'top-full mt-1',
            isLight
              ? 'bg-white border-gray-200'
              : 'bg-[#151C24] border-gray-700'
          )}
        >
          {models.length === 0 ? (
            <div className={cn('px-3 py-2 text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
              No models available
            </div>
          ) : (
            models.map(model => {
              const isSelected = selectedModelIds.includes(model.id);
              return (
                <button
                  type="button"
                  key={model.id}
                  onClick={() => toggleModel(model.id)}
                  className={cn(
                    'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs transition-colors text-left',
                    isLight
                      ? 'text-gray-700 hover:bg-gray-100'
                      : 'text-gray-200 hover:bg-gray-700'
                  )}
                >
                  <div className={cn(
                    'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0',
                    isSelected
                      ? 'bg-blue-600 border-blue-600'
                      : isLight
                      ? 'border-gray-300'
                      : 'border-gray-600'
                  )}>
                    {isSelected && (
                      <svg
                        width="10"
                        height="10"
                        fill="none"
                        stroke="white"
                        viewBox="0 0 24 24"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <ModelIcon />
                  <span className="truncate flex-1">{model.name}</span>
                  {model.enabled === false && (
                    <span
                      className={cn(
                        'text-[10px] px-1 py-0.5 rounded font-medium',
                        isLight ? 'bg-gray-100 text-gray-500' : 'bg-gray-800 text-gray-400',
                      )}
                    >
                      Disabled
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

