import type { FC, CSSProperties } from 'react';
import * as React from 'react';
import { memo, useMemo } from 'react';
import { UsageDisplay } from '../menus/UsageDisplay';
import type { CumulativeUsage, UsageData } from '../../hooks/useUsageStream';

/** URL protocols that cannot have content scripts injected */
const RESTRICTED_URL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'about:',
  'edge://',
  'brave://',
  'moz-extension://',
  'opera://',
] as const;

/** Check if a URL is a restricted page where content extraction is not possible */
function isRestrictedPage(url: string | undefined | null): boolean {
  if (!url) return false;
  return RESTRICTED_URL_PREFIXES.some(prefix => url.startsWith(prefix));
}

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
  showStaleIndicator: boolean;
  isContentFetching: boolean;
  userMessagesCount: number;
  assistantMessagesCount: number;
  // Counter visibility
  isCounterReady?: boolean; // Hide counter until messages are stable after hydration
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
  // Current page URL for detecting restricted pages
  currentPageUrl?: string | null;
  // Plans and Graphs panels
  onPlansClick?: (e?: React.MouseEvent) => void;
  onGraphsClick?: (e?: React.MouseEvent) => void;
  hasPlans?: boolean; // Show plans button only if there's at least 1 plan
  hasGraphs?: boolean; // Show graphs button only if there's at least 1 graph
}

