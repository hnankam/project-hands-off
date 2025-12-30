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
import { CopilotChatUserMessage, useCopilotChat, deleteMessagesFromBackend } from '../../hooks/copilotkit';
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
  
  // Stabilize message content for memoization dependencies
  const messageContentId = useMemo(() => {
    if (!message?.content) return '';
    if (typeof message.content === 'string') return message.content;
    try {
      // For multimodal content, use a stable string representation of the structure
      return JSON.stringify(message.content);
    } catch (e) {
      return String(message.id || '');
    }
  }, [message?.id, message?.content]);

  // Extract attachments and text from message content
  const attachments = useMemo(() => {
    return extractAttachments(message?.content);
  }, [messageContentId]);
  
  const textContent = useMemo(() => {
    return extractTextContent(message?.content);
  }, [messageContentId]);
  
  // PERFORMANCE FIX: Use ref to track message index and only update when it actually changes
  // This prevents re-renders when assistant streams tokens (messages array reference changes but our index doesn't)
  const cachedMessageIndexRef = React.useRef<number>(-1);
  const cachedIsLastRef = React.useRef<boolean>(false);
  
  // Only recalculate index when messages length changes or message ID changes
  const messagesLengthRef = React.useRef(messages?.length ?? 0);
  const messageIdRef = React.useRef(message?.id);
  
  if (!messages || !message?.id) {
    // If no messages or ID, we're likely the first message being rendered optimistically
    if (cachedMessageIndexRef.current !== 0) {
      cachedMessageIndexRef.current = 0;
      cachedIsLastRef.current = true;
    }
  } else {
    const currentLength = messages.length;
    const currentId = message.id;
    const lengthChanged = messagesLengthRef.current !== currentLength;
    const idChanged = messageIdRef.current !== currentId;
    
    if (lengthChanged || idChanged || cachedMessageIndexRef.current === -1) {
      messagesLengthRef.current = currentLength;
      messageIdRef.current = currentId;
      
      const index = messages.findIndex(m => m.id === message.id);
      
      if (index === -1) {
        cachedMessageIndexRef.current = currentLength;
        cachedIsLastRef.current = true;
      } else {
        cachedMessageIndexRef.current = index;
        cachedIsLastRef.current = index >= 0 && index === currentLength - 1;
      }
    }
  }
  
  const messageIndex = cachedMessageIndexRef.current;
  const isLast = cachedIsLastRef.current;
  
  // Stabilize isFirstMessage using ref to prevent callback recreation
  const isFirstMessageRef = React.useRef(messageIndex === 0);
  if (messageIndex === 0 && !isFirstMessageRef.current) {
    isFirstMessageRef.current = true;
  } else if (messageIndex !== 0 && isFirstMessageRef.current) {
    isFirstMessageRef.current = false;
  }
  const isFirstMessage = isFirstMessageRef.current;

  // Handle rerun - regenerate assistant response
  // Use refs to access latest messages without causing rerenders
  const messagesRef = React.useRef(messages);
  const messageIndexRef = React.useRef(messageIndex);
  
  React.useEffect(() => {
    messagesRef.current = messages;
    messageIndexRef.current = messageIndex;
  }, [messages, messageIndex]);
  
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
    
    // For refresh response: filter messages to include only up to and including this user message
    // This excludes the assistant response and any subsequent messages
    // Then trigger a new agent run
    if (currentMessage.id) {
        reloadMessages(currentMessage.id);
    }
  }, [reloadMessages]);
  
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
  
  const handleDelete = useCallback(async (type: 'this' | 'above' | 'below') => {
    const currentMessages = messagesRef.current;
    const currentMessageIndex = messageIndexRef.current;
    const currentSessionId = sessionIdRef.current;
    
    if (!currentMessages || currentMessageIndex === -1 || !currentSessionId) return;
    
    const currentMessage = currentMessages[currentMessageIndex];
    if (!currentMessage?.id) {
      console.error('[CustomUserMessageV2] Cannot delete message without ID');
      return;
    }
    
    try {
      let messageIdsToDelete: string[] = [];
      
      switch (type) {
        case 'this':
          messageIdsToDelete = [currentMessage.id];
          break;
        case 'above':
          // Delete all messages from index 0 to current index (inclusive)
          messageIdsToDelete = currentMessages
            .slice(0, currentMessageIndex + 1)
            .map(msg => msg.id)
            .filter((id): id is string => Boolean(id));
          break;
        case 'below':
          // Delete all messages from current index to end (inclusive)
          messageIdsToDelete = currentMessages
            .slice(currentMessageIndex)
            .map(msg => msg.id)
            .filter((id): id is string => Boolean(id));
          break;
      }
      
      if (messageIdsToDelete.length === 0) {
        console.warn('[CustomUserMessageV2] No message IDs to delete');
        return;
      }
      
      // Call API to delete messages (reuses same helper as reloadMessages)
      await deleteMessagesFromBackend(currentSessionId, messageIdsToDelete);
      
      // Update local state after successful API call
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
      if (updatedMessages.length === 0) {
      persistenceLock.setManualReset(currentSessionId, true);
    }
    
    // Call setMessages directly (not through ref) to ensure we use the latest agent reference
    setMessages(updatedMessages);
    } catch (error) {
      console.error('[CustomUserMessageV2] Error deleting message:', error);
      // Optionally show user-facing error notification here
    }
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
  
  // Handle save edit - use refs to stabilize callback
  const editedContentRef = React.useRef(editedContent);
  const restPropsRef = React.useRef(restProps);
  const setMessagesRef = React.useRef(setMessages);
  const setIsEditingRef = React.useRef(setIsEditing);
  const setEditHistoryRef = React.useRef(setEditHistory);
  const setEditedContentRef = React.useRef(setEditedContent);
  
  React.useEffect(() => {
    editedContentRef.current = editedContent;
    restPropsRef.current = restProps;
    setMessagesRef.current = setMessages;
    setIsEditingRef.current = setIsEditing;
    setEditHistoryRef.current = setEditHistory;
    setEditedContentRef.current = setEditedContent;
  }, [editedContent, restProps, setMessages, setIsEditing, setEditHistory, setEditedContent]);
  
  // Create stable handlers that don't recreate on every render
  const handleSaveEdit = React.useCallback(() => {
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
    setMessagesRef.current(updatedMessages);
    setIsEditingRef.current(false);
    
    // Call onEditMessage callback if provided
    if (currentRestProps.onEditMessage) {
      currentRestProps.onEditMessage({ message: updatedMessages[currentMessageIndex] as UserMessage });
    }
  }, []); // Empty deps - all accessed via refs
  
  // Handle cancel edit - stable callback
  const handleCancelEdit = React.useCallback(() => {
    setIsEditingRef.current(false);
    setEditedContentRef.current('');
    // Remove the last edit history entry since we're canceling
    setEditHistoryRef.current(prev => prev.slice(0, -1));
  }, []); // Empty deps - all accessed via refs
  
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
  
  // Handle keyboard shortcuts - stable callback
  const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  }, []); // Empty deps - handlers are stable
  
  // Construct className with theme class only (copilotKitUserMessage removed)
  const containerClassName = useMemo(() => {
    const themeClass = isLight ? 'light-theme' : 'dark-theme';
    return themeClass;
  }, [isLight]);
  
  // V1 button container styles with fade-in and gradient background
  const buttonContainerStyles = useMemo(() => {
    const baseStyles: React.CSSProperties = {
      position: 'absolute',
      bottom: '12px',
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
  
  // Custom message renderer callback
  // Include editedContent in deps so renderer receives updated props
  // Use stable key to prevent unmounting, and restore focus if lost
  const MessageRendererWithEdit = React.useCallback((rendererProps: { content: string; className?: string }) => {
    if (isEditing) {
      return (
        <CustomUserMessageRenderer 
          key={`edit-${message.id}`} // Stable key - same key prevents unmounting
          {...rendererProps}
          isEditing={isEditing}
          editedContent={editedContent}
          onContentChange={handleContentChangeWithCursor}
          onSave={handleSaveEdit}
          onCancel={handleCancelEdit}
          textareaRef={textareaRef}
          onKeyDown={handleKeyDown}
          attachments={attachments}
          isFirstMessage={isFirstMessage}
        />
      );
    }
    return (
      <CustomUserMessageRenderer 
        key={`view-${message.id}`}
        {...rendererProps}
        attachments={attachments}
        isFirstMessage={isFirstMessage}
      />
    );
  }, [isFirstMessage, handleSaveEdit, handleCancelEdit, handleKeyDown, isEditing, editedContent, attachments, message.id]);
  
  // Store cursor position to restore it after re-render
  const cursorPositionRef = React.useRef<number | null>(null);
  
  // Track cursor position when typing - receives content and cursor position
  const handleContentChangeWithCursor = React.useCallback((content: string, cursorPos?: number) => {
    // Save cursor position if provided, otherwise try to get it from textarea
    if (cursorPos !== undefined) {
      cursorPositionRef.current = cursorPos;
    } else if (textareaRef.current) {
      cursorPositionRef.current = textareaRef.current.selectionStart;
    }
    setEditedContent(content);
  }, []);
  
  // Restore focus and cursor position after render if it was lost
  // This handles cases where CopilotKit re-renders and focus is lost
  React.useEffect(() => {
    if (isEditing && textareaRef.current) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const wasFocused = document.activeElement === textareaRef.current;
          if (!wasFocused) {
            textareaRef.current.focus();
          }
          // Restore cursor position if we have one saved
          if (cursorPositionRef.current !== null) {
            const pos = Math.min(cursorPositionRef.current, textareaRef.current.value.length);
            textareaRef.current.setSelectionRange(pos, pos);
            cursorPositionRef.current = null; // Clear after restoring
          }
        }
      });
    }
  }, [isEditing, editedContent]); // Re-run when content changes to restore focus
  
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
