# SurrealDB Integration for Chrome Extension

This module provides a ready-to-use SurrealDB integration using WebAssembly for embedded database functionality in your Chrome extension.

## Features

- 🗄️ **IndexedDB Persistence**: Store data locally with IndexedDB backend
- 💾 **In-Memory Option**: Fast in-memory storage for temporary data
- 📦 **Pre-configured Tables**: Ready-to-use schemas for messages and downloads
- 🔒 **Type-Safe**: Full TypeScript support with typed interfaces
- 🚀 **Easy to Use**: Simple API for common database operations

## Installation

Both packages are already installed:
- `surrealdb` v1.3.2 - Main SDK
- `@surrealdb/wasm` v1.4.1 - WebAssembly engine

## Quick Start

### Basic Setup

```typescript
import { surrealDB, initializeSchema } from '@extension/shared';

// Connect to database (IndexedDB by default)
await surrealDB.connect('my_extension_db');

// Initialize schema for messages and downloads
await initializeSchema();
```

### Using In-Memory Storage

```typescript
// For temporary data that doesn't need to persist
await surrealDB.connect('temp_db', true); // true = use memory
```

## Usage Examples

### Storing Messages

```typescript
import { surrealDB, MessageRecord } from '@extension/shared';

// Create a new message
const message: MessageRecord = {
  content: 'Hello from the extension!',
  sender: 'user123',
  timestamp: new Date().toISOString(),
  metadata: {
    source: 'chat',
    priority: 'high'
  }
};

const created = await surrealDB.create<MessageRecord>('messages', message);
console.log('Message created:', created);

// Get all messages
const allMessages = await surrealDB.select<MessageRecord[]>('messages');
console.log('All messages:', allMessages);

// Get specific message by ID
const specificMessage = await surrealDB.selectById<MessageRecord>('messages', 'message_id_123');

// Update a message
await surrealDB.update('messages', 'message_id_123', {
  content: 'Updated message content'
});

// Delete a message
await surrealDB.delete('messages', 'message_id_123');
```

### Storing Downloaded Content

```typescript
import { surrealDB, DownloadRecord } from '@extension/shared';

// Store a downloaded file
const download: DownloadRecord = {
  filename: 'document.pdf',
  contentType: 'application/pdf',
  data: 'base64EncodedContent...', // Base64 encoded file data
  size: 1024000, // Size in bytes
  url: 'https://example.com/document.pdf',
  timestamp: new Date().toISOString(),
  metadata: {
    source: 'web_scraper',
    category: 'documents'
  }
};

await surrealDB.create<DownloadRecord>('downloads', download);

// Query downloads by criteria
const recentDownloads = await surrealDB.query<DownloadRecord[]>(`
  SELECT * FROM downloads 
  WHERE timestamp > time::now() - 7d 
  ORDER BY timestamp DESC 
  LIMIT 10
`);
```

### Custom Queries

```typescript
// Execute custom SurrealQL queries
const result = await surrealDB.query(`
  SELECT count() as total FROM messages 
  WHERE sender = $sender
  GROUP BY sender
`, {
  sender: 'user123'
});

console.log('Query result:', result);
```

## Integration in Chrome Extension

### Background Script Example

```typescript
// chrome-extension/src/background/index.ts
import { surrealDB, initializeSchema } from '@extension/shared';

// Initialize on extension startup
chrome.runtime.onInstalled.addListener(async () => {
  try {
    await surrealDB.connect('extension_main_db');
    await initializeSchema();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
  }
});

// Store messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_MESSAGE') {
    surrealDB.create('messages', {
      content: message.content,
      sender: message.sender,
      timestamp: new Date().toISOString()
    }).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async response
  }
});
```

### Side Panel Example

