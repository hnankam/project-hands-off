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
  CustomUndoButton,
  CustomMoreOptionsButton,
} from './slots/CustomUserMessageButtons';

// Type for the component props - derived from CopilotChatUserMessage
type UserMessageProps = React.ComponentProps<typeof CopilotChatUserMessage>;

// Attachment type for display
type AttachmentInfo = {
  filename: string;
  mimeType: string;
  url: string;
};

/**
 * Helper: Extract attachments from multimodal content array
 */
const extractAttachments = (content: any): AttachmentInfo[] => {
  if (!Array.isArray(content)) return [];
  
  return content
    .filter((item: any) => item?.type === 'binary')
    .map((item: any) => ({
      filename: item.filename || 'file',
      mimeType: item.mimeType || 'application/octet-stream',
      url: item.url || '',
    }))
    .filter((att: AttachmentInfo) => att.url); // Only include items with valid URLs
};

/**
 * Helper: Extract text content from multimodal content array
 */
const extractTextContent = (content: any): string => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  
  return content
    .filter((item: any) => item?.type === 'text')
    .map((item: any) => item.text || '')
    .join('\n')
    .trim();
};

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
const CustomUserMessageV2ComponentInner: React.FC<UserMessageProps> = (props) => {
  const { message, ...restProps } = props;
  
  const { isLight } = useStorage(themeStorage);
  const [isHovered, setIsHovered] = useState(false);
  const [editHistory, setEditHistory] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const { messages, setMessages, reloadMessages } = useCopilotChat();
  const sessionId = useChatSessionIdSafe();
  
  // Extract attachments and text from message content
  const attachments = useMemo(() => {
    return extractAttachments(message?.content);
  }, [message?.content]);
  
  const textContent = useMemo(() => {
    return extractTextContent(message?.content);
  }, [message?.content]);
  
  // Find the index of the current message - stabilize to prevent rerenders during streaming
  // Use refs to track values and only update when structure changes (not content)
  const messageIdRef = React.useRef(message?.id);
  const messageIndexRef = React.useRef(-1);
  const isLastRef = React.useRef(false);
  const messagesLengthRef = React.useRef(0);
  const messagesRefSignature = React.useRef<string>('');
  
  // Stabilize messages length - only update when it actually changes
  const stableMessagesLength = React.useMemo(() => messages?.length ?? 0, [messages?.length]);
  
  // Create a signature for messages array to detect if it's actually different
  const messagesSignature = React.useMemo(() => {
    if (!messages) return '';
    return messages.map(m => m.id).join(',');
  }, [messages]);
  
  // Update message index/isLast only when necessary
  // This runs synchronously during render to ensure refs are up-to-date
  const currentMessageId = message?.id;
  const currentMessagesLength = stableMessagesLength;
  
  // Check if we need to update the refs
  if (currentMessageId !== messageIdRef.current) {
    // Message ID changed - recalculate everything
    messageIdRef.current = currentMessageId;
    if (messages && currentMessageId) {
      messageIndexRef.current = messages.findIndex(m => m.id === currentMessageId);
      isLastRef.current = messageIndexRef.current >= 0 && messageIndexRef.current === messages.length - 1;
    } else {
      messageIndexRef.current = -1;
      isLastRef.current = false;
    }
    messagesLengthRef.current = currentMessagesLength;
    messagesRefSignature.current = messagesSignature;
  } else if (currentMessagesLength !== messagesLengthRef.current || messagesSignature !== messagesRefSignature.current) {
    // Messages length or order changed - recalculate index and isLast
    messagesLengthRef.current = currentMessagesLength;
    messagesRefSignature.current = messagesSignature;
    
    // Recalculate index since message order may have changed
    if (messages && currentMessageId) {
      messageIndexRef.current = messages.findIndex(m => m.id === currentMessageId);
      isLastRef.current = messageIndexRef.current >= 0 && messageIndexRef.current === messages.length - 1;
    } else {
      messageIndexRef.current = -1;
      isLastRef.current = false;
    }
  }
  
  // Use ref values directly to avoid recalculation on every render
  const messageIndex = messageIndexRef.current;
  const isLast = isLastRef.current;
  
  // Handle rerun - regenerate assistant response
  // Use refs to access latest messages without causing rerenders
  const messagesRef = React.useRef(messages);
  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  
  // Stabilize message using ref to prevent recreations
  const messageRef = React.useRef(message);
  
  React.useEffect(() => {
    messageRef.current = message;
  }, [message]);
  
  const handleRerun = useCallback(() => {
    const currentMessages = messagesRef.current;
    const currentMessageIndex = messageIndexRef.current;
    const currentMessage = messageRef.current;
    if (!currentMessages || !currentMessage || currentMessageIndex === -1) return;
    
    // Find the next assistant message after this user message
    const following = currentMessages.slice(currentMessageIndex + 1).find(m => {
      const role = (m as any)?.role;
      return role === 'assistant' && typeof role === 'string';
    });
    
    if (following?.id) {
      // Refresh state before reloading
      const refreshedMessages = currentMessages.map(m => ({ ...m }));
      setMessages(refreshedMessages);
      
      setTimeout(() => {
        reloadMessages(following.id);
      }, 50);
    } else if (currentMessage.id) {
      // Fallback: reload from this user message
      const refreshedMessages = currentMessages.map(m => ({ ...m }));
      setMessages(refreshedMessages);
      
      setTimeout(() => {
        reloadMessages(currentMessage.id);
      }, 50);
    }
  }, [setMessages, reloadMessages]); // Include setMessages and reloadMessages to use latest versions
  
  // Handle undo - restore previous edit
  const editHistoryRef = React.useRef(editHistory);
  React.useEffect(() => {
    editHistoryRef.current = editHistory;
  }, [editHistory]);
  
  const handleUndo = useCallback(() => {
    const currentMessages = messagesRef.current;
    const currentMessageIndex = messageIndexRef.current;
    const currentEditHistory = editHistoryRef.current;
    if (!currentMessages || currentEditHistory.length === 0 || currentMessageIndex === -1) return;
    
    const previousContent = currentEditHistory[currentEditHistory.length - 1];
    const updatedMessages = [...currentMessages];
    updatedMessages[currentMessageIndex] = {
      ...updatedMessages[currentMessageIndex],
      content: previousContent as any, // Content can be string or other types
    };
    setMessages(updatedMessages);
    setEditHistory(prev => prev.slice(0, -1));
  }, [setMessages, setEditHistory]); // Include setMessages to use latest version
  
  // Handle delete operations
  const sessionIdRef = React.useRef(sessionId);
  React.useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  
  const handleDelete = useCallback((type: 'this' | 'above' | 'below') => {
    const currentMessages = messagesRef.current;
    const currentMessageIndex = messageIndexRef.current;
    const currentSessionId = sessionIdRef.current;
    
    if (!currentMessages || currentMessageIndex === -1) return;
    
    let updatedMessages: typeof currentMessages;
    switch (type) {
      case 'this':
        updatedMessages = currentMessages.filter((_, i) => i !== currentMessageIndex);
        break;
      case 'above':
        updatedMessages = currentMessages.filter((_, i) => i > currentMessageIndex);
        break;
      case 'below':
        updatedMessages = currentMessages.filter((_, i) => i < currentMessageIndex);
        break;
    }
    
    // Signal intentional delete if empty
    if (currentSessionId && updatedMessages.length === 0) {
      persistenceLock.setManualReset(currentSessionId, true);
    }
    
    // Call setMessages directly (not through ref) to ensure we use the latest agent reference
    setMessages(updatedMessages);
  }, [setMessages]);
  
  // Handle edit button click - enter edit mode
  const textContentRef = React.useRef(textContent);
  React.useEffect(() => {
    textContentRef.current = textContent;
  }, [textContent]);
  
  const handleEditClick = useCallback(() => {
    // Extract text content (handles both string and multimodal array)
    const currentText = textContentRef.current || '';
    
    // Save current content to edit history before editing
    setEditHistory(prev => [...prev, currentText]);
    setEditedContent(currentText);
    setIsEditing(true);
  }, [setEditHistory, setEditedContent, setIsEditing]);
  
  // Handle save edit
  const editedContentRef = React.useRef(editedContent);
  const restPropsRef = React.useRef(restProps);
  React.useEffect(() => {
    editedContentRef.current = editedContent;
    restPropsRef.current = restProps;
  }, [editedContent, restProps]);
  
  const handleSaveEdit = useCallback(() => {
    const currentMessages = messagesRef.current;
    const currentMessageIndex = messageIndexRef.current;
    const currentEditedContent = editedContentRef.current;
    const currentRestProps = restPropsRef.current;
    
    if (!currentMessages || currentMessageIndex === -1) return;
    
    const currentMessage = currentMessages[currentMessageIndex];
    const currentContent = (currentMessage as any)?.content;
    
    // Preserve attachments if they exist in the original message
    let newContent: any;
    if (Array.isArray(currentContent)) {
      // Message has multimodal content - preserve binary parts, update text
      newContent = currentContent.map(part => {
        if (part?.type === 'text') {
          return { type: 'text', text: currentEditedContent };
        }
        return part; // Keep binary parts as-is
      });
      
      // If there was no text part originally, add it
      const hasTextPart = currentContent.some(p => p?.type === 'text');
      if (!hasTextPart && currentEditedContent.trim()) {
        newContent = [{ type: 'text', text: currentEditedContent }, ...newContent];
      }
    } else {
      // Simple string content
      newContent = currentEditedContent;
    }
    
    const updatedMessages = [...currentMessages];
    updatedMessages[currentMessageIndex] = {
      ...updatedMessages[currentMessageIndex],
      content: newContent,
    };
    setMessages(updatedMessages);
    setIsEditing(false);
    
    // Call onEditMessage callback if provided
    if (currentRestProps.onEditMessage) {
      currentRestProps.onEditMessage({ message: updatedMessages[currentMessageIndex] as UserMessage });
    }
  }, [setMessages, setIsEditing]); // Include setMessages to use latest version
  
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
      marginBottom: '0.33rem',
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
  
  // Custom message renderer that handles edit mode and attachments
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
          attachments={attachments}
        />
      );
    }
    return <CustomUserMessageRenderer {...rendererProps} attachments={attachments} />;
  }, [isEditing, editedContent, handleSaveEdit, handleCancelEdit, handleKeyDown, attachments]);
  
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
        // Reorder toolbar buttons: Undo, Edit, Copy, More Options (rightmost)
        // Hide toolbar when in edit mode
        // Note: editButton and copyButton are INTENTIONALLY excluded from deps
        // They are React elements from CopilotKit that change references frequently
        // Including them causes 40+ re-renders. We accept potential stale closures here
        // since these buttons don't rely on our local state
        const reorderedToolbar = useMemo(() => {
          if (isEditing) return null;
          
          return (
            <div
              className=""
              style={buttonContainerStyles}
            >
              {/* Undo Button - Only show if there's edit history */}
              {editHistory.length > 0 && (
                <CustomUndoButton onUndo={handleUndo} />
              )}
              
              {/* Edit Button */}
              {editButton}
              
              {/* Copy Button */}
              {copyButton}
              
              {/* More Options Button (rightmost) - Contains Refresh and Delete */}
              <CustomMoreOptionsButton
                onRerun={handleRerun}
                onDelete={handleDelete}
                messageIndex={messageIndex}
                isLast={isLast}
              />
            </div>
          );
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [isEditing, editHistory.length, messageIndex, isLast, buttonContainerStyles, handleUndo, handleRerun, handleDelete]);
        // editButton and copyButton intentionally excluded - they change every render
        
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
 * 
 * Note: Matching CustomAssistantMessageV2 structure exactly for CopilotKit compatibility.
 * Memoization will be applied internally using useMemo/useCallback instead.
 */
export const CustomUserMessageV2 = Object.assign(
  CustomUserMessageV2ComponentInner,
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

