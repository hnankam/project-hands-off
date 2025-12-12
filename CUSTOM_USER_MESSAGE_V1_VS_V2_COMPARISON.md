# CustomUserMessage: V1 vs V2 Visual Comparison

## Quick Reference Guide

This document provides side-by-side comparisons of the V1 and V2 implementations for easy reference.

---

## Component Structure

### V1 Structure

```
CustomUserMessage (Full Custom Component)
├── Message Container <div>
│   ├── Edit Mode (conditional)
│   │   ├── Textarea
│   │   └── Save/Cancel Buttons
│   └── View Mode (conditional)
│       ├── Image Renderer (if image)
│       ├── Attachment Chips
│       └── Markdown Content
└── Control Toolbar (hover)
    ├── Rerun Button
    ├── Copy Button
    ├── Undo Button (conditional)
    ├── Edit Button
    └── Delete Button with Dropdown
        ├── Delete this message
        ├── Delete all above
        └── Delete all below
```

### V2 Structure (Recommended)

```
CustomUserMessageV2 (Wrapper Component)
└── CopilotChatUserMessage (Base Component)
    ├── Container (slot)
    ├── MessageRenderer (slot) ← Custom with attachments
    ├── Toolbar (slot)
    │   ├── CopyButton (built-in)
    │   ├── EditButton (built-in)
    │   └── additionalToolbarItems ← Custom buttons
    │       ├── Rerun Button
    │       ├── Undo Button
    │       └── Delete Menu Button
    └── BranchNavigation (slot, optional)
```

---

## Component Usage

### V1 Usage

```typescript
// In ChatInner or CopilotChat
import { CustomUserMessage } from './CustomUserMessage';

<CopilotChat
  UserMessage={CustomUserMessage}  // Direct component prop
  AssistantMessage={CustomAssistantMessage}
  Messages={MessagesComponent}
  Input={ScopedInput}
/>
```

### V2 Usage

```typescript
// In ChatInner
import { CustomUserMessageV2 } from './CustomUserMessageV2';

<CopilotChat
  agentId="dynamic_agent"
  threadId={sessionId}
  messageView={{                    // Nested slot object
    assistantMessage: CustomAssistantMessageV2,
    userMessage: CustomUserMessageV2,  // Add here
  }}
/>
```

---

## Props and Types

### V1 Props

```typescript
// Custom interface from hooks
interface UserMessageProps {
  message?: any;
  children?: ReactNode;
  className?: string;
  ImageRenderer?: React.ComponentType<{ imageUrl: string }>;
}

const CustomUserMessage: React.FC<UserMessageProps> = ({
  message,
  ImageRenderer: ImageRendererComponent = ImageRenderer,
}) => {
  // Component logic
};
```

### V2 Props

```typescript
// Type from CopilotKit
type UserMessageProps = React.ComponentProps<typeof CopilotChatUserMessage>;

// Includes:
interface CopilotChatUserMessageProps {
  message: UserMessage;  // From @ag-ui/core
  onEditMessage?: (props: { message: UserMessage }) => void;
  onSwitchToBranch?: (props: { ... }) => void;
  branchIndex?: number;
  numberOfBranches?: number;
  additionalToolbarItems?: React.ReactNode;
  // + slot overrides
  // + HTML div attributes
}
```

---

## State Management

### V1 Approach

```typescript
const CustomUserMessage: React.FC<UserMessageProps> = ({ message }) => {
  // Local state for all features
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [editHistory, setEditHistory] = useState<string[]>([]);
  const [showCopyFeedback, setShowCopyFeedback] = useState(false);
  
  // Direct hooks access
  const { messages, setMessages, reloadMessages } = useCopilotChat();
  
  // Manual state management for everything
  const handleEdit = () => {
    setEditedContent(cleanedContent);
    setIsEditing(true);
  };
  
  const handleSaveEdit = () => {
    setEditHistory(prev => [...prev, content]);
    const updatedMessages = [...messages];
    updatedMessages[index] = { ...updatedMessages[index], content: editedContent };
    setMessages(updatedMessages);
    setIsEditing(false);
  };
  
  // ... more handlers
};
```

