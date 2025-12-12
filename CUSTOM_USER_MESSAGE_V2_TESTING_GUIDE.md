# CustomUserMessageV2 Testing Guide

## Quick Testing Checklist

Use this guide to verify each phase of the CustomUserMessageV2 implementation.

---

## Phase 1: Basic Wrapper with Theme Support

### Prerequisites
1. Start your development server
2. Open the side panel chat
3. Have both light and dark theme ready to test

### Test 1: Basic Message Rendering
**Steps**:
1. Send a user message: "Hello, this is a test message"
2. Verify the message appears in the chat

**Expected Result**:
- ✅ Message displays correctly
- ✅ Message has proper styling (rounded corners, border)
- ✅ Message background matches theme

### Test 2: Theme Switching
**Steps**:
1. With a message visible, note the current theme (light/dark)
2. Switch theme using your theme toggle
3. Observe the user message

**Expected Result**:
- ✅ Message colors update instantly
- ✅ Light theme: Background `#f9fafb`, Border `#e5e7eb`, Text `#374151`
- ✅ Dark theme: Background `#151C24`, Border `#374151`, Text `#d1d5db`

### Test 3: Edit Button Hover
**Steps**:
1. Hover over a user message
2. Observe the toolbar appearance

**Expected Result**:
- ✅ Toolbar fades in smoothly
- ✅ Edit button appears
- ✅ Copy button appears
- ✅ Buttons have proper icons
- ✅ Toolbar fades out when hover leaves

### Test 4: Edit Mode
**Steps**:
1. Hover over a user message
2. Click the edit button
3. Observe the UI change

**Expected Result**:
- ✅ Message switches to edit mode
- ✅ Textarea appears with current message content
- ✅ Save button appears
- ✅ Cancel button appears
- ✅ Toolbar buttons disappear

### Test 5: Edit and Save
**Steps**:
1. Enter edit mode (click edit button)
2. Modify the text (e.g., add " - edited")
3. Click the save button

**Expected Result**:
- ✅ Edit mode closes
- ✅ Message shows updated content
- ✅ No errors in console

### Test 6: Edit and Cancel
**Steps**:
1. Enter edit mode
2. Modify the text
3. Click the cancel button

**Expected Result**:
- ✅ Edit mode closes
- ✅ Message shows original content (not edited)
- ✅ Changes are discarded

### Test 7: Keyboard Shortcuts - Save
**Steps**:
1. Enter edit mode
2. Modify the text
3. Press Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux)

**Expected Result**:
- ✅ Edit mode closes
- ✅ Message shows updated content
- ✅ Works same as clicking save button

### Test 8: Keyboard Shortcuts - Cancel
**Steps**:
1. Enter edit mode
2. Modify the text
3. Press Esc

**Expected Result**:
- ✅ Edit mode closes
- ✅ Message shows original content
- ✅ Changes are discarded

### Test 9: Copy Button
**Steps**:
1. Hover over a user message
2. Click the copy button
3. Paste into a text editor

**Expected Result**:
- ✅ Copy button shows checkmark animation briefly
- ✅ Message content is copied to clipboard correctly
- ✅ Button returns to normal copy icon after ~2 seconds

### Test 10: Multiple Messages
**Steps**:
1. Send 3-4 different user messages
2. Hover over each one
3. Try editing different messages

**Expected Result**:
- ✅ Each message has its own toolbar
- ✅ Only the hovered message shows toolbar
- ✅ Can edit any message independently
- ✅ Edits don't affect other messages

### Test 11: Long Message
**Steps**:
1. Send a very long user message (500+ characters)
2. Enter edit mode
3. Observe the textarea

**Expected Result**:
- ✅ Textarea auto-resizes to show all content
- ✅ No overflow issues
- ✅ Can scroll within textarea if needed
- ✅ Save/cancel buttons remain visible

### Test 12: Special Characters
**Steps**:
1. Send a message with special characters: `Hello! @user #test $price & more...`
2. Enter edit mode
3. Add more special characters: `<div>test</div>`

**Expected Result**:
- ✅ Special characters display correctly
- ✅ HTML is not rendered (shows as text)
- ✅ No XSS vulnerabilities
- ✅ Characters preserved after edit

---

## Phase 2 Tests (Coming Soon)

### Test 13: Rerun Button
- Verify rerun button appears in toolbar
- Test clicking rerun regenerates assistant response
- Verify correct message is targeted

### Test 14: Undo Button
- Verify undo button appears after editing
- Test clicking undo restores previous content
- Verify multiple undos work (if implemented)

---

## Phase 3 Tests (Coming Soon)

### Test 15: Delete Menu
- Verify delete button with dropdown icon
- Test clicking opens dropdown menu
- Verify three options appear

### Test 16: Delete This Message
- Test deleting a middle message
- Verify only that message is removed
- Verify other messages remain

### Test 17: Delete Above
- Test delete all above from middle message
- Verify all messages above are deleted
- Verify current and below messages remain

### Test 18: Delete Below
- Test delete all below from middle message
- Verify all messages below are deleted
- Verify current and above messages remain

---

## Phase 4 Tests (Coming Soon)

### Test 19: Attachment Chips
- Send message with attachment manifest
- Verify chips display with file icon, name, size
- Test clicking chip opens/downloads file

