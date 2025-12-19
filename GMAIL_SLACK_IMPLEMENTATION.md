# Gmail & Slack Integration Implementation

## Overview

This document describes the complete implementation of Gmail and Slack content integration into the chat input system. Gmail emails and Slack messages can now be attached to chat messages as text file attachments, similar to how images and PDFs are handled.

---

## Architecture

### Flow Diagram

```
User Action Flow:
1. User clicks Gmail/Slack in dropdown menu
2. Modal opens → Backend API fetches items via OAuth
3. User selects items from list
4. Items converted to text file attachments
5. Files added to attachments preview
6. On send: Files upload to Firebase → Sent as binary attachments
7. AI receives full content in multimodal message format
```

### Key Design Decisions

1. **Attachments vs Context**: Items are treated as file attachments (not session context)
2. **Text Format**: Emails/messages converted to formatted `.txt` files
3. **OAuth Security**: Tokens stored encrypted in database, decrypted per-request
4. **Lazy Loading**: Items fetched only when modal opens
5. **Client-side Conversion**: Text formatting happens in frontend

---

## Implementation Components

### 1. Backend API Endpoints

**File**: `copilot-runtime-server/routes/workspace.js`

#### Gmail Endpoints

- `GET /api/workspace/connections/:connectionId/gmail/emails`
  - Fetches recent emails (max 50)
  - Query params: `maxResults`, `query`, `pageToken`
  - Returns: `{ emails: [], nextPageToken, totalEstimate }`

- `GET /api/workspace/connections/:connectionId/gmail/email/:emailId`
  - Fetches specific email by ID
  - Returns full email content including body
  - **Note**: This fetches only a single email, not the entire thread

- `GET /api/workspace/connections/:connectionId/gmail/thread/:threadId`
  - **NEW**: Fetches entire email thread (all messages in conversation)
  - Returns thread object with all messages sorted chronologically
  - Used for auto-expanding threads when user selects threaded emails

#### Slack Endpoints

- `GET /api/workspace/connections/:connectionId/slack/conversations`
  - Fetches user's channels/DMs
  - Query params: `types`, `limit`
  - Returns: `{ channels: [], nextCursor }`

- `GET /api/workspace/connections/:connectionId/slack/messages`
  - Fetches recent messages across all channels
  - Query params: `limit`
  - Returns: `{ messages: [], total }`

- `GET /api/workspace/connections/:connectionId/slack/channel/:channelId/messages`
  - Fetches messages from specific channel
  - Query params: `limit`
  - Returns: `{ messages: [], hasMore, nextCursor }`

**Security**: All endpoints require authentication and verify connection ownership.

**Token Refresh**: All Gmail endpoints automatically handle expired tokens:
1. **Proactive Refresh**: Checks if token expires within 5 minutes and refreshes preemptively
2. **Reactive Refresh**: If API returns 401, automatically refreshes token and retries request
3. **Automatic Update**: New tokens are encrypted and saved to database
4. **Graceful Failure**: Returns clear error message if refresh fails (user must reconnect)

---

### 2. API Client Utilities

#### Gmail Client

**File**: `copilot-runtime-server/utils/gmail-client.js`

**Key Functions**:
- `fetchGmailEmails(accessToken, options)` - List emails
- `fetchGmailMessage(accessToken, messageId)` - Get email details
- `fetchGmailProfile(accessToken)` - Get user profile
- `convertToTextFormat(message)` - Format email as text
- `extractEmailBody(payload)` - Parse Gmail API payload
- `decodeBase64Url(str)` - Decode base64url strings

**Key Functions**:
- `fetchGmailEmails(accessToken, options)` - List emails
- `fetchGmailMessage(accessToken, messageId)` - Get single email
- `fetchGmailThread(accessToken, threadId)` - **NEW**: Get entire thread
- `fetchGmailProfile(accessToken)` - Get user profile
- `convertToTextFormat(message)` - Format single email as text
- `convertThreadToTextFormat(thread)` - **NEW**: Format entire thread as text