### V2 Approach

```typescript
const CustomUserMessageV2Component: React.FC<UserMessageProps> = (props) => {
  // Minimal state - edit handled by CopilotKit
  const [editHistory, setEditHistory] = useState<string[]>([]);
  
  // Hooks for custom features only
  const { messages, setMessages, reloadMessages } = useCopilotChat();
  
  // Edit callback - invoked after edit is applied
  const handleEditMessage = useCallback((editProps) => {
    // Just track in history, edit already applied
    setEditHistory(prev => [...prev, originalContent]);
  }, [originalContent]);
  
  // Leverage built-in edit functionality
  return (
    <CopilotChatUserMessage
      {...props}
      onEditMessage={handleEditMessage}  // Hook into built-in edit
      additionalToolbarItems={<CustomButtons />}
    />
  );
};
```

---

## Toolbar Implementation

### V1 Toolbar (Full Custom)

```typescript
{/* Custom toolbar container with hover logic */}
{!isEditing && (
  <div
    className="copilotKitMessageControls"
    style={{
      position: 'absolute',
      bottom: '0rem',
      right: '0.5rem',
      opacity: isHovered ? 1 : 0,
      visibility: isHovered ? 'visible' : 'hidden',
      // ... more styles
    }}>
    {/* Rerun Button */}
    <button onClick={handleRerun} title="Rerun response" style={{ ... }}>
      <svg>...</svg>
    </button>
    
    {/* Copy Button */}
    <button onClick={handleCopy} title="Copy message" style={{ ... }}>
      {showCopyFeedback ? <CheckIcon /> : <CopyIcon />}
    </button>
    
    {/* Undo Button (conditional) */}
    {editHistory.length > 0 && (
      <button onClick={handleUndoEdit} title="Undo last edit" style={{ ... }}>
        <svg>...</svg>
      </button>
    )}
    
    {/* Edit Button */}
    <button onClick={handleEdit} title="Edit message" style={{ ... }}>
      <svg>...</svg>
    </button>
    
    {/* Delete Button with Dropdown */}
    <button onClick={() => setShowDeleteMenu(!showDeleteMenu)} style={{ ... }}>
      <svg>...</svg>
    </button>
  </div>
)}
```

### V2 Toolbar (Hybrid Built-in + Custom)

```typescript
// Custom toolbar items only
const CustomToolbarItems: React.FC<Props> = ({ ... }) => {
  return (
    <>
      {/* Rerun - Custom */}
      <CopilotChatUserMessage.ToolbarButton
        title="Rerun response"
        onClick={onRerun}
        style={{ color: '#3b82f6' }}
      >
        <svg>...</svg>
      </CopilotChatUserMessage.ToolbarButton>
      
      {/* Undo - Custom (conditional) */}
      {hasEditHistory && (
        <CopilotChatUserMessage.ToolbarButton
          title="Undo last edit"
          onClick={onUndo}
          style={{ color: '#3b82f6' }}
        >
          <svg>...</svg>
        </CopilotChatUserMessage.ToolbarButton>
      )}
      
      {/* Delete Menu - Custom */}
      <DeleteMenuButton {...props} />
    </>
  );
};

// Main component
return (
  <CopilotChatUserMessage
    {...props}
    additionalToolbarItems={<CustomToolbarItems {...toolbarProps} />}
  />
  // Copy button and Edit button are built-in, added automatically
);
```

**Key Difference**: V2 provides Copy and Edit buttons automatically. You only need to add custom buttons via `additionalToolbarItems`.

---

## Message Content Rendering

### V1 Content Rendering

```typescript
// Manual rendering with conditional logic
{!isEditing && (
  <div>
    {/* Image rendering */}
    {isImageMessage && <ImageRendererComponent image={message.image!} content={message.content} />}

    {/* Attachment chips */}
    {attachments.length > 0 && (
      <div style={{ ... }}>
        {attachments.map((att, idx) => (
          <div key={`${att.url}-${idx}`} style={{ ... }}>
            <svg>...</svg>
            <a href={att.url}>{att.name}</a>
            <span>({formatSize(att.size)})</span>
          </div>
        ))}
      </div>
    )}

    {/* Text content */}
    {!isImageMessage && (
      <div style={{ ... }}>
        <MarkdownRenderer content={cleanedContent} isLight={isLight} />
      </div>
    )}
  </div>
)}
```

