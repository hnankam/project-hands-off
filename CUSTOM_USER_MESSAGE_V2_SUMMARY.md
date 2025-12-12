# CustomUserMessage V2 Migration - Executive Summary

## TL;DR

**Goal**: Migrate the feature-rich CustomUserMessage component from CopilotKit V1 to V2 while maintaining all functionality and design.

**Approach**: Wrapper pattern around `CopilotChatUserMessage` - leverage built-in features (edit, copy) and add custom buttons (rerun, undo, delete).

**Effort**: ~4-8 hours (Medium complexity)

**Risk**: Low (proven pattern already used for CustomAssistantMessageV2)

---

## What Changes in V2?

### V1 (Current Implementation)
- Fully custom component (~900 lines)
- All features manually implemented
- Props: `UserMessage={CustomUserMessage}`

### V2 (Target Implementation)
- Wrapper component (~300-400 lines)
- Leverage built-in edit, copy, toolbar
- Props: `messageView={{ userMessage: CustomUserMessageV2 }}`

### What's Built-in Now?
✅ **Edit mode** - UI, save/cancel buttons, keyboard shortcuts  
✅ **Copy button** - With feedback animation  
✅ **Toolbar visibility** - Auto show/hide on hover  
✅ **Message container** - Styling and layout  

### What's Still Custom?
❌ **Rerun button** - Trigger assistant response again  
❌ **Undo button** - Restore previous edit  
❌ **Delete menu** - Dropdown with 3 delete options  
❌ **Attachment chips** - Parse and display file info  
❌ **Edit history** - Track previous edits  

---

## Key Architecture Changes

### V1 Architecture
```
CustomUserMessage
└── Everything is custom
    ├── Edit mode UI (textarea, buttons)
    ├── View mode UI (content, attachments)
    ├── Toolbar (all buttons custom)
    ├── State management (edit, hover, menu)
    └── All handlers (edit, copy, delete, rerun)
```

### V2 Architecture
```
CustomUserMessageV2 (Wrapper)
└── CopilotChatUserMessage (Base)
    ├── Edit mode UI ← Built-in
    ├── Copy button ← Built-in
    ├── Edit button ← Built-in
    ├── Toolbar management ← Built-in
    └── additionalToolbarItems ← Your custom buttons
        ├── Rerun
        ├── Undo
        └── Delete menu
```

---

## Implementation Pattern

### Step 1: Basic Wrapper
```typescript
import { CopilotChatUserMessage } from '../../hooks/copilotkit';

type UserMessageProps = React.ComponentProps<typeof CopilotChatUserMessage>;

const CustomUserMessageV2Component: React.FC<UserMessageProps> = (props) => {
  return <CopilotChatUserMessage {...props} />;
};

export const CustomUserMessageV2 = Object.assign(
  CustomUserMessageV2Component,
  CopilotChatUserMessage  // Copy all static properties
) as typeof CopilotChatUserMessage;
```

### Step 2: Add Custom Buttons
```typescript
const CustomUserMessageV2Component: React.FC<UserMessageProps> = (props) => {
  const { messages, reloadMessages } = useCopilotChat();
  
  const handleRerun = () => { /* logic */ };
  const handleUndo = () => { /* logic */ };
  const handleDelete = (type: string) => { /* logic */ };
  
  const customButtons = (
    <>
      <CopilotChatUserMessage.ToolbarButton title="Rerun" onClick={handleRerun}>
        🔄
      </CopilotChatUserMessage.ToolbarButton>
      <CopilotChatUserMessage.ToolbarButton title="Undo" onClick={handleUndo}>
        ↶
      </CopilotChatUserMessage.ToolbarButton>
      <DeleteMenuButton onDelete={handleDelete} />
    </>
  );
  
  return (
    <CopilotChatUserMessage
      {...props}
      additionalToolbarItems={customButtons}
    />
  );
};
```

### Step 3: Custom Message Renderer
```typescript
const CustomMessageRenderer = ({ content, message }) => {
  const { cleanedContent, attachments } = parseAttachments(content);
  
  return (
    <div>
      {attachments.length > 0 && <AttachmentChips attachments={attachments} />}
      <MarkdownRenderer content={cleanedContent} isLight={isLight} />
    </div>
  );
};

return (
  <CopilotChatUserMessage
    {...props}
    messageRenderer={(props) => <CustomMessageRenderer {...props} message={message} />}
    additionalToolbarItems={customButtons}
  />
);
```

### Step 4: Use in ChatInner
```typescript
<CopilotChat
  agentId="dynamic_agent"
  threadId={sessionId}
  messageView={{
    assistantMessage: CustomAssistantMessageV2,
    userMessage: CustomUserMessageV2,  // Add this
  }}
/>
```

---

## Feature Retention Matrix

