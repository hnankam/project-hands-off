# ChatInner Functionality Checklist

## Purpose
This document ensures ALL existing functionality is preserved during refactoring.
Each feature must pass validation before and after refactoring.

---

## Core Functionalities Inventory

### 1. Message Management
- [ ] **Message Sanitization**
  - Truncates tool messages > 2000 chars
  - Adds "..." suffix to truncated messages
  - Only truncates once (checks for existing "...")
  - Preserves message structure and metadata
  
- [ ] **Message Deduplication**
  - Identifies duplicate assistant/tool messages by ID
  - Retains only the most recent duplicate
  - Maintains message order
  - Works with filtered and unfiltered messages
  
- [ ] **Message Filtering**
  - Filters out headless messages (role !== 'user', 'assistant', 'tool')
  - Preserves user, assistant, and tool messages
  - Maintains correct message count
  
- [ ] **Message Persistence**
  - `saveMessagesRef.current()` returns { allMessages, filteredMessages }
  - Sanitizes and deduplicates on save
  - `restoreMessagesRef.current(messages)` restores messages
  - Sanitizes and deduplicates on restore
  
- [ ] **Message Count Tracking**
  - Tracks headless (filtered) message count
  - Updates parent via `setHeadlessMessagesCount`
  - Only updates when count changes

---

### 2. Context Menu Integration
- [ ] **Message Prefilling**
  - Receives context menu message via props
  - Creates prefill event with sessionId and timestamp
  - Dispatches custom window event "copilot-prefill-text"
  - Uses requestAnimationFrame to defer dispatch
  - Prevents duplicate dispatches with cancelAnimationFrame
  
- [ ] **Event Scoping**
  - Includes sessionId in event detail
  - CustomInput filters events by sessionId
  - Only active session responds to events
  
- [ ] **Duplicate Prevention**
  - Tracks used messages in ref
  - Cancels pending animation frames
  - Marks message as used immediately

---

### 3. CopilotKit Actions (15 Total)

#### 3.1 Search Actions (4)
- [ ] **search_page_content**
  - Embeds user query
  - Searches page chunks via searchManager
  - Falls back to SurrealDB vector search
  - Returns top K results with scores
  - Handles empty results gracefully
  
- [ ] **search_form_data**
  - Embeds user query
  - Searches form field groups in SurrealDB
  - Returns matched form fields with metadata
  - Includes selector, type, name, attributes
  
- [ ] **search_clickable_elements**
  - Embeds user query
  - Searches clickable element groups in SurrealDB
  - Returns matched elements with metadata
  - Includes selector, text, tag, aria labels
  
- [ ] **search_dom_updates**
  - Embeds user query
  - Searches recent DOM changes in SurrealDB
  - Uses recency decay scoring
  - Returns updates with timestamps and scores

#### 3.2 Chunk Retrieval Actions (3)
- [ ] **get_html_chunks**
  - Retrieves HTML chunks by index range
  - Queries SurrealDB with LIMIT/START
  - Returns chunks with text and HTML
  - Handles pagination correctly
  
- [ ] **get_form_chunks**
  - Retrieves form field groups by index range
  - Queries SurrealDB with LIMIT/START
  - Returns groups with JSON and metadata
  - Handles pagination correctly
  
- [ ] **get_clickable_chunks**
  - Retrieves clickable element groups by index range
  - Queries SurrealDB with LIMIT/START
  - Returns groups with JSON and metadata
  - Handles pagination correctly

#### 3.3 Navigation Actions (5)
- [ ] **move_cursor_to_element**
  - Sends message to content script
  - Highlights and scrolls to element
  - Verifies selector before action
  - Returns success/error status
  
- [ ] **click_element**
  - Sends message to content script
  - Clicks element by selector
  - Handles click simulation
  - Returns success/error status
  
- [ ] **open_new_tab**
  - Opens URL in new browser tab
  - Returns tab info on success
  - Handles chrome API errors
  
- [ ] **scroll_page**
  - Scrolls page or element
  - Supports direction (up/down) and amount
  - Optional target selector
  - Returns scroll result
  
