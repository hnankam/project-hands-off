# Message Persistence Error Fix

## Issue
`TypeError: Cannot read properties of undefined (reading 'length')` was occurring in the `useMessagePersistence` hook when trying to save messages.

## Root Cause
The `saveMessagesToStorage` function was iterating over messages that could contain `undefined` or `null` entries. When trying to access properties like `msg.content`, `msg.role`, or `msg.id` on undefined messages, the code would throw an error.

## Fix Applied

### 1. Added Defensive Guards in forEach Loops
Both in automatic save and manual save paths:
- Check if `msg` is null/undefined before processing
- Wrap `JSON.stringify` in try-catch to handle circular references
- Use optional chaining and fallback values for all message properties

### 2. Filter Invalid Messages Before Storage
Before saving to Chrome storage, filter out any `undefined` or `null` messages:
```typescript
const validMessages = messagesToSave.filter(msg => msg !== null && msg !== undefined);
```

### 3. Safe Property Access
All message properties now accessed with fallback values:
- `msg.role || 'unknown'`
- `msg.id || 'no-id'`
- `msg.content ? ... : '[no content]'`

## Files Modified
- `pages/side-panel/src/hooks/useMessagePersistence.ts`
- `pages/side-panel/src/components/ChatSessionContainer.tsx` (removed heartbeat logs)

## Testing
Rebuild the extension and test:
1. Navigate to a page and trigger embedding
2. Send some chat messages
3. Verify no console errors about message persistence
4. Check that messages are saved/restored correctly

## Prevention
The fix ensures that even if CopilotKit or other components pass invalid message data, the persistence layer will handle it gracefully without crashing.

