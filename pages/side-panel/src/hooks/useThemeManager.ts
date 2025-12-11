/**
 * @fileoverview Theme Manager Hook
 * 
 * Manages theme state and applies dark mode class to document element.
 * Listens for system theme changes when in system mode.
 * Re-evaluates system theme on mount to handle stale values when panel reopens.
 */

import { useEffect } from 'react';
import { themeStorage } from '@extension/storage';

export function useThemeManager(isLight: boolean, theme: string): void {
  // Apply dark mode class to document element for proper CopilotKit theming
  useEffect(() => {
    if (isLight) {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  }, [isLight]);
  
  // Re-evaluate system theme on mount AND listen for changes when in system mode
  // This handles stale theme values when the side panel reopens after system theme changed
  useEffect(() => {
    if (theme !== 'system') return;
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    // Re-evaluate immediately on mount - the stored isLight may be stale
    // if the system theme changed while the side panel was closed
    const currentSystemIsLight = !mediaQuery.matches;
    if (currentSystemIsLight !== isLight) {
      themeStorage.setTheme('system');
    }
    
    // Listen for future changes
    const handleChange = () => {
      themeStorage.setTheme('system');
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, isLight]);
}

