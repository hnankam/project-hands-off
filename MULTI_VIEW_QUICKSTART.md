# Multi-View Quick Start Guide

## 🎉 What's New

Your Chrome extension now supports **multiple viewing contexts**! Users can now open the chat interface in:

1. **Side Panel** (default) - The original compact view
2. **Popup Window** - Detached, resizable window
3. **Maximized Window** - Full-screen popup
4. **New Tab** - Full browser tab view

All views share the same data and stay perfectly synchronized!

---

## 🚀 Quick Start

### For End Users

#### Opening the Chat in Different Views

1. **Look for the "View" button** in the top toolbar (next to the "+" button)
2. **Click it** to see your options:
   - **Open in Window** - Opens a standard detached window (1200x800)
   - **Open Maximized** - Opens a full-screen window
   - **Open in New Tab** - Opens in a new browser tab

3. **Try it out**:
   - All your sessions and messages are available in any view
   - Changes in one view instantly appear in others
   - You can have multiple views open simultaneously

#### When in a Popup Window

The "View" menu shows additional options:
- **Toggle Maximize** - Switch between normal and full-screen
- **Close Window** - Exit the popup

---

## 🔧 For Developers

### What Was Added

#### 1. New Files

```
pages/side-panel/src/utils/windowManager.ts
pages/side-panel/src/components/ViewOptionsMenu.tsx
```

#### 2. Modified Files

```
pages/side-panel/src/pages/SessionsPage.tsx
pages/side-panel/src/SidePanel.tsx
pages/new-tab/src/NewTab.tsx
```

### Building & Testing

```bash
# Build the extension
pnpm build

# Load the extension in Chrome
# 1. Go to chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the /dist folder

# Test the features:
# 1. Open the side panel
# 2. Click the "View" button
# 3. Try each view option
# 4. Make changes in one view
# 5. Verify they appear in others
```

### How It Works

#### State Synchronization

```typescript
// All storage uses liveUpdate: true
const storage = createStorage<D>(key, fallback, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true  // ✅ Real-time sync!
});
```

This means:
- ✅ Changes propagate automatically across all views
- ✅ No manual synchronization needed
- ✅ Uses native Chrome Storage API events

#### View Detection

```typescript
import { getCurrentViewMode } from '@/utils/windowManager';

const viewMode = getCurrentViewMode();
// Returns: 'sidepanel' | 'popup' | 'newtab' | 'fullscreen'
```

#### Session Routing

```typescript
// Open a specific session in a new tab
await openInNewTab({
  sessionId: 'session-1234567890',
  active: true
});

// The new tab will automatically:
// 1. Load the chat interface
// 2. Switch to the specified session
// 3. Navigate to the sessions page
```

---

## 📋 Testing Checklist

### Manual Testing

- [ ] **Open in Popup** - Click View → Open in Window
- [ ] **Open Maximized** - Click View → Open Maximized
- [ ] **Open in New Tab** - Click View → Open in New Tab
- [ ] **Session Sync** - Create a message in side panel, verify it appears in popup/tab
- [ ] **Session Switch** - Switch sessions in one view, verify it reflects in others
- [ ] **Toggle Maximize** (in popup) - Click View → Toggle Maximize
- [ ] **Close Window** (in popup) - Click View → Close Window
- [ ] **Multiple Views** - Open multiple popups and tabs simultaneously
- [ ] **URL Routing** - Verify session ID in URL loads correct session
- [ ] **New Tab Default** - Navigate to new tab page, verify default mode still works

### Edge Cases

- [ ] Open popup when already in popup
- [ ] Switch sessions while popup is open
- [ ] Close side panel while popup is open
- [ ] Create new session in popup, verify in side panel
- [ ] Delete session in side panel, verify popup updates
- [ ] Test with no sessions
- [ ] Test with many sessions (20+)

---

## 🎯 Key Features

### 1. Smart Session Routing

When you open a view with a specific session:

```typescript
await openInNewTab({ sessionId: 'session-abc123' });
```

The extension automatically:
1. ✅ Detects the session ID from the URL
2. ✅ Verifies the session exists
3. ✅ Switches to that session
4. ✅ Navigates to the sessions page
5. ✅ Shows all messages and history

### 2. Context-Aware UI

The "View" menu adapts based on context:

**In Side Panel:**
- Show: Open in Window, Open Maximized, Open in New Tab
- Hide: Popup-specific options

**In Popup Window:**
- Show: All options plus Toggle Maximize and Close Window
- Highlight: Different styling to indicate popup context

### 3. Perfect State Sync

Every piece of data syncs automatically:
- ✅ Chat messages
- ✅ Session metadata
- ✅ User preferences
- ✅ Agent/model selections
- ✅ Theme settings
- ✅ Authentication state

