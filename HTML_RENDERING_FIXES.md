# HTML Rendering & Thread Content Fixes

## Issues Fixed

### 1. ❌ Email accordion showing "No content available" for threads
**Root Cause**: Backend endpoint returned `{ thread: {...} }` but modal was looking for `data.threadContent`

**Fix**: Backend now includes formatted thread content in response

### 2. ❌ Email content rendering as plain text instead of HTML
**Root Cause**: Content was displayed as plain text with monospace font, showing raw HTML tags

**Fix**: Added DOMPurify for safe HTML rendering with fallback to plain text

---

## Changes Made

### 1. Backend: `copilot-runtime-server/routes/workspace.js`

#### Thread Endpoint - Added `threadContent` to Response

**Lines ~1372-1389** (main path):
```javascript
// Fetch thread with all messages
try {
  const thread = await fetchGmailThread(tokens.access_token, threadId);
  
  if (!thread) {
    return res.status(404).json({ error: 'Thread not found' });
  }
  
  // Convert thread to formatted text
  const { convertThreadToTextFormat } = await import('../utils/gmail-client.js');
  const threadContent = convertThreadToTextFormat(thread);
  
  // Update last_used_at
  await pool.query(
    'UPDATE workspace_connections SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
    [connectionId]
  );
  
  res.json({ thread, threadContent }); // Now includes threadContent
```

**Lines ~1395-1414** (retry after token refresh):
```javascript
// Retry the request with new token
const thread = await fetchGmailThread(tokens.access_token, threadId);

if (!thread) {
  return res.status(404).json({ error: 'Thread not found' });
}

// Convert thread to formatted text
const { convertThreadToTextFormat } = await import('../utils/gmail-client.js');
const threadContent = convertThreadToTextFormat(thread);

// Update last_used_at
await pool.query(
  'UPDATE workspace_connections SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
  [connectionId]
);

return res.json({ thread, threadContent }); // Now includes threadContent
```

**Impact**: 
- Modal can now access `data.threadContent` for threads
- Threads display formatted content instead of "No content available"

---

### 2. Frontend: `pages/side-panel/package.json`

#### Added DOMPurify Dependencies

```json
"dependencies": {
  // ... other dependencies
  "dompurify": "^3.2.2",
  // ... other dependencies
},
"devDependencies": {
  // ... other devDependencies
  "@types/dompurify": "^3.2.0"
}
```

**Action Required**: Run `pnpm install` to install the new dependencies

---

### 3. Frontend: `pages/side-panel/src/components/modals/GmailItemsModal.tsx`

#### Added HTML Rendering Capability

**Imports** (Line ~6-8):
```typescript
import React, { useState, useEffect, useMemo } from 'react';
import { cn } from '@extension/ui';
import DOMPurify from 'dompurify';
```

**Helper Functions** (Line ~255-273):
```typescript
// Check if content is HTML
const isHTML = (str: string) => {
  const htmlPattern = /<\/?[a-z][\s\S]*>/i;
  return htmlPattern.test(str);
};

// Sanitize HTML content
const sanitizeHTML = (html: string) => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'a', 'img', 'div', 'span', 'blockquote', 'pre', 'code',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr'
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'style', 'target'],
    ALLOW_DATA_ATTR: false,
  });
};
```

**Updated Accordion Rendering** (Line ~593-626):
```typescript
{isLoadingContent ? (
  // Loading spinner
  <div className={cn('py-4 text-center text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
    {/* ... loading spinner SVG ... */}
    Loading {isThread ? 'thread' : 'email'} content...
  </div>
) : content ? (
  isHTML(content) ? (
    // Render HTML content
    <div
      className={cn(
        'text-sm break-words max-h-96 overflow-y-auto p-3 rounded prose prose-sm max-w-none',
        isLight 
          ? 'bg-white text-gray-800 prose-gray' 
          : 'bg-gray-800 text-gray-300 prose-invert'
      )}
      dangerouslySetInnerHTML={{ __html: sanitizeHTML(content) }}
      style={{
        lineHeight: '1.6',
      }}
    />
  ) : (
    // Render plain text content
    <div
      className={cn(
        'text-xs whitespace-pre-wrap break-words max-h-96 overflow-y-auto p-3 rounded',
        isLight ? 'bg-white text-gray-800' : 'bg-gray-800 text-gray-300'
      )}
      style={{ 
        fontFamily: 'monospace',
        lineHeight: '1.6',
      }}
    >
      {content}
    </div>
  )
) : (
  <div className={cn('py-4 text-center text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
    No content available
  </div>
)}
```

**Features**:
- ✅ Automatically detects HTML vs plain text
- ✅ Sanitizes HTML to prevent XSS attacks
- ✅ Renders HTML with proper styling (prose classes for typography)
- ✅ Falls back to monospace plain text for non-HTML content
- ✅ Shows "No content available" only when truly empty

---

## Security

### DOMPurify Configuration

The sanitizer is configured with security in mind:

**Allowed Tags**: Only safe HTML tags for email content
- Text formatting: `p`, `br`, `strong`, `em`, `u`
- Headings: `h1`-`h6`
- Lists: `ul`, `ol`, `li`
- Links & Images: `a`, `img`
- Structure: `div`, `span`, `blockquote`, `pre`, `code`
- Tables: `table`, `thead`, `tbody`, `tr`, `th`, `td`
- Separator: `hr`

**Allowed Attributes**: Only safe attributes
- `href`, `src`, `alt`, `title` (for links & images)
- `class`, `id`, `style` (for styling)
- `target` (for link behavior)

