import React from 'react';
import { cn } from '@extension/ui';

export interface CheckboxProps {
  name?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  isLight: boolean;
  disabled?: boolean;
}

export const Checkbox: React.FC<CheckboxProps> = ({ name, checked, onChange, label, isLight, disabled = false }) => {
  return (
    <label className={cn('flex items-center gap-2 group', disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer')}>
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
        className="sr-only"
      />
      <div
        className={cn(
          'w-4 h-4 rounded border-2 flex items-center justify-center transition-all',
          checked
            ? 'border-blue-600 bg-blue-600'
            : isLight
            ? 'border-gray-300 bg-white group-hover:border-gray-400'
            : 'border-gray-600 bg-[#151C24] group-hover:border-gray-500',
          disabled && 'group-hover:border-gray-300 dark:group-hover:border-gray-600',
        )}
      >
        {checked && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      {label && (
        <span
          className={cn(
            'text-xs select-none',
            isLight ? 'text-gray-700 group-hover:text-gray-700' : 'text-gray-300 group-hover:text-[#bcc1c7]',
            disabled && 'group-hover:text-gray-700 dark:group-hover:text-gray-300',
          )}
        >
          {label}
        </span>
      )}
    </label>
  );
};

export default Checkbox;

