import React, { useMemo } from 'react';
import type { FC } from 'react';
import { LoadingSpinner, cn } from '@extension/ui';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
  animate?: boolean;
  isLight?: boolean;
}

const seededRandom = (seed: string): number => {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/**
 * Skeleton Component
 * 
 * Provides a loading placeholder with shimmer animation
 */
export const Skeleton: FC<SkeletonProps> = ({ 
  className = '', 
  width = '100%', 
  height = '1rem', 
  rounded = false,
  animate = true,
  isLight,
}) => {
  const baseClasses =
    typeof isLight === 'boolean'
      ? isLight
        ? 'bg-gray-200'
        : 'bg-gray-700'
      : 'bg-gray-200 dark:bg-gray-700';
  const roundedClasses = rounded ? 'rounded-full' : 'rounded';
  const animateClasses = animate ? 'animate-pulse' : '';
  
  return (
    <div
      className={`${baseClasses} ${roundedClasses} ${animateClasses} ${className}`}
      style={{ width, height }}
    />
  );
};

/**
 * ChatMessageSkeleton Component
 * 
 * Skeleton for individual chat messages
 */
interface ChatMessageSkeletonProps {
  seed?: string;
  isLight?: boolean;
}

const buildLineWidths = (seed: string, count: number): string[] => {
  const widths: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const rand = seededRandom(`${seed}-line-${i}`);
    const width = 0.6 + rand * 0.35; // 60% → 95%
    widths.push(`${Math.round(width * 100)}%`);
  }
  return widths;
};

const buildFooterWidth = (seed: string): string => {
  const width = 0.35 + seededRandom(`${seed}-footer-width`) * 0.3; // 35% → 65%
  return `${Math.round(width * 100)}%`;
};

