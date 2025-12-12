# CustomInput V2 Migration Guide

> **Complete guide for migrating the custom input component from CopilotKit V1 to V2**

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Key Differences](#key-differences)
3. [Type System Changes](#type-system-changes)
4. [Architecture Comparison](#architecture-comparison)
5. [Migration Strategy](#migration-strategy)
6. [Step-by-Step Migration](#step-by-step-migration)
7. [Feature Mapping](#feature-mapping)
8. [Code Examples](#code-examples)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Overview

### What Changed?

CopilotKit V2 introduces a **slot-based architecture** for input customization, replacing V1's direct component replacement pattern. This provides more granular control over individual input sub-components while maintaining type safety.

### Current Implementation (V1)

Your `CustomInput.tsx` is a comprehensive input component with:
- ✅ Tiptap rich text editor
- ✅ File uploads with Firebase integration
- ✅ Drag & drop support
- ✅ Task progress card integration
- ✅ Multi-page context selector
- ✅ Push-to-talk functionality
- ✅ Custom icons and styling
- ✅ Slash commands and mentions
- ✅ Context menu prefill support

### Migration Goal

Preserve all existing functionality while adopting V2's slot-based pattern for better composability and maintainability.

---

## Key Differences

### V1 Pattern (Current)

```typescript
// V1: Direct component replacement
<CopilotChat
  Input={CustomInput}  // Replace entire input
/>
```

### V2 Pattern (Target)

```typescript
// V2: Slot-based customization
<CopilotChat
  chatView={(props) => (
    <CopilotChatView
      {...props}
      input={(inputProps) => (
        <CustomInputV2 {...inputProps} />  // Custom wrapper
      )}
      // OR customize sub-components
      input={(inputProps) => (
        <CopilotChatInput
          {...inputProps}
          textArea={CustomTextArea}
          sendButton={CustomSendButton}
          addMenuButton={CustomAddMenuButton}
        />
      )}
    />
  )}
/>
```

---

## Type System Changes

### V1 InputProps

```typescript
interface InputProps {
  inProgress: boolean;
  onSend: (message: string) => void;
  isVisible?: boolean;
  onStop?: () => void;
  onUpload?: (file: File) => void;
  hideStopButton?: boolean;
}

// Your custom extension
interface CustomInputProps extends InputProps {
  listenSessionId?: string;
  isAgentAndModelSelected?: boolean;
  taskProgressState?: AgentStepState;
  onTaskProgressStateChange?: (state: AgentStepState) => void;
  showTaskProgress?: boolean;
  sessionId?: string;
  onToggleTaskProgress?: () => void;
  selectedPageURLs?: string[];
  onSelectedPageURLsChange?: (urls: string[]) => void;
  currentPageURL?: string | null;
}
```

### V2 CopilotChatInputProps

```typescript
type CopilotChatInputSlots = {
  textArea: typeof CopilotChatInput.TextArea;
  sendButton: typeof CopilotChatInput.SendButton;
  startTranscribeButton: typeof CopilotChatInput.StartTranscribeButton;
  cancelTranscribeButton: typeof CopilotChatInput.CancelTranscribeButton;
  finishTranscribeButton: typeof CopilotChatInput.FinishTranscribeButton;
  addMenuButton: typeof CopilotChatInput.AddMenuButton;
  audioRecorder: typeof CopilotChatAudioRecorder;
};

type CopilotChatInputProps = WithSlots<CopilotChatInputSlots, {
  mode?: "input" | "transcribe" | "processing";
  toolsMenu?: (ToolsMenuItem | "-")[];
  autoFocus?: boolean;
  onSubmitMessage?: (value: string) => void;
  onStop?: () => void;
  isRunning?: boolean;
  onStartTranscribe?: () => void;
  onCancelTranscribe?: () => void;
  onFinishTranscribe?: () => void;
  onAddFile?: () => void;
  value?: string;
  onChange?: (value: string) => void;
}>;
```

### Key Changes

| V1 Prop | V2 Prop | Notes |
|---------|---------|-------|
| `inProgress` | `isRunning` | Renamed for clarity |
| `onSend` | `onSubmitMessage` | Renamed for consistency |
| `isVisible` | ❌ Removed | Handled by chatView visibility |
| `onUpload` | `onAddFile` | Callback only, file handling is manual |
| - | `mode` | 🆕 New: input/transcribe/processing states |
| - | `toolsMenu` | 🆕 New: Configurable tools dropdown |
| - | `value`/`onChange` | 🆕 New: Controlled input option |

---

## Architecture Comparison

### V1 Architecture (Current)

```
CustomInput (Monolithic)
├── Tiptap Editor
├── File Upload System
│   ├── Firebase Integration
│   ├── Drag & Drop
│   └── Paste Handler
├── Task Progress Card
├── Pages Selector
├── Custom Toolbar
│   ├── Plan Toggle
│   ├── Upload Menu
│   └── Push-to-Talk
└── Send/Stop Button
```

**Pros:**
- Complete control over entire input
- All features tightly integrated
- Custom event handling

**Cons:**
- Monolithic (1466 lines)
- Hard to compose with V2 components
- Difficult to maintain/test individual features

### V2 Architecture (Target)

```
CopilotChatInput (Composable)
├── Slots (Customizable)
│   ├── textArea (your Tiptap editor)
│   ├── sendButton (your custom button)
│   ├── addMenuButton (your upload menu)
│   ├── startTranscribeButton
│   ├── cancelTranscribeButton
│   ├── finishTranscribeButton
│   └── audioRecorder
└── Children Render Prop (Full Control)
    └── CustomInputWrapper
        ├── Task Progress Card
        ├── Pages Selector
        └── Slot Elements
```

**Pros:**
- Modular and composable
- Each feature is independently testable
- Easier to maintain
- Better TypeScript support
- Can mix custom + built-in components

**Cons:**
- More initial setup
- Need to understand slot system
- Some refactoring required

---

## Migration Strategy

### Recommended Approach: Hybrid Wrapper

Create a V2 wrapper that:
1. **Preserves** your custom features (Tiptap, uploads, task progress, pages selector)
2. **Adopts** V2's slot system for toolbar buttons
3. **Maintains** backward compatibility with your existing props

### Three Migration Paths

#### Option A: Full Custom Wrapper (Recommended)
Keep all your custom logic, wrap it as a V2 input component.

**Best for:** Preserving all existing functionality with minimal changes.

#### Option B: Hybrid Slots
Use V2's `CopilotChatInput` with custom slots for specific parts.

**Best for:** Gradual migration, mixing custom + built-in components.

#### Option C: Pure V2
Rebuild using V2 components entirely, migrate features one by one.

**Best for:** Clean slate, long-term maintainability.

---

## Step-by-Step Migration

### Phase 1: Create V2 Input Wrapper

Create `CustomInputV2.tsx` that wraps your existing logic:

```typescript
// CustomInputV2.tsx
import React from 'react';
import { CopilotChatInput, type CopilotChatInputProps } from '@copilotkitnext/react';
import { CustomInput } from './CustomInput'; // Your existing component

// Extend V2 props with your custom props
interface CustomInputV2Props extends Partial<CopilotChatInputProps> {
  // Your custom props
  listenSessionId?: string;
  isAgentAndModelSelected?: boolean;
  taskProgressState?: AgentStepState;
  onTaskProgressStateChange?: (state: AgentStepState) => void;
  showTaskProgress?: boolean;
  sessionId?: string;
  onToggleTaskProgress?: () => void;
  selectedPageURLs?: string[];
  onSelectedPageURLsChange?: (urls: string[]) => void;
  currentPageURL?: string | null;
}

export const CustomInputV2: React.FC<CustomInputV2Props> = ({
  // V2 props
  isRunning,
  onSubmitMessage,
  onStop,
  mode,
  toolsMenu,
  autoFocus,
  onAddFile,
  value,
  onChange,
  
  // Your custom props
  listenSessionId,
  isAgentAndModelSelected,
  taskProgressState,
  onTaskProgressStateChange,
  showTaskProgress,
  sessionId,
  onToggleTaskProgress,
  selectedPageURLs,
  onSelectedPageURLsChange,
  currentPageURL,
  
  ...rest
}) => {
  // Map V2 props to V1 props
  const v1Props = {
    inProgress: isRunning ?? false,
    onSend: onSubmitMessage ?? (() => {}),
    onStop: onStop ?? undefined,
    isVisible: true,
    hideStopButton: false,
    
    // Your custom props (unchanged)
    listenSessionId,
    isAgentAndModelSelected,
    taskProgressState,
    onTaskProgressStateChange,
    showTaskProgress,
    sessionId,
    onToggleTaskProgress,
    selectedPageURLs,
    onSelectedPageURLsChange,
    currentPageURL,
  };
  
  // Use your existing CustomInput with mapped props
  return <CustomInput {...v1Props} />;
};
```

### Phase 2: Update ChatInner Integration

Update `ChatInner.tsx` to use V2 slot pattern:

```typescript
// ChatInner.tsx
import { CustomInputV2 } from './CustomInputV2';

// ... inside component

return (
  <CopilotChat
    agentId="dynamic_agent"
    threadId={sessionId}
    messageView={{
      assistantMessage: CustomAssistantMessageV2,
      userMessage: CustomUserMessageV2,
    }}
    chatView={(chatViewProps) => (
      <CopilotChatView
        {...chatViewProps}
        scrollToBottomButton={CustomScrollToBottomButton}
        feather={CustomFeather}
        disclaimer={CustomDisclaimer}
        suggestionView={CustomSuggestionView as any}
        // Add custom input
        input={(inputProps) => (
          <CustomInputV2
            {...inputProps}
            listenSessionId={sessionId}
            isAgentAndModelSelected={isAgentAndModelSelected}
            taskProgressState={dynamicAgentState}
            onTaskProgressStateChange={setDynamicAgentState}
            showTaskProgress={showProgressBar}
            sessionId={sessionId}
            onToggleTaskProgress={toggleProgressBarFn}
            selectedPageURLs={selectedPageURLsRef.current}
            onSelectedPageURLsChange={urls => onPagesChangeRef.current?.(urls)}
            currentPageURL={currentPageURLRef.current}
          />
        )}
      />
    )}
  />
);
```

### Phase 3: Refactor to Slots (Optional - Long Term)

Gradually refactor individual features to use V2 slots:

```typescript
// CustomInputV2.tsx (Refactored with slots)
export const CustomInputV2: React.FC<CustomInputV2Props> = (props) => {
  const {
    taskProgressState,
    onTaskProgressStateChange,
    showTaskProgress,
    onToggleTaskProgress,
    selectedPageURLs,
    onSelectedPageURLsChange,
    currentPageURL,
    sessionId,
    ...inputProps
  } = props;
  
  return (
    <div className="custom-input-wrapper">
      {/* Task Progress Card - Above input */}
      {taskProgressState?.steps && taskProgressState.steps.length > 0 && (
        <TaskProgressCard 
          state={taskProgressState} 
          setState={onTaskProgressStateChange}
          isCollapsed={!showTaskProgress} 
        />
      )}
      
      {/* CopilotChatInput with custom slots */}
      <CopilotChatInput {...inputProps}>
        {({ textArea, sendButton, addMenuButton, audioRecorder }) => (
          <div className="input-layout">
            {/* Custom Tiptap Editor as textArea */}
            <CustomTiptapEditor {...textAreaProps} />
            
            {/* Toolbar */}
            <div className="input-toolbar">
              {/* Plan Toggle */}
              {canToggleTaskProgress && (
                <PlanToggleButton
                  showTaskProgress={showTaskProgress}
                  onToggle={onToggleTaskProgress}
                />
              )}
              
              {/* Upload Menu */}
              <CustomUploadMenu onFilesSelected={handleFiles} />
              
              {/* Pages Selector */}
              <PagesSelector
                selectedPageURLs={selectedPageURLs}
                onPagesChange={onSelectedPageURLsChange}
                currentPageURL={currentPageURL}
              />
              
              <div style={{ flexGrow: 1 }} />
              
              {/* Audio Recorder */}
              {audioRecorder}
              
              {/* Send Button */}
              {sendButton}
            </div>
          </div>
        )}
      </CopilotChatInput>
    </div>
  );
};
```

---

## Feature Mapping

### 1. Tiptap Editor → textArea Slot

**V1 (Current):**
```typescript
const editor = useEditor({
  extensions: [StarterKit, Markdown, CodeBlockLowlight, ...],
  // ... config
});

return <EditorContent editor={editor} />;
```

**V2 (Slot):**
```typescript
// Create custom TextArea component
const CustomTiptapTextArea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>((props, ref) => {
  const editor = useEditor({
    extensions: [StarterKit, Markdown, ...],
  });
  
  return <EditorContent editor={editor} />;
});

// Use as slot
<CopilotChatInput
  textArea={CustomTiptapTextArea}
/>
```

### 2. File Uploads → addMenuButton Slot

**V1 (Current):**
```typescript
<DropdownMenu
  trigger={<button>{CustomIcons.upload}</button>}
>
  <DropdownMenuItem onClick={openImagePicker}>
    Upload Images
  </DropdownMenuItem>
  <DropdownMenuItem onClick={openFilePicker}>
    Upload Files
  </DropdownMenuItem>
</DropdownMenu>
```

**V2 (Slot):**
```typescript
const CustomAddMenuButton = (props: ButtonHTMLAttributes<HTMLButtonElement>) => {
  return (
    <DropdownMenu
      trigger={<button {...props}>{CustomIcons.upload}</button>}
    >
      <DropdownMenuItem onClick={openImagePicker}>
        Upload Images
      </DropdownMenuItem>
      <DropdownMenuItem onClick={openFilePicker}>
        Upload Files
      </DropdownMenuItem>
    </DropdownMenu>
  );
};

<CopilotChatInput
  addMenuButton={CustomAddMenuButton}
/>
```

### 3. Task Progress Card → Wrapper Component

**V1 (Current):**
```typescript
return (
  <div className="copilotKitInputContainer">
    {/* Task Progress Card */}
    {taskProgressState?.steps && (
      <TaskProgressCard ... />
    )}
    {/* Input */}
    <div className="copilotKitInput">...</div>
  </div>
);
```

**V2 (Keep as wrapper):**
```typescript
const CustomInputV2 = (props) => {
  return (
    <div className="custom-input-wrapper">
      {/* Task Progress Card - Keep this outside CopilotChatInput */}
      {props.taskProgressState?.steps && (
        <TaskProgressCard ... />
      )}
      
      {/* CopilotChatInput */}
      <CopilotChatInput {...inputProps}>
        {/* ... slots */}
      </CopilotChatInput>
    </div>
  );
};
```

### 4. Pages Selector → Custom Toolbar Item

**V1 (Current):**
```typescript
<div className="copilotKitInputControls">
  {/* ... other buttons */}
  <PagesSelector ... />
  {/* ... send button */}
</div>
```

**V2 (Children render prop):**
```typescript
<CopilotChatInput {...props}>
  {({ textArea, sendButton, addMenuButton, audioRecorder }) => (
    <div className="input-layout">
      {textArea}
      <div className="toolbar">
        {addMenuButton}
        <PagesSelector ... />  {/* Custom component */}
        <div style={{ flexGrow: 1 }} />
        {audioRecorder}
        {sendButton}
      </div>
    </div>
  )}
</CopilotChatInput>
```

### 5. Push-to-Talk → audioRecorder Slot

**V1 (Current):**
```typescript
const { pushToTalkState, setPushToTalkState } = usePushToTalk({...});

{showPushToTalk && (
  <button onClick={() => setPushToTalkState(...)}>
    {CustomIcons.microphone}
  </button>
)}
```

**V2 (Use built-in + customize):**
```typescript
// Option A: Use built-in audioRecorder
<CopilotChatInput
  audioRecorder={(props) => <CopilotChatAudioRecorder {...props} />}
/>

// Option B: Custom push-to-talk
const CustomAudioRecorder = (props) => {
  const { pushToTalkState, setPushToTalkState } = usePushToTalk({...});
  
  return (
    <button onClick={() => setPushToTalkState(...)}>
      {CustomIcons.microphone}
    </button>
  );
};

<CopilotChatInput
  audioRecorder={CustomAudioRecorder}
/>
```

### 6. Send/Stop Button → sendButton Slot

**V1 (Current):**
```typescript
<button
  disabled={sendDisabled}
  onClick={isInProgress && !hideStopButton ? onStop : send}
  className="copilotKitInputControlButton"
>
  {buttonIcon}
</button>
```

**V2 (Slot):**
```typescript
const CustomSendButton = (props: ButtonHTMLAttributes<HTMLButtonElement>) => {
  const { isRunning, onStop } = useCustomInputContext();
  
  return (
    <button
      {...props}
      className="copilotKitInputControlButton"
    >
      {isRunning ? CustomIcons.stop : CustomIcons.send}
    </button>
  );
};

<CopilotChatInput
  sendButton={CustomSendButton}
/>
```

### 7. Drag & Drop → Wrapper Handler

**V1 (Current):**
```typescript
<div
  onDragEnter={handleDragEnter}
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
>
  {/* Input */}
</div>
```

**V2 (Keep as wrapper):**
```typescript
const CustomInputV2 = (props) => {
  const [isDragActive, setIsDragActive] = useState(false);
  
  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={isDragActive ? 'drag-active' : ''}
    >
      <CopilotChatInput {...props}>
        {/* ... */}
      </CopilotChatInput>
    </div>
  );
};
```

### 8. Context Menu Prefill → Custom Event Handler

**V1 (Current):**
```typescript
useEffect(() => {
  const handlePrefillEvent = (event: Event) => {
    const { text, sessionId } = event.detail;
    if (listenSessionId === sessionId) {
      editor.commands.setContent(text);
    }
  };
  
  window.addEventListener('copilot-prefill-text', handlePrefillEvent);
  return () => window.removeEventListener('copilot-prefill-text', handlePrefillEvent);
}, [listenSessionId, editor]);
```

**V2 (Keep unchanged - works with both):**
```typescript
// Same implementation - this is independent of CopilotKit version
// Keep in your CustomInputV2 wrapper
```

---

## Code Examples

### Example 1: Minimal Migration (Quick Win)

```typescript
// CustomInputV2.tsx - Minimal wrapper
import React from 'react';
import type { CopilotChatInputProps } from '@copilotkitnext/react';
import { CustomInput } from './CustomInput';

interface CustomInputV2Props extends Partial<CopilotChatInputProps> {
  listenSessionId?: string;
  isAgentAndModelSelected?: boolean;
  taskProgressState?: AgentStepState;
  onTaskProgressStateChange?: (state: AgentStepState) => void;
  showTaskProgress?: boolean;
  sessionId?: string;
  onToggleTaskProgress?: () => void;
  selectedPageURLs?: string[];
  onSelectedPageURLsChange?: (urls: string[]) => void;
  currentPageURL?: string | null;
}

export const CustomInputV2: React.FC<CustomInputV2Props> = ({
  isRunning,
  onSubmitMessage,
  onStop,
  ...customProps
}) => {
  // Simple prop mapping
  return (
    <CustomInput
      inProgress={isRunning ?? false}
      onSend={onSubmitMessage ?? (() => {})}
      onStop={onStop}
      isVisible={true}
      {...customProps}
    />
  );
};
```

### Example 2: Hybrid Approach (Recommended)

```typescript
// CustomInputV2.tsx - Hybrid with slots
import React from 'react';
import { CopilotChatInput, type CopilotChatInputProps } from '@copilotkitnext/react';
import { TaskProgressCard } from '../cards/TaskProgressCard';
import { PagesSelector } from '../selectors/PagesSelector';
import { CustomTiptapEditor } from './CustomTiptapEditor';
import { CustomUploadMenu } from './CustomUploadMenu';

interface CustomInputV2Props extends Partial<CopilotChatInputProps> {
  // Your custom props
  taskProgressState?: AgentStepState;
  onTaskProgressStateChange?: (state: AgentStepState) => void;
  showTaskProgress?: boolean;
  selectedPageURLs?: string[];
  onSelectedPageURLsChange?: (urls: string[]) => void;
  currentPageURL?: string | null;
  sessionId?: string;
}

export const CustomInputV2: React.FC<CustomInputV2Props> = ({
  // V2 props
  isRunning,
  onSubmitMessage,
  onStop,
  mode,
  autoFocus,
  
  // Custom props
  taskProgressState,
  onTaskProgressStateChange,
  showTaskProgress,
  selectedPageURLs,
  onSelectedPageURLsChange,
  currentPageURL,
  sessionId,
  
  ...rest
}) => {
  const hasTaskProgress = Boolean(
    taskProgressState?.steps?.some(step => step.status !== 'deleted')
  );

  return (
    <div className="custom-input-v2-wrapper">
      {/* Task Progress Card - Outside CopilotChatInput */}
      {hasTaskProgress && taskProgressState && onTaskProgressStateChange && (
        <div className={`task-progress-container ${showTaskProgress ? 'visible' : 'hidden'}`}>
          <TaskProgressCard
            state={taskProgressState}
            setState={onTaskProgressStateChange}
            isCollapsed={!showTaskProgress}
            isHistorical={false}
            showControls={true}
          />
        </div>
      )}
      
      {/* CopilotChatInput with slots */}
      <CopilotChatInput
        isRunning={isRunning}
        onSubmitMessage={onSubmitMessage}
        onStop={onStop}
        mode={mode}
        autoFocus={autoFocus}
        {...rest}
      >
        {({ textArea, sendButton, addMenuButton, audioRecorder }) => (
          <div className="input-content">
            {/* Custom Tiptap Editor */}
            <CustomTiptapEditor sessionId={sessionId} />
            
            {/* Custom Toolbar */}
            <div className="input-toolbar">
              {/* Upload Menu */}
              <CustomUploadMenu />
              
              {/* Pages Selector */}
              {onSelectedPageURLsChange && (
                <PagesSelector
                  selectedPageURLs={selectedPageURLs ?? []}
                  onPagesChange={onSelectedPageURLsChange}
                  currentPageURL={currentPageURL}
                  sessionId={sessionId}
                  variant="compact"
                />
              )}
              
              <div className="spacer" />
              
              {/* Audio Recorder */}
              {audioRecorder}
              
              {/* Send Button */}
              {sendButton}
            </div>
          </div>
        )}
      </CopilotChatInput>
    </div>
  );
};
```

### Example 3: Full Slot Customization (Advanced)

```typescript
// CustomInputV2.tsx - Full control with all custom slots
import React, { useState, useRef } from 'react';
import { CopilotChatInput, type CopilotChatInputProps } from '@copilotkitnext/react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

interface CustomInputV2Props extends Partial<CopilotChatInputProps> {
  sessionId?: string;
  // ... other custom props
}

// Custom TextArea using Tiptap
const CustomTiptapTextArea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { sessionId?: string }
>(({ sessionId, ...props }, ref) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      // ... your extensions
    ],
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
      },
    },
  });
  
  return (
    <div className="custom-textarea-wrapper">
      <EditorContent editor={editor} />
    </div>
  );
});

// Custom Send Button
const CustomSendButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = (props) => {
  return (
    <button
      {...props}
      className="custom-send-button"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="11" />
        <path d="M12 7v10M12 7l-4 4M12 7l4 4" stroke="white" strokeWidth="2" fill="none" />
      </svg>
    </button>
  );
};

// Custom Add Menu Button
const CustomAddMenuButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = (props) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleFilesPicked = (files: FileList | null) => {
    // Your file handling logic
  };
  
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFilesPicked(e.target.files)}
      />
      <button
        {...props}
        onClick={() => fileInputRef.current?.click()}
        className="custom-add-menu-button"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </>
  );
};

// Main Component
export const CustomInputV2: React.FC<CustomInputV2Props> = ({
  sessionId,
  ...inputProps
}) => {
  return (
    <CopilotChatInput
      {...inputProps}
      textArea={(props) => <CustomTiptapTextArea {...props} sessionId={sessionId} />}
      sendButton={CustomSendButton}
      addMenuButton={CustomAddMenuButton}
    />
  );
};
```

---

## Best Practices

### 1. Gradual Migration

✅ **Do:** Start with a simple wrapper, then refactor incrementally
```typescript
// Phase 1: Simple wrapper
const CustomInputV2 = (props) => <CustomInput {...mapProps(props)} />;

// Phase 2: Extract features to slots
const CustomInputV2 = (props) => (
  <CopilotChatInput {...props} textArea={CustomTextArea} />
);

// Phase 3: Full slot-based architecture
const CustomInputV2 = (props) => (
  <CopilotChatInput {...props}>
    {(slots) => <CustomLayout {...slots} />}
  </CopilotChatInput>
);
```

❌ **Don't:** Rewrite everything at once

### 2. Preserve Custom Features

✅ **Do:** Keep your unique features outside CopilotChatInput
```typescript
<div className="wrapper">
  <TaskProgressCard />  {/* Keep outside */}
  <CopilotChatInput>
    <PagesSelector />  {/* Custom toolbar item */}
  </CopilotChatInput>
</div>
```

❌ **Don't:** Try to force everything into slots

### 3. Type Safety

✅ **Do:** Extend V2 types properly
```typescript
interface CustomInputV2Props extends Partial<CopilotChatInputProps> {
  // Your custom props
  sessionId?: string;
}
```

❌ **Don't:** Use `any` or bypass type checking

### 4. Component Composition

✅ **Do:** Break down features into reusable components
```typescript
// Separate components
const CustomTiptapEditor = ...;
const CustomUploadMenu = ...;
const PagesSelector = ...;

// Compose in CustomInputV2
<CopilotChatInput>
  {(slots) => (
    <>
      <CustomTiptapEditor />
      <CustomToolbar>
        <CustomUploadMenu />
        <PagesSelector />
        {slots.sendButton}
      </CustomToolbar>
    </>
  )}
</CopilotChatInput>
```

❌ **Don't:** Keep everything in one giant component

### 5. Event Handling

✅ **Do:** Maintain your custom event system
```typescript
// Your custom events work with V2
useEffect(() => {
  window.addEventListener('copilot-prefill-text', handlePrefill);
  return () => window.removeEventListener('copilot-prefill-text', handlePrefill);
}, []);
```

❌ **Don't:** Remove custom functionality just to match V2 patterns

### 6. Styling

✅ **Do:** Use V2 CSS variables where possible
```typescript
style={{
  backgroundColor: 'var(--copilot-kit-input-background-color, #ffffff)',
  borderColor: 'var(--copilot-kit-input-border-color, #e5e7eb)',
}}
```

❌ **Don't:** Hardcode colors that should be theme-aware

### 7. Testing

✅ **Do:** Test both V1 and V2 during migration
```typescript
// Feature flag for gradual rollout
const useV2Input = process.env.ENABLE_V2_INPUT === 'true';

<CopilotChat
  chatView={(props) => (
    <CopilotChatView
      {...props}
      input={useV2Input ? CustomInputV2 : CustomInput}
    />
  )}
/>
```

❌ **Don't:** Switch entirely without testing

---

## Troubleshooting

### Issue 1: Props Not Mapping Correctly

**Problem:**
```typescript
// V1 prop name
<CustomInput inProgress={true} />

// V2 expects
<CopilotChatInput isRunning={true} />
```

**Solution:**
```typescript
const CustomInputV2 = ({ isRunning, onSubmitMessage, ...props }) => {
  return (
    <CustomInput
      inProgress={isRunning ?? false}
      onSend={onSubmitMessage ?? (() => {})}
      {...props}
    />
  );
};
```

### Issue 2: Editor Not Focusing

**Problem:** Tiptap editor doesn't auto-focus after send.

**Solution:**
```typescript
const send = async () => {
  // ... send logic
  
  // Re-focus editor after send
  setTimeout(() => {
    editor?.commands.focus('end');
  }, 100);
};
```

### Issue 3: File Upload Context Lost

**Problem:** File upload state is lost when using slots.

**Solution:** Use context or lift state to wrapper:
```typescript
const CustomInputV2 = (props) => {
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  
  return (
    <AttachmentsContext.Provider value={{ attachments, setAttachments }}>
      <CopilotChatInput {...props}>
        {(slots) => (
          <>
            <AttachmentsPreview />
            {slots.textArea}
            <CustomUploadButton />
          </>
        )}
      </CopilotChatInput>
    </AttachmentsContext.Provider>
  );
};
```

### Issue 4: Task Progress Card Positioning

**Problem:** Task progress card doesn't position correctly above input.

**Solution:** Use absolute positioning with proper z-index:
```typescript
<div className="input-wrapper" style={{ position: 'relative' }}>
  <div 
    className="task-progress"
    style={{
      position: 'absolute',
      bottom: '100%',
      left: 0,
      right: 0,
      zIndex: 10,
    }}
  >
    <TaskProgressCard />
  </div>
  
  <CopilotChatInput />
</div>
```

### Issue 5: Custom Events Not Firing

**Problem:** Custom events (like prefill) don't work.

**Solution:** Ensure event listeners are in the wrapper, not inside slots:
```typescript
const CustomInputV2 = (props) => {
  const editor = useEditor({...});
  
  // Register event listener in wrapper
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      editor?.commands.setContent(e.detail.text);
    };
    window.addEventListener('copilot-prefill-text', handler);
    return () => window.removeEventListener('copilot-prefill-text', handler);
  }, [editor]);
  
  return <CopilotChatInput {...props} />;
};
```

### Issue 6: TypeScript Errors with Slots

**Problem:**
```
Type 'CustomComponent' is not assignable to type 'SlotValue<...>'
```

**Solution:** Ensure component signature matches slot type:
```typescript
// Correct signature
const CustomSendButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = (props) => {
  return <button {...props}>Send</button>;
};

// Use with proper typing
<CopilotChatInput
  sendButton={CustomSendButton}
/>
```

---

## Migration Checklist

### Pre-Migration

- [ ] Read this guide completely
- [ ] Review your current CustomInput features
- [ ] Identify which features are V2-compatible
- [ ] Plan migration strategy (wrapper vs. slots)
- [ ] Set up feature flags for gradual rollout

### Phase 1: Initial Setup

- [ ] Create `CustomInputV2.tsx` wrapper
- [ ] Map V2 props to V1 props
- [ ] Test basic send/receive functionality
- [ ] Verify all custom props are passed through
- [ ] Check TypeScript types

### Phase 2: Integration

- [ ] Update `ChatInner.tsx` to use V2 slot pattern
- [ ] Pass custom props through chatView
- [ ] Test with existing features (task progress, pages selector)
- [ ] Verify event handlers still work (prefill, drag & drop)
- [ ] Test keyboard shortcuts

### Phase 3: Feature Migration

- [ ] Extract Tiptap editor to separate component
- [ ] Create custom upload menu button
- [ ] Migrate task progress card positioning
- [ ] Update pages selector integration
- [ ] Test file upload/attachments
- [ ] Verify Firebase integration

### Phase 4: Polish

- [ ] Update styling to use V2 CSS variables
- [ ] Test theme switching (light/dark)
- [ ] Verify all animations work
- [ ] Test on different screen sizes
- [ ] Check accessibility

### Phase 5: Testing

- [ ] Test all input modes (input, transcribe, processing)
- [ ] Test send/stop functionality
- [ ] Test file uploads (images, documents)
- [ ] Test drag & drop
- [ ] Test paste functionality
- [ ] Test context menu prefill
- [ ] Test task progress card animations
- [ ] Test pages selector
- [ ] Test push-to-talk (if enabled)
- [ ] Test keyboard shortcuts

### Phase 6: Deployment

- [ ] Feature flag enabled for testing
- [ ] Monitor for errors
- [ ] Gradual rollout to users
- [ ] Remove V1 code once stable
- [ ] Update documentation

---

## Additional Resources

### Official Documentation
- [CopilotKit V2 Migration Guide](https://docs.copilotkit.ai/migration)
- [CopilotChatInput API Reference](https://docs.copilotkit.ai/reference/components/CopilotChatInput)
- [Slot System Documentation](https://docs.copilotkit.ai/concepts/slots)

### Internal Documentation
- [COPILOTKIT_V2_MIGRATION_PLAN.md](./COPILOTKIT_V2_MIGRATION_PLAN.md)
- [CUSTOM_USER_MESSAGE_V2_MIGRATION_GUIDE.md](./CUSTOM_USER_MESSAGE_V2_MIGRATION_GUIDE.md)
- [CHILDREN_RENDER_PROPS_REFERENCE.md](./CHILDREN_RENDER_PROPS_REFERENCE.md)

### Related Components
- `CustomAssistantMessageV2.tsx` - V2 assistant message implementation
- `CustomUserMessageV2.tsx` - V2 user message implementation
- `CustomMarkdownRenderer.tsx` - V2 markdown renderer with mermaid support
- `ThinkingBlock.tsx` - Custom thinking block component
- `MermaidBlock.tsx` - Mermaid diagram renderer

---

## Summary

### Key Takeaways

1. **Wrapper Approach:** Start with a simple wrapper that maps V2 props to V1 props
2. **Preserve Features:** Keep your custom features (Tiptap, uploads, task progress, pages selector)
3. **Gradual Migration:** Refactor to slots incrementally, not all at once
4. **Type Safety:** Maintain TypeScript types throughout migration
5. **Testing:** Test thoroughly with feature flags before full rollout

### Benefits of V2

- ✅ Better component composition
- ✅ More granular customization via slots
- ✅ Improved TypeScript support
- ✅ Easier to maintain and test
- ✅ Better integration with CopilotKit ecosystem

### Migration Timeline

- **Week 1:** Create wrapper, basic integration, initial testing
- **Week 2-3:** Feature migration, slot-based refactoring
- **Week 4:** Polish, comprehensive testing
- **Week 5:** Gradual rollout, monitoring
- **Week 6:** Full deployment, cleanup

---

## Questions?

If you encounter issues during migration:

1. Check this guide's [Troubleshooting](#troubleshooting) section
2. Review the [Code Examples](#code-examples)
3. Consult the official CopilotKit V2 documentation
4. Test with feature flags to isolate issues

Good luck with your migration! 🚀

