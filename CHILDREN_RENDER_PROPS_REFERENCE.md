# CopilotChatUserMessage Children Render Props Reference

## Complete List of Available Props

The children render function receives these props:

```typescript
{
  // ============================================================================
  // SLOT ELEMENTS (React.ReactElement) - Rendered slot components
  // ============================================================================
  
  messageRenderer: React.ReactElement,
  // The rendered message content (text, images, etc.)
  // Type: FC<{ content: string; className?: string }>
  
  toolbar: React.ReactElement,
  // The hover toolbar containing edit/copy buttons
  // Type: FC<React.HTMLAttributes<HTMLDivElement>>
  
  copyButton: React.ReactElement,
  // Individual copy button (already included in toolbar)
  // Type: FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { copied?: boolean }>
  
  editButton: React.ReactElement,
  // Individual edit button (already included in toolbar)
  // Type: FC<React.ButtonHTMLAttributes<HTMLButtonElement>>
  
  branchNavigation: React.ReactElement,
  // Branch navigation UI for message branching
  // Type: FC<HTMLAttributes<HTMLDivElement> & { currentBranch, numberOfBranches, onSwitchToBranch, message }>
  
  // ============================================================================
  // REST PROPS - Configuration and callback props
  // ============================================================================
  
  onEditMessage?: (props: { message: UserMessage }) => void,
  // Callback when message is edited
  
  onSwitchToBranch?: (props: { message: UserMessage; branchIndex: number; numberOfBranches: number }) => void,
  // Callback when switching between message branches
  
  message: UserMessage,  // REQUIRED
  // The message object from @ag-ui/core
  
  branchIndex?: number,
  // Current branch index (if branching is enabled)
  
  numberOfBranches?: number,
  // Total number of branches (if branching is enabled)
  
  additionalToolbarItems?: React.ReactNode,
  // Custom toolbar items to add to the toolbar
  
  // ============================================================================
  // HTML DIV ATTRIBUTES
  // ============================================================================
  
  className?: string,
  style?: React.CSSProperties,
  id?: string,
  onClick?: React.MouseEventHandler<HTMLDivElement>,
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>,
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>,
  // ... all other standard HTML div attributes
  // (data-*, aria-*, role, etc.)
}
```

---

## Typical Usage Patterns

### Pattern 1: Basic Container Customization (Phase 1 - Current)

```typescript
<CopilotChatUserMessage {...props}>
  {({ messageRenderer, toolbar }) => (
    <CopilotChatUserMessage.Container className={containerClassName}>
      {messageRenderer}
      {toolbar}
    </CopilotChatUserMessage.Container>
  )}
</CopilotChatUserMessage>
```

**Uses**: `messageRenderer`, `toolbar`  
**Ignores**: `copyButton`, `editButton`, `branchNavigation`, callbacks, message data

---

### Pattern 2: Accessing Message Data

```typescript
<CopilotChatUserMessage {...props}>
  {({ messageRenderer, toolbar, message }) => (
    <CopilotChatUserMessage.Container className={containerClassName}>
      <div className="message-header">
        <span>Message ID: {message.id}</span>
      </div>
      {messageRenderer}
      {toolbar}
    </CopilotChatUserMessage.Container>
  )}
</CopilotChatUserMessage>
```

**Uses**: `messageRenderer`, `toolbar`, `message`

---

### Pattern 3: Custom Toolbar Items (Phase 2 - Future)

```typescript
<CopilotChatUserMessage {...props}>
  {({ messageRenderer, toolbar, message, additionalToolbarItems }) => (
    <CopilotChatUserMessage.Container className={containerClassName}>
      {messageRenderer}
      <div className="custom-toolbar-section">
        {/* Your custom buttons here */}
        <RerunButton message={message} />
        <UndoButton />
      </div>
      {toolbar}  {/* Includes additionalToolbarItems prop if provided */}
    </CopilotChatUserMessage.Container>
  )}
</CopilotChatUserMessage>
```

**Uses**: `messageRenderer`, `toolbar`, `message`, `additionalToolbarItems`

---

### Pattern 4: Branch Navigation

```typescript
<CopilotChatUserMessage {...props}>
  {({ 
    messageRenderer, 
    toolbar, 
    branchNavigation, 
    branchIndex, 
    numberOfBranches 
  }) => (
    <CopilotChatUserMessage.Container className={containerClassName}>
      {numberOfBranches > 1 && branchNavigation}
      {messageRenderer}
      {toolbar}
    </CopilotChatUserMessage.Container>
  )}
</CopilotChatUserMessage>
```

**Uses**: All branch-related props

---

### Pattern 5: Edit Callback