### V2 Content Rendering

```typescript
// Custom messageRenderer slot
const CustomMessageRenderer: React.FC<{
  content: string;
  className?: string;
  message: UserMessage;
}> = ({ content, className, message }) => {
  // Parse attachments from content
  const { cleanedContent, attachments } = parseAttachments(content);
  
  return (
    <div className={className}>
      {/* Attachment chips (same logic) */}
      {attachments.length > 0 && (
        <AttachmentChips attachments={attachments} isLight={isLight} />
      )}
      
      {/* Custom markdown renderer */}
      <MarkdownRenderer content={cleanedContent} isLight={isLight} />
    </div>
  );
};

// In main component
return (
  <CopilotChatUserMessage
    {...props}
    messageRenderer={(rendererProps) => (
      <CustomMessageRenderer {...rendererProps} message={message} />
    )}
  />
  // Images handled automatically by CopilotKit if present in UserMessage
);
```

**Key Difference**: V2 uses a slot for content rendering. Images are handled automatically by the base component.

---

## Edit Mode

### V1 Edit Mode

```typescript
// Full manual implementation
{isEditing ? (
  <div className="edit-mode" style={{ width: '100%' }}>
    <textarea
      ref={textareaRef}
      value={editedContent}
      onChange={e => setEditedContent(e.target.value)}
      onKeyDown={handleKeyDown}  // Cmd+Enter, Esc
      style={{ ... }}
    />
    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
      <button onClick={handleCancelEdit}>Cancel</button>
      <button onClick={handleSaveEdit}>Save</button>
    </div>
  </div>
) : (
  <div>{/* View mode content */}</div>
)}
```

### V2 Edit Mode

```typescript
// Built-in edit mode triggered by EditButton
// Edit mode is managed internally by CopilotChatUserMessage

// You only need to handle the edit callback
const handleEditMessage = useCallback((editProps: { message: UserMessage }) => {
  // Edit is already applied, just track history
  const currentContent = message.content;
  setEditHistory(prev => [...prev, currentContent]);
}, [message]);

return (
  <CopilotChatUserMessage
    {...props}
    onEditMessage={handleEditMessage}
  />
  // Edit mode UI, save/cancel buttons all built-in
);
```

**Key Difference**: V2 handles edit mode UI automatically. You just provide a callback to track the edit.

---

## Delete Operations

### V1 Delete Menu

```typescript
// Custom dropdown with portal
<div ref={deleteMenuRef}>
  <button
    ref={deleteButtonRef}
    onClick={() => setShowDeleteMenu(!showDeleteMenu)}
    style={{ color: '#ef4444' }}
  >
    <svg>...</svg>
  </button>

  {showDeleteMenu && createPortal(
    <div ref={deleteDropdownRef} style={{ position: 'fixed', ... }}>
      <button onClick={handleDeleteMessage}>Delete this message</button>
      <button onClick={handleDeleteAbove} disabled={index === 0}>
        Delete all above
      </button>
      <button onClick={handleDeleteBelow} disabled={isLast}>
        Delete all below
      </button>
    </div>,
    document.body
  )}
</div>

// Delete handlers
const handleDeleteMessage = () => {
  const updatedMessages = messages.filter((_, i) => i !== index);
  setMessages(updatedMessages);
  setShowDeleteMenu(false);
};
```

### V2 Delete Menu

