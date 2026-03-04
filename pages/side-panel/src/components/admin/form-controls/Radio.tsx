import * as React from 'react';
import { cn } from '@extension/ui';

export interface RadioProps {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  isLight: boolean;
}

export const Radio: React.FC<RadioProps> = ({ name, value, checked, onChange, label, isLight }) => {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <div
        className={cn(
          'w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all',
          checked
            ? 'border-blue-600 bg-blue-600'
            : isLight
            ? 'border-gray-300 bg-white group-hover:border-gray-400'
            : 'border-gray-600 bg-[#151C24] group-hover:border-gray-500',
        )}
      >
        {checked && (
          <div className="w-1.5 h-1.5 rounded-full bg-white" />
        )}
      </div>
      <span
        className={cn(
          'text-xs select-none',
          isLight ? 'text-gray-700 group-hover:text-gray-700' : 'text-gray-300 group-hover:text-[#bcc1c7]',
        )}
      >
        {label}
      </span>
    </label>
  );
};

export default Radio;

