import * as React from 'react';
import { useState } from 'react';
import { cn } from '@extension/ui';
import { SkillIcon } from '../icons';
import { CustomMarkdownRenderer } from '../../chat/CustomMarkdownRenderer';

export interface SkillResource {
  name: string;
  content: string;
}

export interface SkillResourceListEditorProps {
  resources: SkillResource[];
  onChange: (resources: SkillResource[]) => void;
  isLight: boolean;
  disabled?: boolean;
  title?: string;
}

export const SkillResourceListEditor: React.FC<SkillResourceListEditorProps> = ({
  resources,
  onChange,
  isLight,
  disabled = false,
  title,
}) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [resourceViewModes, setResourceViewModes] = useState<Record<number, 'edit' | 'preview'>>({});

  const setResourceViewMode = (idx: number, mode: 'edit' | 'preview') => {
    setResourceViewModes((p) => ({ ...p, [idx]: mode }));
  };

  const addResource = () => {
    onChange([...resources, { name: '', content: '' }]);
    setExpandedIndex(resources.length);
  };

  const removeResource = (index: number) => {
    const next = resources.filter((_, i) => i !== index);
    onChange(next);
    if (expandedIndex === index) {
      setExpandedIndex(null);
    } else if (expandedIndex !== null && expandedIndex > index) {
      setExpandedIndex(expandedIndex - 1);
    }
  };

  const updateResource = (index: number, updates: Partial<SkillResource>) => {
    const next = resources.map((r, i) => (i === index ? { ...r, ...updates } : r));
    onChange(next);
  };

  if (disabled) {
    return (
      <div
        className={cn(
          'rounded-lg border p-3',
          isLight ? 'bg-gray-50 border-gray-200 text-gray-500' : 'bg-gray-800/30 border-gray-700 text-gray-400',
        )}
      >
        <p className="text-xs">Resources (add name and content for each)</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        {title ? (
          <span className={cn('text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>{title}</span>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={addResource}
          className={cn(
            'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
            isLight ? 'text-blue-600 hover:bg-blue-50' : 'text-blue-400 hover:bg-blue-900/20',
          )}
        >
          <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Resource
        </button>
      </div>

      <p className={cn('text-[10px]', isLight ? 'text-gray-500' : 'text-gray-400')}>
        Add reference documentation, forms, or other resources for this skill.
      </p>

      {resources.length === 0 ? (
        <div
          className={cn(
            'text-xs text-center py-3 rounded-lg border border-dashed',
            isLight ? 'text-gray-400 border-gray-200 bg-gray-50' : 'text-gray-500 border-gray-700 bg-gray-800/50',
          )}
        >
          No resources configured
        </div>
      ) : (
        <div className="space-y-2">
          {resources.map((resource, idx) => (
            <div
              key={idx}
              className={cn(
                'rounded-lg border',
                isLight ? 'bg-gray-50 border-gray-200' : 'bg-gray-800/50 border-gray-700',
              )}
            >
              <button
                type="button"
                onClick={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-1.5 rounded-t-lg transition-colors',
                  isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-800',
                )}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <svg
                    className={cn(
                      'w-3 h-3 transition-transform flex-shrink-0',
                      expandedIndex === idx ? 'rotate-90' : '',
                    )}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <SkillIcon className="flex-shrink-0" size={14} />
                  <input
                    type="text"
                    value={resource.name}
                    onChange={(e) => {
                      e.stopPropagation();
                      updateResource(idx, { name: e.target.value });
                    }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Resource name (e.g. reference, FORMS.md)"
                    className={cn(
                      'flex-1 min-w-0 text-xs font-medium bg-transparent border-none outline-none text-left',
                      isLight ? 'text-gray-700 placeholder-gray-400' : 'text-gray-300 placeholder-gray-500',
                    )}
                  />
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeResource(idx);
                  }}
                  className={cn(
                    'p-1 rounded transition-colors flex-shrink-0',
                    isLight
                      ? 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                      : 'text-gray-500 hover:text-red-400 hover:bg-red-900/20',
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
              </button>
              <div
                className={cn(
                  'overflow-hidden transition-all ease-in-out',
                  expandedIndex === idx ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0',
                )}
              >
                <div
                  className={cn('border-t px-3 pb-3 pt-2', isLight ? 'border-gray-200' : 'border-gray-700')}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label className={cn('text-xs font-medium', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      Content
                    </label>
                    <div
                      className={cn(
                        'inline-flex rounded-lg p-0.5',
                        isLight ? 'bg-gray-100' : 'bg-gray-800/50',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setResourceViewMode(idx, 'preview')}
                        title="Preview rendered markdown"
                        className={cn(
                          'p-1 rounded-lg transition-colors',
                          (resourceViewModes[idx] ?? 'edit') === 'preview'
                            ? isLight
                              ? 'bg-white border border-gray-200 shadow-sm'
                              : 'bg-gray-700 border border-gray-600'
                            : isLight
                              ? 'text-gray-500 hover:text-gray-700'
                              : 'text-gray-400 hover:text-gray-300',
                        )}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => setResourceViewMode(idx, 'edit')}
                        title="Edit markdown source"
                        className={cn(
                          'p-1 rounded-lg transition-colors',
                          (resourceViewModes[idx] ?? 'edit') === 'edit'
                            ? isLight
                              ? 'bg-white border border-gray-200 shadow-sm'
                              : 'bg-gray-700 border border-gray-600'
                            : isLight
                              ? 'text-gray-500 hover:text-gray-700'
                              : 'text-gray-400 hover:text-gray-300',
                        )}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  {(resourceViewModes[idx] ?? 'edit') === 'edit' && (
                    <textarea
                      rows={6}
                      value={resource.content}
                      onChange={(e) => updateResource(idx, { content: e.target.value })}
                      placeholder="Enter resource content (markdown supported)..."
                      className={cn(
                        'w-full px-3 py-2 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500 resize-y json-textarea font-mono',
                        isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                      )}
                    />
                  )}
                  {(resourceViewModes[idx] ?? 'edit') === 'preview' && (
                    <div
                      className={cn(
                        'rounded-lg border overflow-auto text-xs p-3 min-h-[80px] max-h-[300px] skills-rendered-scrollbar',
                        isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-600',
                        !isLight && 'dark',
                      )}
                    >
                      {resource.content ? (
                        <CustomMarkdownRenderer
                          content={resource.content}
                          isLight={isLight}
                          hideToolbars={true}
                          className="agent-instructions-markdown"
                        />
                      ) : (
                        <span className={cn(isLight ? 'text-gray-400' : 'text-gray-500')}>
                          No content yet. Switch to edit mode to add content.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SkillResourceListEditor;
