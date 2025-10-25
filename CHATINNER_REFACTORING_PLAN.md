# ChatInner Component Refactoring Plan

## Current Issues

### 1. **Size and Complexity**
- **1,766 lines** in a single file
- **15+ CopilotKit actions** defined inline
- **Multiple state management concerns** mixed together
- **Hard to maintain and test**

### 2. **Multiple Responsibilities**
The component currently handles:
- Message sanitization and deduplication
- Context menu prefill logic
- Semantic search management
- Progress bar state management
- 15+ CopilotKit actions (search, navigation, form manipulation, etc.)
- Custom UI rendering (ThinkingBlock, TaskProgressCard)
- Suggestion generation
- Theme management
- Database totals management

### 3. **Performance Concerns**
- Multiple `useEffect` hooks (20+)
- Large inline action definitions that recreate on every render
- Complex sanitization logic in callbacks
- Potential unnecessary re-renders

## Refactoring Strategy

### Phase 1: Extract Custom Hooks

#### 1.1 `useMessageSanitization`
**Location**: `pages/side-panel/src/hooks/useMessageSanitization.ts`

**Purpose**: Handle message sanitization, deduplication, and filtering

**Exports**:
```typescript
export const useMessageSanitization = (messages: any[], setMessages: (msgs: any[]) => void) => {
  return {
    filteredMessages: any[],
    sanitizeMessages: (msgs: any[]) => { messages, hasChanges },
    computeMessagesSignature: (msgs: any[]) => string,
  };
};
```

**Moves**:
- `sanitizeMessages` callback
- `computeMessagesSignature` function
- `filteredMessages` memo
- All sanitization-related refs

---

#### 1.2 `useContextMenuPrefill`
**Location**: `pages/side-panel/src/hooks/useContextMenuPrefill.ts`

**Purpose**: Handle context menu message prefilling

**Exports**:
```typescript
export const useContextMenuPrefill = (
  sessionId: string,
  contextMenuMessage: string | null
) => {
  // Handles event dispatch and state management
};
```

**Moves**:
- `inputPrefillRef`, `contextMenuUsedRef`, `pendingAnimationFrameRef`
- Context menu `useEffect` logic
- Event dispatch logic

---

#### 1.3 `useProgressBarState`
**Location**: `pages/side-panel/src/hooks/useProgressBarState.ts`

**Purpose**: Manage progress bar visibility and state

**Exports**:
```typescript
export const useProgressBarState = (
  dynamicAgentState: AgentStepState,
  onProgressBarStateChange?: (has: boolean, show: boolean, toggle: () => void) => void
) => {
  return {
    showProgressBar: boolean,
    hasProgressBar: boolean,
    toggleProgressBar: () => void,
  };
};
```

**Moves**:
- `showProgressBar` state
- `hasProgressBar` derived state
- `toggleProgressBarFn` callback
- Progress bar state change notification effect

---

#### 1.4 `useSemanticSearch`
**Location**: `pages/side-panel/src/hooks/useSemanticSearch.ts`

**Purpose**: Encapsulate semantic search manager and database queries

**Exports**:
```typescript
export const useSemanticSearch = (
  sessionId: string,
  pageDataRef: React.MutableRefObject<any>
) => {
  return {
    searchManager: SemanticSearchManager,
    searchPageContent: (query: string, ...opts) => Promise<Result>,
    searchFormData: (query: string, ...opts) => Promise<Result>,
    searchClickableElements: (query: string, ...opts) => Promise<Result>,
    searchDOMUpdates: (query: string, ...opts) => Promise<Result>,
    getHTMLChunks: (startIndex: number, endIndex: number) => Promise<Result>,
    getFormGroups: (startIndex: number, endIndex: number) => Promise<Result>,
    getClickableGroups: (startIndex: number, endIndex: number) => Promise<Result>,
  };
};
```

---

### Phase 2: Extract CopilotKit Actions

#### 2.1 Action Files Structure
```
pages/side-panel/src/actions/copilot/
├── index.ts                      # Exports all actions
├── searchActions.ts              # Search-related actions
│   ├── useSearchPageContent
│   ├── useSearchFormData
│   ├── useSearchClickableElements
│   ├── useSearchDOMUpdates
├── chunkActions.ts               # Chunk retrieval actions
│   ├── useGetHTMLChunks
│   ├── useGetFormChunks
│   ├── useGetClickableChunks
├── navigationActions.ts          # Browser navigation actions
│   ├── useMoveCursorToElement
│   ├── useClickElement
│   ├── useOpenNewTab
│   ├── useScroll
│   ├── useDragAndDrop
├── formActions.ts                # Form manipulation actions
│   ├── useInputData
├── utilityActions.ts             # Utility actions
│   ├── useCleanupExtensionUI
│   ├── useVerifySelector
│   ├── useGetSelectorAtPoint
│   ├── useGetSelectorsAtPoints
│   ├── useRefreshPageContent
│   ├── useTakeScreenshot
│   ├── useWaitSeconds
└── generativeUIActions.ts        # Generative UI actions
    └── useWeatherCard
```

#### 2.2 Action Hook Pattern
Each action hook should follow this pattern:

```typescript
export const useSearchPageContent = (
  searchManager: SemanticSearchManager,
  totals: { html: number; form: number; click: number }
) => {
  useCopilotAction({
    name: 'search_page_content',
    description: '...',
    parameters: [...],
    handler: async ({ query, topK, minScore }) => {
      // Action logic
    },
  });
};
```

---

### Phase 3: Extract Components

#### 3.1 `ThinkingBlock`
**Location**: `pages/side-panel/src/components/ThinkingBlock.tsx`

