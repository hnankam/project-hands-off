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

import React, { useMemo, useState, useCallback } from 'react';
import { CopilotChatUserMessage, useCopilotChat } from '../../hooks/copilotkit';
import { useStorage, persistenceLock } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { useChatSessionIdSafe } from '../../context/ChatSessionIdContext';
import type { UserMessage } from '@ag-ui/core';
import { CustomUserMessageRenderer } from './slots/CustomUserMessageRenderer';
import { 
  CustomCopyButton, 
  CustomEditButton,
  CustomRerunButton,
  CustomUndoButton,
  CustomDeleteButton,
} from './slots/CustomUserMessageButtons';

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
  const { message, ...restProps } = props;
  const { isLight } = useStorage(themeStorage);
  const [isHovered, setIsHovered] = useState(false);
  const [editHistory, setEditHistory] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const { messages, setMessages, reloadMessages } = useCopilotChat();
  const sessionId = useChatSessionIdSafe();
  
  // Find the index of the current message
  const messageIndex = useMemo(() => {
    if (!messages || !message) return -1;
    return messages.findIndex(m => m.id === message.id);
  }, [messages, message]);
  
  const isLast = useMemo(() => {
    if (!messages || messageIndex === -1) return false;
    return messageIndex === messages.length - 1;
  }, [messages, messageIndex]);
  
  // Handle rerun - regenerate assistant response
  const handleRerun = useCallback(() => {
    if (!messages || !message || messageIndex === -1) return;
    
    // Find the next assistant message after this user message
    const following = messages.slice(messageIndex + 1).find(m => {
      const role = (m as any)?.role;
      return role === 'assistant' && typeof role === 'string';
    });
    
    if (following?.id) {
      // Refresh state before reloading
      const refreshedMessages = messages.map(m => ({ ...m }));
      setMessages(refreshedMessages);
      
      setTimeout(() => {
        reloadMessages(following.id);
      }, 50);
    } else if (message.id) {
      // Fallback: reload from this user message
      const refreshedMessages = messages.map(m => ({ ...m }));
      setMessages(refreshedMessages);
      
      setTimeout(() => {
        reloadMessages(message.id);
      }, 50);
    }
  }, [messages, message, messageIndex, setMessages, reloadMessages]);
  
  // Handle undo - restore previous edit
  const handleUndo = useCallback(() => {
    if (!messages || editHistory.length === 0 || messageIndex === -1) return;
    
    const previousContent = editHistory[editHistory.length - 1];
    const updatedMessages = [...messages];
    updatedMessages[messageIndex] = {
      ...updatedMessages[messageIndex],
      content: previousContent as any, // Content can be string or other types
    };
    setMessages(updatedMessages);
    setEditHistory(prev => prev.slice(0, -1));
  }, [messages, editHistory, messageIndex, setMessages]);
  
  // Handle delete operations
  const handleDelete = useCallback((type: 'this' | 'above' | 'below') => {
    if (!messages || messageIndex === -1) return;
    
    let updatedMessages: typeof messages;
    switch (type) {
      case 'this':
        updatedMessages = messages.filter((_, i) => i !== messageIndex);
        break;
      case 'above':
        updatedMessages = messages.filter((_, i) => i > messageIndex);
        break;
      case 'below':
        updatedMessages = messages.filter((_, i) => i < messageIndex);
        break;
    }
    
    // Signal intentional delete if empty
    if (sessionId && updatedMessages.length === 0) {
      persistenceLock.setManualReset(sessionId, true);
    }
    
    setMessages(updatedMessages);
  }, [messages, messageIndex, sessionId, setMessages]);
  
  // Handle edit button click - enter edit mode
  const handleEditClick = useCallback(() => {
    const currentContent = (message as any)?.content || '';
    if (typeof currentContent === 'string') {
      // Save current content to edit history before editing
      setEditHistory(prev => [...prev, currentContent]);
      setEditedContent(currentContent);
      setIsEditing(true);
    }
  }, [message]);
  
  // Handle save edit
  const handleSaveEdit = useCallback(() => {
    if (!messages || messageIndex === -1) return;
    
    const updatedMessages = [...messages];
    updatedMessages[messageIndex] = {
      ...updatedMessages[messageIndex],
      content: editedContent as any,
    };
    setMessages(updatedMessages);
    setIsEditing(false);
    
    // Call onEditMessage callback if provided
    if (restProps.onEditMessage) {
      restProps.onEditMessage({ message: updatedMessages[messageIndex] as UserMessage });
    }
  }, [messages, messageIndex, editedContent, setMessages, restProps]);
  
  // Handle cancel edit
  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditedContent('');
    // Remove the last edit history entry since we're canceling
    setEditHistory(prev => prev.slice(0, -1));
  }, []);
  
  // Handle edit message callback - track in history (called after save)
  const handleEditMessage = useCallback((editProps: { message: UserMessage }) => {
    // This is called after edit is saved, edit history already tracked in handleEditClick
  }, []);
  
  // Focus textarea when entering edit mode
  React.useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      );
    }
  }, [isEditing]);
  
  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  }, [handleSaveEdit, handleCancelEdit]);
  
  // Construct className with theme class only (copilotKitUserMessage removed)
  const containerClassName = useMemo(() => {
    const themeClass = isLight ? 'light-theme' : 'dark-theme';
    return themeClass;
  }, [isLight]);
  
  // V1 button container styles with fade-in and gradient background
  const buttonContainerStyles = useMemo(() => {
    const baseStyles: React.CSSProperties = {
      position: 'absolute',
      bottom: '0',
      right: '0',
      display: 'flex',
      maxHeight: '30px',
      gap: '0.25rem',
      opacity: isHovered ? 1 : 0,
      visibility: (isHovered ? 'visible' : 'hidden') as 'visible' | 'hidden',
      transition: 'opacity 0.2s ease-in-out, visibility 0.2s ease-in-out',
      zIndex: 10000,
      overflow: 'visible',
      borderRadius: '0 10px 10px 0',
      marginRight: '5px',
      marginBottom: '1.3rem',
      paddingLeft: '35px',
    };
    
    // Gradient background fade matching V1
    if (isLight) {
      return {
        ...baseStyles,
        background: 'linear-gradient(to right, rgba(249, 250, 251, 0) 0%, rgba(249, 250, 251, 0.8) 20%, rgba(249, 250, 251, 0.95) 40%, rgb(249, 250, 251) 60%)',
      };
    } else {
      return {
        ...baseStyles,
        background: 'linear-gradient(to right, rgba(21, 28, 36, 0) 0%, rgba(21, 28, 36, 0.8) 20%, rgba(21, 28, 36, 0.95) 40%, rgb(21, 28, 36) 60%)',
      };
    }
  }, [isLight, isHovered]);
  
  // Container styles - position relative for absolute positioned toolbar
  const containerStyles = useMemo(() => ({
    position: 'relative' as const,
    overflow: 'visible' as const,
  }), []);
  
  // No additional toolbar items - we'll reorder in the children render prop
  // This prevents duplicate buttons since we're manually reordering
  const additionalToolbarItems = null;
  
  // Custom message renderer that handles edit mode
  const MessageRendererWithEdit = useCallback((rendererProps: { content: string; className?: string }) => {
    if (isEditing) {
      return (
        <CustomUserMessageRenderer 
          {...rendererProps}
          isEditing={isEditing}
          editedContent={editedContent}
          onContentChange={setEditedContent}
          onSave={handleSaveEdit}
          onCancel={handleCancelEdit}
          textareaRef={textareaRef}
          onKeyDown={handleKeyDown}
        />
      );
    }
    return <CustomUserMessageRenderer {...rendererProps} />;
  }, [isEditing, editedContent, handleSaveEdit, handleCancelEdit, handleKeyDown]);
  
  // Custom edit button that triggers edit mode
  const CustomEditButtonWithHandler = useCallback((buttonProps: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
    return <CustomEditButton {...buttonProps} onClick={handleEditClick} />;
  }, [handleEditClick]);
  
  return (
    <CopilotChatUserMessage 
      {...restProps}
      message={message}
      messageRenderer={MessageRendererWithEdit}
      copyButton={CustomCopyButton}
      editButton={CustomEditButtonWithHandler}
      onEditMessage={handleEditMessage}
      additionalToolbarItems={additionalToolbarItems}
    >
      {({ messageRenderer, toolbar, copyButton, editButton, branchNavigation, ...slotProps }) => {
        // Reorder toolbar buttons: Refresh, Undo, Edit, Copy, Delete (rightmost)
        // Hide toolbar when in edit mode
        const reorderedToolbar = useMemo(() => {
          if (isEditing) return null;
          
          return (
            <div
              className=""
              style={buttonContainerStyles}
            >
              {/* Refresh Button */}
              <CustomRerunButton onRerun={handleRerun} />
              
              {/* Undo Button - Only show if there's edit history */}
              {editHistory.length > 0 && (
                <CustomUndoButton onUndo={handleUndo} />
              )}
              
              {/* Edit Button */}
              {editButton}
              
              {/* Copy Button */}
              {copyButton}
              
              {/* Delete Button (rightmost) */}
              <CustomDeleteButton
                onDelete={handleDelete}
                messageIndex={messageIndex}
                isLast={isLast}
              />
            </div>
          );
        }, [isEditing, handleRerun, handleUndo, handleDelete, editHistory.length, messageIndex, isLast, editButton, copyButton, buttonContainerStyles]);
        
        return (
          <CopilotChatUserMessage.Container 
            className={containerClassName}
            style={containerStyles}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {messageRenderer}
            {/* Reordered toolbar - Hide when in edit mode */}
            {reorderedToolbar}
          </CopilotChatUserMessage.Container>
        );
      }}
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

