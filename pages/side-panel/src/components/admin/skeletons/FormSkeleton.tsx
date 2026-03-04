import * as React from 'react';
import { cn } from '@extension/ui';

interface FormSkeletonProps {
  isLight: boolean;
  fields?: number;
}

/**
 * Generic form skeleton for loading states
 */
export const FormSkeleton: React.FC<FormSkeletonProps> = ({ isLight, fields = 3 }) => {
  const labelSkeleton = cn('h-3 w-24 rounded mb-2 animate-pulse', isLight ? 'bg-gray-200' : 'bg-gray-700');
  const inputSkeleton = cn('h-9 w-full rounded animate-pulse', isLight ? 'bg-gray-100' : 'bg-gray-800');

  return (
    <div className="space-y-4">
      {Array.from({ length: fields }).map((_, index) => (
        <div key={index}>
          <div className={labelSkeleton} />
          <div className={inputSkeleton} />
        </div>
      ))}
    </div>
  );
};

/**
 * Selector skeleton for dropdown loading states
 */
export const SelectorSkeleton: React.FC<{ isLight: boolean }> = ({ isLight }) => (
  <div
    className={cn(
      'h-[34px] w-full rounded-md border animate-pulse',
      isLight ? 'border-gray-200 bg-gray-100' : 'border-gray-700 bg-gray-800'
    )}
  />
);

export default FormSkeleton;

