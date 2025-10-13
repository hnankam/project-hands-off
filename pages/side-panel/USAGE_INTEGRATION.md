# Frontend WebSocket Usage Integration

This document describes the WebSocket usage streaming integration in the side panel frontend.

## Overview

The side panel now displays real-time token usage statistics streamed via WebSocket from the backend server. The integration consists of:

1. **`useUsageStream` Hook** - Manages WebSocket connection and usage data
2. **`UsageDisplay` Component** - Displays usage statistics (compact and full views)
3. **`ChatSessionContainer` Integration** - Connects everything together
4. **`StatusBar` Display** - Shows compact usage in the status bar

## Components

### 1. `useUsageStream` Hook

**Location:** `src/hooks/useUsageStream.ts`

Custom React hook that manages the WebSocket connection to the backend usage endpoint.

```typescript
const {
  lastUsage,           // Last usage update received
  cumulativeUsage,     // Accumulated usage for the session
  isConnected,         // WebSocket connection status
  error,               // Error message if any
  resetCumulative      // Function to reset accumulated usage
} = useUsageStream(sessionId, enabled);
```

**Features:**
- Automatic connection/disconnection based on session ID
- Reconnection with exponential backoff (max 5 attempts)
- Keep-alive pings every 30 seconds
- Cumulative usage tracking across requests
- Error handling and logging

### 2. `UsageDisplay` Component

**Location:** `src/components/UsageDisplay.tsx`

Displays token usage statistics in two modes:

#### Compact Mode (for StatusBar)
```tsx
<UsageDisplay
  lastUsage={lastUsage}
  cumulativeUsage={cumulativeUsage}
  isConnected={isConnected}
  isLight={isLight}
  compact={true}
/>
```

Shows:
- Connection status indicator (green pulse when live)
- Total tokens in compact format (1.5K, 2.3M)
- Tooltip with full number

#### Full Mode
```tsx
<UsageDisplay
  lastUsage={lastUsage}
  cumulativeUsage={cumulativeUsage}
  isConnected={isConnected}
  isLight={isLight}
  compact={false}
/>
```

Shows:
- Connection status (Live/Offline)
- Total tokens (large display)
- Request count
- Input tokens
- Output tokens
- Last update info

### 3. StatusBar Integration

**Location:** `src/components/StatusBar.tsx`

The StatusBar now accepts optional usage data:

```typescript
interface StatusBarProps {
  // ... existing props
  usageData?: {
    lastUsage: UsageData | null;
    cumulativeUsage: CumulativeUsage;
    isConnected: boolean;
  } | null;
}
```

The compact usage display appears between the message counters and status section.

### 4. ChatSessionContainer Integration

**Location:** `src/components/ChatSessionContainer.tsx`

The main container component now:
1. Initializes the WebSocket hook
2. Passes usage data to StatusBar
3. Logs any usage errors

```typescript
// Usage streaming via WebSocket
const {
  lastUsage,
  cumulativeUsage,
  isConnected: isUsageConnected,
  error: usageError,
  resetCumulative
} = useUsageStream(sessionId, isActive);
```

## Data Flow

```
┌──────────────────────────────────────────────────────────┐
│                    ChatSessionContainer                   │
│                                                            │
│  ┌────────────────────────────────────────────────────┐  │
│  │  useUsageStream(sessionId, isActive)              │  │
│  │                                                     │  │
│  │  WebSocket: ws://localhost:8001/ws/usage/{id}     │  │
│  └──────────────────┬─────────────────────────────────┘  │
│                     │                                     │
│                     ↓                                     │
│  ┌────────────────────────────────────────────────────┐  │
│  │  State: { lastUsage, cumulativeUsage, isConnected }│ │
│  └──────────────────┬─────────────────────────────────┘  │
│                     │                                     │
│                     ↓                                     │
│  ┌────────────────────────────────────────────────────┐  │
│  │  StatusBar (usageData prop)                        │  │
│  │                                                     │  │
│  │  ┌────────────────────────────────────────────┐   │  │
│  │  │  UsageDisplay (compact mode)               │   │  │
│  │  │  • Connection indicator                    │   │  │
│  │  │  • Total tokens                             │   │  │
│  │  └────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Backend Integration

The frontend connects to the backend WebSocket endpoint:

```
ws://localhost:8001/ws/usage/{session_id}
```

### Message Format

The backend sends JSON messages with usage data:

```json
{
  "session_id": "session-123",
  "agent_type": "general",
  "model": "gemini-2.5-flash-lite",
  "request_tokens": 6603,
  "response_tokens": 9,
  "total_tokens": 6612,
  "timestamp": "2025-10-12T09:45:43.036041"
}
```

### Keep-Alive

The frontend sends "ping" messages every 30 seconds:
```
"ping"
```

Backend responds with:
```json
{"type": "pong"}
```

## Configuration

### WebSocket URL

Default: `ws://localhost:8001`

