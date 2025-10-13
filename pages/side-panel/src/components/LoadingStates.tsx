import React from 'react';
import type { FC } from 'react';
import { LoadingSpinner } from '@extension/ui';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
  animate?: boolean;
}

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
  animate = true 
}) => {
  const baseClasses = 'bg-gray-200 dark:bg-gray-700';
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
export const ChatMessageSkeleton: FC<{ isUser?: boolean }> = ({ isUser = false }) => {
  return (
    <div className={`flex gap-3 mb-4 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar skeleton */}
      <Skeleton width={32} height={32} rounded className="flex-shrink-0" />
      
      {/* Message content skeleton */}
      <div className={`flex-1 max-w-[80%] ${isUser ? 'items-end' : ''}`}>
        <div className="space-y-2">
          {/* Message text lines */}
          <Skeleton height={16} width="85%" />
          <Skeleton height={16} width="60%" />
          {Math.random() > 0.5 && <Skeleton height={16} width="75%" />}
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
export const ChatSkeleton: FC = () => {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header skeleton */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <Skeleton width={20} height={20} rounded />
          <Skeleton width={120} height={16} />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton width={24} height={24} rounded />
          <Skeleton width={24} height={24} rounded />
          <Skeleton width={24} height={24} rounded />
        </div>
      </div>
      
      {/* Messages area skeleton */}
      <div className="flex-1 p-4 space-y-4 overflow-hidden">
        {/* Assistant messages */}
        <ChatMessageSkeleton isUser={false} />
        <ChatMessageSkeleton isUser={false} />
        
        {/* User message */}
        <ChatMessageSkeleton isUser={true} />
        
        {/* More assistant messages */}
        <ChatMessageSkeleton isUser={false} />
        <ChatMessageSkeleton isUser={false} />
      </div>
      
      {/* Input area skeleton */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <Skeleton height={40} className="flex-1 rounded-full" />
          <Skeleton width={40} height={40} rounded />
        </div>
      </div>
    </div>
  );
};

/**
 * SessionTabsSkeleton Component
 * 
 * Skeleton for session tabs
 */
export const SessionTabsSkeleton: FC = () => {
  return (
    <div className="flex gap-2 p-2 border-t border-gray-200 dark:border-gray-700">
      <Skeleton width={80} height={28} className="rounded-full" />
      <Skeleton width={100} height={28} className="rounded-full" />
      <Skeleton width={90} height={28} className="rounded-full" />
    </div>
  );
};

/**
 * StatusBarSkeleton Component
 * 
 * Skeleton for the status bar
 */
export const StatusBarSkeleton: FC = () => {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-4 flex-1">
        <Skeleton width={40} height={12} />
        <Skeleton width={120} height={12} />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton width={24} height={24} rounded />
        <Skeleton width={24} height={24} rounded />
        <Skeleton width={24} height={24} rounded />
      </div>
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
