# Slack Thread Auto-Expansion and File Attachment Implementation

## Overview

This document outlines the implementation of two key features for Slack integration:
1. **Thread Auto-Expansion**: Automatically fetch all replies when a user selects a threaded message
2. **File Attachment Downloading**: Download and attach actual files from Slack messages

## Features Implemented

### 1. Thread Auto-Expansion

When a user selects a Slack message that contains replies (indicated by a reply count badge), the system automatically:
- Detects the message is part of a thread (has `reply_count > 0`)
- Fetches all messages in the thread from Slack API
- Formats the entire conversation into a single text file
- Includes parent message and all replies in chronological order

#### Visual Indicators

In the Slack modal, threaded messages display:
- A badge showing the number of replies
- Example: A message with 5 replies shows a badge with "5"
- The badge uses blue styling to match the app's color scheme

### 2. File Attachment Downloading

When a user selects a Slack message that contains files, the system:
- Detects files in the message using the `files` array
- Downloads each file from Slack's private URLs
- Preserves original file names and MIME types
- Adds files as separate attachments alongside the message text
- Handles various file types (images, documents, PDFs, etc.)

## Technical Implementation

### Backend Changes

#### New Functions in `slack-client.js`

1. **`fetchSlackThreadReplies(accessToken, channelId, threadTs)`**
   - Fetches all replies for a given thread using Slack's `conversations.replies` API
   - Returns array of messages including parent and all replies
   - Handles pagination if thread is very large

2. **`convertThreadToTextFormat(messages, channelName)`**
   - Formats an entire thread into readable text
   - Labels parent message as "PARENT MESSAGE"
   - Numbers replies sequentially
   - Includes timestamps, attachments info, and file metadata for each message

3. **`downloadSlackFile(accessToken, file)`**
   - Downloads a file from Slack using `url_private_download` or `url_private`
   - Returns file buffer for further processing
   - Requires authentication via access token

4. **`getThreadFilename(parentMessage, channelName, replyCount)`**
   - Generates descriptive filenames for thread exports
   - Format: `slack-thread-{channel}-{timestamp}-{replyCount}-replies-{preview}.txt`

#### New Backend Endpoints in `workspace.js`

1. **`GET /api/workspace/connections/:connectionId/slack/thread/:channelId/:threadTs`**
   - Fetches all messages in a Slack thread
   - Includes proactive and reactive token refresh logic
   - Returns: `{ messages: [], hasMore: boolean }`

2. **`POST /api/workspace/connections/:connectionId/slack/file/download`**
   - Downloads a Slack file and returns it as a buffer
   - Accepts: `{ file: { url_private_download, name, mimetype, ... } }`
   - Returns: File buffer with appropriate headers
   - Includes proactive and reactive token refresh logic

### Frontend Changes

#### Updated `SlackItemsModal.tsx`

1. **Interface Updates**
   ```typescript
   interface SlackMessage {
     ts: string;
     text: string;
     user?: string;
     channelId: string;
     channelName: string;
     channelType: string;
     thread_ts?: string;
     reply_count?: number;        // NEW
     reply_users_count?: number;  // NEW
     attachments?: any[];
     files?: any[];
   }
   ```

2. **Thread Indicator Display**
   - Detects threaded messages: `const isThread = message.reply_count && message.reply_count > 0`
   - Displays badge with reply count
   - Blue styling matches Gmail thread indicators
   - Positioned alongside attachment indicators

3. **Thread Expansion in Modal**
   - Added `threadContents` state to store fetched threads
   - Added `loadingThreads` state to track loading status
   - Implemented `fetchThreadContent()` function to fetch thread replies when expanding
   - Updated `toggleMessageExpansion()` to trigger thread fetching
   - Expanded view displays:
     - Parent message labeled with 📌
     - All replies numbered sequentially (💬 Reply 1, Reply 2, etc.)
     - Timestamp for each message
     - Attachments and files for each message in the thread

#### Updated `CustomInputV2.tsx`

