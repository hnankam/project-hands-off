/**
 * Custom User Message Component for CopilotKit V2
 * 
 * Phase 1: Basic wrapper with theme support
 * 
 * This is a wrapper around CopilotChatUserMessage that provides:
 * - Theme-aware styling (light/dark mode)
 * - Built-in features from CopilotKit:
 *   - Edit mode (textarea, save/cancel, keyboard shortcuts)
 *   - Copy button (with feedback)
 *   - Toolbar hover management
 * 
 * Future phases will add:
 * - Custom toolbar items (rerun, undo, delete menu)
 * - Attachment chip rendering
 * - Custom markdown rendering
 * - Edit history tracking
 */

import React, { useMemo } from 'react';
import { CopilotChatUserMessage } from '../../hooks/copilotkit';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import type { UserMessage } from '@ag-ui/core';
import { CustomUserMessageRenderer } from './slots/CustomUserMessageRenderer';

// Type for the component props - derived from CopilotChatUserMessage
type UserMessageProps = React.ComponentProps<typeof CopilotChatUserMessage>;

/**
 * CustomUserMessageV2Component - Wrapper with theme support and full width message renderer
 * 
 * Uses the children render prop to customize:
 * - Container with theme-aware classes
 * - MessageRenderer for full width content
 * 
 * Features:
 * - Theme-aware Container with theme class
 * - Full width message content
 * - All built-in CopilotKit features (edit, copy, toolbar)
 * 
 * Props destructured from children render function (line 87):
 * 
 * SLOT ELEMENTS (React.ReactElement):
 * - messageRenderer: Rendered message content element (uses our CustomMessageRenderer)
 * - toolbar: Edit/copy buttons toolbar element
 * - copyButton: Individual copy button element (already included in toolbar)
 * - editButton: Individual edit button element (already included in toolbar)
 * - branchNavigation: Branch navigation UI element (if branching enabled)
 * 
 * CONFIGURATION PROPS (from ...slotProps):
 * - message: UserMessage object (REQUIRED) - The message data from @ag-ui/core
 * - onEditMessage?: (props: { message: UserMessage }) => void - Callback when message edited
 * - onSwitchToBranch?: (props: { message: UserMessage; branchIndex: number; numberOfBranches: number }) => void - Callback for branch switching
 * - branchIndex?: number - Current branch index (if branching enabled)
 * - numberOfBranches?: number - Total number of branches (if branching enabled)
 * - additionalToolbarItems?: React.ReactNode - Custom toolbar items to add
 * 
 * HTML DIV ATTRIBUTES (from ...slotProps):
 * - className?: string - CSS classes
 * - style?: React.CSSProperties - Inline styles
 * - id?: string - Element ID
 * - onClick?: React.MouseEventHandler<HTMLDivElement> - Click handler
 * - onMouseEnter?: React.MouseEventHandler<HTMLDivElement> - Mouse enter handler
 * - onMouseLeave?: React.MouseEventHandler<HTMLDivElement> - Mouse leave handler
 * - data-*?: string - Data attributes
 * - aria-*?: string - ARIA attributes
 * - role?: string - ARIA role
 * - tabIndex?: number - Tab index
 * - ... (all other standard HTML div attributes)
 * 
 * @param props - All CopilotChatUserMessage props
 */
const CustomUserMessageV2Component: React.FC<UserMessageProps> = (props) => {
  const { isLight } = useStorage(themeStorage);
  
  // Construct className with theme class only (copilotKitUserMessage removed)
  const containerClassName = useMemo(() => {
    const themeClass = isLight ? 'light-theme' : 'dark-theme';
    return themeClass;
  }, [isLight]);
  
  return (
    <CopilotChatUserMessage {...props} messageRenderer={CustomUserMessageRenderer}>
      {({ messageRenderer, toolbar, copyButton, editButton, branchNavigation, ...slotProps }) => (
        <CopilotChatUserMessage.Container className={containerClassName}>
          {messageRenderer}
          {toolbar}
        </CopilotChatUserMessage.Container>
      )}
    </CopilotChatUserMessage>
  );
};

/**
 * Export with static properties copied from CopilotChatUserMessage
 * This is required for the V2 slot system to work correctly.
 * 
 * The component must have the same shape as CopilotChatUserMessage
 * including all its sub-components (Container, MessageRenderer, etc.)
 */
export const CustomUserMessageV2 = Object.assign(
  CustomUserMessageV2Component,
  {
    Container: CopilotChatUserMessage.Container,
    MessageRenderer: CopilotChatUserMessage.MessageRenderer,
    Toolbar: CopilotChatUserMessage.Toolbar,
    ToolbarButton: CopilotChatUserMessage.ToolbarButton,
    CopyButton: CopilotChatUserMessage.CopyButton,
    EditButton: CopilotChatUserMessage.EditButton,
    BranchNavigation: CopilotChatUserMessage.BranchNavigation,
  }
) as typeof CopilotChatUserMessage;

export default CustomUserMessageV2;

