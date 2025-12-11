/**
 * Centralized CopilotKit Type Definitions
 *
 * V2 Implementation:
 * - Message type from @ag-ui/core (AG-UI protocol)
 * - Component props defined locally for V2 compatibility
 */

import type { ReactNode } from 'react';

// =============================================================================
// Message Types (from @ag-ui/core in V2)
// =============================================================================

export type { Message } from '@ag-ui/core';

// =============================================================================
// Component Props Types
// Defined locally for V2 compatibility since react-ui exports may differ
// =============================================================================

/** Props for custom input component */
export interface InputProps {
  inProgress?: boolean;
  onSend?: (message: string) => void;
  isVisible?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
}

/** Props for custom messages container component */
export interface MessagesProps {
  messages?: any[];
  inProgress?: boolean;
  children?: ReactNode;
  className?: string;
}

/** Props for custom user message component */
export interface UserMessageProps {
  message?: any;
  children?: ReactNode;
  className?: string;
  ImageRenderer?: React.ComponentType<{ imageUrl: string }>;
}

/** Props for custom assistant message component */
export interface AssistantMessageProps {
  message?: any;
  isLoading?: boolean;
  isStreaming?: boolean;
  children?: ReactNode;
  className?: string;
  subComponent?: ReactNode;
}
