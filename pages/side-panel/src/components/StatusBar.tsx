import type { FC, CSSProperties } from 'react';
import React, { memo } from 'react';
import { UsageDisplay } from './UsageDisplay';
import type { CumulativeUsage, UsageData } from '../hooks/useUsageStream';

export interface StatusBarProps {
  isLight: boolean;
  isPanelInteractive: boolean;
  currentTabId: number | null;
  isPanelVisible: boolean;
  contentState: {
    current: any;
    previous: any;
    status: 'none' | 'loading' | 'refreshing' | 'ready' | 'error';
    lastFetch: number;
    error?: string;
  };
  getCurrentTabTitle: () => string;
  onRefreshClick: () => void;
  onSaveClick: () => void;
  onLoadClick: () => void;
  showStaleIndicator: boolean;
  isContentFetching: boolean;
  headlessMessagesCount: number;
  storedMessagesCount: number;
  // Embedding status
  isEmbedding?: boolean;
  embeddingStatus?: string;
  // Usage streaming
  usageData?: {
    lastUsage: UsageData | null;
    cumulativeUsage: CumulativeUsage;
    isConnected: boolean;
  } | null;
  onUsageClick?: () => void;
  // Progress bar toggle
  hasProgressBar?: boolean;
  showProgressBar?: boolean;
  onToggleProgressBar?: () => void;
}