To change, pass the `wsUrl` parameter to `useUsageStream`:

```typescript
const usage = useUsageStream(sessionId, isActive, 'ws://your-server:port');
```

### Enable/Disable

The hook is enabled when:
- `sessionId` is not null
- `enabled` parameter is true (default based on `isActive`)

## Features

### ✅ Automatic Reconnection

If the WebSocket disconnects, it will automatically attempt to reconnect with exponential backoff:
- Attempt 1: 2 seconds
- Attempt 2: 4 seconds
- Attempt 3: 8 seconds
- Attempt 4: 16 seconds
- Attempt 5: 30 seconds (capped)

After 5 failed attempts, stops trying and shows an error.

### ✅ Cumulative Tracking

The hook automatically accumulates usage across all updates:
- Total input tokens
- Total output tokens
- Total tokens
- Number of requests

### ✅ Session Isolation

Each session has its own WebSocket connection and usage tracking. Switching sessions creates a new connection.

### ✅ Visual Feedback

- **Green pulse dot**: Connected and live
- **Gray dot**: Disconnected
- **Token count**: Real-time updates as requests complete

## Error Handling

Errors are logged to the console and stored in the `error` state:

```typescript
const { error } = useUsageStream(sessionId, isActive);

useEffect(() => {
  if (error) {
    console.warn('Usage streaming error:', error);
  }
}, [error]);
```

Common errors:
- "WebSocket connection error" - Network issues
- "Max reconnection attempts reached" - Server unavailable
- "Connection failed" - Invalid WebSocket URL

## Development

### Testing Locally

1. Start the backend server:
   ```bash
   cd copilotkit-pydantic
   python main.py
   ```

2. Build and run the extension:
   ```bash
   pnpm install
   pnpm build
   ```

3. Load the extension in Chrome
4. Open the side panel
5. Make a request to an agent
6. Watch usage stats update in real-time

### Debugging

Enable verbose logging:

```typescript
// In useUsageStream.ts, all console.log statements are already present
// Check browser console for:
// 🔌 Connection events
// 📊 Usage updates
// ❌ Errors
// 🔄 Reconnection attempts
```

## Performance

- **WebSocket overhead**: Minimal (<1KB per message)
- **Re-renders**: Optimized with `useMemo` in StatusBar
- **Memory**: Cleanup on unmount prevents leaks
- **Network**: Keep-alive pings every 30s are lightweight

## Future Enhancements

Possible improvements:
- [ ] Cost estimation based on model pricing
- [ ] Usage history chart
- [ ] Export usage data
- [ ] Budget alerts/warnings
- [ ] Per-agent usage breakdown
- [ ] Session usage comparison

## Troubleshooting

### Usage not updating

1. Check WebSocket connection in browser DevTools (Network → WS)
2. Verify backend server is running (`http://localhost:8001`)
3. Confirm session ID matches between frontend and backend
4. Check browser console for errors

### Connection keeps dropping

1. Check firewall/proxy WebSocket support
2. Verify backend is accessible
3. Check for conflicting extensions
4. Review backend logs for errors

### Numbers seem wrong

1. Verify backend is sending correct data
2. Check if multiple tabs are open (each has separate connection)
3. Use `resetCumulative()` to reset the counter
4. Check browser console for parsing errors

