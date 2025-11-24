# CSS Phase 3 Extraction Plan

**Current Status**: Main CSS is 2,472 lines  
**Goal**: Reduce to ~1,200-1,500 lines (additional 40-50% reduction)

---

## Extraction Strategy

### Safe Extractions (Low Risk - Do First)

#### 1. CopilotKit Variables ✅ DONE
- **Lines**: 400-438 (39 lines)
- **Target**: `styles/0-base/variables.css`
- **Risk**: LOW - Pure CSS variables
- **Status**: ✅ Extracted

#### 2. Thinking Block Component
- **Lines**: ~1580-1630 (50 lines)
- **Target**: `styles/2-components/copilotkit/thinking-block.css`
- **Risk**: LOW - Self-contained component
- **Status**: Pending

#### 3. Utilities & Helpers
- **Lines**: 2364-END (~110 lines)
- **Target**: `styles/3-utilities/helpers.css`
- **Risk**: LOW - Generic utilities
- **Status**: Pending

### Moderate Risk Extractions (Do After Testing Safe Ones)

#### 4. CopilotKit Code Blocks
- **Lines**: 1161-~1350 (190 lines)
- **Target**: `styles/2-components/copilotkit/code-blocks.css`
- **Risk**: MODERATE - Used in chat messages
- **Status**: Pending

#### 5. CopilotKit Input & Suggestions
- **Lines**: ~1750-~1950 (200 lines)
- **Target**: `styles/2-components/copilotkit/input.css`
- **Risk**: MODERATE - Main input area
- **Status**: Pending

#### 6. CopilotKit Messages & Controls
- **Lines**: ~650-~1100 (450 lines)
- **Target**: `styles/2-components/copilotkit/messages.css`
- **Risk**: MODERATE - Core chat UI
- **Status**: Pending

---

## Expected Results

| Component | Lines | Cumulative Extracted | Main CSS Remaining |
|-----------|-------|---------------------|-------------------|
| Variables (done) | 39 | 39 | 2,433 |
| Thinking Block | 50 | 89 | 2,383 |
| Utilities | 110 | 199 | 2,273 |
| Code Blocks | 190 | 389 | 2,083 |
| Input & Suggestions | 200 | 589 | 1,883 |
| Messages & Controls | 450 | 1,039 | 1,433 |

**Final Projected Main CSS**: ~1,433 lines (**-42% from current**)

---

## Implementation Steps

### Phase 3A: Safe Extractions (Variables, Thinking, Utilities)
1. Extract each component to new file
2. Add import to main CSS
3. Remove extracted section from main
4. Build and test
5. If successful, proceed to next

### Phase 3B: Moderate Risk (Code Blocks, Input, Messages)
1. Extract one at a time
2. Test UI thoroughly after each
3. Verify:
   - Code blocks render correctly
   - Input works properly
   - Messages display correctly
   - Controls are functional

---

## Rollback Strategy

If any extraction causes issues:
1. Revert the specific extraction
2. Keep previously successful extractions
3. Document the issue
4. Skip problematic component

---

## Next Steps

1. ✅ Variables extracted
2. Extract Thinking Block
3. Extract Utilities
4. Build & test
5. If successful, proceed to Code Blocks
6. Continue iteratively