**Features**:
- Handles Gmail API pagination
- Extracts text/plain or text/html from multipart messages
- Formats emails with headers and content sections
- **Auto-expands email threads**: Fetches all messages in a conversation
- Groups messages chronologically in thread format

#### Slack Client

**File**: `copilot-runtime-server/utils/slack-client.js`

**Key Functions**:
- `fetchSlackConversations(accessToken, options)` - List channels
- `fetchSlackMessages(accessToken, channelId, options)` - Get channel messages
- `fetchRecentSlackMessages(accessToken, limit)` - Get recent messages across all channels
- `convertToTextFormat(message, channelName, userName)` - Format message as text
- `searchSlackMessages(accessToken, query, options)` - Search messages

**Features**:
- Aggregates messages across multiple channels
- Handles thread replies and attachments
- Formats messages with channel context and metadata

---

### 3. Frontend Modals

#### GmailItemsModal

**File**: `pages/side-panel/src/components/modals/GmailItemsModal.tsx`

**Features**:
- Displays list of recent emails with subject, sender, date
- Search functionality (subject, sender, content)
- Multi-select with checkboxes
- Visual indicators for unread emails
- Select All / Deselect All
- Responsive layout with scroll

**UI Elements**:
- Email preview cards showing sender, subject, snippet
- **Thread indicators**: Badge showing 🧵 with message count for threaded emails
- Thread tooltip: "This email is part of a thread with N messages. All messages in the thread will be attached."
- **Server-side search**: Search bar queries Gmail API directly with Gmail search syntax
- **Pagination**: "Load More Emails" button to fetch additional pages (50 emails at a time)
- Search spinner indicator during active searches
- Timestamp formatting (relative for recent, absolute for old)
- Loading states and error handling
- Selected count badge

**Search Features**:
- **Gmail Search Syntax Support**: Use Gmail's native search operators
  - `subject:meeting` - Search by subject
  - `from:user@example.com` - Search by sender
  - `to:user@example.com` - Search by recipient
  - `has:attachment` - Emails with attachments
  - `is:unread` - Unread emails only
  - Combine operators: `from:john subject:report`
- **Debounced Search**: 500ms delay before triggering search (reduces API calls)
- **Real-time Results**: Search results update as you type
- **Clear Search**: Clearing search box reloads initial email list

#### SlackItemsModal

**File**: `pages/side-panel/src/components/modals/SlackItemsModal.tsx`

**Features**:
- Displays messages from all accessible channels
- Channel filter dropdown
- Search functionality (content, channel name)
- Multi-select with checkboxes
- Visual indicators for channel type (channel/group/DM)
- Attachment/file badges

**UI Elements**:
- Message cards with channel, timestamp, content
- Channel icons (# for channels, 👥 for groups, 💬 for DMs)
- Loading states and error handling
- Selected count badge

---

### 4. CustomInputV2 Integration

**File**: `pages/side-panel/src/components/chat/CustomInputV2.tsx`

#### New State Variables

```typescript
// Gmail modal state
const [showGmailModal, setShowGmailModal] = useState(false);
const [gmailConnectionId, setGmailConnectionId] = useState<string | null>(null);

// Slack modal state
const [showSlackModal, setShowSlackModal] = useState(false);
const [slackConnectionId, setSlackConnectionId] = useState<string | null>(null);
```

#### Handler Functions

**Modal Openers**:
- `openGmailModal(connectionId)` - Opens Gmail selection modal
- `openSlackModal(connectionId)` - Opens Slack selection modal

**Item Processors**:
- `handleGmailItemsSelected(emails)` - Converts emails to attachments
- `handleSlackItemsSelected(messages)` - Converts messages to attachments

**Formatters**:
- `formatEmailAsText(email)` - Formats email with headers and body
- `formatSlackMessageAsText(message)` - Formats message with metadata
- `generateEmailFilename(email)` - Creates descriptive filename
- `generateSlackFilename(message)` - Creates descriptive filename
- `formatSlackTimestamp(ts)` - Converts epoch to readable date

#### Text File Format

**Gmail Email Format**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 EMAIL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

From: John Doe <john@example.com>
To: Jane Smith <jane@example.com>
Subject: Project Update
Date: Mon, 15 Jan 2024 10:30:00 -0800

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MESSAGE CONTENT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Email body text...]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Slack Message Format**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💬 SLACK MESSAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Channel: #general
Type: channel
Timestamp: Jan 15, 2024, 10:30 AM

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MESSAGE CONTENT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Message text...]

