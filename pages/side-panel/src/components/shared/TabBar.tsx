/**
 * TabBar
 *
 * A reusable horizontal tab bar with localStorage persistence.
 */

import * as React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@extension/ui';
import { ANIMATION_DURATIONS } from '../../constants/ui';

export interface TabConfig<T extends string = string> {
  /** Tab key/id */
  key: T;
  /** Display label (if different from key) */
  label?: string;
  /** Whether this tab is hidden */
  hidden?: boolean;
  /** Whether this tab is disabled (shown but not clickable) */
  disabled?: boolean;
}

export interface TabBarProps<T extends string = string> {
  /** Array of tab configurations or simple string keys */
  tabs: (T | TabConfig<T>)[];
  /** Currently active tab */
  activeTab: T;
  /** Called when tab changes */
  onTabChange: (tab: T) => void;
  /** Light/dark theme */
  isLight: boolean;
  /** LocalStorage key for persistence (optional) */
  storageKey?: string;
  /** Additional className for the container */
  className?: string;
  /** Whether to center tabs when they don't overflow */
  centerWhenFit?: boolean;
}

export function TabBar<T extends string = string>({
  tabs,
  activeTab,
  onTabChange,
  isLight,
  storageKey,
  className,
  centerWhenFit = true,
}: TabBarProps<T>): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<T, HTMLButtonElement>>(new Map());
  const [tabsOverflow, setTabsOverflow] = useState(false);

  // Normalize tabs to TabConfig format
  const normalizedTabs: TabConfig<T>[] = tabs.map(tab => (typeof tab === 'string' ? { key: tab as T } : tab));

  // Filter out hidden tabs
  const visibleTabs = normalizedTabs.filter(tab => !tab.hidden);

  // Check if tabs overflow
  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current) {
        const hasOverflow = containerRef.current.scrollWidth > containerRef.current.clientWidth;
        setTabsOverflow(hasOverflow);
      }
    };

    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    const timer = setTimeout(checkOverflow, ANIMATION_DURATIONS.scrollDelay);

    return () => {
      window.removeEventListener('resize', checkOverflow);
      clearTimeout(timer);
    };
  }, [activeTab, tabs]);

  // Auto-scroll to active tab
  useEffect(() => {
    const activeTabElement = tabRefs.current.get(activeTab);

    if (activeTabElement && containerRef.current) {
      setTimeout(() => {
        activeTabElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        });
      }, ANIMATION_DURATIONS.scrollDelay);
    }
  }, [activeTab]);

  // Persist to localStorage
  useEffect(() => {
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, activeTab);
      } catch (error) {
        console.error(`[TabBar] Failed to save tab to localStorage:`, error);
      }
    }
  }, [activeTab, storageKey]);

  const handleTabClick = useCallback(
    (tab: T) => {
      onTabChange(tab);
    },
    [onTabChange],
  );

  const getTabLabel = (tab: TabConfig<T>): string => {
    return tab.label || tab.key.charAt(0).toUpperCase() + tab.key.slice(1);
  };

  return (
    <div
      className={cn(
        'flex h-[37px] min-h-[37px] items-center justify-center gap-2 border-t border-b px-2 py-1',
        isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
        className,
      )}>
      <div
        ref={containerRef}
        className={cn(
          'session-tabs-scroll flex items-center gap-1 overflow-x-auto',
          centerWhenFit && !tabsOverflow && 'justify-center',
        )}>
        {visibleTabs.map(tab => (
          <button
            key={tab.key}
            ref={el => {
              if (el) {
                tabRefs.current.set(tab.key, el);
              } else {
                tabRefs.current.delete(tab.key);
              }
            }}
            onClick={() => !tab.disabled && handleTabClick(tab.key)}
            disabled={tab.disabled}
            className={cn(
              'flex-shrink-0 rounded px-3 py-1 text-xs font-medium capitalize transition-colors',
              tab.disabled
                ? isLight
                  ? 'cursor-not-allowed text-gray-400'
                  : 'cursor-not-allowed text-gray-600'
                : activeTab === tab.key
                  ? isLight
                    ? 'bg-gray-200 text-gray-700'
                    : 'bg-gray-700 text-[#bcc1c7]'
                  : isLight
                    ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-700'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-[#bcc1c7]',
            )}>
            {getTabLabel(tab)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default TabBar;