### Test 20: Custom Markdown
- Send message with markdown syntax
- Verify proper rendering
- Test code blocks, lists, etc.

---

## Browser Testing Matrix

Test in multiple browsers:

- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (if on Mac)

---

## Accessibility Testing

### Keyboard Navigation
- [ ] Tab to edit button (via message hover)
- [ ] Enter/Space to activate edit button
- [ ] Tab through save/cancel in edit mode
- [ ] Esc to cancel edit mode

### Screen Reader
- [ ] Verify edit button has proper aria-label
- [ ] Verify save/cancel buttons announced
- [ ] Verify message role is communicated

---

## Performance Testing

### Memory Leaks
1. Send 50+ messages
2. Edit/cancel multiple times
3. Check browser memory usage (DevTools)

**Expected**:
- ✅ No memory leaks
- ✅ Smooth performance with many messages

### Animation Performance
1. Rapidly hover in/out of messages
2. Observe toolbar animation

**Expected**:
- ✅ No animation jank
- ✅ Smooth fade transitions

---

## Error Scenarios

### Test E1: Edit with Empty Content
**Steps**:
1. Enter edit mode
2. Delete all text (empty textarea)
3. Try to save

**Expected Result**:
- ⚠️ Should handle gracefully (allow or show validation)

### Test E2: Edit During Theme Switch
**Steps**:
1. Enter edit mode
2. Switch theme while editing
3. Continue editing and save

**Expected Result**:
- ✅ Edit mode remains functional
- ✅ Save works correctly
- ✅ No visual glitches

### Test E3: Rapid Edit/Cancel
**Steps**:
1. Rapidly click edit → cancel → edit → cancel
2. Multiple times

**Expected Result**:
- ✅ UI responds correctly each time
- ✅ No stuck states
- ✅ No console errors

---

## Console Error Check

After all tests, check browser console:

- [ ] No TypeScript errors
- [ ] No React warnings
- [ ] No CopilotKit errors
- [ ] No CORS errors
- [ ] No missing prop warnings

---

## Visual Regression Checklist

Compare with V1 design (if available):

- [ ] Border radius matches
- [ ] Padding/margins match
- [ ] Font sizes match
- [ ] Colors match (light theme)
- [ ] Colors match (dark theme)
- [ ] Hover states match
- [ ] Button sizes match
- [ ] Icon sizes match

---

## Integration Testing

### With Assistant Messages
1. Send user message
2. Wait for assistant response
3. Edit user message
4. Verify chat flow continues normally

### With Suggestions
1. Display suggestions
2. Send user message
3. Verify suggestions update/clear appropriately

### With Error States
1. Trigger an error (disconnect network)
2. Try to edit a user message
3. Verify no crashes

---

## Documentation Test

After Phase 1:
- [ ] All Phase 1 features documented
- [ ] Code comments are clear
- [ ] TypeScript types are documented
- [ ] Known issues listed (if any)

---

## Sign-Off Checklist

Before marking Phase 1 complete:

- [ ] All Phase 1 tests pass
- [ ] No linting errors
- [ ] No TypeScript errors
- [ ] No console errors
- [ ] Theme switching works
- [ ] Edit mode works
- [ ] Copy works
- [ ] Keyboard shortcuts work
- [ ] Tested in at least 2 browsers
- [ ] Documentation updated
- [ ] Code reviewed

---

## Quick Smoke Test (30 seconds)

For rapid verification:

1. ✅ Send message → appears
2. ✅ Hover → toolbar shows
3. ✅ Click edit → edit mode
4. ✅ Type text → updates
5. ✅ Press Esc → cancels
6. ✅ Click copy → copies
7. ✅ Switch theme → updates

**If all pass**: Phase 1 is working! ✅

**If any fail**: Debug and retest.

---

## Automated Test Script (Future)

Consider adding automated tests:

```typescript
describe('CustomUserMessageV2 - Phase 1', () => {
  it('renders user message correctly', () => {
    // Test implementation
  });
  
  it('shows toolbar on hover', () => {
    // Test implementation
  });
  
  it('enters edit mode on edit click', () => {
    // Test implementation
  });
  
  // More tests...
});
```

---

## Bug Report Template

If you find issues:

```markdown
**Bug Title**: [Brief description]

**Phase**: Phase 1

**Steps to Reproduce**:
1. 
2. 
3. 

**Expected Behavior**:


**Actual Behavior**:


**Browser**: Chrome 120 / Firefox 121 / Safari 17

**Theme**: Light / Dark

**Console Errors**:
```
[Paste any errors]
```

**Screenshots**: [Attach if relevant]
```

---

## Need Help?

- Review [Phase 1 Complete Doc](./CUSTOM_USER_MESSAGE_V2_PHASE1_COMPLETE.md)
- Check [Migration Guide](./CUSTOM_USER_MESSAGE_V2_MIGRATION_GUIDE.md)
- Compare with [V1 vs V2 Comparison](./CUSTOM_USER_MESSAGE_V1_VS_V2_COMPARISON.md)
- Inspect browser DevTools for errors

---

**Testing Status**: 🟡 **Ready to Test** (Phase 1)

Run through all Phase 1 tests and report results!