Attachments:
  1. Document Title
     [Attachment preview text...]

Files:
  1. report.pdf (application/pdf)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### Connection Click Handler Update

```typescript
onClick={(e) => {
  e.stopPropagation();
  if (connection.service_name === 'gmail') {
    openGmailModal(connection.id);
  } else if (connection.service_name === 'slack') {
    openSlackModal(connection.id);
  } else {
    console.log(`Connection ${connection.service_name} not yet implemented`);
  }
}}
```

---

## OAuth Token Auto-Refresh

### Overview

OAuth access tokens expire after a period of time (typically 1 hour for Google). The system implements automatic token refresh to maintain seamless access to Gmail and Slack without requiring users to re-authenticate.

### How It Works

**Two-Layer Approach:**

1. **Proactive Refresh** (Before Expiry)
   - Checks if token expires within 5 minutes
   - Automatically refreshes before making API call
   - Prevents 401 errors from happening
   - Uses `shouldRefreshToken(expiresAt, bufferSeconds=300)`

2. **Reactive Refresh** (After 401 Error)
   - Catches 401 authentication errors from API
   - Automatically refreshes token
   - Retries the original request with new token
   - Transparent to the user

### Implementation Details

**New File**: `copilot-runtime-server/utils/oauth-refresh.js`

**Key Functions**:
- `refreshGoogleToken(refreshToken, clientId, clientSecret)` - Refresh Gmail tokens
- `refreshSlackToken(refreshToken, clientId, clientSecret)` - Refresh Slack tokens
- `shouldRefreshToken(expiresAt, bufferSeconds)` - Check if refresh needed
- `calculateExpiryTimestamp(expiresIn)` - Calculate expiry time

**Helper Function**: `refreshAndUpdateToken(connection, userId, tokens, service)`
- Calls appropriate refresh function
- Calculates new expiry timestamp
- Encrypts new tokens
- Updates database with new credentials
- Returns refreshed tokens

### Token Refresh Flow

```
API Request → Check Expiry → [Expired?] → Refresh Token
                                  ↓ No
                            Make API Call → [401 Error?] → Refresh & Retry
                                  ↓ No           ↓
                            Return Data    Return Data or Error
```

### Database Updates

When tokens are refreshed:
- `encrypted_credentials` - Updated with new access_token
- `token_expires_at` - Updated with new expiry time
- `updated_at` - Set to current timestamp
- `refresh_token` - Preserved (not changed unless Google provides new one)

### Error Handling

**Refresh Success**:
- New tokens saved to database
- Original request automatically retried
- User sees no interruption

**Refresh Failure**:
- Returns 401 status code
- Error message: "Authentication expired. Please reconnect your Gmail account."
- User must go through OAuth flow again

### Refresh Token Scenarios

**Scenario 1: Token About to Expire**
- Token expires in 4 minutes
- Proactive refresh triggered before API call
- New token obtained
- Request succeeds seamlessly

**Scenario 2: Expired Token**
- Token already expired
- API returns 401 error
- Reactive refresh triggered
- Request retried with new token
- Success (one retry)

**Scenario 3: Invalid Refresh Token**
- Refresh token revoked or invalid
- Refresh attempt fails
- Returns 401 with clear error message
- User must reconnect account

**Scenario 4: No Refresh Token**
- Old connection without refresh_token
- Cannot refresh automatically
- Returns error: "No refresh token available. User must re-authenticate."
- User must reconnect account

### Security Considerations