```typescript
// Same approach - custom dropdown in additionalToolbarItems
const DeleteMenuButton: React.FC<Props> = ({ ... }) => {
  const [showMenu, setShowMenu] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Position calculation, click outside logic (same as V1)
  
  return (
    <>
      <CopilotChatUserMessage.ToolbarButton  // Use built-in button style
        ref={buttonRef}
        title="Delete options"
        onClick={() => setShowMenu(!showMenu)}
        style={{ color: '#ef4444' }}
      >
        <svg>...</svg>
      </CopilotChatUserMessage.ToolbarButton>
      
      {showMenu && createPortal(
        <div ref={dropdownRef} style={{ position: 'fixed', ... }}>
          {/* Same menu items as V1 */}
        </div>,
        document.body
      )}
    </>
  );
};

// Delete handlers (same logic)
const handleDelete = (type: 'this' | 'above' | 'below') => {
  let updatedMessages: typeof messages;
  // ... same logic as V1
  setMessages(updatedMessages);
};
```

**Key Difference**: V2 uses `CopilotChatUserMessage.ToolbarButton` for consistent styling, but delete logic remains custom.

---

## Hooks Usage

### V1 Hooks

```typescript
import {
  useCopilotChat,
  ImageRenderer,
  type UserMessageProps,
} from '../../hooks/copilotkit';
import { useStorage, persistenceLock } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { useChatSessionIdSafe } from '../../context/ChatSessionIdContext';

const CustomUserMessage: React.FC<UserMessageProps> = ({ message }) => {
  const { isLight } = useStorage(themeStorage);
  const { messages, setMessages, reloadMessages } = useCopilotChat();
  const sessionId = useChatSessionIdSafe();
  
  // Use all hooks directly
};
```

### V2 Hooks

```typescript
import { CopilotChatUserMessage } from '../../hooks/copilotkit';
import { useCopilotChat } from '../../hooks/copilotkit';
import { useStorage, persistenceLock } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { useChatSessionIdSafe } from '../../context/ChatSessionIdContext';
import type { UserMessage } from '@ag-ui/core';

type UserMessageProps = React.ComponentProps<typeof CopilotChatUserMessage>;

const CustomUserMessageV2Component: React.FC<UserMessageProps> = (props) => {
  const { message } = props;
  const { isLight } = useStorage(themeStorage);
  const { messages, setMessages, reloadMessages } = useCopilotChat();
  const sessionId = useChatSessionIdSafe();
  
  // Same hooks, but less state management needed
};
```

**Key Difference**: V2 imports `UserMessage` type from `@ag-ui/core` and derives props from `CopilotChatUserMessage`.

---

## Export Pattern

### V1 Export

```typescript
// Simple named export
export const CustomUserMessage: React.FC<UserMessageProps> = ({ ... }) => {
  // Component implementation
};
```

### V2 Export

```typescript
// Component
const CustomUserMessageV2Component: React.FC<UserMessageProps> = (props) => {
  // Component implementation
};

// Export with static properties (REQUIRED for slot compatibility)
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

**Key Difference**: V2 requires copying static sub-component properties to match the expected slot type signature.

---

## CSS Classes

### V1 Classes

```typescript
// Custom classes
<div
  className="copilotKitMessage copilotKitUserMessage"
  data-message-role="user"
  data-message-id={(message as any)?.id || ''}
  style={{ ... }}
>
  {/* Custom inline styles for everything */}
</div>
```

### V2 Classes

```typescript
// Leverage built-in classes + add custom
<CopilotChatUserMessage
  {...props}
  className={`copilotKitUserMessage ${props.className || ''}`}
  // Built-in component handles most styling
/>

