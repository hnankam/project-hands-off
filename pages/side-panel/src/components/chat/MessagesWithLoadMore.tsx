/**
 * LoadMoreHistoryBar
 *
 * A bar with "Load older messages" button for paginated history.
 * Renders above the chat content; user clicks to load more.
 */

import * as React from 'react';
import { cn } from '@extension/ui';

export interface LoadMoreHistoryBarProps {
  onLoadMore: () => void;
  isLoading: boolean;
  hasMore: boolean;
  isLight?: boolean;
  /** Hide when there are no messages (nothing to paginate) */
  hasMessages?: boolean;
  /** Error message from last load attempt */
  error?: string | null;
}

export const LoadMoreHistoryBar: React.FC<LoadMoreHistoryBarProps> = ({
  onLoadMore,
  isLoading,
  hasMore,
  isLight = true,
  hasMessages = true,
  error = null,
}) => {
  if (!hasMore || !hasMessages) return null;

  return (
    <div
      className={cn(
        'flex-shrink-0 flex flex-col justify-center items-center py-2 border-b gap-1 pointer-events-auto',
        isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-gray-800/50'
      )}
    >
      {error && (
        <span
          className={cn(
            'text-xs',
            isLight ? 'text-red-600' : 'text-red-400'
          )}
        >
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onLoadMore();
        }}
        disabled={isLoading}
        className={cn(
          'px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer',
          isLight
            ? 'text-gray-600 hover:bg-gray-200 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed'
            : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        {isLoading ? 'Loading...' : 'Load older messages'}
      </button>
    </div>
  );
};