1. **Enhanced `handleSlackItemsSelected` Function**
   - Now `async` to support API calls for threads and files
   - **Thread Processing**:
     - Checks if message has `reply_count > 0`
     - If yes, fetches full thread via backend endpoint
     - Formats as single text file using `formatSlackThreadAsText`
     - Uses descriptive filename with thread info
   - **File Processing**:
     - Iterates through `message.files` array
     - Downloads each file via backend endpoint
     - Creates `AttachmentItem` for each file
     - Preserves original file metadata (name, type, size)
   - **Error Handling**:
     - Falls back to basic message text if thread/file fetch fails
     - Logs errors for debugging
     - Continues processing other messages

2. **New Helper Functions**
   - `formatSlackTimestamp(ts)`: Converts Slack timestamps to readable dates (moved to top for proper scoping)
   - `formatSlackThreadAsText(messages, channelName)`: Formats entire thread
   - `generateSlackThreadFilename(message, threadLength)`: Creates descriptive filenames for threads

## File Format Examples

### Thread Export Format

```
========================================================================
SLACK THREAD (5 messages)
========================================================================

Channel: #general

========================================================================
PARENT MESSAGE
========================================================================

Timestamp: Dec 18, 2025, 10:30 AM

MESSAGE CONTENT:
How should we handle the new feature request?

========================================================================
REPLY 1
========================================================================

Timestamp: Dec 18, 2025, 10:35 AM

MESSAGE CONTENT:
I think we should prioritize performance over features...
```

**Note**: Uses plain ASCII characters (=) instead of Unicode box-drawing characters to ensure compatibility across all systems and prevent encoding issues.

### Filename Examples

- Single message: `slack-general-Dec-18-2025-10-30-AM-How-should-we-handle-the-new.txt`
- Thread: `slack-thread-general-Dec-18-2025-10-30-AM-4-replies-How-should-we-handle-the-new.txt`
- Downloaded file: Original filename preserved (e.g., `quarterly-report.pdf`, `screenshot.png`)

## Testing Guide

### Testing Thread Expansion in Modal

1. **Setup**:
   - Connect a Slack workspace that has channels with threaded conversations
   - Ensure you have messages with multiple replies

2. **Test Steps**:
   - Open chat input and click the add menu
   - Select a connected Slack workspace
   - Look for messages with reply count badges (blue badge with number)
   - Click the chevron button to expand a threaded message

3. **Expected Results**:
   - Expanded content shows "Loading thread..." briefly
   - After loading, displays the full conversation:
     - Parent message labeled with 📌 Parent Message
     - Each reply labeled with 💬 Reply 1, Reply 2, etc.
     - Timestamps for each message
     - Attachments/files shown for each message
   - Thread content is cached (re-expanding is instant)
   - Non-threaded messages just show their own content when expanded

### Testing Thread Auto-Expansion (Adding to Chat)

1. **Setup**:
   - Connect a Slack workspace that has channels with threaded conversations
   - Ensure you have messages with multiple replies

2. **Test Steps**:
   - Open chat input and click the add menu
   - Select a connected Slack workspace
   - Look for messages with reply count badges (blue badge with number)
   - Select a threaded message and click "Add Selected"

3. **Expected Results**:
   - Console logs show: `[CustomInputV2] Fetching thread for message {ts} with {N} replies...`
   - Console logs show: `[CustomInputV2] Successfully fetched thread with {N} messages`
   - A single text file is attached with format: `slack-thread-{channel}-{timestamp}-{N}-replies-{preview}.txt`
   - Opening the file shows parent message and all replies in order
   - Each message is clearly labeled (PARENT MESSAGE, REPLY 1, REPLY 2, etc.)

### Testing File Attachments

1. **Setup**:
   - Ensure your Slack workspace has messages with file attachments
   - Common file types to test: images, PDFs, documents

2. **Test Steps**:
   - Open the Slack modal from chat input
   - Find a message with file attachments (shows 📁 indicator)
   - Select the message and click "Add Selected"