// CSS targets built-in structure
.copilotKitUserMessage {
  /* Your custom overrides */
}
```

**Key Difference**: V2 uses built-in CopilotKit classes and structure. You mainly override styles via CSS.

---

## Testing Considerations

### V1 Testing Concerns

- Test all custom state management
- Test edit mode transitions
- Test toolbar visibility on hover
- Test delete menu positioning
- Test keyboard shortcuts
- Test clipboard API
- Test portal cleanup
- Test all custom handlers

### V2 Testing Concerns

- Test custom toolbar items
- Test delete menu positioning (still custom)
- Test edit history tracking
- Test rerun functionality
- Test integration with built-in features
- Test attachment parsing
- Test that static properties are exported correctly

**Key Difference**: V2 has less custom logic to test since built-in features handle edit, copy, and toolbar visibility.

---

## Pros and Cons

### V1 Approach

**Pros:**
- ✅ Complete control over all features
- ✅ No dependency on CopilotKit internals
- ✅ Can customize every detail

**Cons:**
- ❌ More code to maintain (~900 lines)
- ❌ More state management
- ❌ More testing required
- ❌ Duplicate functionality with CopilotKit
- ❌ No built-in branching support
- ❌ Manual hover management

### V2 Approach

**Pros:**
- ✅ Leverages built-in features (less code ~300-400 lines)
- ✅ Automatic branching support
- ✅ Type-safe with official APIs
- ✅ Built-in toolbar management
- ✅ Built-in edit mode UI
- ✅ Less testing needed
- ✅ Future-proof with official slot system

**Cons:**
- ❌ Less control over built-in features
- ❌ Still need custom code for delete menu, undo, rerun
- ❌ Requires understanding slot system
- ❌ Must copy static properties for type compatibility

---

## Migration Effort Estimation

### V1 to V2 Migration

**Effort: Medium (4-8 hours)**

**Breakdown:**
1. Create new file and basic structure (30 min)
2. Implement custom toolbar items (1-2 hours)
3. Implement custom message renderer (1 hour)
4. Implement delete menu component (1-2 hours)
5. Wire up handlers and state (1 hour)
6. Copy icons and styles (30 min)
7. Update imports and exports (30 min)
8. Testing and bug fixes (1-2 hours)

**Risk: Low**
- Built-in features reduce complexity
- Pattern already established with CustomAssistantMessageV2
- Most logic can be reused from V1

---

## Recommendation

**Use the V2 Wrapper Approach** for these reasons:

1. **Less Code to Maintain**: ~60% reduction in custom code
2. **Built-in Features**: Edit, copy, toolbar management handled automatically
3. **Type Safety**: Full TypeScript support with official types
4. **Future Features**: Automatic compatibility with V2 branching
5. **Better Architecture**: Follows CopilotKit's recommended patterns
6. **Proven Pattern**: Same approach as CustomAssistantMessageV2

Only implement fully custom if you need complete control over edit mode UI or other built-in features.

---

## Next Steps

1. Review the [Full Migration Guide](./CUSTOM_USER_MESSAGE_V2_MIGRATION_GUIDE.md)
2. Start with minimal implementation (just rerun button)
3. Incrementally add features (undo, delete menu, attachments)
4. Test each feature as you add it
5. Update styles to match V1 design
6. Deploy and monitor for issues

---

## Quick Start Code Snippet

```typescript
// Minimal V2 implementation to get started
import React, { useCallback } from 'react';
import { CopilotChatUserMessage } from '../../hooks/copilotkit';
import { useCopilotChat } from '../../hooks/copilotkit';

type UserMessageProps = React.ComponentProps<typeof CopilotChatUserMessage>;

const CustomUserMessageV2Component: React.FC<UserMessageProps> = (props) => {
  const { messages, reloadMessages } = useCopilotChat();
  
  const handleRerun = useCallback(() => {
    const index = messages?.findIndex(m => m.id === props.message.id) ?? -1;
    if (index === -1) return;
    
    const following = messages?.slice(index + 1).find(m => (m as any)?.role === 'assistant');
    if (following?.id) reloadMessages(following.id);
  }, [messages, props.message, reloadMessages]);
  
  return (
    <CopilotChatUserMessage
      {...props}
      additionalToolbarItems={
        <CopilotChatUserMessage.ToolbarButton
          title="Rerun"
          onClick={handleRerun}
          style={{ color: '#3b82f6' }}
        >
          🔄
        </CopilotChatUserMessage.ToolbarButton>
      }
    />
  );
};

export const CustomUserMessageV2 = Object.assign(
  CustomUserMessageV2Component,
  CopilotChatUserMessage
) as typeof CopilotChatUserMessage;
```

Then use in `ChatInner.tsx`:

```typescript
<CopilotChat
  messageView={{
    assistantMessage: CustomAssistantMessageV2,
    userMessage: CustomUserMessageV2,
  }}
/>
```

That's it! You now have a custom user message with a rerun button. Add more features incrementally.

