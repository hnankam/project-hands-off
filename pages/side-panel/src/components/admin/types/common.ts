/**
 * Common types and utilities shared across admin components
 */

/**
 * Common props for admin components that support theming
 */
export interface ThemeProps {
  isLight: boolean;
}

/**
 * Common props for components with loading states
 */
export interface LoadingProps {
  loading?: boolean;
}

/**
 * Common props for components that can be disabled
 */
export interface DisabledProps {
  disabled?: boolean;
}

/**
 * Common props for selector components
 */
export interface BaseSelectorProps extends ThemeProps, LoadingProps, DisabledProps {
  placeholder?: string;
}

/**
 * Common props for multi-selector components
 */
export interface BaseMultiSelectorProps extends BaseSelectorProps {
  allowEmpty?: boolean;
}

/**
 * Common tab props
 */
export interface BaseTabProps extends ThemeProps {
  onError: (error: string) => void;
  onSuccess: (message: string) => void;
}

/**
 * Base instruction interface
 */
export interface BaseInstruction {
  id: string;
  instructionKey: string;
  instructionValue: string;
  description: string | null;
  organizationId: string;
  teamId: string | null;
  teamName: string | null;
  createdAt: string;
  updatedAt: string;
}

