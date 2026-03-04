import * as React from 'react';
import { cn } from '@extension/ui';

interface CardSkeletonProps {
  isLight: boolean;
  variant?: 'user' | 'team' | 'default';
}

/**
 * Generic card skeleton for loading states
 */
export const CardSkeleton: React.FC<CardSkeletonProps> = ({ isLight, variant = 'default' }) => {
  const baseClasses = cn(
    'rounded-lg border transition-all animate-pulse',
    isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700'
  );

  const skeletonBar = (width: string, height: string = 'h-3') =>
    cn(height, width, 'rounded', isLight ? 'bg-gray-200' : 'bg-gray-700');

  const skeletonBarLight = (width: string, height: string = 'h-2.5') =>
    cn(height, width, 'rounded', isLight ? 'bg-gray-100' : 'bg-gray-800');

  if (variant === 'user') {
    return (
      <div className={cn(baseClasses, 'p-3')}>
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-full', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
          <div className="flex-1 space-y-2">
            <div className={skeletonBar('w-1/3')} />
            <div className={skeletonBarLight('w-1/2')} />
            <div className="flex items-center gap-2">
              <div className={cn('h-2.5 w-16 rounded-full', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
              <div className={cn('h-2.5 w-20 rounded-full', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
            </div>
          </div>
          <div className={cn('h-6 w-6 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
        </div>
      </div>
    );
  }

  if (variant === 'team') {
    return (
      <div className={baseClasses}>
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className={skeletonBar('w-32')} />
            <div className={cn('h-5 w-16 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
          </div>
          <div className={skeletonBarLight('w-24')} />
          <div className="space-y-2">
            <div className={cn('h-2 w-full rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
            <div className={cn('h-2 w-5/6 rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
          </div>
        </div>
      </div>
    );
  }

  // Default skeleton
  return (
    <div className={cn(baseClasses, 'p-4')}>
      <div className="space-y-3">
        <div className={skeletonBar('w-1/2')} />
        <div className={skeletonBarLight('w-3/4')} />
        <div className={skeletonBarLight('w-2/3')} />
      </div>
    </div>
  );
};

/**
 * User skeleton card - convenience export
 */
export const UserSkeletonCard: React.FC<{ isLight: boolean }> = ({ isLight }) => (
  <CardSkeleton isLight={isLight} variant="user" />
);

/**
 * Team skeleton card - convenience export
 */
export const TeamSkeletonCard: React.FC<{ isLight: boolean }> = ({ isLight }) => (
  <CardSkeleton isLight={isLight} variant="team" />
);

export default CardSkeleton;