- [ ] **drag_and_drop**
  - Drags element to target
  - Uses source and target selectors
  - Returns success/error status

#### 3.4 Form Actions (1)
- [ ] **input_data**
  - Inputs data into form fields
  - Handles text, number, date, checkbox, radio, select
  - Validates selector before input
  - Returns success/error status

#### 3.5 Utility Actions (6)
- [ ] **cleanup_extension_ui**
  - Removes all extension highlights
  - Cleans up UI elements
  - Returns success status
  
- [ ] **verify_selector**
  - Checks if selector exists on page
  - Returns exists: true/false
  - Validates selector syntax
  
- [ ] **get_selector_at_point**
  - Gets selector at x,y coordinates
  - Returns selector and element info
  - Handles coordinates correctly
  
- [ ] **get_selectors_at_points**
  - Batch version of get_selector_at_point
  - Processes multiple points
  - Returns array of results
  
- [ ] **refresh_page_content**
  - Triggers fresh page content fetch
  - Includes all DOM content
  - Updates embeddings afterward
  - Returns success/error status
  
- [ ] **take_screenshot**
  - Captures visible tab or full page
  - Supports PNG and JPEG formats
  - Configurable quality
  - Returns base64 image data

#### 3.6 Generative UI Action (1)
- [ ] **display_weather_card**
  - Displays weather card component
  - Returns card with weather data
  - Integrates with CopilotKit UI

---

### 4. CopilotKit Readables (1)
- [ ] **Page Metadata**
  - Provides minimal page metadata to agent
  - Includes URL, title, domain, path
  - Includes database totals (HTML, form, clickable chunks)
  - Excludes large HTML/form data (sent only on demand)
  - Updates when page content changes

---

### 5. State Management

#### 5.1 Agent State
- [ ] **dynamic_agent state**
  - Syncs with backend via useCoAgent
  - Includes proverbs array
  - Updates automatically
  
- [ ] **dynamicAgentState (Progress)**
  - Tracks agent steps
  - Renders progress cards
  - Syncs with backend
  - Persists to session storage
  - Notifies parent on changes

#### 5.2 Theme
- [ ] **isLight theme**
  - Reads from exampleThemeStorage
  - Updates ThinkingBlock styling
  - Applies to all child components

#### 5.3 Loading State
- [ ] **isLoading**
  - Tracks agent loading state
  - Updates parent via setIsAgentLoading
  - Affects UI disabled states

#### 5.4 Database Totals
- [ ] **totals state**
  - Tracks HTML, form, clickable chunk counts
  - Updates from dbTotals prop
  - Used in page metadata readable
  - Logged for debugging

---

### 6. Progress Bar Management
- [ ] **Progress Bar State**
  - Tracks visibility with showProgressBar
  - Detects if progress exists (hasProgressBar)
  - Provides toggle function
  - Notifies parent component on state changes
  
- [ ] **Progress Card Rendering**
  - Renders floating progress card when steps exist
  - Shows card at top of chat
  - Includes backdrop blur effect
  - Adapts to light/dark theme
  
- [ ] **Historical Progress Cards**
  - Renders inline historical cards via useCoAgentStateRender
  - Marks older cards as historical
  - Collapses older cards automatically
  - Uses MutationObserver for card detection

---

### 7. Semantic Search
- [ ] **SemanticSearchManager**
  - Created once via useMemo
  - Uses pageDataRef for embeddings
  - Performs cosine similarity search
  - Caches results efficiently
  
- [ ] **Embedding Updates**
  - Updates pageDataRef when embeddings change
  - Updates pageDataRef when content changes
  - Preserves reference stability

---

### 8. Suggestions
- [ ] **Suggestion Generation**
  - Generates smart suggestions via useCopilotChatSuggestions
  - Instructions based on page metadata
  - Re-generates when content changes
  - Respects showSuggestions prop (maxSuggestions: 0 when false)
  - Shows 4 suggestions when enabled

---

### 9. Custom Rendering