**Purpose**: Render thinking block for AI reasoning

```typescript
export const ThinkingBlock: FC<{ 
  children?: React.ReactNode;
  isLight: boolean;
}> = ({ children, isLight }) => {
  // Component logic
};
```

---

#### 3.2 `TaskProgressCard` (Already separate, but verify usage)
Ensure proper integration and memoization

---

### Phase 4: Reorganize ChatInner.tsx

#### 4.1 New Structure
```typescript
export const ChatInner: FC<ChatInnerProps> = (props) => {
  // ========================================
  // 1. HOOKS & CONTEXT
  // ========================================
  const { isLight } = useStorage(exampleThemeStorage);
  const { threadId, setChatInstructions, ... } = useCopilotContext();
  const { messages, setMessages, isLoading } = useCopilotChatHeadless_c();
  
  // ========================================
  // 2. CUSTOM HOOKS
  // ========================================
  const { filteredMessages, sanitizeMessages } = useMessageSanitization(messages, setMessages);
  useContextMenuPrefill(sessionId, contextMenuMessage);
  const { showProgressBar, hasProgressBar, toggleProgressBar } = useProgressBarState(...);
  const searchActions = useSemanticSearch(sessionId, pageDataRef);
  
  // ========================================
  // 3. STATE & REFS
  // ========================================
  const [totals, setTotals] = useState(...);
  const pageDataRef = useRef(...);
  
  // ========================================
  // 4. COPILOTKIT ACTIONS (via custom hooks)
  // ========================================
  useSearchPageContent(searchActions.searchManager, totals);
  useGetHTMLChunks(searchActions.getHTMLChunks);
  // ... all other action hooks
  
  // ========================================
  // 5. COPILOTKIT READABLES
  // ========================================
  useCopilotReadable({
    description: "Current page metadata",
    value: pageMetadataForAgent,
  });
  
  // ========================================
  // 6. EFFECTS
  // ========================================
  useEffect(() => {
    // Update embeddings ref
  }, [pageContentEmbedding, currentPageContent]);
  
  useEffect(() => {
    // Generate suggestions
  }, [currentPageContent?.timestamp]);
  
  // ========================================
  // 7. MEMO & CALLBACKS
  // ========================================
  const ScopedInput = useMemo(() => { ... }, [sessionId]);
  
  // ========================================
  // 8. RENDER
  // ========================================
  return (
    <div>
      <CopilotChat ... />
    </div>
  );
};
```

---

### Phase 5: Additional Improvements

#### 5.1 Type Safety
- Create proper TypeScript interfaces for all action parameters
- Extract common types to `types.ts`
- Use `z` (Zod) schemas consistently

#### 5.2 Error Handling
- Add consistent error handling across all actions
- Create error boundary for the component
- Add better error messages for users

#### 5.3 Performance
- Audit all `useMemo` and `useCallback` dependencies
- Ensure refs are used where appropriate to avoid re-renders
- Consider using `React.memo` for sub-components

#### 5.4 Testing
- Write unit tests for custom hooks
- Write integration tests for actions
- Add test coverage reporting

#### 5.5 Documentation
- Add JSDoc comments to all hooks and functions
- Create usage examples
- Document action parameters and return types

---

## Implementation Order

1. ✅ **Phase 1**: Extract custom hooks (easier, low risk)
   - Start with `useMessageSanitization`
   - Then `useContextMenuPrefill`
   - Then `useProgressBarState`
   - Finally `useSemanticSearch`

2. **Phase 2**: Extract CopilotKit actions (medium complexity)
   - Group related actions first
   - Test each group independently
   - Update ChatInner to use new hooks

3. **Phase 3**: Extract components (low risk)
   - Extract `ThinkingBlock`
   - Verify `TaskProgressCard` integration

4. **Phase 4**: Reorganize ChatInner (final cleanup)
   - Apply new structure
   - Add section comments
   - Remove dead code

5. **Phase 5**: Polish and improvements
   - Add missing types
   - Improve error handling
   - Add tests
   - Update documentation

---

## Expected Benefits

### Maintainability
- **Smaller files**: Easier to navigate and understand
- **Clear separation of concerns**: Each file has a single responsibility
- **Easier testing**: Hooks and actions can be tested independently

### Performance
- **Better memoization**: Custom hooks can manage their own memoization
- **Reduced re-renders**: Clearer dependency arrays
- **Lazy loading**: Actions could be lazy-loaded if needed

### Developer Experience
- **Better IDE support**: Smaller files load faster in editors
- **Easier debugging**: Clear boundaries between concerns
- **Reusability**: Custom hooks can be used in other components

### Code Quality
- **Type safety**: Better TypeScript inference
- **Consistency**: Standardized patterns across actions
- **Documentation**: Easier to document smaller, focused modules

---

## Migration Strategy

### For Development
1. Create new hook files alongside existing code
2. Gradually move logic from ChatInner to hooks
3. Test each migration step
4. Keep old code until new code is verified
5. Delete old code once migration is complete

### For Testing
1. Add tests for new hooks as they're created
2. Verify behavior matches original
3. Test in development environment
4. Test in production-like environment
5. Monitor for regressions

### For Deployment
1. Deploy as non-breaking changes
2. Monitor performance metrics
3. Have rollback plan ready
4. Deploy in stages if needed

---

## Notes

- This refactoring can be done incrementally
- Each phase can be deployed independently
- Old behavior should be preserved exactly
- Performance should improve or stay the same
- Code coverage should improve with better testability

## Next Steps

1. Review and approve this plan
2. Start with Phase 1, Hook 1 (`useMessageSanitization`)
3. Create PR for each major change
4. Update this document as we progress

