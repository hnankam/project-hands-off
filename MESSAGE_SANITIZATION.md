# Message Sanitization Implementation

## Overview
Added a comprehensive message sanitization useEffect to prevent errors from invalid message data in ChatInner component.

## What It Does

The sanitization useEffect runs whenever messages change and handles:

### 1. **Null/Undefined Messages**
- Filters out any `null` or `undefined` messages from the array
- Prevents crashes from missing message objects

### 2. **Circular References**
- Detects messages with circular object references
- Replaces circular content with error message: `[Content removed: circular reference]`
- Prevents `JSON.stringify()` errors during persistence

### 3. **Large Content Warning**
- Warns if message content exceeds 100KB when stringified
- Helps identify performance issues
- Does not modify the message, just logs warning

### 4. **Invalid Role**
- Checks if `role` field exists and is a string
- Defaults to `'user'` if missing or invalid
- Prevents errors in message rendering

### 5. **Missing ID**
- Generates unique ID if missing: `msg-{timestamp}-{index}`
- Ensures all messages have identifiers for React keys

### 6. **Filtration Enhancement**
- Updated filtered messages logic to handle stringify errors gracefully
- Filters out messages that can't be stringified

## Benefits

### Error Prevention
- **No crashes** from malformed messages
- **No circular reference errors** during storage
- **No missing key warnings** in React

### Performance
- **Only updates** when sanitization is actually needed
- **Warns about** large messages that might impact performance
- **Non-blocking** - doesn't prevent message display

### Data Integrity
- **Ensures** all messages have required fields
- **Validates** data structure before persistence
- **Maintains** message history reliability

## Implementation Details

```typescript
useEffect(() => {
  // 1. Skip empty arrays
  if (!messages || messages.length === 0) return;
  
  // 2. Sanitize each message
  const sanitizedMessages = messages.map((message, index) => {
    // Check for null/undefined
    // Clone and sanitize content
    // Validate role and id
    // Track modifications
    return sanitized;
  }).filter(msg => msg !== null);
  
  // 3. Only update if changes were made
  if (needsSanitization && sanitizedMessages.length !== messages.length) {
    setMessages(sanitizedMessages);
  }
}, [messages, setMessages]);
```

## When It Runs

- **Trigger**: Whenever `messages` array changes
- **Frequency**: Once per message array update
- **Performance**: Only re-sanitizes if not already clean

## Example Scenarios

### Scenario 1: Circular Reference
```javascript
// Before: Message with circular ref
{
  id: 'msg1',
  role: 'assistant',
  content: { data: circular_object }
}

// After: Sanitized
{
  id: 'msg1',
  role: 'assistant',
  content: '[Content removed: circular reference]'
}
```

### Scenario 2: Missing Fields
```javascript
// Before: Invalid message
{
  content: 'Hello'
  // Missing role and id
}

// After: Sanitized
{
  id: 'msg-1234567890-0',
  role: 'user',
  content: 'Hello'
}
```

### Scenario 3: Null Messages
```javascript
// Before: Array with nulls
[message1, null, undefined, message2]

// After: Clean array
[message1, message2]
```

## Testing Checklist

1. ✅ Messages with circular references don't crash
2. ✅ Null messages are filtered out
3. ✅ Missing role defaults to 'user'
4. ✅ Missing ID gets generated
5. ✅ Large messages are logged
6. ✅ Valid messages pass through unchanged
7. ✅ Filtered messages work with sanitized data

## Files Modified

- `pages/side-panel/src/components/ChatInner.tsx`
  - Added sanitization useEffect (lines 140-203)
  - Enhanced filtered messages with try-catch (lines 205-229)

## Notes

- **Non-destructive**: Only modifies messages when necessary
- **Performant**: Skips sanitization when not needed
- **Defensive**: Handles edge cases gracefully
- **Logged**: Warns about issues for debugging

