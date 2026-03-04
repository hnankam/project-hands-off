import * as React from 'react';
import { useState, useRef } from 'react';
import { cn } from '@extension/ui';
import { useClickOutside, useDropdownPosition } from '../hooks';
import { ModelIcon, ChevronDownIcon, CloseIcon } from '../icons';
import { CheckmarkIcon } from '../icons/CheckIcon';
import { SelectorSkeleton } from '../skeletons';
import type { ModelOption } from '../types';

export interface ModelMultiSelectorProps {
  isLight: boolean;
  models: ModelOption[];
  selectedModelIds: string[];
  onChange: (modelIds: string[]) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  loading?: boolean;
}

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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownPosition = useDropdownPosition(buttonRef, isOpen);

  useClickOutside(dropdownRef, () => setIsOpen(false), isOpen);

  if (loading) {
    return <SelectorSkeleton isLight={isLight} />;
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
                  <CloseIcon size={10} strokeWidth={3} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <span className={cn('flex-1 min-w-0 text-left', isLight ? 'text-gray-500' : 'text-gray-400')}>
            {placeholder}
          </span>
        )}
        
        <ChevronDownIcon isOpen={isOpen} className="flex-shrink-0 mt-0.5" />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute left-0 w-full min-w-[180px] rounded-md border shadow-lg z-[9999] max-h-[240px] overflow-y-auto',
            dropdownPosition === 'up' ? 'bottom-full mb-1' : 'top-full mt-1',
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
                      <CheckmarkIcon size={10} strokeWidth={3} className="text-white" />
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

export default ModelMultiSelector;