**Blocked**:
- ❌ Scripts (`<script>` tags)
- ❌ Event handlers (`onclick`, `onload`, etc.)
- ❌ Data attributes (`data-*`)
- ❌ Iframes
- ❌ Form elements
- ❌ Dangerous protocols (`javascript:`, `data:`, etc.)

---

## Data Flow

### Thread Content

#### Before Fix:
```
1. User expands thread email
2. Frontend → Backend: GET /api/.../gmail/thread/:threadId
3. Backend returns: { thread: { messages: [...] } }
4. Frontend looks for: data.threadContent
5. Result: undefined → "No content available" ❌
```

#### After Fix:
```
1. User expands thread email
2. Frontend → Backend: GET /api/.../gmail/thread/:threadId
3. Backend:
   - Fetches thread from Gmail API
   - Converts to formatted text using convertThreadToTextFormat()
   - Returns: { thread: {...}, threadContent: "..." }
4. Frontend accesses: data.threadContent
5. Result: Formatted thread content displayed ✅
```

### HTML Rendering

```
1. Content fetched (HTML or plain text)
2. Check: isHTML(content)
   ├─ If HTML:
   │  ├─ Sanitize with DOMPurify
   │  ├─ Render with dangerouslySetInnerHTML
   │  └─ Apply prose styling (typography)
   └─ If Plain Text:
      ├─ Render as-is with whitespace-pre-wrap
      └─ Apply monospace font
```

---

## Installation & Testing

### Step 1: Install Dependencies

From the project root:
```bash
cd /Users/hnankam/Downloads/data/project-hands-off
pnpm install
```

This will install:
- `dompurify@^3.2.2`
- `@types/dompurify@^3.2.0`

### Step 2: Rebuild Frontend

```bash
pnpm run build
# or for development
pnpm run dev
```

### Step 3: Test Thread Content

1. Open Gmail modal
2. Find an email that's part of a thread (shows 🧵 badge)
3. Click expand button
4. **Expected**: Should display formatted thread content
5. **Before**: Showed "No content available"

### Step 4: Test HTML Rendering

1. Expand an email with rich formatting (HTML)
2. **Expected**: Should render as formatted HTML
   - Bold text appears bold
   - Links are clickable
   - Lists are properly formatted
   - Images display (if any)
3. **Before**: Showed raw HTML tags like `<p>`, `<strong>`, etc.

### Step 5: Test Plain Text Rendering

1. Expand an email with plain text only
2. **Expected**: Should render in monospace font
3. Whitespace and line breaks preserved

---

## Visual Comparison

### Before (Plain Text Only)

```
┌─────────────────────────────────────┐
│ <p>Hello <strong>John</strong>,</p>│
│ <p>Please see the attached...</p>  │
│ <br>                                │
│ <ul><li>Item 1</li></ul>           │
└─────────────────────────────────────┘
```
❌ Shows raw HTML tags  
❌ No formatting  
❌ Hard to read

### After (HTML Rendered)

```
┌─────────────────────────────────────┐
│ Hello John,                         │
│                                     │
│ Please see the attached...          │
│                                     │
│ • Item 1                            │
│ • Item 2                            │
└─────────────────────────────────────┘
```
✅ Rendered HTML  
✅ Proper formatting  
✅ Easy to read

---

## Code Locations

### Backend Changes
- **File**: `copilot-runtime-server/routes/workspace.js`
- **Endpoint**: `GET /api/workspace/connections/:connectionId/gmail/thread/:threadId`
- **Lines**: ~1372-1389 (main path), ~1395-1414 (retry path)
- **Change**: Added `threadContent` to response

### Frontend Changes
- **File**: `pages/side-panel/src/components/modals/GmailItemsModal.tsx`
- **Imports**: Line ~6-8
- **Helper Functions**: Line ~255-273
- **Rendering Logic**: Line ~593-626
- **Changes**: 
  - Import DOMPurify
  - Add HTML detection function
  - Add HTML sanitization function
  - Update accordion rendering with conditional HTML/plain text

- **File**: `pages/side-panel/package.json`
- **Lines**: ~22 (dompurify), ~54 (@types/dompurify)
- **Change**: Added dependencies

---

## Troubleshooting

### Issue: "Cannot find module 'dompurify'"

**Cause**: Dependencies not installed

**Solution**:
```bash
cd /Users/hnankam/Downloads/data/project-hands-off
pnpm install
```

### Issue: Thread still shows "No content available"

**Cause**: Backend changes not reflected (server not restarted)

**Solution**:
1. Stop the backend server
2. Restart it
3. Try again

### Issue: HTML not rendering, shows as plain text

**Cause**: Content might not have HTML tags

**Solution**: This is expected behavior for plain text emails. The system auto-detects and renders accordingly.

### Issue: XSS security warning

**Cause**: Using `dangerouslySetInnerHTML`

**Solution**: This is safe because we sanitize with DOMPurify before rendering. The sanitizer removes all potentially dangerous content.

---

## Future Enhancements

1. **Image Caching**: Cache inline images for offline viewing
2. **Link Preview**: Show preview on hover for links
3. **Attachment Display**: Show email attachments inline
4. **Dark Mode Optimization**: Better HTML styling for dark theme
5. **Print Support**: Export rendered HTML for printing
6. **Copy Formatted**: Copy HTML content with formatting

---

## Related Documentation
- Main Gmail Implementation: `GMAIL_SLACK_IMPLEMENTATION.md`
- Performance Optimization: `GMAIL_OPTIMIZATION_CHANGES.md`
- DOMPurify Docs: https://github.com/cure53/DOMPurify