```typescript
// pages/side-panel/src/components/ChatInner.tsx
import { surrealDB, MessageRecord } from '@extension/shared';
import { useEffect, useState } from 'react';

export function ChatInner() {
  const [messages, setMessages] = useState<MessageRecord[]>([]);

  // Load messages on component mount
  useEffect(() => {
    const loadMessages = async () => {
      try {
        if (!surrealDB.isDBConnected()) {
          await surrealDB.connect('extension_main_db');
        }
        const allMessages = await surrealDB.select<MessageRecord[]>('messages');
        setMessages(allMessages);
      } catch (error) {
        console.error('Failed to load messages:', error);
      }
    };
    
    loadMessages();
  }, []);

  const saveMessage = async (content: string, sender: string) => {
    const newMessage: MessageRecord = {
      content,
      sender,
      timestamp: new Date().toISOString()
    };
    
    try {
      await surrealDB.create<MessageRecord>('messages', newMessage);
      // Reload messages
      const updated = await surrealDB.select<MessageRecord[]>('messages');
      setMessages(updated);
    } catch (error) {
      console.error('Failed to save message:', error);
    }
  };

  return (
    <div>
      {/* Your chat UI */}
    </div>
  );
}
```

### Content Script Example

```typescript
// pages/content/src/index.ts
import { surrealDB } from '@extension/shared';

// Initialize database in content script
(async () => {
  await surrealDB.connect('extension_content_db');
  
  // Store downloaded content
  const downloadContent = async (url: string, data: string) => {
    await surrealDB.create('downloads', {
      filename: url.split('/').pop() || 'unknown',
      contentType: 'text/html',
      data: btoa(data), // Base64 encode
      size: data.length,
      url,
      timestamp: new Date().toISOString()
    });
  };
  
  // Use the function
  await downloadContent(window.location.href, document.documentElement.outerHTML);
})();
```

## Advanced Features

### Creating Custom Tables

```typescript
const db = surrealDB.getInstance();

await db.query(`
  DEFINE TABLE IF NOT EXISTS custom_table SCHEMALESS;
  DEFINE FIELD IF NOT EXISTS name ON custom_table TYPE string;
  DEFINE FIELD IF NOT EXISTS value ON custom_table TYPE number;
  DEFINE INDEX IF NOT EXISTS custom_index ON custom_table FIELDS name;
`);
```

### Live Queries (Real-time Updates)

```typescript
const db = surrealDB.getInstance();

// Subscribe to live updates
const queryUuid = await db.live('messages', (action, result) => {
  console.log('Live update:', action, result);
  // Handle CREATE, UPDATE, DELETE actions
});

// Unsubscribe when done
await db.kill(queryUuid);
```

### Relationships

```typescript
// Create related records
await db.query(`
  -- Create a user
  CREATE user:john SET name = "John Doe";
  
  -- Create messages related to the user
  CREATE message SET 
    content = "Hello!", 
    author = user:john,
    timestamp = time::now();
  
  -- Query with relations
  SELECT *, author.* FROM message;
`);
```

## API Reference

### SurrealDBManager Methods

- `connect(dbName?, useMemory?)` - Connect to database
- `getInstance()` - Get Surreal instance
- `isDBConnected()` - Check connection status
- `close()` - Close connection
- `create<T>(table, data)` - Create record
- `select<T>(table)` - Select all records
- `selectById<T>(table, id)` - Select by ID
- `update<T>(table, id, data)` - Update record
- `delete(table, id)` - Delete record
- `query<T>(sql, vars?)` - Execute custom query

### Type Definitions

- `MessageRecord` - Message data structure
- `DownloadRecord` - Download data structure

## Best Practices

1. **Initialize Early**: Connect to the database when your extension loads
2. **Handle Errors**: Always wrap database calls in try-catch blocks
3. **Use Transactions**: For multiple related operations
4. **Index Important Fields**: Add indexes for fields you query frequently
5. **Clean Up**: Close connections when appropriate (e.g., on extension unload)
6. **Type Safety**: Use TypeScript interfaces for better type checking

## Troubleshooting

### Database Not Connecting

```typescript
// Check if connected
if (!surrealDB.isDBConnected()) {
  console.error('Database not connected');
  await surrealDB.connect();
}
```

### WebAssembly Errors

Ensure your Vite config includes the WebAssembly optimizations (already configured):

```typescript
optimizeDeps: {
  exclude: ['@surrealdb/wasm'],
  esbuildOptions: {
    target: 'esnext',
  },
},
esbuild: {
  supported: {
    'top-level-await': true,
  },
}
```

## Resources

- [SurrealDB Documentation](https://surrealdb.com/docs)
- [JavaScript SDK](https://surrealdb.com/docs/sdk/javascript)
- [WebAssembly Engine](https://surrealdb.com/docs/sdk/javascript/engines/wasm)
- [SurrealQL Reference](https://surrealdb.com/docs/surrealql)