| Feature | V1 Status | V2 Status | Implementation |
|---------|-----------|-----------|----------------|
| Edit message | ✅ Custom | ✅ Built-in | Use built-in with `onEditMessage` callback |
| Copy message | ✅ Custom | ✅ Built-in | Use built-in `CopyButton` |
| Delete message | ✅ Custom | ✅ Custom | Keep dropdown menu in `additionalToolbarItems` |
| Delete above/below | ✅ Custom | ✅ Custom | Keep in dropdown menu |
| Undo edit | ✅ Custom | ✅ Custom | Track history, add button in `additionalToolbarItems` |
| Rerun response | ✅ Custom | ✅ Custom | Add button in `additionalToolbarItems` |
| Attachment chips | ✅ Custom | ✅ Custom | Parse in `messageRenderer` slot |
| Markdown rendering | ✅ Custom | ✅ Custom | Use in `messageRenderer` slot |
| Image support | ✅ Custom | ✅ Built-in | Handled automatically by base component |
| Hover controls | ✅ Custom | ✅ Built-in | Automatic with built-in toolbar |
| Keyboard shortcuts | ✅ Custom | ✅ Built-in | Built-in edit mode supports Cmd+Enter, Esc |
| Theme support | ✅ Custom | ✅ Custom | Continue using `themeStorage` |
| Portal dropdown | ✅ Custom | ✅ Custom | Keep for delete menu |

**Result**: All features retained, ~60% less custom code.

---

## Files to Create/Modify

### New Files
1. **`CustomUserMessageV2.tsx`** - Main component
   - `CustomUserMessageV2Component` - Wrapper component
   - `CustomToolbarItems` - Custom buttons component
   - `CustomMessageRenderer` - Attachment + markdown renderer
   - `DeleteMenuButton` - Dropdown menu component
   - `AttachmentChips` - File attachment display
   - Export with static properties

### Modified Files
1. **`ChatInner.tsx`** - Add to `messageView` slot
   ```typescript
   messageView={{
     assistantMessage: CustomAssistantMessageV2,
     userMessage: CustomUserMessageV2,  // Add this line
   }}
   ```

2. **`chat-messages.v2.css`** (if needed) - Additional styling
   - User message hover states
   - Toolbar button styles
   - Delete menu styles

---

## Code Reuse from V1

### Can Be Reused Directly
- ✅ Attachment parsing logic
- ✅ Delete menu structure and positioning
- ✅ SVG icons for buttons
- ✅ Theme color logic
- ✅ Edit history state management
- ✅ Rerun handler logic
- ✅ Delete handlers (this, above, below)
- ✅ Click outside handler for menu

### Needs Adaptation
- 🔄 Message type (`UserMessageProps` → `UserMessage` from `@ag-ui/core`)
- 🔄 Edit handler (callback instead of full custom)
- 🔄 Toolbar rendering (built-in + additional items)
- 🔄 Content rendering (messageRenderer slot)

### Can Be Removed
- ❌ Edit mode UI (textarea, save/cancel buttons)
- ❌ Copy handler and feedback state
- ❌ Hover state management
- ❌ Edit button click handler
- ❌ Image renderer conditional logic

---

## Timeline and Phases

### Phase 1: Basic Structure (1 hour)
- Create `CustomUserMessageV2.tsx`
- Set up wrapper with static properties
- Add to ChatInner.tsx
- Test basic rendering

### Phase 2: Custom Buttons (2 hours)
- Implement rerun button
- Implement undo button with history
- Test button functionality

### Phase 3: Delete Menu (2 hours)
- Implement DeleteMenuButton component
- Add dropdown with 3 options
- Test positioning and click outside

### Phase 4: Message Renderer (1 hour)
- Implement attachment parsing
- Add AttachmentChips component
- Integrate MarkdownRenderer

### Phase 5: Polish & Test (2 hours)
- Add all SVG icons
- Update styles to match V1
- Comprehensive testing
- Fix bugs and edge cases

**Total: 8 hours (can be reduced to 4-5 with focus)**

---

## Testing Checklist

### Functional Testing
- [ ] Message displays correctly
- [ ] Edit button opens edit mode
- [ ] Save/cancel edit works
- [ ] Copy button works with feedback
- [ ] Rerun button triggers response
- [ ] Undo button restores previous edit
- [ ] Delete menu opens/closes
- [ ] Delete this message works
- [ ] Delete above works (disabled when first)
- [ ] Delete below works (disabled when last)
- [ ] Attachments display correctly
- [ ] Markdown renders properly
- [ ] Images display (if present)

### Visual Testing
- [ ] Hover shows toolbar
- [ ] Toolbar buttons have correct colors
- [ ] Delete menu positions correctly
- [ ] No layout shifts on hover
- [ ] Theme colors match design
- [ ] Icons are correct size/color
- [ ] Smooth transitions

### Edge Case Testing
- [ ] Empty messages
- [ ] Very long messages
- [ ] Messages with only attachments
- [ ] Messages with special characters
- [ ] Edit history with multiple edits
- [ ] Delete when it's the only message
- [ ] Rerun when no assistant response exists

---

## Benefits of V2 Approach

