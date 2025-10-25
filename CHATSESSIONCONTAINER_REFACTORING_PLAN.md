# ChatSessionContainer.tsx Refactoring Plan

## Current State
- **Total Lines**: 1324 lines
- **Complexity**: Very High
- **Main Issues**:
  - Large embedding logic embedded in component (~300 lines)
  - Complex agent switching state machine (~70 lines)
  - Multiple auto-save effects (~60 lines)
  - DOM update embedding logic (~40 lines)
  - Missing timestamps on debug/console logs (~35+ statements)

## Refactoring Goals
1. Extract complex logic into custom hooks
2. Add timestamps to all logging statements
3. Extract utility functions
4. Improve code organization
5. Preserve ALL existing functionality

## Refactoring Tasks

### Task 1: Extract Page Content Embedding Logic (Priority: HIGH)
**Lines**: ~391-681 (290 lines)
**Target**: `usePageContentEmbedding.ts`
**Impact**: -290 lines from main component

**Responsibilities**:
- Manage embedding state (isEmbedding, embeddingStatus)
- Handle content embedding lifecycle
- Store embeddings in SurrealDB
- Update DB totals
- Prevent duplicate embeddings
- Handle embedding errors

**Inputs**:
- currentPageContent
- isEmbeddingInitialized
- isEmbeddingProcessing
- embedPageContentForTab
- sessionId
- currentTabId

**Outputs**:
- pageContentEmbeddingRef
- isEmbedding
- embeddingStatus
- dbTotals

### Task 2: Extract DOM Update Embedding Logic (Priority: MEDIUM)
**Lines**: ~684-760 (76 lines)
**Target**: `useDOMUpdateEmbedding.ts`
**Impact**: -76 lines from main component

**Responsibilities**:
- Embed DOM updates
- Store in database with recency score
- Create DOM update summaries

**Inputs**:
- latestDOMUpdate
- isEmbeddingInitialized
- currentPageContent
- embedTexts
- sessionId

**Outputs**:
- (side effects only - stores in DB)

### Task 3: Extract Agent Switching Logic (Priority: HIGH)
**Lines**: ~770-840 (70 lines)
**Target**: `useAgentSwitching.ts`
**Impact**: -70 lines from main component

**Responsibilities**:
- Manage agent switching state machine
- Handle 3-step switching process
- Save/restore messages during switch
- Show switching overlay

**Inputs**:
- selectedAgent
- selectedModel
- handleSaveMessages
- handleLoadMessages

**Outputs**:
- activeAgent
- activeModel
- isSwitchingAgent
- switchingStep

### Task 4: Extract Auto-Save Logic (Priority: MEDIUM)
**Lines**: ~910-964 (54 lines)
**Target**: `useAutoSave.ts`
**Impact**: -54 lines from main component

**Responsibilities**:
- Auto-save when session becomes inactive
- Auto-save when panel is closing
- Debounced save logic

**Inputs**:
- isActive
- saveMessagesRef
- saveMessagesToStorage

**Outputs**:
- (side effects only - auto-saves to storage)

### Task 5: Add Timestamps to All Logs (Priority: HIGH)
**Target**: All console.log/debug.log calls
**Impact**: Better debugging, consistent logging

**Locations** (~35 statements):
- Line 192: debug.log
- Line 221: debug.log
- Line 232: debug.log
- Line 250: debug.log
- Line 256: debug.log
- Line 366-380: console.log (6 statements)
- Line 394-673: console.log (25+ statements)
- Line 691: console.log
- Line 713: console.log
- Line 715: console.error
- Line 775-825: console.log (4 statements)

**Implementation**:
```typescript
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
```

### Task 6: Extract Helper Functions (Priority: LOW)
**Lines**: 722-760 (38 lines)
**Target**: `utils/domUpdateHelpers.ts`
**Impact**: -38 lines from main component

**Functions**:
- `createDOMUpdateSummary`

### Task 7: Final Verification (Priority: CRITICAL)
- Run linter
- Verify all functionality
- Test all hooks
- Ensure no regressions

## Expected Results

### Line Reduction
| Component | Before | After | Reduction |
|-----------|--------|-------|-----------|
| ChatSessionContainer.tsx | 1324 | ~800 | -524 lines (39.6%) |

### New Files
1. `hooks/usePageContentEmbedding.ts` (~320 lines with docs)
2. `hooks/useDOMUpdateEmbedding.ts` (~90 lines with docs)
3. `hooks/useAgentSwitching.ts` (~100 lines with docs)
4. `hooks/useAutoSave.ts` (~70 lines with docs)
5. `utils/domUpdateHelpers.ts` (~50 lines with docs)

### Benefits
- **Maintainability**: Each hook has a single, clear responsibility
- **Testability**: Hooks can be unit tested independently
- **Reusability**: Hooks can be used in other components
- **Readability**: Main component focuses on orchestration
- **Debugging**: Timestamps on all logs for better troubleshooting

## Implementation Order
1. ✅ Create refactoring plan document
2. 🔄 Extract `usePageContentEmbedding` hook (highest impact)
3. Extract `useDOMUpdateEmbedding` hook
4. Extract `useAgentSwitching` hook
5. Extract `useAutoSave` hook
6. Add timestamps to all logs
7. Extract helper functions
8. Final verification and linter check

---
**Status**: In Progress
**Priority**: High
**Estimated Completion**: 7 tasks remaining