#### 9.1 ThinkingBlock
- [ ] **Markdown Rendering**
  - Registers custom "thinking" markdown tag
  - Renders thinking content in blue box
  - Shows lightbulb icon
  - Adapts to light/dark theme
  - Displays with proper formatting

#### 9.2 TaskProgressCard
- [ ] **Floating Card**
  - Renders at top when agent is active
  - Shows current agent steps
  - Includes controls (collapse, etc.)
  - Updates in real-time
  
- [ ] **Inline Historical Cards**
  - Renders past progress inline with messages
  - Marked as historical
  - Shows collapsed by default
  - No controls shown

#### 9.3 CustomInput
- [ ] **Session-Scoped Input**
  - Created via useMemo with sessionId
  - Listens for prefill events scoped to session
  - Only processes events for matching sessionId
  - Stable across re-renders

#### 9.4 CustomUserMessage
- [ ] **User Message Rendering**
  - Displays user messages with custom styling
  - Adapts to theme
  - Shows user avatar/indicator

---

### 10. Effects and Side Effects

#### 10.1 Suggestions Effect
- [ ] **Content-based Trigger**
  - Triggers on currentPageContent.timestamp change
  - Calls generateSuggestions()
  - Only when page content updates

#### 10.2 Body Class Effect
- [ ] **Hide Suggestions Class**
  - Adds "hide-copilot-suggestions" to body when showSuggestions is false
  - Removes class when showSuggestions is true
  - Cleans up on unmount

#### 10.3 Embedding Update Effect
- [ ] **PageDataRef Update**
  - Updates pageDataRef.embeddings when pageContentEmbedding changes
  - Updates pageDataRef.pageContent when currentPageContent changes
  - Maintains reference stability

#### 10.4 DB Totals Effect
- [ ] **Totals Adoption**
  - Updates totals state when dbTotals prop changes
  - Logs adoption for debugging
  - Only updates when values change

#### 10.5 Progress State Notification Effect
- [ ] **Parent Notification**
  - Calls onProgressBarStateChange when values change
  - Includes has, show, and toggle function
  - Uses ref to track previous state
  - Only notifies on actual changes

#### 10.6 Agent Step State Notification Effect
- [ ] **Parent Notification**
  - Calls onAgentStepStateChange when dynamicAgentState changes
  - Keeps parent in sync with agent state

---

## Validation Tests

### Pre-Refactoring Tests
Run these tests BEFORE starting refactoring to establish baseline:

```bash
# 1. Message Management Tests
- Send 10 messages and verify count
- Trigger save and verify all messages saved
- Trigger restore and verify all messages restored
- Send duplicate tool messages and verify deduplication
- Send large tool message (>2000 chars) and verify truncation

# 2. Context Menu Tests
- Right-click and select "Analyze Element"
- Verify input field populates
- Switch sessions and verify only active session responds
- Trigger multiple context menu actions rapidly
- Verify no duplicate prefills

# 3. Search Actions Tests
- Search for "button" in page content
- Search for "email" in form fields
- Search for "submit" in clickable elements
- Search for recent changes in DOM updates
- Verify all return relevant results

# 4. Chunk Retrieval Tests
- Get HTML chunks [0-4]
- Get form chunks [0-2]
- Get clickable chunks [0-2]
- Verify correct chunks returned
- Test pagination (different ranges)

# 5. Navigation Actions Tests
- Move cursor to header element
- Click a button
- Open new tab with URL
- Scroll page down 500px
- Drag element A to element B

# 6. Form Actions Tests
- Input text into text field
- Input number into number field
- Check a checkbox
- Select radio button
- Select dropdown option

# 7. Utility Actions Tests
- Cleanup extension UI
- Verify selector exists
- Get selector at point (100, 100)
- Get selectors at multiple points
- Refresh page content
- Take screenshot (PNG and JPEG)

# 8. State Management Tests
- Verify agent state syncs
- Verify progress state syncs
- Verify theme applies correctly
- Verify loading state updates

# 9. Progress Bar Tests
- Start agent task with steps
- Verify progress card appears
- Toggle progress bar visibility
- Complete task and verify card becomes historical
- Start new task and verify new card appears

# 10. Suggestions Tests
- Load page with content
- Verify suggestions generate
- Disable suggestions and verify they hide
- Change page and verify suggestions regenerate
```

