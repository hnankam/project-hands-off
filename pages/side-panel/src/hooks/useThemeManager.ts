/**
 * @fileoverview Theme Manager Hook
 * 
 * Manages theme state and applies dark mode class to document element.
 * Listens for system theme changes when in system mode.
 */

import { useEffect } from 'react';
import { exampleThemeStorage } from '@extension/storage';

export function useThemeManager(isLight: boolean, theme: string): void {
  // Apply dark mode class to document element for proper CopilotKit theming
  useEffect(() => {
    if (isLight) {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  }, [isLight]);
  
  // Listen for system theme changes when in system mode
  useEffect(() => {
    if (theme !== 'system') return;
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      // Re-evaluate system theme
      exampleThemeStorage.setTheme('system');
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);
}