3. **Expected Results**:
   - Console logs show: `[CustomInputV2] Downloading {N} file(s) from Slack message...`
   - For each file: `[CustomInputV2] Successfully downloaded file: {filename}`
   - Multiple attachments appear in chat input:
     - One text file with the message content
     - Additional attachments for each file from Slack
   - Files retain original names and can be previewed if supported

### Testing Combined (Thread with Files)

1. **Test Steps**:
   - Find a threaded message that also contains file attachments
   - Select it in the Slack modal

2. **Expected Results**:
   - Thread is fetched and formatted
   - Files from the parent message (and potentially replies) are downloaded
   - Multiple attachments: thread text file + downloaded files
   - Console shows both thread fetching and file downloading logs

## Error Handling

### Thread Fetching Errors

- If thread fetch fails (network, auth, etc.), falls back to single message text
- Error logged: `[CustomInputV2] Error processing Slack message:`
- User still gets the basic message content

### File Download Errors

- Individual file download failures don't stop other files
- Errors logged per file: `[CustomInputV2] Failed to download file {name}: {status}`
- Successfully downloaded files are still attached
- Message text is always attached regardless of file download status

## Token Refresh

Both new endpoints include:
- **Proactive refresh**: Checks token expiry before making API calls
- **Reactive refresh**: Catches 401 errors and retries with refreshed token
- Consistent with Gmail implementation

## Limitations and Considerations

1. **API Rate Limits**: 
   - Slack API has rate limits
   - Large threads may take time to fetch
   - Consider implementing caching for frequently accessed threads

2. **File Size Limits**:
   - Large files may take time to download
   - No size limit validation currently implemented
   - Consider adding file size checks/warnings

3. **Thread Depth**:
   - Currently fetches all replies regardless of count
   - Very large threads (100+ messages) may be slow
   - Consider pagination or limiting for UX

4. **File Types**:
   - All file types are downloaded
   - Some may not preview in chat
   - External files (shared from other services) may have different URLs

## Code Locations

### Backend Files

- `copilot-runtime-server/utils/slack-client.js`: Core Slack API functions
  - Lines ~370-470: Thread fetching and formatting functions
  - Lines ~470-520: File download function
  
- `copilot-runtime-server/routes/workspace.js`: API endpoints
  - Lines ~1940-2040: Thread replies endpoint
  - Lines ~2040-2140: File download endpoint

### Frontend Files

- `pages/side-panel/src/components/modals/SlackItemsModal.tsx`: UI for selecting messages
  - Lines 9-20: Updated interface with thread fields
  - Lines 42-44: Added state for thread contents and loading
  - Lines 106-147: `fetchThreadContent()` and `toggleMessageExpansion()` functions
  - Lines 519-570: Enhanced expanded content to display thread messages
  
- `pages/side-panel/src/components/chat/CustomInputV2.tsx`: Message processing
  - Lines 971-1097: Enhanced `handleSlackItemsSelected` function
  - Lines 1157-1169: `formatSlackTimestamp` (moved to top)
  - Lines 1197-1247: `formatSlackThreadAsText`
  - Lines 1265-1269: `generateSlackThreadFilename`

## Future Enhancements

1. ~~**Thread Preview**: Show thread context in accordion when expanded in modal~~ ✅ IMPLEMENTED
2. **File Preview**: Display file thumbnails in Slack modal before selection
3. **Selective Download**: Allow users to choose which files to download
4. **File Size Warnings**: Alert users about large file downloads
5. **Caching**: Cache thread content to reduce API calls
6. **Progress Indicators**: Show download progress for large files
7. **Batch Operations**: Optimize multiple file downloads with parallelization

## Summary

The Slack integration now fully supports:
- ✅ Thread auto-expansion (similar to Gmail)
- ✅ File attachment downloading
- ✅ Visual thread indicators in UI
- ✅ Proper error handling and fallbacks
- ✅ Token refresh for all operations
- ✅ Consistent formatting and file naming
- ✅ Console logging for debugging

Users can now seamlessly add complete Slack conversations (including all replies and files) as attachments to their chat messages, providing full context to the AI assistant.