- **Encryption**: All tokens (access & refresh) encrypted with AES-256-GCM
- **Scope Preservation**: Original OAuth scopes maintained after refresh
- **User-Specific**: Tokens encrypted per user (can't be decrypted by others)
- **Automatic Cleanup**: Expired tokens automatically refreshed, no manual intervention

### Performance Impact

- **Proactive Refresh**: Adds ~500ms to first request after expiry
- **Reactive Refresh**: Adds ~1 second (failed request + refresh + retry)
- **Caching**: Tokens cached in memory during request lifecycle
- **Database Updates**: Minimal overhead (single UPDATE query)

### Logging

Token refresh operations are logged for debugging:
```
[OAuth] Refreshing gmail token for connection abc-123
[OAuth] Successfully refreshed and updated gmail token
```

Or on failure:
```
[Workspace] Failed to refresh token: No refresh token available
```

### Testing Token Refresh

**Manual Test**:
1. Connect Gmail account
2. Get connection ID from database
3. Manually expire the token in database:
   ```sql
   UPDATE workspace_connections 
   SET token_expires_at = NOW() - INTERVAL '1 hour'
   WHERE id = 'connection-id';
   ```
4. Try to fetch emails from frontend
5. Should see refresh logs in backend
6. Request should succeed

**Expected Logs**:
```
[Workspace] Gmail token expired or expiring soon, refreshing...
[OAuth] Refreshing gmail token for connection abc-123
[OAuth] Successfully refreshed and updated gmail token
```

---

## Gmail Thread Auto-Expansion

### Overview

When a user selects an email that is part of a conversation (thread), the system automatically fetches and attaches **all messages in that thread** instead of just the single email. This provides complete context for the AI assistant.

### How It Works

1. **Thread Detection**
   - When emails are fetched, each email includes a `threadId`
   - The modal counts how many emails share the same `threadId`
   - If count > 1, the email is marked as part of a thread

2. **Visual Indicator**
   - Thread emails display a badge: 🧵 with message count (e.g., "🧵 5")
   - Tooltip explains: "This email is part of a thread with N messages. All messages in the thread will be attached."
   - Badge color: Blue theme to indicate special handling

3. **Auto-Expansion on Selection**
   - When user clicks "Add" with threaded emails selected
   - System calls: `GET /api/workspace/connections/:id/gmail/thread/:threadId`
   - Backend fetches all messages in the thread via Gmail API
   - Messages are sorted chronologically (oldest first)

4. **Thread File Format**
   - Single file containing all messages in conversation
   - Filename: `gmail-thread-[subject]-[N]msgs.txt`
   - Format:
     ```
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     📧 EMAIL THREAD (5 messages)
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     
     From: Alice <alice@example.com>
     To: Bob <bob@example.com>
     Subject: Project Discussion
     Date: Mon, 15 Jan 2024 10:00:00
     
     [Original message content]
     
     ─────────────────────────────────────────────────────────────────────
     MESSAGE 2 OF 5
     ─────────────────────────────────────────────────────────────────────
     
     From: Bob <bob@example.com>
     To: Alice <alice@example.com>
     Subject: Re: Project Discussion
     Date: Mon, 15 Jan 2024 11:30:00
     
     [Reply content]
     
     [... continues for all messages ...]
     ```

5. **Fallback Handling**
   - If thread fetch fails → Falls back to single email
   - Error logged to console
   - User still gets the originally selected email

### Benefits

- **Complete Context**: AI sees entire conversation history
- **Better Understanding**: Chronological order helps AI follow discussion
- **Fewer Files**: One file per thread instead of N files
- **Automatic**: No extra user action required
- **Transparent**: Visual indicator shows what will happen

### Performance Considerations

- **API Efficiency**: One request per thread (not per message)
- **Gmail Quota**: Thread endpoint returns all messages in single call
- **File Size**: Threads can be large (limit: 30MB per file)
- **Upload Time**: Larger files take longer to upload to Firebase

### Example Scenarios

**Scenario 1: Single Email**
- User selects email with no 🧵 badge
- Result: Single file with that email

**Scenario 2: Thread Email**
- User selects email with 🧵 3 badge
- Result: Single file with all 3 messages in chronological order

**Scenario 3: Multiple Threads**
- User selects 2 emails from Thread A (🧵 5) and 1 email from Thread B (🧵 2)
- Result: 2 files
  - File 1: Thread A with all 5 messages
  - File 2: Thread B with all 2 messages

**Scenario 4: Mixed Selection**
- User selects:
  - 1 single email (no badge)
  - 1 thread email (🧵 4)
- Result: 2 files
  - File 1: Single email
  - File 2: Thread with all 4 messages

---

## Testing Guide

### Prerequisites

1. **Gmail Connection**: User must have connected Gmail via OAuth
2. **Slack Connection**: User must have connected Slack via OAuth
3. **Firebase Setup**: Firebase Storage configured for file uploads

### Manual Testing Steps

#### Gmail Attachment Flow

1. **Open Chat Input**
   - Navigate to chat interface
   - Verify attachment dropdown button is visible

2. **Open Gmail Modal**
   - Click attachment dropdown (+)
   - Click Gmail connection item
   - Modal should open showing "Loading emails..."

3. **Select Emails**
   - Wait for emails to load (initial batch: 50 emails)
   - Verify emails display with: sender, subject, snippet, date
   - **Check for thread indicators**: Look for 🧵 badge with message count
   - Hover over thread badge to see tooltip
   - Test select individual emails (checkbox)
   - Test "Select All" functionality
   - Verify selected count updates

3a. **Test Gmail Search** (NEW ✨)
   - Type search query in search box (e.g., "subject:meeting")
   - Wait 500ms for debounce
   - Verify "Searching emails..." loading state appears
   - Verify search spinner shows in search input
   - Verify search results appear
   - Test Gmail search operators:
     - `from:john` - Search by sender
     - `subject:report` - Search by subject
     - `is:unread` - Unread emails
     - `has:attachment` - Emails with attachments
   - Clear search box → Verify original email list reloads
   - Verify helper text shows: "Uses Gmail search syntax"

3b. **Test Pagination** (NEW ✨)
   - Scroll to bottom of email list
   - Verify "Load More Emails" button appears (if more than 50 emails exist)
   - Click "Load More Emails"
   - Button should show "Loading..." while fetching
   - Verify new emails append to list (doesn't replace)
   - Verify Select All still works with all loaded emails
   - Verify button disappears when no more emails to load

4. **Add Attachments**
   - Click "Add (N)" button
   - Modal should close
   - Attachments should appear in preview area
   - **For single emails**: Verify filename format `gmail-[sender]-[subject].txt`
   - **For threads**: Verify filename format `gmail-thread-[subject]-[N]msgs.txt`
   - Verify file type shows as "TXT"

5. **Send Message**
   - Type a message (or leave empty)
   - Click send button
   - Verify upload progress shows
   - Verify attachments upload to Firebase
   - Verify message sent successfully

6. **Send Message**
   - Type a message (or leave empty)
   - Click send button
   - Verify upload progress shows
   - Verify attachments upload to Firebase
   - Verify message sent successfully

7. **Verify AI Response**
   - AI should acknowledge the email content
   - AI should be able to reference specific details from the email
   - **For threads**: AI should understand the conversation flow

#### Gmail Thread Auto-Expansion Test

1. **Identify Thread Email**
   - Look for emails with 🧵 badge
   - Note the message count in the badge
   - Hover to see tooltip

2. **Select Thread Email**
   - Click checkbox on a threaded email
   - Verify selected count updates

3. **Add Thread Attachment**
   - Click "Add" button
   - Modal closes
   - Watch for attachment to appear

4. **Verify Thread File**
   - Filename should be: `gmail-thread-[subject]-[N]msgs.txt`
   - File size should be larger than single email
   - Click to preview (if preview is available)

5. **Send and Test**
   - Send message with thread attachment
   - AI should acknowledge receiving multiple messages
   - Ask AI: "How many emails are in this thread?"
   - Ask AI: "Summarize the conversation chronologically"
   - AI should correctly identify message count and flow

6. **Test Multiple Threads**
   - Select emails from 2 different threads
   - Verify you get 2 separate files
   - Verify each has correct message count

#### Slack Attachment Flow

1. **Open Slack Modal**
   - Click attachment dropdown (+)
   - Click Slack connection item
   - Modal should open showing "Loading messages..."

2. **Filter Messages**
   - Wait for messages to load
   - Test channel filter dropdown
   - Verify message count per channel
   - Test search functionality

3. **Select Messages**
   - Select messages from different channels
   - Verify channel icons display correctly (# for channels, etc.)
   - Test "Select All" functionality
   - Verify selected count updates

4. **Add Attachments**
   - Click "Add (N)" button
   - Modal should close
   - Verify filename format: `slack-[channel]-[timestamp]-[preview].txt`
   - Verify attachment cards display

5. **Send Message**
   - Follow same steps as Gmail
   - Verify Slack message content is properly formatted

#### Error Handling Tests

1. **No Connection**
   - Disconnect Gmail/Slack
   - Verify connection no longer appears in dropdown

2. **API Failure**
   - Temporarily disable backend
   - Open modal → should show error message
   - Click "Retry" → should re-attempt fetch

3. **Empty Results**
   - Test with account that has no emails/messages
   - Should show "No emails/messages found"

4. **Search No Results**
   - Search for non-existent content
   - Should show "No items match your search"

---

## File Attachment Details

### Conversion Process

1. **Gmail Email → Text File**
   ```typescript
   const emailText = formatEmailAsText(email);
   const blob = new Blob([emailText], { type: 'text/plain; charset=utf-8' });
   const file = new File([blob], filename, { type: 'text/plain' });
   ```

2. **Slack Message → Text File**
   ```typescript
   const messageText = formatSlackMessageAsText(message);
   const blob = new Blob([messageText], { type: 'text/plain; charset=utf-8' });
   const file = new File([blob], filename, { type: 'text/plain' });
   ```

3. **Add to Attachments**
   - Creates `AttachmentItem` with status: 'pending'
   - Generates object URL for preview
   - Adds to attachments array

4. **Upload on Send**
   - Uploads to Firebase Storage: `workspace/{userId}/{timestamp}-{filename}`
   - Updates status to 'uploading' with progress
   - On complete: status 'uploaded', sets `uploadedUrl`
   - Registers in workspace files database

5. **Send as Binary Attachment**
   - Creates multimodal content array
   - Adds text content part
   - Adds binary parts for each attachment:
     ```typescript
     {
       type: 'binary',
       mimeType: 'text/plain',
       url: uploadedUrl,
       filename: 'gmail-..-.txt'
     }
     ```

---

## Database Schema

### workspace_connections Table

Used to store OAuth tokens for Gmail/Slack:

```sql
CREATE TABLE workspace_connections (
    id UUID PRIMARY KEY,
    user_id TEXT NOT NULL,
    connection_name VARCHAR(255),
    connection_type VARCHAR(50), -- 'oauth2_gmail', 'oauth2_slack'
    service_name VARCHAR(100), -- 'gmail', 'slack'
    encrypted_credentials BYTEA NOT NULL,
    token_expires_at TIMESTAMP,
    scopes TEXT[],
    status VARCHAR(20) DEFAULT 'active',
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Token Decryption

Tokens are encrypted using AES-256-GCM:

```javascript
const tokens = decryptOAuthTokens(connection.encrypted_credentials, userId);
// Returns: { access_token, refresh_token, expires_at, scopes }
```

---

## Environment Variables

Required for OAuth functionality (already configured):

```bash
# Gmail OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Slack OAuth
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret

# Firebase (for file storage)
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_STORAGE_BUCKET=your_bucket_name
```

---

## API Rate Limits

### Gmail API
- **Quota**: 1 billion requests/day
- **Per-user**: 250 quota units/second
- **Batch**: 50 messages per batch request
- **Recommendation**: Fetch max 50 emails at a time

### Slack API
- **Rate Limit**: Tier 3 (50+ requests/minute)
- **Burst**: Can handle bursts up to 100 requests
- **Recommendation**: Fetch max 100 messages at a time

---

## Future Enhancements

### Potential Improvements

1. **Pagination Support**
   - Add "Load More" button for emails/messages
   - Implement infinite scroll

2. **Advanced Filters**
   - Date range filter
   - Label/folder filter for Gmail
   - User filter for Slack

3. **Preview in Modal**
   - Click email/message to preview full content
   - Expandable cards

4. **Bulk Operations**
   - Attach all emails from a thread
   - Attach entire channel conversation

5. **Caching**
   - Cache fetched items for 5 minutes
   - Refresh button to force reload

6. **Other Services**
   - Outlook emails
   - Google Drive files
   - OneDrive files
   - Dropbox files

---

## Troubleshooting

### Common Issues

**Issue**: Modal opens but shows "Failed to load emails/messages"

**Solutions**:
- Check OAuth token is still valid (not expired) - **Auto-refresh handles this**
- Verify API credentials are configured
- Check browser console for API errors
- Verify user has granted required scopes

**Issue**: 401 "Invalid Credentials" error

**Status**: ✅ **AUTOMATICALLY HANDLED**

The system now automatically detects expired tokens and refreshes them. You should see these logs:
```
[Workspace] Got 401 error, attempting token refresh...
[OAuth] Refreshing gmail token for connection xxx
[OAuth] Successfully refreshed and updated gmail token
```

If refresh fails, user will see: "Authentication expired. Please reconnect your Gmail account."

**Issue**: "Failed to decrypt credentials" or "Unsupported state or unable to authenticate data"

**Cause**: This error occurs when:
- Connection was created with a different encryption key
- User ID mismatch (tokens encrypted for different user)
- Corrupted token data in database
- Environment variable `ENCRYPTION_SECRET` was changed

**Status**: ✅ **AUTOMATICALLY HANDLED**

The system now:
1. Detects decryption errors
2. Marks connection as 'invalid' in database
3. Returns clear error: "Connection credentials are invalid or corrupted. Please disconnect and reconnect your Gmail account."
4. Includes `action: 'reconnect_required'` for frontend handling

**Logs you'll see**:
```
[Workspace] Failed to decrypt OAuth tokens: Error: Unsupported state or unable to authenticate data
[Workspace] This usually means the connection needs to be recreated via OAuth
[Workspace] Marked connection abc-123 as invalid
```

**Solution**: User must:
1. Go to Connections panel
2. Disconnect the invalid connection
3. Reconnect using OAuth flow
4. New tokens will be encrypted properly

**Issue**: 403 "Gmail API has not been used in project" or "API is disabled"

**Solution**:
1. Go to [Google Cloud Console](https://console.developers.google.com)
2. Select your project
3. Navigate to "APIs & Services" → "Library"
4. Search for "Gmail API"
5. Click "Enable"
6. Wait 2-3 minutes for propagation
7. Retry the request

**Direct Link**: The error message includes a direct activation link - click it to enable the API.

**Common Cause**: OAuth credentials were created but Gmail API wasn't explicitly enabled in the project.

**Issue**: Attachments not uploading

**Solutions**:
- Check Firebase Storage rules allow writes
- Verify Firebase auth is working
- Check file size is under 30MB limit
- Verify network connectivity

**Issue**: AI can't access attachment content

**Solutions**:
- Verify Firebase download URL is public
- Check attachment was uploaded successfully
- Verify binary content part has correct mimeType
- Check AI model supports file attachments

---

## Code Locations Summary

### Backend
- API Endpoints: `copilot-runtime-server/routes/workspace.js`
  - Gmail emails: lines ~1019-1087
  - Gmail single email: lines ~1092-1154
  - **Gmail thread**: lines ~1159-1222 (NEW)
  - Slack conversations: lines ~1230-1290
  - Slack messages: lines ~1295-1355
  - Slack channel messages: lines ~1360-1420
  
- Gmail Client: `copilot-runtime-server/utils/gmail-client.js`
  - `fetchGmailEmails()`: lines ~24-65
  - **`fetchGmailThread()`**: lines ~70-125 (NEW)
  - `fetchGmailMessage()`: lines ~130-185
  - `convertToTextFormat()`: lines ~230-250
  - **`convertThreadToTextFormat()`**: lines ~255-285 (NEW)
  
- Slack Client: `copilot-runtime-server/utils/slack-client.js`

### Frontend
- CustomInputV2: `pages/side-panel/src/components/chat/CustomInputV2.tsx`
  - Imports: lines 34-35
  - State: lines 219-227
  - Gmail handlers: lines 739-867 (with thread auto-expansion)
  - **`formatGmailThreadAsText()`**: lines ~868-897 (NEW)
  - Slack handlers: lines ~900-950
  - Connection clicks: lines ~1600-1620
  - Modal renders: lines ~1840-1880
  
- GmailItemsModal: `pages/side-panel/src/components/modals/GmailItemsModal.tsx`
  - Thread detection: lines ~95-115
  - **Thread indicator UI**: lines ~275-340 (NEW - 🧵 badge)
  - Thread count function: lines ~118-121 (NEW)
  
- SlackItemsModal: `pages/side-panel/src/components/modals/SlackItemsModal.tsx`
- Modal exports: `pages/side-panel/src/components/modals/index.ts`

---

## Completion Status

✅ **Backend API Endpoints** - Complete
✅ **Gmail API Client** - Complete (with thread support)
✅ **Slack API Client** - Complete
✅ **GmailItemsModal Component** - Complete (with thread indicators, search, pagination) ✨
✅ **SlackItemsModal Component** - Complete
✅ **CustomInputV2 Integration** - Complete (with auto-thread expansion)
✅ **Item-to-Attachment Conversion** - Complete
✅ **Gmail Thread Auto-Expansion** - Complete
✅ **OAuth Token Auto-Refresh** - Complete
✅ **Gmail Server-Side Search** - Complete ✨
✅ **Gmail Pagination** - Complete ✨
✅ **Documentation** - Complete

All TODO items completed successfully. The implementation is ready for testing and deployment.

### Latest Enhancements

**Gmail Search & Pagination:** ✨ NEW
✅ Server-side Gmail search using Gmail's native search syntax
✅ Support for Gmail search operators (subject:, from:, is:unread, has:attachment, etc.)
✅ Debounced search (500ms) to reduce API calls
✅ Real-time search indicator (spinner in input)
✅ Pagination with "Load More Emails" button
✅ Loads 50 emails per page
✅ Appends results (doesn't replace existing emails)
✅ Clear search resets to initial email list
✅ Helper text showing search syntax examples

**Thread Auto-Expansion:**
✅ Added `fetchGmailThread()` function to fetch entire conversations
✅ Added `convertThreadToTextFormat()` for thread formatting
✅ Added backend endpoint: `GET /api/workspace/connections/:id/gmail/thread/:threadId`
✅ Added thread indicators (🧵 badge) in GmailItemsModal
✅ Implemented automatic thread detection and expansion
✅ Added fallback handling for failed thread fetches

**OAuth Token Auto-Refresh:**
✅ Created `oauth-refresh.js` utility with Google & Slack token refresh
✅ Implemented proactive refresh (before expiry)
✅ Implemented reactive refresh (on 401 errors)
✅ Automatic database updates with new tokens
✅ Applied to all Gmail endpoints (emails, single email, thread)
✅ Transparent to users - no re-authentication needed
✅ Comprehensive error handling and logging
✅ Graceful handling of decryption errors with reconnect prompt

---

## Contact & Support

For issues or questions about this implementation, refer to:
- Backend API documentation in workspace.js
- Frontend component comments in CustomInputV2.tsx
- OAuth configuration in oauth.js

