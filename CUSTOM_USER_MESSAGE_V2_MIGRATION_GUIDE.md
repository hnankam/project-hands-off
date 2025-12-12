# CustomUserMessage V1 to V2 Migration Guide

## Overview

This guide details how to migrate the CustomUserMessage component from CopilotKit V1 to V2 while maintaining the rich feature set and design from V1.

## Table of Contents

1. [V1 Design Features](#v1-design-features)
2. [V2 Slot Structure](#v2-slot-structure)
3. [Key Differences](#key-differences)
4. [Migration Approach](#migration-approach)
5. [Implementation Plan](#implementation-plan)
6. [Code Examples](#code-examples)

---

## V1 Design Features

The V1 `CustomUserMessage` component (from `CustomUserMessage.tsx`) includes these features:

### Core Features
- ✅ **Edit message content** - Inline textarea editing with save/cancel
- ✅ **Delete operations** with dropdown menu:
  - Delete this message only
  - Delete all messages above (and this one)
  - Delete all messages below (and this one)
- ✅ **Copy to clipboard** - With visual feedback (checkmark animation)
- ✅ **Undo last edit** - Maintains edit history
- ✅ **Rerun/Regenerate** - Trigger assistant response again
- ✅ **Image support** - Via ImageRenderer component
- ✅ **Attachment chips** - Parse and display hidden manifest
- ✅ **Hover controls** - Show/hide toolbar on mouse hover
- ✅ **Markdown rendering** - Via custom MarkdownRenderer
- ✅ **Keyboard shortcuts** - Cmd+Enter to save, Esc to cancel

### Design System
- **Styling**: Matches existing design with rounded corners, theme-aware colors
- **Colors (Light)**: Background `#f9fafb`, Border `#e5e7eb`, Text `#374151`
- **Colors (Dark)**: Background `#151C24`, Border `#374151`, Text `#d1d5db`
- **Layout**: Full width with padding, visible overflow for dropdowns
- **Transitions**: Smooth fade-in for hover controls (0.2s ease)

### UI Elements
1. **Message Container** - Rounded, bordered, theme-aware
2. **Edit Mode** - Textarea with auto-resize
3. **Attachment Chips** - Small pills showing file info
4. **Control Toolbar** - Right-aligned with gradient fade background
5. **Delete Dropdown Menu** - Portal-based positioned menu
6. **Icons** - SVG icons for all actions (edit, delete, copy, undo, rerun)

---

## V2 Slot Structure

### How V2 Message Customization Works

In V2, message customization uses a **slot-based system** through the `messageView` prop:

```typescript
<CopilotChat
  agentId="dynamic_agent"
  threadId={sessionId}
  messageView={{
    assistantMessage: CustomAssistantMessageV2,  // Custom assistant message
    userMessage: CustomUserMessageV2,             // Custom user message (NEW)
  }}
/>
```

### CopilotChatUserMessage Type Structure

```typescript
// Main component props
interface CopilotChatUserMessageProps {
  // Required
  message: UserMessage;  // From @ag-ui/core
  
  // Optional callbacks
  onEditMessage?: (props: { message: UserMessage }) => void;
  onSwitchToBranch?: (props: { 
    message: UserMessage; 
    branchIndex: number; 
    numberOfBranches: number 
  }) => void;
  
  // Branching support (V2 feature)
  branchIndex?: number;
  numberOfBranches?: number;
  
  // Customization
  additionalToolbarItems?: React.ReactNode;
  
  // Slots for sub-components
  messageRenderer?: SlotValue<typeof CopilotChatUserMessage.MessageRenderer>;
  toolbar?: SlotValue<typeof CopilotChatUserMessage.Toolbar>;
  copyButton?: SlotValue<typeof CopilotChatUserMessage.CopyButton>;
  editButton?: SlotValue<typeof CopilotChatUserMessage.EditButton>;
  branchNavigation?: SlotValue<typeof CopilotChatUserMessage.BranchNavigation>;
  
  // HTML attributes
  className?: string;
  // ... other HTMLDivElement attributes
}

// Sub-components available
namespace CopilotChatUserMessage {
  const Container: React.FC<React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>>;
  const MessageRenderer: React.FC<{ content: string; className?: string; }>;
  const Toolbar: React.FC<React.HTMLAttributes<HTMLDivElement>>;
  const ToolbarButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & {
    title: string;
    children: React.ReactNode;
  }>;
  const CopyButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & {
    copied?: boolean;
  }>;
  const EditButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>>;
  const BranchNavigation: React.FC<React.HTMLAttributes<HTMLDivElement> & {
    currentBranch?: number;
    numberOfBranches?: number;
    onSwitchToBranch?: (props: CopilotChatUserMessageOnSwitchToBranchProps) => void;
    message: UserMessage;
  }>;
}
```

---

## Key Differences

### V1 vs V2 Comparison

| Feature | V1 Implementation | V2 Implementation |
|---------|-------------------|-------------------|
| **Message Prop** | `UserMessageProps` from react-core | `UserMessage` from @ag-ui/core |
| **Edit Handler** | Custom `handleSaveEdit()` with `setMessages()` | Use `onEditMessage` callback prop |
| **Delete Handler** | Custom with `setMessages()` | Use `setMessages()` from `useCopilotChat()` |
| **Copy Handler** | Custom clipboard API | Can use built-in `CopyButton` or custom |
| **Rerun/Regenerate** | Custom with `reloadMessages()` | Use `reloadMessages()` from `useCopilotChat()` |
| **Toolbar** | Custom hover toolbar | Use `Toolbar` slot + `additionalToolbarItems` |
| **Message Content** | Custom rendering with `MarkdownRenderer` | Use `messageRenderer` slot |
| **Image Support** | Via `ImageRenderer` prop | Built into V2 message type |
| **Attachments** | Custom manifest parsing | Need custom implementation |
| **Edit History** | Custom state management | Need custom state management |
| **Delete Menu** | Custom portal dropdown | Need custom implementation |

---

## Migration Approach

### Option 1: Wrapper Pattern (Recommended)

Create a wrapper around `CopilotChatUserMessage` similar to `CustomAssistantMessageV2`:

```typescript
const CustomUserMessageV2Component: React.FC<
  React.ComponentProps<typeof CopilotChatUserMessage>
> = (props) => {
  // Custom logic and state here
  return (
    <CopilotChatUserMessage
      {...props}
      additionalToolbarItems={<CustomToolbarItems />}
      messageRenderer={(rendererProps) => <CustomMessageRenderer {...rendererProps} />}
    />
  );
};

// Copy static properties to match expected slot type
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
```

### Option 2: Full Custom Implementation

Build a completely custom component that doesn't use `CopilotChatUserMessage` at all. This gives maximum control but requires more code.

**Recommendation**: Use **Option 1 (Wrapper Pattern)** - it's cleaner and maintains compatibility with V2 features like branching.

---

## Implementation Plan

### Step 1: Create Base Structure

Create `CustomUserMessageV2.tsx` in `/pages/side-panel/src/components/chat/`:

```typescript
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CopilotChatUserMessage } from '../../hooks/copilotkit';
import { useStorage, persistenceLock } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { useCopilotChat } from '../../hooks/copilotkit';
import { useChatSessionIdSafe } from '../../context/ChatSessionIdContext';
import { MarkdownRenderer } from '../tiptap/MarkdownRenderer';
import type { UserMessage } from '@ag-ui/core';

type UserMessageProps = React.ComponentProps<typeof CopilotChatUserMessage>;
```

### Step 2: Implement Custom Toolbar Items

Add the custom toolbar buttons (rerun, undo, delete) as `additionalToolbarItems`:

```typescript
const CustomToolbarItems: React.FC<{
  message: UserMessage;
  onRerun: () => void;
  onUndo: () => void;
  onDelete: () => void;
  hasEditHistory: boolean;
  isHovered: boolean;
}> = ({ message, onRerun, onUndo, onDelete, hasEditHistory, isHovered }) => {
  const { isLight } = useStorage(themeStorage);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  
  // Return custom toolbar buttons
  return (
    <>
      {/* Rerun Button */}
      <CopilotChatUserMessage.ToolbarButton
        title="Rerun response"
        onClick={onRerun}
        style={{ color: '#3b82f6' }}
      >
        {/* SVG icon */}
      </CopilotChatUserMessage.ToolbarButton>
      
      {/* Undo Button (conditional) */}
      {hasEditHistory && (
        <CopilotChatUserMessage.ToolbarButton
          title="Undo last edit"
          onClick={onUndo}
          style={{ color: '#3b82f6' }}
        >
          {/* SVG icon */}
        </CopilotChatUserMessage.ToolbarButton>
      )}
      
      {/* Delete Menu */}
      <DeleteMenuButton 
        message={message} 
        onDelete={onDelete}
        isLight={isLight}
      />
    </>
  );
};
```

### Step 3: Implement Custom Message Renderer

Handle attachments and custom markdown rendering:

```typescript
const CustomMessageRenderer: React.FC<{
  content: string;
  className?: string;
  message: UserMessage;
}> = ({ content, className, message }) => {
  const { isLight } = useStorage(themeStorage);
  
  // Parse attachment manifest
  const { cleanedContent, attachments } = useMemo(() => {
    const re = /<!--ATTACHMENTS:\s*([\s\S]*?)\s*-->/m;
    const m = content.match(re);
    if (!m) return { cleanedContent: content, attachments: [] };
    
    const json = m[1];
    const list = JSON.parse(json);
    const cleaned = content.replace(re, '').trimEnd();
    return { cleanedContent: cleaned, attachments: list };
  }, [content]);
  
  return (
    <div className={className}>
      {/* Attachment chips */}
      {attachments.length > 0 && (
        <AttachmentChips attachments={attachments} isLight={isLight} />
      )}
      
      {/* Message content with custom markdown */}
      <MarkdownRenderer content={cleanedContent} isLight={isLight} />
    </div>
  );
};
```

### Step 4: Implement Delete Menu

Create a dropdown menu component using portal:

```typescript
const DeleteMenuButton: React.FC<{
  message: UserMessage;
  onDelete: (type: 'this' | 'above' | 'below') => void;
  isLight: boolean;
}> = ({ message, onDelete, isLight }) => {
  const [showMenu, setShowMenu] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Position calculation on open
  useEffect(() => {
    if (showMenu && buttonRef.current && dropdownRef.current) {
      requestAnimationFrame(() => {
        const buttonRect = buttonRef.current!.getBoundingClientRect();
        const top = buttonRect.bottom + 4;
        const right = window.innerWidth - buttonRect.right;
        dropdownRef.current!.style.top = `${top}px`;
        dropdownRef.current!.style.right = `${right}px`;
      });
    }
  }, [showMenu]);
  
  // Click outside handler
  useEffect(() => {
    if (!showMenu) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && 
          !dropdownRef.current?.contains(target)) {
        setShowMenu(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [showMenu]);
  
  return (
    <>
      <CopilotChatUserMessage.ToolbarButton
        ref={buttonRef}
        title="Delete options"
        onClick={() => setShowMenu(!showMenu)}
        style={{ color: '#ef4444' }}
      >
        {/* Delete icon SVG */}
      </CopilotChatUserMessage.ToolbarButton>
      
      {showMenu && createPortal(
        <div ref={dropdownRef} className="delete-dropdown-menu">
          {/* Menu items */}
        </div>,
        document.body
      )}
    </>
  );
};
```

### Step 5: Wire Up Main Component

```typescript
const CustomUserMessageV2Component: React.FC<UserMessageProps> = (props) => {
  const { message } = props;
  const { isLight } = useStorage(themeStorage);
  const { messages, setMessages, reloadMessages } = useCopilotChat();
  const sessionId = useChatSessionIdSafe();
  
  // Edit history state
  const [editHistory, setEditHistory] = useState<string[]>([]);
  
  // Find message index
  const index = useMemo(() => {
    if (!messages || !message) return -1;
    return messages.findIndex(m => m.id === message.id);
  }, [messages, message]);
  
  // Handle rerun
  const handleRerun = useCallback(() => {
    if (!messages || !message || index === -1) return;
    
    const following = messages.slice(index + 1)
      .find(m => (m as any)?.role === 'assistant');
    
    if (following?.id) {
      reloadMessages(following.id);
    } else if (message.id) {
      reloadMessages(message.id);
    }
  }, [messages, message, index, reloadMessages]);
  
  // Handle undo
  const handleUndo = useCallback(() => {
    if (!messages || editHistory.length === 0 || index === -1) return;
    
    const previousContent = editHistory[editHistory.length - 1];
    const updatedMessages = [...messages];
    updatedMessages[index] = {
      ...updatedMessages[index],
      content: previousContent,
    };
    setMessages(updatedMessages);
    setEditHistory(prev => prev.slice(0, -1));
  }, [messages, editHistory, index, setMessages]);
  
  // Handle delete operations
  const handleDelete = useCallback((type: 'this' | 'above' | 'below') => {
    if (!messages || index === -1) return;
    
    let updatedMessages: typeof messages;
    switch (type) {
      case 'this':
        updatedMessages = messages.filter((_, i) => i !== index);
        break;
      case 'above':
        updatedMessages = messages.filter((_, i) => i > index);
        break;
      case 'below':
        updatedMessages = messages.filter((_, i) => i < index);
        break;
    }
    
    // Signal intentional delete if empty
    if (sessionId && updatedMessages.length === 0) {
      persistenceLock.setManualReset(sessionId, true);
    }
    
    setMessages(updatedMessages);
  }, [messages, index, sessionId, setMessages]);
  
  // Handle edit
  const handleEditMessage = useCallback((editProps: { message: UserMessage }) => {
    if (!messages || index === -1) return;
    
    // Save to edit history
    const currentContent = (message as any)?.content || '';
    setEditHistory(prev => [...prev, currentContent]);
    
    // The edit is already applied by CopilotKit
    // We just track it in history
  }, [messages, message, index]);
  
  // Custom toolbar items
  const toolbarItems = (
    <CustomToolbarItems
      message={message}
      onRerun={handleRerun}
      onUndo={handleUndo}
      onDelete={handleDelete}
      hasEditHistory={editHistory.length > 0}
      isHovered={true}
    />
  );
  
  return (
    <CopilotChatUserMessage
      {...props}
      onEditMessage={handleEditMessage}
      additionalToolbarItems={toolbarItems}
      messageRenderer={(rendererProps) => (
        <CustomMessageRenderer 
          {...rendererProps} 
          message={message} 
        />
      )}
      className={`copilotKitUserMessage ${props.className || ''}`}
    />
  );
};

// Export with static properties
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
```

### Step 6: Update ChatInner.tsx

```typescript
import { CustomUserMessageV2 } from './CustomUserMessageV2';

// In the render:
<CopilotChat
  agentId="dynamic_agent"
  threadId={sessionId}
  messageView={{
    assistantMessage: CustomAssistantMessageV2,
    userMessage: CustomUserMessageV2,  // Add this line
  }}
  chatView={{
    scrollToBottomButton: CustomScrollToBottomButton,
    feather: CustomFeather,
    disclaimer: CustomDisclaimer,
    suggestionView: CustomSuggestionView as any,
  }}
/>
```

### Step 7: Styling

Update or create CSS file for V2 user message styling:

```css
/* Ensure the styles match V1 design */
.copilotKitUserMessage {
  position: relative;
  border-radius: 10px;
  padding: 0.5rem;
  overflow: visible;
  transition: all 0.2s ease-in-out;
}

/* Light mode */
:not(.dark) .copilotKitUserMessage {
  background-color: #f9fafb;
  border: 1px solid #e5e7eb;
  color: #374151;
}

/* Dark mode */
.dark .copilotKitUserMessage {
  background-color: #151C24;
  border: 1px solid #374151;
  color: #d1d5db;
}

/* Toolbar styling */
.copilotKitUserMessage [data-toolbar] {
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s ease-in-out, visibility 0.2s ease-in-out;
}

.copilotKitUserMessage:hover [data-toolbar] {
  opacity: 1;
  visibility: visible;
}
```

---

## Code Examples

### Complete Minimal Example

Here's a minimal working example that adds just the rerun button:

```typescript
// CustomUserMessageV2.tsx (minimal version)
import React, { useCallback, useMemo } from 'react';
import { CopilotChatUserMessage } from '../../hooks/copilotkit';
import { useCopilotChat } from '../../hooks/copilotkit';
import type { UserMessage } from '@ag-ui/core';

type UserMessageProps = React.ComponentProps<typeof CopilotChatUserMessage>;

const CustomUserMessageV2Component: React.FC<UserMessageProps> = (props) => {
  const { message } = props;
  const { messages, reloadMessages } = useCopilotChat();
  
  const index = useMemo(() => {
    return messages?.findIndex(m => m.id === message.id) ?? -1;
  }, [messages, message]);
  
  const handleRerun = useCallback(() => {
    if (!messages || index === -1) return;
    
    const following = messages.slice(index + 1)
      .find(m => (m as any)?.role === 'assistant');
    
    if (following?.id) {
      reloadMessages(following.id);
    }
  }, [messages, index, reloadMessages]);
  
  const rerunButton = (
    <CopilotChatUserMessage.ToolbarButton
      title="Rerun response"
      onClick={handleRerun}
      style={{ color: '#3b82f6' }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" 
           strokeWidth="2" width="16" height="16">
        <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </CopilotChatUserMessage.ToolbarButton>
  );
  
  return (
    <CopilotChatUserMessage
      {...props}
      additionalToolbarItems={rerunButton}
    />
  );
};

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
```

---

## Feature Mapping

### V1 Feature → V2 Implementation

| V1 Feature | V2 Implementation Method |
|------------|-------------------------|
| **Edit** | Built-in via `EditButton` + `onEditMessage` callback |
| **Copy** | Built-in via `CopyButton` (automatic) |
| **Delete** | Custom button in `additionalToolbarItems` + `setMessages()` |
| **Undo** | Custom button + edit history state |
| **Rerun** | Custom button + `reloadMessages()` from `useCopilotChat` |
| **Attachments** | Custom `messageRenderer` slot with parsing logic |
| **Hover Controls** | Built-in toolbar auto-shows on hover |
| **Markdown** | Custom `messageRenderer` slot with `MarkdownRenderer` |
| **Keyboard Shortcuts** | Built-in edit mode supports Enter/Esc |
| **Delete Menu** | Custom dropdown in `additionalToolbarItems` with portal |

---

## Migration Checklist

- [ ] Create `CustomUserMessageV2.tsx` file
- [ ] Implement `CustomToolbarItems` component
- [ ] Implement `CustomMessageRenderer` component
- [ ] Implement `DeleteMenuButton` component
- [ ] Add attachment parsing logic
- [ ] Add edit history state management
- [ ] Wire up rerun handler
- [ ] Wire up delete handlers
- [ ] Wire up undo handler
- [ ] Copy V1 SVG icons
- [ ] Update CSS for V2 styling
- [ ] Export component with static properties
- [ ] Update `ChatInner.tsx` to use new component
- [ ] Test edit functionality
- [ ] Test delete functionality
- [ ] Test rerun functionality
- [ ] Test undo functionality
- [ ] Test attachment display
- [ ] Test keyboard shortcuts
- [ ] Test theme switching
- [ ] Test hover interactions

---

## Benefits of V2 Approach

1. **Cleaner Architecture** - Leverages built-in CopilotKit features
2. **Branching Support** - Automatically compatible with V2 message branching
3. **Better Maintenance** - Less custom code to maintain
4. **Type Safety** - Full TypeScript support with proper types
5. **Future-Proof** - Uses official V2 APIs and patterns
6. **Built-in Features** - Copy, edit, toolbar management handled by CopilotKit

---

## Notes and Gotchas

1. **Message Type Change**: V1 uses custom `UserMessageProps`, V2 uses `UserMessage` from `@ag-ui/core`
2. **Content Structure**: May need to handle different content formats in V2
3. **Edit Callback**: V2's `onEditMessage` is invoked after the edit is applied, unlike V1's manual save
4. **Toolbar Visibility**: V2 handles hover automatically, no need for custom `isHovered` state
5. **Static Properties**: Must copy all static sub-components to match the expected slot type
6. **Portal Positioning**: Delete menu still needs manual positioning with portal
7. **Theme Context**: Continue using existing `themeStorage` for consistency

---

## Additional Resources

- [CopilotKit V2 Migration Plan](./COPILOTKIT_V2_MIGRATION_PLAN.md)
- [CustomAssistantMessageV2 Reference](./pages/side-panel/src/components/chat/CustomAssistantMessageV2.tsx)
- [V1 CustomUserMessage Source](./pages/side-panel/src/components/chat/CustomUserMessage.tsx)
- [CopilotKit V2 Documentation](https://docs.copilotkit.ai/)