export const StatusBar: FC<StatusBarProps> = memo(({
  isLight,
  isPanelInteractive,
  currentTabId,
  isPanelVisible,
  contentState,
  getCurrentTabTitle,
  onRefreshClick,
  showStaleIndicator,
  isContentFetching,
  userMessagesCount,
  assistantMessagesCount,
  isCounterReady = true, // Default to true for backward compatibility
  isEmbedding,
  embeddingStatus,
  usageData,
  onUsageClick,
  currentPageUrl,
  onPlansClick,
  onGraphsClick,
  hasPlans = false,
  hasGraphs = false,
}) => {
  // Get the current page URL from available sources
  const currentUrl = useMemo(() => {
    return contentState.current?.url || contentState.current?.pageURL || currentPageUrl || null;
  }, [contentState.current?.url, contentState.current?.pageURL, currentPageUrl]);

  // Check if we're on a restricted page (chrome://, about:, etc.)
  const isOnRestrictedPage = useMemo(() => {
    return isRestrictedPage(currentUrl);
  }, [currentUrl]);

  // If we have an error but no URL info yet, don't show error (still loading URL info)
  const hasUrlInfo = currentUrl !== null;
  
  // Check if we have valid content (has URL or title) - more reliable than just truthiness check
  const hasValidContent = useMemo(() => {
    const current = contentState.current;
    return current && (current.url || current.pageURL || current.title);
  }, [contentState.current]);
  
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
          {/* Message counters - only show when stable after hydration */}
          {isCounterReady ? (
            <span className="whitespace-nowrap">
              <span title="User Messages">{userMessagesCount} ↑</span>
              {' / '}
              <span title="Assistant Messages">{assistantMessagesCount} ↓</span>
            </span>
          ) : (
            <span className="whitespace-nowrap opacity-50">
              <span title="Loading messages...">-- ↑ / -- ↓</span>
            </span>
          )}
          
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
            <svg width="15" height="15" fill="currentColor" viewBox="0 0 20 20" style={{ flexShrink: 0 }}>
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
            <svg className="animate-spin" width="15" height="15" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Loading content...</span>
          </div>
        ) : contentState.status === 'refreshing' ? (
          <div className={`content-status-indicator content-refreshing flex items-center gap-1 flex-1 min-w-0 ${
            isLight ? 'text-orange-600' : 'text-orange-400'
          }`}>
            <svg className="animate-spin" width="15" height="15" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Refreshing...</span>
          </div>
        ) : isEmbedding ? (
          <div className={`content-status-indicator flex items-center gap-1 flex-1 min-w-0 ${
            isLight ? 'text-purple-600' : 'text-purple-400'
          }`}>
            <svg className="animate-spin" width="15" height="15" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{embeddingStatus || 'Generating embeddings...'}</span>
          </div>
        ) : hasValidContent ? (
          <div className={`content-status-indicator flex items-center gap-1 flex-1 min-w-0 ${
            isLight ? 'text-green-600' : 'text-green-400'
          }`}>
            <svg width="15" height="15" fill="currentColor" viewBox="0 0 20 20" style={{ flexShrink: 0 }}>
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
          isOnRestrictedPage ? (
            // Neutral status for restricted pages (chrome://, about:, etc.)
            <div className={`content-status-indicator flex items-center gap-1 flex-1 min-w-0 ${
              isLight ? 'text-gray-500' : 'text-gray-400'
            }`}>
              <svg width="15" height="15" fill="currentColor" viewBox="0 0 20 20" style={{ flexShrink: 0 }}>
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span>Restricted page</span>
            </div>
          ) : !hasUrlInfo ? (
            // Still waiting for URL info - show loading instead of error
            <div className={`content-status-indicator flex items-center gap-1 flex-1 min-w-0 ${
              isLight ? 'text-blue-600' : 'text-blue-400'
            }`}>
              <svg className="animate-spin" width="15" height="15" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Loading...</span>
            </div>
          ) : (
            // Actual error for regular pages
            <div className={`content-status-indicator flex items-center gap-1 flex-1 min-w-0 ${
              isLight ? 'text-red-600' : 'text-red-400'
            }`}>
              <svg width="15" height="15" fill="currentColor" viewBox="0 0 20 20" style={{ flexShrink: 0 }}>
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>Error loading content</span>
            </div>
          )
        ) : contentState.status === 'none' ? (
          <div className={`content-status-indicator flex items-center gap-1 flex-1 min-w-0 ${
            isLight ? 'text-blue-600' : 'text-blue-400'
          }`}>
            <svg className="animate-spin" width="15" height="15" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Initializing...</span>
          </div>
        ) : (
          <div className={`content-status-indicator flex items-center gap-1 flex-1 min-w-0 ${
            isLight ? 'text-blue-600' : 'text-blue-400'
          }`}>
            <svg width="15" height="15" fill="currentColor" viewBox="0 0 20 20" style={{ flexShrink: 0 }}>
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
                ? 'text-gray-600 hover:bg-gray-200'
                : 'text-gray-400 hover:bg-gray-700'
          }`}
          title={
            isContentFetching
              ? "Refreshing content..."
              : showStaleIndicator 
                ? "Page content has changed - Click to refresh" 
                : "Analyze Current Page"
          }
        >
          <svg 
            className={isContentFetching ? 'animate-spin' : ''} 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            style={{
              width: '13px',
              height: '13px',
              minWidth: '13px',
              minHeight: '13px',
              maxWidth: '13px',
              maxHeight: '13px',
              display: 'block',
              shapeRendering: 'geometricPrecision',
              WebkitFontSmoothing: 'antialiased',
            }}
          >
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {showStaleIndicator && !isContentFetching && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
            </span>
          )}
        </button>
        
        {/* Plans Button */}
        {onPlansClick && hasPlans && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPlansClick(e);
            }}
            className={`h-[26px] w-[26px] flex items-center justify-center rounded-md transition-colors border ${
              isLight
                ? 'text-gray-600 hover:bg-gray-100 border-gray-200'
                : 'text-gray-400 hover:bg-gray-700 border-gray-700'
            }`}
            title="Chat plans"
          >
            <svg 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              style={{
                width: '12px',
                height: '12px',
                minWidth: '12px',
                minHeight: '12px',
              }}
            >
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </button>
        )}
        
        {/* Graphs Button */}
        {onGraphsClick && hasGraphs && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onGraphsClick(e);
            }}
            className={`h-[26px] w-[26px] flex items-center justify-center rounded-md transition-colors border ${
              isLight
                ? 'text-gray-600 hover:bg-gray-100 border-gray-200'
                : 'text-gray-400 hover:bg-gray-700 border-gray-700'
            }`}
            title="Chat graphs"
          >
            <svg 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              style={{
                width: '12px',
                height: '12px',
                minWidth: '12px',
                minHeight: '12px',
              }}
            >
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
});