export const StatusBar: FC<StatusBarProps> = memo(({
  isLight,
  isPanelInteractive,
  currentTabId,
  isPanelVisible,
  contentState,
  getCurrentTabTitle,
  onRefreshClick,
  onSaveClick,
  onLoadClick,
  showStaleIndicator,
  isContentFetching,
  headlessMessagesCount,
  storedMessagesCount,
  isEmbedding,
  embeddingStatus,
  usageData,
  onUsageClick,
  hasProgressBar,
  showProgressBar,
  onToggleProgressBar
}) => {
  return (
    <div 
      className={`flex items-center justify-between gap-2 px-2 py-1 border-b h-[34px] ${
        isLight ? 'bg-gray-50 border-gray-200' : 'bg-[#151C24] border-gray-700'
      }`}
      style={{
        '--fade-bg-color': isLight ? '#f9fafb' : '#151C24'
      } as CSSProperties}
    >
      {/* Status indicator with message counters */}
      <div className={`flex items-center gap-3 text-xs flex-1 min-w-0 mr-4 ${
        isLight ? 'text-gray-600' : 'text-gray-400'
      }`}>
        {/* Message counters and usage stacked */}
        <div className="flex flex-col gap-0 flex-shrink-0 text-[10px] leading-[1.1] -my-0.5 items-end">
          {/* Message counters */}
          <span className="whitespace-nowrap">
            <span title="Current Messages">{headlessMessagesCount} ↑</span>
            {' / '}
            <span title="Stored Messages">{storedMessagesCount} ↓</span>
          </span>
          
          {/* Usage display */}
          {usageData && (
            <div className="scale-[0.85] origin-right">
              <UsageDisplay
                lastUsage={usageData.lastUsage}
                cumulativeUsage={usageData.cumulativeUsage}
                isConnected={usageData.isConnected}
                isLight={isLight}
                compact={true}
                onClick={onUsageClick}
              />
            </div>
          )}
        </div>
        
        {/* Separator */}
        <div className={`h-6 w-px ${isLight ? 'bg-gray-300' : 'bg-gray-600'}`} />
        
        {/* Status section */}
        <div className="flex-1 min-w-0">
        {!isPanelInteractive ? (
          <div className={`content-status-indicator flex items-center gap-1 flex-1 min-w-0 ${
            isLight ? 'text-gray-600' : 'text-gray-400'
          }`}>
            <svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20" style={{ flexShrink: 0 }}>
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="min-w-0 flex-1">
              <div className="relative overflow-hidden">
                <span className="block whitespace-nowrap fade-text">
                  {currentTabId ? (
                    <>
                      {getCurrentTabTitle()}
                      <span className="ml-1 opacity-75 text-xs">
                        • ({!isPanelVisible ? 'not visible' : 'click to activate'})
                      </span>
                    </>
                  ) : (
                    'No tab selected • (click to activate)'
                  )}
                </span>
              </div>
            </div>
          </div>
        ) : contentState.status === 'loading' ? (
          <div className={`content-status-indicator flex items-center gap-1 flex-1 min-w-0 ${
            isLight ? 'text-blue-600' : 'text-blue-400'
          }`}>
            <svg className="animate-spin" width="12" height="12" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Loading content...</span>
          </div>
        ) : contentState.status === 'refreshing' ? (
          <div className={`content-status-indicator content-refreshing flex items-center gap-1 flex-1 min-w-0 ${
            isLight ? 'text-orange-600' : 'text-orange-400'
          }`}>
            <svg className="animate-spin" width="12" height="12" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Refreshing...</span>
          </div>
        ) : isEmbedding ? (
          <div className={`content-status-indicator flex items-center gap-1 flex-1 min-w-0 ${
            isLight ? 'text-purple-600' : 'text-purple-400'
          }`}>
            <svg className="animate-spin" width="12" height="12" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{embeddingStatus || 'Generating embeddings...'}</span>
          </div>
        ) : contentState.current ? (
          <div className={`content-status-indicator flex items-center gap-1 flex-1 min-w-0 ${
            isLight ? 'text-green-600' : 'text-green-400'
          }`}>
            <svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20" style={{ flexShrink: 0 }}>
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <div className="min-w-0 flex-1">
              <div className="relative overflow-hidden">
                <span className="block whitespace-nowrap fade-text">
                  {getCurrentTabTitle() || 'Content ready'}
                </span>
              </div>
            </div>
          </div>
        ) : contentState.status === 'error' ? (
          <div className={`content-status-indicator flex items-center gap-1 flex-1 min-w-0 ${
            isLight ? 'text-red-600' : 'text-red-400'
          }`}>
            <svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20" style={{ flexShrink: 0 }}>
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>Error loading content</span>
          </div>
        ) : contentState.status === 'none' ? (
          <div className={`content-status-indicator flex items-center gap-1 flex-1 min-w-0 ${
            isLight ? 'text-blue-600' : 'text-blue-400'
          }`}>
            <svg className="animate-spin" width="12" height="12" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Initializing...</span>
          </div>
        ) : (
          <div className={`content-status-indicator flex items-center gap-1 flex-1 min-w-0 ${
            isLight ? 'text-blue-600' : 'text-blue-400'
          }`}>
            <svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20" style={{ flexShrink: 0 }}>
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Ready for analysis</span>
          </div>
        )}
        </div>
      </div>
      
      {/* Action buttons */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onRefreshClick}
          disabled={isContentFetching}
          className={`relative h-[26px] w-[26px] flex items-center justify-center rounded-md transition-colors ${
            isContentFetching
              ? 'opacity-50 cursor-not-allowed text-gray-400'
              : showStaleIndicator 
                ? isLight
                  ? 'text-orange-600 hover:bg-orange-100'
                  : 'text-orange-400 hover:bg-orange-900/50'
                : isLight
                ? 'text-blue-600 hover:bg-blue-100'
                : 'text-blue-400 hover:bg-blue-900/50'
          }`}
          title={
            isContentFetching
              ? "Refreshing content..."
              : showStaleIndicator 
                ? "Page content has changed - Click to refresh" 
                : "Analyze Current Page"
          }
        >
          <svg className={isContentFetching ? 'animate-spin' : ''} width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {showStaleIndicator && !isContentFetching && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
            </span>
          )}
        </button>
        
        {/* Progress bar toggle - only shown when progress bar exists */}
        {hasProgressBar && (
          <button
            onClick={onToggleProgressBar}
            className={`h-[26px] w-[26px] flex items-center justify-center rounded-md transition-colors ${
              showProgressBar
                ? isLight
                  ? 'text-blue-600 bg-blue-100 hover:bg-blue-200'
                  : 'text-blue-400 bg-blue-900/50 hover:bg-blue-900/70'
                : isLight
                  ? 'text-gray-600 hover:bg-gray-200'
                  : 'text-gray-400 hover:bg-gray-700'
            }`}
            title={showProgressBar ? "Hide Progress Bar" : "Show Progress Bar"}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </button>
        )}
        
        <button
          onClick={onSaveClick}
          className={`h-[26px] w-[26px] flex items-center justify-center rounded-md transition-colors ${
            isLight 
              ? 'text-gray-600 hover:bg-gray-200' 
              : 'text-gray-400 hover:bg-gray-700'
          }`}
          title="Save Messages"
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
        </button>
        <button
          onClick={onLoadClick}
          className={`h-[26px] w-[26px] flex items-center justify-center rounded-md transition-colors ${
            isLight 
              ? 'text-gray-600 hover:bg-gray-200' 
              : 'text-gray-400 hover:bg-gray-700'
          }`}
          title="Load Messages"
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </button>
      </div>
    </div>
  );
});

