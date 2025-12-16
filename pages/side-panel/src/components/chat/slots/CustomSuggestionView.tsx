/**
 * Custom Suggestion View Component for CopilotKit V2
 * 
 * Displays suggestion pills that users can click to send predefined prompts.
 */
import React, { useMemo } from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';

// Types matching CopilotKit's suggestion interface
export interface Suggestion {
  title: string;
  message: string;
  isLoading?: boolean;
}

export interface CustomSuggestionPillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  isLight?: boolean;
  children: React.ReactNode;
}

export interface CustomSuggestionViewProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Array of suggestions to display */
  suggestions: Suggestion[];
  /** Callback when a suggestion is selected */
  onSelectSuggestion?: (suggestion: Suggestion, index: number) => void;
  /** Indexes of suggestions that are loading */
  loadingIndexes?: ReadonlyArray<number>;
  /** Slot override for container component (from CopilotKit) */
  container?: React.ComponentType<React.HTMLAttributes<HTMLDivElement>>;
  /** Slot override for suggestion pill component (from CopilotKit) */
  suggestion?: React.ComponentType<CustomSuggestionPillProps>;
}

/**
 * Custom suggestion pill component
 * Background matches status bar/session header: #f9fafb (light) / #151C24 (dark)
 */
export const CustomSuggestionPill: React.FC<CustomSuggestionPillProps> = ({
  isLoading,
  isLight = false,
  children,
  className = '',
  disabled,
  style,
  ...props
}) => {
  // Theme-aware colors matching status bar/session header
  const colors = isLight
    ? {
        bg: '#f9fafb',        // bg-gray-50 - matches status bar/session header
        hoverBg: '#e5e7eb',
        text: '#374151',
        border: '#e5e7eb',
      }
    : {
        bg: '#151C24',        // Matches status bar/session header
        hoverBg: '#2d333b',
        text: '#d1d5db',
        border: '#374151',    // Matches user message border
      };

  return (
    <button
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-150 pointer-events-auto disabled:opacity-50 disabled:cursor-not-allowed ${isLoading ? 'animate-pulse' : ''} ${className}`.trim()}
      disabled={disabled || isLoading}
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = colors.hoverBg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = colors.bg;
      }}
      {...props}
    >
      {isLoading && (
        <svg 
          className="animate-spin h-3 w-3" 
          xmlns="http://www.w3.org/2000/svg" 
          fill="none" 
          viewBox="0 0 24 24"
        >
          <circle 
            className="opacity-25" 
            cx="12" 
            cy="12" 
            r="10" 
            stroke="currentColor" 
            strokeWidth="4"
          />
          <path 
            className="opacity-75" 
            fill="currentColor" 
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {children}
    </button>
  );
};


/**
 * CustomSuggestionView - Displays suggestion pills
 * 
 * Features:
 * - Flexbox container with wrapping
 * - Tracks loading state per suggestion
 * - Theme-aware background colors
 * 
 * Note: Not using forwardRef as CopilotKit's slot system doesn't work well with it
 * 
 * Props from CopilotKit:
 * - suggestions: Array of suggestion objects
 * - onSelectSuggestion: Callback when suggestion is clicked
 * - loadingIndexes: Indexes of suggestions being loaded
 * - container: Optional slot override for container (we use our own)
 * - suggestion: Optional slot override for pill (we use our own)
 * - className, children, and other HTML div attributes
 */
export const CustomSuggestionView: React.FC<CustomSuggestionViewProps> = ({
    suggestions,
    onSelectSuggestion,
    loadingIndexes,
  container: _container, // Accept but don't use - we have our own container
  suggestion: _suggestion, // Accept but don't use - we have our own pill
    className,
    children,
    ...restProps
}) => {

  // Suppress unused variable warnings
  void _container;
  void _suggestion;

  const themeState = useStorage(themeStorage);
  const isLight = themeState.isLight;

    // Create a Set of loading indexes for quick lookup
    const loadingSet = useMemo(() => {
      if (!loadingIndexes || loadingIndexes.length === 0) {
        return new Set<number>();
      }
      return new Set(loadingIndexes);
    }, [loadingIndexes]);

  // Ensure suggestions is an array
  const suggestionsArray = Array.isArray(suggestions) ? suggestions : [];

    // Map suggestions to pill elements
  const suggestionElements = suggestionsArray.map((suggestion, index) => {
    if (!suggestion || !suggestion.title) {
      return null;
    }
    
      const isLoading = loadingSet.has(index) || suggestion.isLoading === true;
      
      return (
        <CustomSuggestionPill
          key={`${suggestion.title}-${index}`}
          isLoading={isLoading}
        isLight={isLight}
        type="button"
        onClick={() => {
          console.log('[CustomSuggestionView] Pill clicked:', { suggestion, index });
          onSelectSuggestion?.(suggestion, index);
        }}
        >
          {suggestion.title}
        </CustomSuggestionPill>
      );
    });

  const baseClasses = "flex items-center gap-1.5 sm:gap-2 pl-0 sm:px-0 overflow-x-auto suggestions-scroll";

    return (
    <div className={`${baseClasses} ${className || ''}`.trim()} {...restProps}>
        {suggestionElements}
        {children}
    </div>
    );
};

CustomSuggestionView.displayName = 'CustomSuggestionView';

export default CustomSuggestionView;