```typescript
<CopilotChatUserMessage {...props}>
  {({ messageRenderer, toolbar, message, onEditMessage }) => {
    // Track edit in history when callback fires
    React.useEffect(() => {
      const handleEdit = (editProps) => {
        console.log('Message edited:', editProps.message);
        // Save to edit history
      };
      
      // Note: onEditMessage is the callback prop, not a function we call
      // It's handled internally by CopilotKit
    }, [onEditMessage]);
    
    return (
      <CopilotChatUserMessage.Container className={containerClassName}>
        {messageRenderer}
        {toolbar}
      </CopilotChatUserMessage.Container>
    );
  }}
</CopilotChatUserMessage>
```

**Uses**: Callback props for tracking

---

## Props Breakdown by Category

### 1. Rendered Slot Elements (5 props)

These are **already rendered** React elements ready to use:

| Prop | Type | Description |
|------|------|-------------|
| `messageRenderer` | `ReactElement` | The message content |
| `toolbar` | `ReactElement` | Edit/copy buttons toolbar |
| `copyButton` | `ReactElement` | Copy button (included in toolbar) |
| `editButton` | `ReactElement` | Edit button (included in toolbar) |
| `branchNavigation` | `ReactElement` | Branch UI (if applicable) |

**Note**: `toolbar` already contains `copyButton` and `editButton`, so you typically don't need to use them separately.

---

### 2. Callback Props (2 props)

| Prop | Type | Description |
|------|------|-------------|
| `onEditMessage` | `(props: { message: UserMessage }) => void` | Called when message is edited |
| `onSwitchToBranch` | `(props: { message, branchIndex, numberOfBranches }) => void` | Called when switching branches |

**Usage**: These are for tracking/observing changes, not for triggering actions.

---

### 3. Data Props (5 props)

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `message` | `UserMessage` | ✅ Yes | The message object |
| `branchIndex` | `number` | No | Current branch index |
| `numberOfBranches` | `number` | No | Total branches |
| `additionalToolbarItems` | `ReactNode` | No | Custom toolbar items |
| `className` | `string` | No | Additional CSS classes |

---

### 4. HTML Attributes (~50+ props)

All standard HTML div attributes are available:
- Event handlers: `onClick`, `onMouseEnter`, `onMouseLeave`, etc.
- Styling: `style`, `className`, `id`
- Accessibility: `aria-*`, `role`, `tabIndex`
- Data attributes: `data-*`
- And more...

---

## What You Typically Need

### Phase 1 (Current - Basic Wrapper)
```typescript
{({ messageRenderer, toolbar }) => ... }
```

**2 props used**: Just the content and toolbar

---

### Phase 2 (Custom Toolbar Items)
```typescript
{({ messageRenderer, toolbar, message }) => ... }
```

**3 props used**: Content, toolbar, and message data for custom buttons

---

### Phase 3 (Delete Menu)
```typescript
{({ messageRenderer, toolbar, message, additionalToolbarItems }) => ... }
```

**4 props used**: Add custom toolbar items

---

### Phase 4 (Full Customization)
```typescript
{({ 
  messageRenderer, 
  toolbar, 
  message, 
  additionalToolbarItems,
  onEditMessage,
  branchIndex,
  numberOfBranches
}) => ... }
```

**7+ props used**: Everything needed for full control

---

## Type Definitions

### UserMessage Type
```typescript
// From @ag-ui/core
interface UserMessage {
  id: string;
  role: 'user';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image'; image: string }>;
  createdAt?: Date;
  // ... other properties
}
```

### MessageRenderer Props
```typescript
{
  content: string;  // Message content text
  className?: string;  // Optional CSS class
}
```

### Toolbar Props
```typescript
React.HTMLAttributes<HTMLDivElement>
// All standard div attributes (className, style, onClick, etc.)
```

---

## Advanced: Accessing All Props

If you need to see exactly what you're getting:

```typescript
<CopilotChatUserMessage {...props}>
  {(renderProps) => {
    console.log('All props:', Object.keys(renderProps));
    console.log('Full props object:', renderProps);
    
    const {
      messageRenderer,
      toolbar,
      copyButton,
      editButton,
      branchNavigation,
      onEditMessage,
      onSwitchToBranch,
      message,
      branchIndex,
      numberOfBranches,
      additionalToolbarItems,
      ...htmlAttributes
    } = renderProps;
    
    return (
      <CopilotChatUserMessage.Container>
        {messageRenderer}
        {toolbar}
      </CopilotChatUserMessage.Container>
    );
  }}
</CopilotChatUserMessage>
```

---

## Summary

**Total Props Available**: 60+ (5 slots + 7 config + 50+ HTML attributes)

**Commonly Used**: 2-4 props (`messageRenderer`, `toolbar`, `message`, `additionalToolbarItems`)

**Phase 1 Current Usage**: 2 props only (`messageRenderer`, `toolbar`)

**Next Phase**: Will add `message` prop for custom button functionality

