# ChatSessionContainer.tsx Integration Guide

## Overview
This guide provides step-by-step instructions for integrating the newly created custom hooks into `ChatSessionContainer.tsx`. Follow these instructions carefully to ensure all functionality is preserved.

## Created Hooks

1. **usePageContentEmbedding.ts** (432 lines) - Manages page content embedding
2. **useDOMUpdateEmbedding.ts** (136 lines) - Manages DOM update embedding
3. **useAgentSwitching.ts** (126 lines) - Manages agent/model switching
4. **useAutoSave.ts** (106 lines) - Manages automatic message saving
5. **logging.ts** (48 lines) - Shared timestamp utilities

## Integration Steps

### Step 1: Add New Imports

At the top of `ChatSessionContainer.tsx`, after line 17, add:

```typescript
import { usePageContentEmbedding } from '../hooks/usePageContentEmbedding';
import { useDOMUpdateEmbedding } from '../hooks/useDOMUpdateEmbedding';
import { useAgentSwitching } from '../hooks/useAgentSwitching';
import { useAutoSave } from '../hooks/useAutoSave';
import { ts } from '../utils/logging';
```

### Step 2: Replace Embedding State (Lines 53-87)

**REMOVE** these lines:
```typescript
// Lines 53-77: pageContentEmbeddingRef definition
// Lines 80-87: isEmbedding, embeddingStatus, dbTotals state
```

**KEEP** only:
```typescript
// Progress bar state (lines 48-51)
const [hasProgressBar, setHasProgressBar] = useState(false);
const [showProgressBar, setShowProgressBar] = useState(true);
const [toggleProgressBar, setToggleProgressBar] = useState<(() => void) | undefined>(undefined);
```

### Step 3: Replace Agent Switching State (Lines 99-121)

**REMOVE** these lines:
```typescript
// Lines 101-103: isSwitchingAgent, switchingStep, shouldLoadMessagesAfterSwitch
// Lines 106-107: activeAgent, activeModel
// Lines 120-121: previousAgentRef, previousModelRef
```

**KEEP** only:
```typescript
// Lines 99-100
const [selectedAgent, setSelectedAgent] = useState(currentSession?.selectedAgent || 'general');
const [selectedModel, setSelectedModel] = useState(currentSession?.selectedModel || 'claude-4.5-haiku');
```

### Step 4: Add Hook Calls (After Line 327)

After the `useEmbeddingWorker` hook call (line 327), add the new hooks:

```typescript
// Page content embedding hook
const {
  pageContentEmbeddingRef,
  isEmbedding,
  embeddingStatus,
  dbTotals,
} = usePageContentEmbedding({
  currentPageContent,
  isEmbeddingInitialized,
  isEmbeddingProcessing,
  embedPageContentForTab,
  initialize,
  sessionId,
  currentTabId,
});

// DOM update embedding hook
useDOMUpdateEmbedding({
  latestDOMUpdate,
  isEmbeddingInitialized,
  currentPageContent,
  embedTexts,
  sessionId,
});

// Agent switching hook
const {
  activeAgent,
  activeModel,
  isSwitchingAgent,
  switchingStep,
} = useAgentSwitching({
  selectedAgent,
  selectedModel,
  sessionId,
  handleSaveMessages,
  handleLoadMessages,
});

// Auto-save hook
useAutoSave({
  isActive,
  saveMessagesRef,
  saveMessagesToStorage,
});
```

### Step 5: Remove Old Logic

**DELETE** these large blocks:

1. **Lines 329-333**: `isEmbeddingProcessingRef` effect (now handled in hook)
2. **Lines 363-380**: Embedding worker state logging (moved to hook)
3. **Lines 391-681**: Entire page content embedding effect (moved to hook)
4. **Lines 684-760**: Entire DOM update embedding logic (moved to hook)
5. **Lines 762-767**: Agent/model storage effect (moved to hook)
6. **Lines 770-840**: Agent switching effects (moved to hook)
7. **Lines 910-964**: Auto-save effects (moved to hook)

### Step 6: Add Timestamps to Remaining Logs

Find and replace all `debug.log(` and `console.log(` calls with timestamp:

**Before:**
```typescript
debug.log('[ChatSessionContainer] Panel hidden, clearing content cache');
console.log('[ChatSessionContainer] ✅ Embedding worker ready');
```

**After:**
```typescript
debug.log(ts(), '[ChatSessionContainer] Panel hidden, clearing content cache');
console.log(ts(), '[ChatSessionContainer] ✅ Embedding worker ready');
```

**Locations to update** (approximate line numbers):
- Line 192: `debug.log`
- Line 221: `debug.log`
- Line 232: `debug.log`
- Line 250: `debug.log`
- Line 256: `debug.log`
- Line 352: `console.warn`
- Line 358: `console.warn`

### Step 7: Update MessageData Interface

The `MessageData` interface (lines 110-113) is now defined in the hook, so it can be removed from the component. However, if other parts reference it, keep it or import from a shared types file.

### Step 8: Verify Functionality

After making changes, verify:

1. ✅ Embedding still works when content changes
2. ✅ Agent switching shows 3-step overlay
3. ✅ Messages auto-save when session becomes inactive
4. ✅ Messages auto-save when panel closes
5. ✅ DOM updates are embedded and stored
6. ✅ All logs show timestamps
7. ✅ No TypeScript errors
8. ✅ No linter warnings

## Expected Results

### Line Reduction
| File | Before | After | Change |
|------|--------|-------|--------|
| ChatSessionContainer.tsx | 1324 | ~800 | -524 lines (39.6%) |

### New Files Created
- `hooks/usePageContentEmbedding.ts` (432 lines)
- `hooks/useDOMUpdateEmbedding.ts` (136 lines)
- `hooks/useAgentSwitching.ts` (126 lines)
- `hooks/useAutoSave.ts` (106 lines)
- `utils/logging.ts` (48 lines)
- **Total new code**: 848 lines (well-documented, testable)

### Benefits
- **Maintainability**: Each hook has a single responsibility
- **Testability**: Hooks can be tested independently
- **Reusability**: Hooks can be used in other components
- **Debugging**: Timestamps on all logs
- **Readability**: Main component is focused on orchestration

## Common Issues & Solutions

### Issue 1: TypeScript Errors on Hook Returns
**Solution**: Ensure all hook return types match the expected types in ChatSessionContainer

### Issue 2: Embedding Not Working
**Solution**: Verify that `currentPageContent` is being passed correctly to the hook

### Issue 3: Agent Switching Overlay Not Showing
**Solution**: Ensure `isSwitchingAgent` and `switchingStep` from the hook are used in the render

### Issue 4: Auto-save Not Triggering
**Solution**: Verify `saveMessagesRef` is populated by ChatInner before the hook tries to use it

## Testing Checklist

- [ ] Load a page - embedding should trigger automatically
- [ ] Switch agents - 3-step overlay should appear
- [ ] Switch tabs while session is inactive - messages should auto-save
- [ ] Close panel - messages should auto-save immediately
- [ ] Make DOM changes - updates should be embedded
- [ ] Check console - all logs should have timestamps
- [ ] Run `npm run lint` - no errors
- [ ] Run `npm run build` - no TypeScript errors

## Rollback Plan

If issues arise:
1. Revert ChatSessionContainer.tsx to previous version
2. Keep the new hook files - they're standalone and don't affect anything
3. Debug the integration step-by-step
4. Test each hook integration separately

---

**Status**: Integration guide complete
**Estimated Integration Time**: 30-45 minutes
**Risk Level**: Medium (large file, but changes are well-isolated)
**Recommendation**: Test after each major step (embedding, switching, auto-save)

