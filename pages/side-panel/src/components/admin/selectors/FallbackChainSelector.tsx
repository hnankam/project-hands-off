import * as React from 'react';
import { useState, useRef } from 'react';
import { cn } from '@extension/ui';
import { useClickOutside, useDropdownPosition } from '../hooks';
import { ModelIcon } from '../icons';
import { SelectorSkeleton } from '../skeletons';

export interface FallbackChainModelOption {
  modelKey: string;
  displayName: string;
  enabled?: boolean;
}

export interface FallbackChainSelectorProps {
  isLight: boolean;
  models: FallbackChainModelOption[];
  selectedModelKeys: string[];
  onChange: (modelKeys: string[]) => void;
  excludeModelKey?: string;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
}

export const FallbackChainSelector: React.FC<FallbackChainSelectorProps> = ({
  isLight,
  models,
  selectedModelKeys,
  onChange,
  excludeModelKey,
  placeholder = 'Add fallback models (order: primary → fallbacks)',
  disabled = false,
  loading = false,
}) => {
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownPosition = useDropdownPosition(buttonRef as React.RefObject<HTMLElement>, addDropdownOpen);

  useClickOutside(dropdownRef as React.RefObject<HTMLElement>, () => setAddDropdownOpen(false), addDropdownOpen);

  const availableModels = models.filter(
    m => m.modelKey !== excludeModelKey && !selectedModelKeys.includes(m.modelKey)
  );

  if (loading) {
    return <SelectorSkeleton isLight={isLight} />;
  }

  if (disabled) {
    return (
      <div
        className={cn(
          'rounded-lg border p-3',
          isLight ? 'bg-gray-50 border-gray-200 text-gray-500' : 'bg-gray-800/30 border-gray-700 text-gray-400',
        )}
      >
        <p className="text-xs">{placeholder}</p>
      </div>
    );
  }

  const addModel = (modelKey: string) => {
    onChange([...selectedModelKeys, modelKey]);
    setAddDropdownOpen(false);
  };

  const removeModel = (modelKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedModelKeys.filter(k => k !== modelKey));
  };

  const moveUp = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (index <= 0) return;
    const next = [...selectedModelKeys];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };

  const moveDown = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (index >= selectedModelKeys.length - 1) return;
    const next = [...selectedModelKeys];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  };

  const modelKeyToDisplay = (key: string) => {
    const m = models.find(x => x.modelKey === key);
    return m ? m.displayName || m.modelKey : key;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        <div className="relative" ref={dropdownRef}>
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setAddDropdownOpen(!addDropdownOpen)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
              isLight
                ? 'text-blue-600 hover:bg-blue-50'
                : 'text-blue-400 hover:bg-blue-900/20',
            )}
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Fallback Model
          </button>

          {addDropdownOpen && (
            <div
              className={cn(
                'absolute right-0 min-w-[200px] rounded-md border shadow-lg z-[9999] max-h-[240px] overflow-y-auto',
                dropdownPosition === 'up' ? 'bottom-full mb-1' : 'top-full mt-1',
                isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
              )}
            >
              {availableModels.length === 0 ? (
                <div className={cn('px-3 py-2 text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                  No more models to add
                </div>
              ) : (
                availableModels.map(model => (
                  <button
                    type="button"
                    key={model.modelKey}
                    onClick={() => addModel(model.modelKey)}
                    className={cn(
                      'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs transition-colors text-left',
                      isLight
                        ? 'text-gray-700 hover:bg-gray-100'
                        : 'text-gray-200 hover:bg-gray-700',
                    )}
                  >
                    <ModelIcon />
                    <span className="truncate flex-1">{model.displayName || model.modelKey}</span>
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
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <p className={cn('text-[10px]', isLight ? 'text-gray-500' : 'text-gray-400')}>
        Try these models in sequence if the primary fails. First in the list is primary.
      </p>

      {selectedModelKeys.length === 0 ? (
        <div
          className={cn(
            'text-xs text-center py-3 rounded-lg border border-dashed',
            isLight ? 'text-gray-400 border-gray-200 bg-gray-50' : 'text-gray-500 border-gray-700 bg-gray-800/50',
          )}
        >
          No fallback models configured
        </div>
      ) : (
        <div className="space-y-2">
          {selectedModelKeys.map((key, idx) => (
            <div
              key={key}
              className={cn(
                'flex items-center justify-between px-3 py-2 rounded-lg border',
                isLight ? 'bg-gray-50 border-gray-200' : 'bg-gray-800/50 border-gray-700',
              )}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <ModelIcon className="flex-shrink-0" />
                <span className={cn('text-xs font-medium truncate', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  {modelKeyToDisplay(key)}
                </span>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={e => moveUp(idx, e)}
                  disabled={idx === 0}
                  className={cn(
                    'p-1 rounded transition-colors',
                    idx === 0 ? 'opacity-40 cursor-not-allowed' : isLight ? 'hover:bg-gray-200' : 'hover:bg-gray-700',
                  )}
                  title="Move up"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M18 15l-6-6-6 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={e => moveDown(idx, e)}
                  disabled={idx === selectedModelKeys.length - 1}
                  className={cn(
                    'p-1 rounded transition-colors',
                    idx === selectedModelKeys.length - 1
                      ? 'opacity-40 cursor-not-allowed'
                      : isLight
                        ? 'hover:bg-gray-200'
                        : 'hover:bg-gray-700',
                  )}
                  title="Move down"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={e => removeModel(key, e)}
                  className={cn(
                    'p-1 rounded transition-colors',
                    isLight ? 'text-gray-400 hover:text-red-500 hover:bg-red-50' : 'text-gray-500 hover:text-red-400 hover:bg-red-900/20',
                  )}
                  title="Remove"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FallbackChainSelector;