### Post-Refactoring Tests
Run the SAME tests after each refactoring phase to ensure no regressions.

### Automated Test Script
Create a test script that validates core functionality:

```typescript
// test-chatinner-functionality.ts
export const testChatInnerFunctionality = async () => {
  const results = {
    messageSanitization: false,
    messageDeduplication: false,
    contextMenuPrefill: false,
    searchActions: false,
    chunkRetrieval: false,
    navigationActions: false,
    formActions: false,
    utilityActions: false,
    progressBar: false,
    suggestions: false,
  };
  
  // Run all tests...
  
  return results;
};
```

---

## Refactoring Safety Guidelines

### 1. **One Change at a Time**
- Extract one hook at a time
- Test after each extraction
- Commit after each successful test
- Don't combine multiple changes

### 2. **Keep Old Code Initially**
- Comment out old code, don't delete immediately
- Keep for 1-2 commits after replacement works
- Easier to compare behavior
- Easier to rollback if needed

### 3. **Maintain Exact Behavior**
- Don't "improve" logic during extraction
- Save improvements for separate PRs
- Focus only on moving code, not changing it
- Compare outputs byte-for-byte if possible

### 4. **Test Coverage**
- Write tests for new hooks before using them
- Test hooks in isolation
- Test integration after replacement
- Maintain or improve test coverage

### 5. **Type Safety**
- Don't relax TypeScript checks
- Add types where missing
- Ensure no `any` types introduced
- Use strict mode

### 6. **Performance Monitoring**
- Measure render counts before/after
- Check memory usage before/after
- Monitor bundle size before/after
- Profile critical paths

### 7. **Documentation**
- Document each extracted hook
- Add usage examples
- Update component documentation
- Keep refactoring plan updated

---

## Rollback Plan

### If Issues Arise:
1. **Immediate Rollback**
   ```bash
   git revert HEAD  # Revert last commit
   git push --force-with-lease
   ```

2. **Restore from Branch**
   ```bash
   git checkout main
   git reset --hard origin/main
   ```

3. **Cherry-Pick Good Changes**
   ```bash
   git cherry-pick <good-commit-hash>
   ```

### Communication:
- Document any issues found
- Update refactoring plan with lessons learned
- Communicate with team before major changes
- Have staging environment for testing

---

## Sign-Off Checklist

Before marking refactoring complete:

### Functionality Preserved
- [ ] All 15 CopilotKit actions work
- [ ] Message sanitization works
- [ ] Message deduplication works
- [ ] Context menu prefill works
- [ ] Progress bar works
- [ ] Suggestions generate correctly
- [ ] Search functionality works
- [ ] Theme applies correctly
- [ ] All state management works

### Code Quality
- [ ] No TypeScript errors
- [ ] No linter warnings
- [ ] All tests pass
- [ ] Code coverage maintained or improved
- [ ] Documentation updated
- [ ] PR reviewed and approved

### Performance
- [ ] No performance regressions
- [ ] Bundle size not increased significantly
- [ ] Memory usage stable
- [ ] No new console errors/warnings

### User Experience
- [ ] UI looks identical
- [ ] All interactions work
- [ ] No visual regressions
- [ ] Animations/transitions preserved
- [ ] Accessibility maintained

---

## Notes

- This checklist is MANDATORY for each refactoring phase
- All items must be checked before proceeding to next phase
- Any failing item requires investigation and fix
- Document any deviations from original behavior
- Update this checklist as new functionality is discovered

## Success Criteria

✅ **Refactoring is successful when:**
1. All functionality checklist items pass
2. All tests pass (before and after)
3. Code is more maintainable
4. Performance is same or better
5. Team approves changes

❌ **Refactoring should be rolled back if:**
1. Any core functionality breaks
2. Performance degrades significantly
3. New bugs introduced that can't be quickly fixed
4. Team consensus to revert

