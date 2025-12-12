# CustomUserMessage V2 Migration Documentation

## 📚 Documentation Index

This folder contains comprehensive documentation for migrating the CustomUserMessage component from CopilotKit V1 to V2.

### 📖 Documentation Files

1. **[CUSTOM_USER_MESSAGE_V2_SUMMARY.md](./CUSTOM_USER_MESSAGE_V2_SUMMARY.md)** ⭐ START HERE
   - Executive summary
   - Quick overview of changes
   - Decision matrix
   - Timeline estimation
   - Quick start instructions

2. **[CUSTOM_USER_MESSAGE_V2_MIGRATION_GUIDE.md](./CUSTOM_USER_MESSAGE_V2_MIGRATION_GUIDE.md)** 📝 IMPLEMENTATION GUIDE
   - Detailed technical guide
   - Complete code examples
   - Step-by-step implementation
   - Feature mapping
   - Migration checklist

3. **[CUSTOM_USER_MESSAGE_V1_VS_V2_COMPARISON.md](./CUSTOM_USER_MESSAGE_V1_VS_V2_COMPARISON.md)** 🔍 VISUAL REFERENCE
   - Side-by-side comparisons
   - Code pattern differences
   - Visual structure diagrams
   - Quick reference examples

4. **[COPILOTKIT_V2_MIGRATION_PLAN.md](./COPILOTKIT_V2_MIGRATION_PLAN.md)** 🗺️ OVERALL MIGRATION
   - Complete V1 to V2 migration strategy
   - Server and client changes
   - Package updates
   - General V2 concepts

---

## 🚀 Quick Start

### For Busy Developers (5 minutes)