1. **Less Code** (~60% reduction: 900 → 350 lines)
2. **Better Maintenance** (fewer custom features to maintain)
3. **Type Safety** (official TypeScript types)
4. **Future-Proof** (compatible with V2 features like branching)
5. **Consistent UX** (built-in features match CopilotKit style)
6. **Easier Testing** (less custom logic to test)

---

## Potential Issues and Solutions

### Issue 1: Type Mismatch
**Problem**: `UserMessage` type from `@ag-ui/core` different from V1  
**Solution**: Use type casting where needed: `(message as any)?.content`

### Issue 2: Static Properties
**Problem**: Slot expects component with sub-components  
**Solution**: Use `Object.assign()` to copy all static properties

### Issue 3: Edit Callback Timing
**Problem**: `onEditMessage` called after edit is applied  
**Solution**: Just track in history, don't try to control the edit

### Issue 4: Delete Menu Positioning
**Problem**: Portal menu positioning in scrollable container  
**Solution**: Use same approach as V1 with `requestAnimationFrame`

### Issue 5: Attachment Manifest
**Problem**: Hidden comment in content needs parsing  
**Solution**: Reuse exact parsing logic from V1

---

## Documentation References

### Detailed Guides
1. **[Full Migration Guide](./CUSTOM_USER_MESSAGE_V2_MIGRATION_GUIDE.md)** - Complete implementation details with code examples
2. **[V1 vs V2 Comparison](./CUSTOM_USER_MESSAGE_V1_VS_V2_COMPARISON.md)** - Side-by-side visual comparison
3. **[CopilotKit V2 Migration Plan](./COPILOTKIT_V2_MIGRATION_PLAN.md)** - Overall V2 migration strategy

### Reference Files
- **V1 Source**: `pages/side-panel/src/components/chat/CustomUserMessage.tsx`
- **V2 Assistant Example**: `pages/side-panel/src/components/chat/CustomAssistantMessageV2.tsx`
- **V2 Suggestion Example**: `pages/side-panel/src/components/chat/slots/CustomSuggestionView.tsx`

---

## Decision Matrix

| Factor | V1 Full Custom | V2 Wrapper | V2 Full Custom |
|--------|----------------|------------|----------------|
| **Code Volume** | 🟡 High (900 lines) | 🟢 Medium (350 lines) | 🔴 Very High (1000+ lines) |
| **Maintenance** | 🟡 Medium effort | 🟢 Low effort | 🔴 High effort |
| **Built-in Features** | 🔴 None | 🟢 Many | 🔴 None |
| **Customization** | 🟢 Complete | 🟡 Most | 🟢 Complete |
| **Type Safety** | 🟡 Custom types | 🟢 Official types | 🟡 Custom types |
| **Future Features** | 🔴 No branching | 🟢 Branching support | 🟡 Manual branching |
| **Migration Effort** | N/A (current) | 🟢 Medium (8h) | 🔴 High (16h+) |

**Recommendation**: ✅ **V2 Wrapper** - Best balance of features, maintainability, and effort.

---

## Getting Started

### Quick Start (30 minutes)
1. Copy the minimal example from V1 vs V2 Comparison doc
2. Create `CustomUserMessageV2.tsx` with basic wrapper
3. Add to `ChatInner.tsx` `messageView` prop
4. Test that it renders

### Full Implementation (8 hours)
1. Follow the Implementation Plan in the Migration Guide
2. Implement features incrementally
3. Test each feature as you add it
4. Reference V1 code for logic to reuse

### Resources
- Start with: [Full Migration Guide](./CUSTOM_USER_MESSAGE_V2_MIGRATION_GUIDE.md)
- Reference: [V1 vs V2 Comparison](./CUSTOM_USER_MESSAGE_V1_VS_V2_COMPARISON.md)
- Example: `CustomAssistantMessageV2.tsx`

---

## Questions?

### "Can I just keep using V1 CustomUserMessage?"
No - V1 components are not compatible with V2's slot system and AG-UI protocol. Migration is required.

### "Do I have to use the wrapper pattern?"
Recommended, but not required. You can build fully custom, but you'll lose built-in features and type safety.

### "What if I need more control over edit mode?"
You can override the `messageRenderer` slot completely, but you'll need to implement edit mode UI yourself.

### "Will this break my existing messages?"
No - messages are data, not UI. The new component will render existing messages correctly.

### "Can I migrate incrementally?"
No - you must migrate the entire chat component at once since V1 and V2 use different protocols.

---

## Success Criteria

✅ All V1 features working in V2  
✅ Design matches V1 (colors, layout, interactions)  
✅ No regressions in functionality  
✅ Code is cleaner and more maintainable  
✅ Tests pass  
✅ Production deployment successful  

---

## Next Action

👉 **Start with the [Full Migration Guide](./CUSTOM_USER_MESSAGE_V2_MIGRATION_GUIDE.md)** - it contains complete code examples and step-by-step instructions.

Or jump right in with the quick start example from [V1 vs V2 Comparison](./CUSTOM_USER_MESSAGE_V1_VS_V2_COMPARISON.md#quick-start-code-snippet).

