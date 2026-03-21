import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@extension/ui';
import { WORKSPACE_CREDENTIAL_TYPES } from '../../../constants/workspaceCredentialTypes';

export interface WorkspaceCredentialTypeDropdownProps {
  value: string;
  onChange: (type: string) => void;
  isLight: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Compact button + menu (same pattern as SupportRequestModal / workspace Credentials type).
 */
export const WorkspaceCredentialTypeDropdown: React.FC<WorkspaceCredentialTypeDropdownProps> = ({
  value,
  onChange,
  isLight,
  disabled = false,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [open]);

  const label = value || 'Select type…';

  return (
    <div className={cn('relative w-full min-w-0', className)} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={cn(
          'flex min-h-[32px] w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors',
          disabled && 'cursor-not-allowed opacity-50',
          isLight
            ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
            : 'border-gray-600 bg-[#151C24] text-gray-200 hover:bg-gray-700',
        )}>
        <span className="min-w-0 flex-1 truncate text-left font-medium">{label}</span>
        <svg
          className={cn('h-3 w-3 flex-shrink-0 transition-transform', open ? 'rotate-180' : '')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
          aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          className={cn(
            'absolute top-full right-0 left-0 z-[80] mt-1 max-h-[220px] overflow-y-auto rounded-md border shadow-lg',
            isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-[#151C24]',
          )}>
          <button
            type="button"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
            className={cn(
              'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors',
              !value
                ? isLight
                  ? 'bg-blue-50 font-medium text-blue-700'
                  : 'bg-blue-900/30 font-medium text-blue-300'
                : isLight
                  ? 'text-gray-500 hover:bg-gray-100'
                  : 'text-gray-400 hover:bg-gray-700',
            )}>
            Select type…
          </button>
          {WORKSPACE_CREDENTIAL_TYPES.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors',
                value === opt
                  ? isLight
                    ? 'bg-blue-50 font-medium text-blue-700'
                    : 'bg-blue-900/30 font-medium text-blue-300'
                  : isLight
                    ? 'text-gray-700 hover:bg-gray-100'
                    : 'text-gray-200 hover:bg-gray-700',
              )}>
              <span className="min-w-0 flex-1 truncate">{opt}</span>
              {value === opt && (
                <svg className="h-3 w-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