1. Read the [Summary](./CUSTOM_USER_MESSAGE_V2_SUMMARY.md) for overview
2. Copy the quick start code from [Comparison Doc](./CUSTOM_USER_MESSAGE_V1_VS_V2_COMPARISON.md#quick-start-code-snippet)
3. Create `CustomUserMessageV2.tsx` with the minimal example
4. Add to `ChatInner.tsx` messageView prop
5. Test and iterate

### For Detailed Implementation (1-2 hours)

1. Read the [Summary](./CUSTOM_USER_MESSAGE_V2_SUMMARY.md) to understand the approach
2. Follow the [Migration Guide](./CUSTOM_USER_MESSAGE_V2_MIGRATION_GUIDE.md) step by step
3. Reference [V1 vs V2 Comparison](./CUSTOM_USER_MESSAGE_V1_VS_V2_COMPARISON.md) as needed
4. Test thoroughly using the checklist

---

## 🎯 What's Changing?

### V1 (Current)
```typescript
<CopilotChat
  UserMessage={CustomUserMessage}  // Full custom component
/>
```

### V2 (Target)
```typescript
<CopilotChat
  messageView={{
    userMessage: CustomUserMessageV2,  // Wrapper with built-in features
  }}
/>
```

### Key Benefits
- ✅ 60% less custom code (900 → 350 lines)
- ✅ Built-in edit mode, copy button, toolbar
- ✅ Better type safety with official TypeScript types
- ✅ Automatic compatibility with V2 branching
- ✅ Easier maintenance and testing

---

## 📋 Feature Retention

All V1 features are retained in V2:

| Feature | Status |
|---------|--------|
| Edit message | ✅ Built-in |
| Copy message | ✅ Built-in |
| Delete message | ✅ Custom (reused from V1) |
| Delete above/below | ✅ Custom (reused from V1) |
| Undo edit | ✅ Custom (reused from V1) |
| Rerun response | ✅ Custom (reused from V1) |
| Attachment chips | ✅ Custom (reused from V1) |
| Markdown rendering | ✅ Custom (reused from V1) |
| Image support | ✅ Built-in |
| Hover controls | ✅ Built-in |
| Keyboard shortcuts | ✅ Built-in |
| Theme support | ✅ Custom (reused from V1) |

---

## 🏗️ Architecture Overview

### V1 Architecture (Full Custom)
```
CustomUserMessage (~900 lines)
├── Edit Mode (textarea, buttons, keyboard shortcuts)
├── View Mode (content, images, attachments)
├── Toolbar (all buttons custom built)
├── State Management (edit, hover, menu, copy feedback)
└── Event Handlers (edit, copy, delete, rerun, undo)
```

### V2 Architecture (Wrapper Pattern)
```
CustomUserMessageV2 (~350 lines)
└── CopilotChatUserMessage (Base Component)
    ├── Edit Mode UI ← Built-in ✅
    ├── Copy Button ← Built-in ✅
    ├── Edit Button ← Built-in ✅
    ├── Toolbar Management ← Built-in ✅
    ├── messageRenderer Slot ← Custom (attachments, markdown)
    └── additionalToolbarItems ← Custom (rerun, undo, delete)
```

---

## 🔧 Implementation Approach

### Recommended: Wrapper Pattern

**Wrap `CopilotChatUserMessage` and add custom features:**

```typescript
const CustomUserMessageV2Component: React.FC<UserMessageProps> = (props) => {
  // 1. Add custom state (edit history)
  const [editHistory, setEditHistory] = useState<string[]>([]);
  
  // 2. Add custom handlers (rerun, undo, delete)
  const handleRerun = () => { /* custom logic */ };
  const handleUndo = () => { /* custom logic */ };
  
  // 3. Create custom toolbar items
  const customButtons = (
    <>
      <CopilotChatUserMessage.ToolbarButton onClick={handleRerun}>
        🔄
      </CopilotChatUserMessage.ToolbarButton>
      {/* More buttons */}
    </>
  );
  
  // 4. Create custom message renderer (attachments)
  const customRenderer = (props) => (
    <div>
      <AttachmentChips />
      <MarkdownRenderer />
    </div>
  );
  
  // 5. Return wrapped component
  return (
    <CopilotChatUserMessage
      {...props}
      additionalToolbarItems={customButtons}
      messageRenderer={customRenderer}
    />
  );
};

// 6. Export with static properties (required!)
export const CustomUserMessageV2 = Object.assign(
  CustomUserMessageV2Component,
  CopilotChatUserMessage
) as typeof CopilotChatUserMessage;
```

---

## 📊 Effort Estimation

| Phase | Duration | Tasks |
|-------|----------|-------|
| **Phase 1: Basic Structure** | 1 hour | Create file, wrapper, exports |
| **Phase 2: Custom Buttons** | 2 hours | Rerun, undo buttons |
| **Phase 3: Delete Menu** | 2 hours | Dropdown with 3 options |
| **Phase 4: Message Renderer** | 1 hour | Attachments, markdown |
| **Phase 5: Polish & Test** | 2 hours | Icons, styles, testing |
| **Total** | **8 hours** | Full feature parity |

**Risk Level**: 🟢 Low (proven pattern from CustomAssistantMessageV2)

---

## 🧪 Testing Strategy

### Unit Testing
- [ ] Custom button handlers
- [ ] Edit history tracking
- [ ] Attachment parsing
- [ ] Delete menu logic

### Integration Testing
- [ ] Message rendering
- [ ] Edit flow with callback
- [ ] Toolbar visibility
- [ ] Theme switching

### E2E Testing
- [ ] Full edit workflow
- [ ] Delete operations
- [ ] Rerun functionality
- [ ] Undo multiple edits

---

## 🎨 Design Consistency

The V2 implementation maintains the exact same design as V1:

### Colors
```css
/* Light Mode */
background: #f9fafb
border: #e5e7eb
text: #374151

/* Dark Mode */
background: #151C24
border: #374151
text: #d1d5db
```

### Layout
- Rounded corners (10px)
- Padding (0.5rem)
- Full width with max-width constraints
- Smooth transitions (0.2s ease)

### Interactions
- Hover reveals toolbar
- Gradient fade background for toolbar
- Button hover scale (1.15x)
- Dropdown menu positioned via portal

---

## 📦 Files Structure

### New Files to Create
```
pages/side-panel/src/components/chat/
└── CustomUserMessageV2.tsx
    ├── CustomUserMessageV2Component (main wrapper)
    ├── CustomToolbarItems (custom buttons)
    ├── CustomMessageRenderer (attachments + markdown)
    ├── DeleteMenuButton (dropdown menu)
    ├── AttachmentChips (file display)
    └── Export with static properties
```

### Files to Modify
```
pages/side-panel/src/components/chat/
└── ChatInner.tsx
    └── Add userMessage to messageView prop
```

---

## 🔗 Related Documentation

### CopilotKit V2 Migration
- [Overall V2 Migration Plan](./COPILOTKIT_V2_MIGRATION_PLAN.md)
- [Server-side Migration](./COPILOTKIT_V2_MIGRATION_PLAN.md#server-side-migration)
- [Client-side Migration](./COPILOTKIT_V2_MIGRATION_PLAN.md#client-side-migration)

### Reference Implementations
- **V1 Source**: `pages/side-panel/src/components/chat/CustomUserMessage.tsx`
- **V2 Assistant Example**: `pages/side-panel/src/components/chat/CustomAssistantMessageV2.tsx`
- **V2 Suggestion Example**: `pages/side-panel/src/components/chat/slots/CustomSuggestionView.tsx`

### CopilotKit Documentation
- [CopilotKit V2 Official Docs](https://docs.copilotkit.ai/)
- [AG-UI Core Types](https://github.com/copilotkit/copilotkit)

---

## ❓ Common Questions

### Why can't I just keep V1 CustomUserMessage?
V1 components use GraphQL protocol and are incompatible with V2's AG-UI protocol. Migration is required.

### Why use wrapper pattern instead of full custom?
- Less code to write and maintain
- Automatic compatibility with V2 features (branching)
- Better type safety
- Proven pattern (see CustomAssistantMessageV2)

### What if I need complete control?
You can build fully custom, but you'll lose:
- Built-in edit mode UI
- Built-in copy functionality
- Automatic toolbar management
- Type compatibility with V2 slot system

### Will my messages be affected?
No. Messages are data stored separately. The UI component change doesn't affect stored messages.

### Can I migrate features incrementally?
Yes! Start with minimal wrapper (just passes props), then add features one by one:
1. Basic wrapper
2. Add rerun button
3. Add undo button
4. Add delete menu
5. Add attachment parsing

---

## ✅ Migration Checklist

### Pre-Migration
- [ ] Review all three documentation files
- [ ] Understand V2 slot system
- [ ] Backup current implementation
- [ ] Set up testing environment

### Implementation
- [ ] Create CustomUserMessageV2.tsx
- [ ] Implement basic wrapper
- [ ] Add custom toolbar items
- [ ] Add delete menu
- [ ] Add message renderer
- [ ] Copy static properties
- [ ] Update ChatInner.tsx

### Testing
- [ ] Basic rendering works
- [ ] Edit functionality works
- [ ] Copy functionality works
- [ ] Rerun works
- [ ] Undo works
- [ ] Delete menu works
- [ ] Attachments display
- [ ] Theme switching works

### Deployment
- [ ] Code review
- [ ] QA testing
- [ ] Stage deployment
- [ ] Monitor for issues
- [ ] Production deployment

---

## 🎓 Learning Path

### Beginner (Never used CopilotKit V2)
1. Read [Summary](./CUSTOM_USER_MESSAGE_V2_SUMMARY.md)
2. Read V2 slot system section in [Migration Guide](./CUSTOM_USER_MESSAGE_V2_MIGRATION_GUIDE.md#v2-slot-structure)
3. Study [CustomAssistantMessageV2 example](./pages/side-panel/src/components/chat/CustomAssistantMessageV2.tsx)
4. Follow step-by-step [Migration Guide](./CUSTOM_USER_MESSAGE_V2_MIGRATION_GUIDE.md#implementation-plan)

### Intermediate (Familiar with CopilotKit)
1. Read [Summary](./CUSTOM_USER_MESSAGE_V2_SUMMARY.md)
2. Review [Comparison Doc](./CUSTOM_USER_MESSAGE_V1_VS_V2_COMPARISON.md) for differences
3. Use [Migration Guide](./CUSTOM_USER_MESSAGE_V2_MIGRATION_GUIDE.md) as reference
4. Implement using wrapper pattern

### Advanced (CopilotKit Expert)
1. Skim [Summary](./CUSTOM_USER_MESSAGE_V2_SUMMARY.md)
2. Copy quick start code from [Comparison](./CUSTOM_USER_MESSAGE_V1_VS_V2_COMPARISON.md#quick-start-code-snippet)
3. Implement and extend as needed
4. Reference docs for specific details

---

## 🚧 Troubleshooting

### Type Errors
**Issue**: Type mismatch with UserMessage  
**Solution**: Check you're importing from `@ag-ui/core` and using `React.ComponentProps<typeof CopilotChatUserMessage>`

### Static Properties Missing
**Issue**: "Property X does not exist on type..."  
**Solution**: Ensure you're using `Object.assign()` to copy all static properties in the export

### Edit Not Working
**Issue**: Edit mode doesn't appear  
**Solution**: V2 handles edit internally. Don't override edit button unless necessary. Use `onEditMessage` callback to track edits.

### Toolbar Not Showing
**Issue**: Custom buttons don't appear  
**Solution**: Use `additionalToolbarItems` prop, not children. Check button component structure.

### Delete Menu Not Positioning
**Issue**: Dropdown appears in wrong location  
**Solution**: Use same portal pattern as V1 with `requestAnimationFrame` for positioning

---

## 📞 Support

For questions or issues:

1. Check the three documentation files in this folder
2. Review reference implementations (CustomAssistantMessageV2)
3. Check CopilotKit V2 official documentation
4. Review V1 source code for logic to reuse

---

## 🎯 Success Metrics

After migration, verify:

- ✅ All V1 features working
- ✅ Design matches V1 exactly
- ✅ No performance regressions
- ✅ Code is more maintainable
- ✅ TypeScript types are correct
- ✅ Tests pass
- ✅ Production stable

---

## 📝 Version History

- **v1.0** (Current) - CopilotKit V1 implementation
- **v2.0** (Target) - CopilotKit V2 wrapper pattern

---

## 🙏 Acknowledgments

This migration maintains feature parity with the excellent V1 implementation while leveraging V2's improved architecture and built-in features.

---

**Ready to start?** 👉 Begin with the [Summary Document](./CUSTOM_USER_MESSAGE_V2_SUMMARY.md)

**Need details?** 👉 Dive into the [Migration Guide](./CUSTOM_USER_MESSAGE_V2_MIGRATION_GUIDE.md)

**Want comparisons?** 👉 Check the [V1 vs V2 Comparison](./CUSTOM_USER_MESSAGE_V1_VS_V2_COMPARISON.md)