---

## 🐛 Troubleshooting

### Popup Not Opening

**Issue**: Nothing happens when clicking "Open in Window"

**Solutions**:
1. Check browser's popup blocker (should allow extension popups by default)
2. Check browser console for errors
3. Verify extension has `windows` permission in manifest

### Session Not Loading

**Issue**: New tab/popup opens but shows wrong session

**Solutions**:
1. Check browser console for session routing logs
2. Verify session ID in URL matches an existing session
3. Check that session storage is accessible

### Changes Not Syncing

**Issue**: Updates in one view don't appear in others

**Solutions**:
1. Verify both views are open (not just tabs)
2. Check browser console for storage errors
3. Reload the extension
4. Clear extension storage and retry

### View Menu Not Showing

**Issue**: Can't find the "View" button

**Solutions**:
1. Look in the top toolbar, next to the "+" button
2. Ensure you're on the Sessions page, not Home or Admin
3. Try refreshing the side panel

---

## 📖 Usage Examples

### Example 1: Open Current Session in Popup

```typescript
import { openInPopupWindow } from '@/utils/windowManager';

// In SessionsPage or any component with access to currentSessionId
const handleOpenPopup = async () => {
  await openInPopupWindow({
    sessionId: currentSessionId,
    width: 1400,
    height: 900,
    state: 'normal'
  });
};
```

### Example 2: Open Specific Session in New Tab

```typescript
import { openInNewTab } from '@/utils/windowManager';

const handleOpenInTab = async (sessionId: string) => {
  await openInNewTab({
    sessionId,
    active: true  // Focus the new tab
  });
};
```

### Example 3: Detect Current View

```typescript
import { getCurrentViewMode, isPopupWindow } from '@/utils/windowManager';

const MyComponent = () => {
  const viewMode = getCurrentViewMode();
  const isPopup = isPopupWindow();
  
  return (
    <div>
      <p>Current view: {viewMode}</p>
      {isPopup && (
        <button onClick={closePopupWindow}>
          Close Window
        </button>
      )}
    </div>
  );
};
```

---

## 🎨 UI Integration

### ViewOptionsMenu Component

The menu is already integrated into `SessionsPage`:

```tsx
// File: pages/side-panel/src/pages/SessionsPage.tsx (line 1044)

<ViewOptionsMenu
  isLight={isLight}
  currentSessionId={currentSessionId}
/>
```

It's positioned in the header toolbar, providing easy access to all view options.

### Styling

The component uses existing design system:
- Respects light/dark theme
- Matches existing button styles
- Uses consistent spacing and typography
- Includes hover states and transitions

---

## 🚀 Next Steps

### Optional Enhancements

1. **Keyboard Shortcuts**
   ```typescript
   // Add to manifest.json
   "commands": {
     "open-popup": {
       "suggested_key": {
         "default": "Ctrl+Shift+P"
       },
       "description": "Open in popup window"
     }
   }
   ```

2. **Window State Persistence**
   ```typescript
   // Save window position/size
   const saveWindowState = async (windowId: number) => {
     const window = await chrome.windows.get(windowId);
     await chrome.storage.local.set({
       [`window_${windowId}`]: {
         width: window.width,
         height: window.height,
         top: window.top,
         left: window.left
       }
     });
   };
   ```

3. **View Preferences**
   ```typescript
   // Remember preferred view per session
   await storage.set({
     [`session_${sessionId}_preferredView`]: 'popup'
   });
   ```

---

## 📚 Additional Resources

- **Full Documentation**: See `MULTI_VIEW_IMPLEMENTATION.md`
- **Chrome Extension APIs**: [Chrome Windows API](https://developer.chrome.com/docs/extensions/reference/windows/)
- **Chrome Storage**: [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)

---

## ✅ Success Criteria

You'll know it's working when:

1. ✅ "View" button appears in SessionsPage header
2. ✅ Menu opens with all view options
3. ✅ Popup window opens successfully
4. ✅ New tab opens in chat mode
5. ✅ All views show the same data
6. ✅ Changes in one view appear immediately in others
7. ✅ Session routing works (URL with sessionId loads correct session)
8. ✅ Popup-specific controls appear in popup window
9. ✅ Window maximize/restore works
10. ✅ No console errors

---

## 🎉 You're Done!

The multi-view feature is fully implemented and ready to use. Enjoy the flexibility of viewing your chats in any context you prefer!

Need help? Check:
- Console logs for debugging
- `MULTI_VIEW_IMPLEMENTATION.md` for detailed architecture
- Chrome DevTools for extension debugging