export const ChatMessageSkeleton: FC<ChatMessageSkeletonProps> = ({ seed, isLight = true }) => {
  const resolvedSeed = seed ?? 'message-default';
  const lineCount = 4;
  const lineWidths = useMemo(() => buildLineWidths(resolvedSeed, lineCount), [resolvedSeed, lineCount]);
  const showFooter = useMemo(() => seededRandom(`${resolvedSeed}-footer`) > 0.4, [resolvedSeed]);
  const footerWidth = useMemo(() => buildFooterWidth(resolvedSeed), [resolvedSeed]);

  return (
    <div
      className={cn(
        'relative w-full rounded-xl border px-4 py-3 shadow-sm transition-colors duration-200',
        'ring-1 ring-black/0 backdrop-blur-[1px]',
        isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-[#0C1117]',
      )}
    >
      <div className="space-y-2">
        {lineWidths.map((width, index) => (
          <Skeleton key={index} height={12} width={width} isLight={isLight} />
        ))}
        {showFooter && <Skeleton height={10} width={footerWidth} className="opacity-70" isLight={isLight} />}
      </div>
    </div>
  );
};

const TaskProgressSkeleton: FC<{ seed?: string; isLight?: boolean }> = ({ seed = 'task-progress', isLight = true }) => {
  const stepWidths = useMemo(
    () => Array.from({ length: 3 }, (_, index) => `${Math.round((0.55 + seededRandom(`${seed}-step-${index}`) * 0.35) * 100)}%`),
    [seed],
  );

  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3 shadow-sm',
        isLight ? 'border-blue-200/70 bg-blue-50/70' : 'border-blue-900/50 bg-blue-900/15',
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <Skeleton height={12} width="45%" isLight={isLight} />
        <Skeleton height={10} width="18%" className="opacity-70" isLight={isLight} />
      </div>
      <div className="space-y-2">
        {stepWidths.map((width, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton width={18} height={18} rounded isLight={isLight} />
            <Skeleton height={10} width={width} isLight={isLight} />
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Skeleton height={8} width="100%" className="rounded-full opacity-40" animate={false} isLight={isLight} />
        <Skeleton
          height={8}
          width={`${Math.round((0.45 + seededRandom(`${seed}-progress`) * 0.4) * 100)}%`}
          className="-mt-2 rounded-full"
          isLight={isLight}
        />
      </div>
    </div>
  );
};

const ComposerSkeleton: FC<{ isLight?: boolean }> = ({ isLight = true }) => {
  return (
    <div className={cn('border-t', isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-[#0C1117]')}>
      <div className="px-3 pt-3 pt-2 mb-2">
        <Skeleton height={85} className="rounded-xl" isLight={isLight} />
      </div>
      {/* Disclaimer skeleton */}
      <div className="flex justify-center pb-4">
        <Skeleton height={10} width={280} className="opacity-50" isLight={isLight} />
      </div>
    </div>
  );
};

export const SelectorsBarSkeleton: FC<{ isLight?: boolean }> = ({ isLight = true }) => {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 border-t px-2 py-1.5',
        isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Skeleton width={150} height={32} className="rounded-lg" isLight={isLight} />
        <Skeleton width={150} height={32} className="rounded-lg" isLight={isLight} />
      </div>
      <Skeleton width={120} height={32} className="rounded-lg" isLight={isLight} />
    </div>
  );
};

/**
 * StatusBarSkeleton Component
 * 
 * Skeleton for the status bar
 */
export const StatusBarSkeleton: FC<{ isLight?: boolean }> = ({ isLight = true }) => {
  return (
    <div
      className={cn(
        'flex h-[34px] items-center justify-between gap-2 border-b px-2 py-1',
        isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex flex-col gap-1 text-[10px] leading-tight">
          <Skeleton width={60} height={10} isLight={isLight} />
          <Skeleton width={70} height={10} className="opacity-70" isLight={isLight} />
        </div>
        <div className={cn('h-6 w-px', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
        <div className="flex-1">
          <Skeleton height={12} className="w-full" isLight={isLight} />
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Skeleton width={26} height={26} className="rounded-md" isLight={isLight} />
      </div>
    </div>
  );
};

/**
 * MessagesOnlySkeleton Component
 * 
 * Skeleton for just the messages area (no status bar, no selectors)
 * This should match the messages section of ChatSkeleton for consistency
 */
export const MessagesOnlySkeleton: FC<{ isLight?: boolean }> = ({ isLight }) => {
  const resolvedIsLight = typeof isLight === 'boolean' ? isLight : !document.documentElement.classList.contains('dark');

  return (
    <div className={cn('flex h-full flex-col overflow-hidden', resolvedIsLight ? 'bg-white' : 'bg-[#0C1117]')}>
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <div className="flex h-full flex-col overflow-hidden">
            <div className="flex-1 overflow-y-hidden px-3 pb-6 pt-4">
              <div className="flex h-full flex-col gap-4">
                <TaskProgressSkeleton isLight={resolvedIsLight} />
                <ChatMessageSkeleton seed="message-1" isLight={resolvedIsLight} />
                <ChatMessageSkeleton seed="message-2" isLight={resolvedIsLight} />
                <ChatMessageSkeleton seed="message-3" isLight={resolvedIsLight} />
                <ChatMessageSkeleton seed="message-4" isLight={resolvedIsLight} />
                <ChatMessageSkeleton seed="message-5" isLight={resolvedIsLight} />
              </div>
            </div>
            <ComposerSkeleton isLight={resolvedIsLight} />
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * ChatSkeleton Component
 * 
 * Complete chat interface skeleton
 */
export const ChatSkeleton: FC<{ isLight?: boolean }> = ({ isLight }) => {
  const resolvedIsLight = typeof isLight === 'boolean' ? isLight : !document.documentElement.classList.contains('dark');

  return (
    <div className={cn('flex h-full flex-col overflow-hidden', resolvedIsLight ? 'bg-white' : 'bg-[#0C1117]')}>
      <StatusBarSkeleton isLight={resolvedIsLight} />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <div className="flex h-full flex-col overflow-hidden">
            <div className="flex-1 overflow-y-hidden px-3 pb-6 pt-4">
              <div className="flex h-full flex-col gap-4">
                <TaskProgressSkeleton isLight={resolvedIsLight} />
                <ChatMessageSkeleton seed="message-1" isLight={resolvedIsLight} />
                <ChatMessageSkeleton seed="message-2" isLight={resolvedIsLight} />
                <ChatMessageSkeleton seed="message-3" isLight={resolvedIsLight} />
                <ChatMessageSkeleton seed="message-4" isLight={resolvedIsLight} />
                <ChatMessageSkeleton seed="message-5" isLight={resolvedIsLight} />
              </div>
            </div>
            <ComposerSkeleton isLight={resolvedIsLight} />
          </div>
        </div>
      </div>
      <SelectorsBarSkeleton isLight={resolvedIsLight} />
    </div>
  );
};

/**
 * SessionTabsSkeleton Component
 * 
 * Skeleton for session tabs
 */
export const SessionTabsSkeleton: FC<{ isLight?: boolean }> = ({ isLight = true }) => {
  return (
    <div
      className={cn(
        'flex gap-2 border-t p-2',
        isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
      )}
    >
      <Skeleton width={80} height={28} className="rounded-full" isLight={isLight} />
      <Skeleton width={100} height={28} className="rounded-full" isLight={isLight} />
      <Skeleton width={90} height={28} className="rounded-full" isLight={isLight} />
    </div>
  );
};

/**
 * ContentLoadingSpinner Component
 * 
 * Loading spinner for content operations
 */
export const ContentLoadingSpinner: FC<{ 
  message?: string; 
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ 
  message = 'Loading content...', 
  size = 'md',
  className = '' 
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };
  
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`${sizeClasses[size]} animate-spin`}>
        <LoadingSpinner />
      </div>
      <span className="text-sm text-gray-600 dark:text-gray-400">{message}</span>
    </div>
  );
};

/**
 * InlineLoadingSpinner Component
 * 
 * Small inline loading spinner
 */
export const InlineLoadingSpinner: FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`inline-flex items-center ${className}`}>
      <div className="w-3 h-3 animate-spin">
        <svg className="w-full h-full text-current" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    </div>
  );
};

/**
 * ButtonLoadingSpinner Component
 * 
 * Loading spinner for buttons
 */
export const ButtonLoadingSpinner: FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`w-4 h-4 animate-spin ${className}`}>
      <svg className="w-full h-full text-current" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    </div>
  );
};

/**
 * PageLoadingOverlay Component
 * 
 * Full page loading overlay
 */
export const PageLoadingOverlay: FC<{ 
  message?: string;
  isVisible: boolean;
}> = ({ 
  message = 'Loading...', 
  isVisible 
}) => {
  if (!isVisible) return null;
  
  return (
    <div className="fixed inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-sm w-full mx-4">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 animate-spin">
            <LoadingSpinner />
          </div>
          <span className="text-gray-900 dark:text-white font-medium">{message}</span>
        </div>
      </div>
    </div>
  );
};

/**
 * ProgressiveLoading Component
 * 
 * Shows loading progress with steps
 */
export const ProgressiveLoading: FC<{
  steps: string[];
  currentStep: number;
  className?: string;
}> = ({ steps, currentStep, className = '' }) => {
  return (
    <div className={`space-y-3 ${className}`}>
      {steps.map((step, index) => (
        <div key={index} className="flex items-center gap-3">
          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium ${
            index < currentStep 
              ? 'bg-green-500 text-white' 
              : index === currentStep 
                ? 'bg-blue-500 text-white animate-pulse' 
                : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
          }`}>
            {index < currentStep ? (
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            ) : (
              index + 1
            )}
          </div>
          <span className={`text-sm ${
            index <= currentStep 
              ? 'text-gray-900 dark:text-white' 
              : 'text-gray-500 dark:text-gray-400'
          }`}>
            {step}
          </span>
        </div>
      ))}
    </div>
  );
};
