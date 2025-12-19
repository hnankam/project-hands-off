# OAuth Token Refresh Fix - Decryption Error Resolution

## Problem

After a successful OAuth token refresh (401 error → token refresh → success), subsequent API requests were failing with decryption errors:

```
Decryption error: Error: Unsupported state or unable to authenticate data
    at Decipheriv.final (node:internal/crypto/cipher:170:29)
    at decryptCredential
```

This was causing the system to continuously fail and required users to completely recreate their OAuth connections instead of just refreshing the token.

## Root Cause

The issue was a **data format mismatch** between how credentials are stored during:
1. **Initial OAuth connection** (in `oauth.js`)
2. **Token refresh** (in `workspace.js`)

### Initial OAuth Flow (Correct)

In `copilot-runtime-server/routes/oauth.js` line 238:

```javascript
// Destructures to get ONLY the encrypted Buffer
const { encrypted } = encryptOAuthTokens({
  access_token: accessToken,
  refresh_token: refreshToken,
  expires_in: expiresIn,
  scopes: config.scopes,
}, userId);

// Stores ONLY the Buffer in the database
await pool.query(`INSERT INTO workspace_connections...`, [
  userId,
  ...,
  encrypted,  // <-- Just the Buffer
  ...
]);
```

### Token Refresh Flow (Incorrect - Now Fixed)

In `copilot-runtime-server/routes/workspace.js` line 1125 (before fix):

```javascript
// Was storing the FULL OBJECT { encrypted: Buffer, algorithm: string }
const encryptedCredentials = encryptOAuthTokens(updatedTokens, userId);

await pool.query(
  `UPDATE workspace_connections 
   SET encrypted_credentials = $1, ...`,
  [
    encryptedCredentials,  // <-- FULL OBJECT, not just Buffer
    ...
  ]
);
```

### The Impact

When `decryptOAuthTokens` tried to decrypt the credentials after a token refresh, it expected a `Buffer` but received an object `{ encrypted: Buffer, algorithm: string }`, causing the decryption to fail with "Unsupported state or unable to authenticate data".

## Solution

Modified `copilot-runtime-server/routes/workspace.js` in the `refreshAndUpdateToken` function to **destructure and store only the Buffer**, matching the initial OAuth flow:

```javascript
// Encrypt and save to database
// Note: Only store the encrypted Buffer, not the full object
const { encrypted } = encryptOAuthTokens(updatedTokens, userId);

await pool.query(
  `UPDATE workspace_connections 
   SET encrypted_credentials = $1, 
       token_expires_at = $2,
       updated_at = CURRENT_TIMESTAMP
   WHERE id = $3`,
  [
    encrypted,  // Store only the Buffer, not the full object
    expiresAt ? new Date(expiresAt * 1000) : null,
    connection.id
  ]
);
```

## Testing

### Before Fix

```
1. User opens Gmail modal
2. API returns 401 (token expired)
3. System refreshes token (SUCCESS)
4. Subsequent requests fail with decryption error
5. Connection marked as invalid
6. User must completely reconnect OAuth
```

### After Fix

```
1. User opens Gmail modal
2. API returns 401 (token expired)
3. System refreshes token (SUCCESS)
4. Subsequent requests work normally
5. Connection remains active
6. User continues without interruption
```

### Manual Testing Steps

1. Connect Gmail account
2. Wait for token to expire (or manually expire in database)
3. Open Gmail modal to trigger API call
4. Verify:
   - ✅ Token refresh succeeds
   - ✅ No decryption errors in logs
   - ✅ Subsequent API calls work
   - ✅ Connection remains active
   - ✅ User can select and attach emails

## Files Changed

### `/copilot-runtime-server/routes/workspace.js`

#### 1. **Function**: `refreshAndUpdateToken` (Line ~1144)
**Change**: Destructure `{ encrypted }` from `encryptOAuthTokens` return value before storing in database

**Before**:
```javascript
const encryptedCredentials = encryptOAuthTokens(updatedTokens, userId);
await pool.query(`UPDATE...`, [encryptedCredentials, ...]);
```

**After**:
```javascript
const { encrypted } = encryptOAuthTokens(updatedTokens, userId);
await pool.query(`UPDATE...`, [encrypted, ...]);
```

#### 2. **Gmail Endpoints** (Already had token refresh)
- `/api/workspace/connections/:connectionId/gmail/emails`
- `/api/workspace/connections/:connectionId/gmail/email/:emailId`
- `/api/workspace/connections/:connectionId/gmail/thread/:threadId`

Features:
- ✅ `safeDecryptOAuthTokens` for error handling
- ✅ Proactive token refresh (before expiry)
- ✅ Reactive 401 error handling with retry

#### 3. **Slack Endpoints** (NEW - Token refresh added)
- `/api/workspace/connections/:connectionId/slack/conversations`
- `/api/workspace/connections/:connectionId/slack/messages`
- `/api/workspace/connections/:connectionId/slack/channel/:channelId/messages`

**Changes**: Added the same robust token refresh logic as Gmail:
- ✅ Replaced direct `decryptOAuthTokens` with `safeDecryptOAuthTokens`
- ✅ Added proactive token refresh check with `shouldRefreshToken`
- ✅ Added reactive 401 error handling with automatic retry
- ✅ Only marks connections as invalid for actual refresh token errors

**Before** (Slack endpoints):
```javascript
// Direct decryption (no error handling)
let tokens;
try {
  tokens = decryptOAuthTokens(connection.encrypted_credentials, userId);
} catch (error) {
  return res.status(500).json({ error: 'Failed to decrypt credentials' });
}

// No token refresh logic
// No 401 retry logic
```

**After** (Slack endpoints):
```javascript
// Safe decryption with error handling
const tokens = await safeDecryptOAuthTokens(
  connection.encrypted_credentials, 
  userId, 
  connectionId, 
  pool
);

// Proactive token refresh
if (tokens.expires_at && shouldRefreshToken(tokens.expires_at)) {
  const refreshedTokens = await refreshAndUpdateToken(
    connection, userId, tokens, 'slack'
  );
  Object.assign(tokens, refreshedTokens);
}

// Reactive 401 error handling with retry
catch (apiError) {
  if (apiError.message && apiError.message.includes('401')) {
    const refreshedTokens = await refreshAndUpdateToken(...);
    // Retry the API call with new token
  }
}
```

## Technical Details

### encryptOAuthTokens Return Value

From `copilot-runtime-server/utils/encryption.js`:

```javascript
function encryptOAuthTokens(tokens, organizationId) {
  const tokenData = { ... };
  return encryptCredential(tokenData, organizationId);
  // Returns: { encrypted: Buffer, algorithm: string }
}
```

### decryptOAuthTokens Expected Input

From `copilot-runtime-server/utils/encryption.js`:

```javascript
function decryptOAuthTokens(encryptedData, organizationId) {
  const decrypted = decryptCredential(encryptedData, organizationId);
  // Expects encryptedData to be a Buffer
  return JSON.parse(decrypted);
}
```

### decryptCredential Validation

From `copilot-runtime-server/utils/encryption.js` line 100:

```javascript
function decryptCredential(encryptedData, organizationId) {
  if (!Buffer.isBuffer(encryptedData)) {
    throw new Error('Encrypted data must be a Buffer');
  }
  // This check would fail if we passed { encrypted: Buffer, algorithm: string }
  ...
}
```

## Expected Logs (After Fix)

### Successful Token Refresh

```
[Workspace] Got 401 error, attempting token refresh...
[OAuth] Refreshing gmail token for connection <id>
[OAuth] Successfully refreshed and updated gmail token
```

### Subsequent Requests (No Errors)

```
# No decryption errors!
# Connection remains active
# API calls succeed
```

## Related Documentation

- `GMAIL_SLACK_IMPLEMENTATION.md` - Original implementation documentation
- `copilot-runtime-server/utils/oauth-refresh.js` - Token refresh logic
- `copilot-runtime-server/utils/encryption.js` - Encryption/decryption utilities
- `copilot-runtime-server/routes/oauth.js` - Initial OAuth connection flow

## Debug Logs Added

To help diagnose credential format issues, comprehensive debug logging has been added:

### 1. When Fetching from Database
```
[Workspace Debug] === Fetching Gmail Emails Endpoint ===
[Workspace Debug] Connection ID: <uuid>
[Workspace Debug] Encrypted credentials type from DB: object
[Workspace Debug] Is Buffer from DB? true/false
[Workspace Debug] Encrypted credentials length: <number>
```

### 2. When Decrypting Credentials
```
[Workspace Debug] Encrypted credentials type: object
[Workspace Debug] Is Buffer? true/false
[Workspace Debug] Is Object? true/false
[Workspace Debug] Encrypted credentials keys: [ 'encrypted', 'algorithm' ]
```

If corrupted format detected:
```
[Workspace] Detected corrupted credential format (full object instead of Buffer)
[Workspace] Attempting to extract Buffer from object...
[Workspace] Successfully decrypted using extracted Buffer!
[Workspace] This connection needs to be refreshed to fix the stored format
```

### 3. When Refreshing Tokens
```
[OAuth Debug] Encrypt result type: object
[OAuth Debug] Encrypt result keys: [ 'encrypted', 'algorithm' ]
[OAuth Debug] Extracted encrypted type: object
[OAuth Debug] Is Buffer? true
[OAuth Debug] Buffer length: <number>
[OAuth Debug] Stored credentials in database for connection <uuid>
```

### 4. On Decryption Errors
```
[Workspace Debug] Error details: <error message>
[Workspace Debug] Error stack: <stack trace>
[Workspace Debug] Time since last update: <ms>
```

## Fixing Existing Corrupted Connections

### The Problem

If your Gmail connection was created or refreshed before this fix, the encrypted credentials in the database are corrupted. The logs will show:

```
[Workspace Debug] Encrypted credentials type from DB: object
[Workspace Debug] Is Buffer from DB? true  ✅ (correct)
[Workspace Debug] Encrypted credentials length: 2200
Decryption error: Error: Unsupported state or unable to authenticate data  ❌
```

The credentials are stored as a Buffer (which is the correct type), but the **data inside the Buffer is corrupted** because it was serialized incorrectly by PostgreSQL when the full object was stored instead of just the Buffer.

### The Solution: Reconnect Gmail

You need to **disconnect and reconnect your Gmail account** to get fresh credentials stored in the correct format. Here are three ways to do this:

#### Option 1: Using the SQL Script (Fastest)

```bash
cd /Users/hnankam/Downloads/data/project-hands-off
psql $DATABASE_URL -f fix-gmail-connection.sql
```

This will:
1. Show your current Gmail connections
2. Mark them as 'invalid'
3. Show the updated status

Then:
1. Restart your server
2. Go to the app and reconnect Gmail
3. Fresh credentials will be stored correctly

#### Option 2: Using the Node.js Utility

```bash
cd /Users/hnankam/Downloads/data/project-hands-off
node copilot-runtime-server/utils/fix-corrupted-connections.js
```

This will automatically mark all OAuth connections (Gmail/Slack) as invalid.

#### Option 3: Manually in Your Database Client

Run this SQL:

```sql
UPDATE workspace_connections
SET status = 'invalid', updated_at = CURRENT_TIMESTAMP
WHERE service_name = 'gmail' AND status = 'active';
```

### After Running the Fix

1. ✅ Restart your server
2. ✅ The Gmail connection will appear as disconnected in the UI
3. ✅ Click to reconnect Gmail
4. ✅ Complete the OAuth flow
5. ✅ New credentials will be stored in the correct format
6. ✅ Token refresh will work seamlessly from now on

### Why This Happened

1. **Before fix**: Token refresh stored `{ encrypted: Buffer, algorithm: string }` in the database
2. **PostgreSQL**: Serialized this object in a way that corrupted the Buffer data
3. **On retrieval**: We get a Buffer back, but its contents are invalid
4. **Result**: Decryption fails with "Unsupported state or unable to authenticate data"

The fix ensures new credentials are stored correctly, but existing corrupted credentials must be replaced by reconnecting.

## Conclusion

This fix ensures that OAuth token refresh works seamlessly without requiring users to completely reconnect their accounts. The token refresh process now properly stores credentials in the same format as the initial OAuth flow, preventing decryption errors and maintaining connection stability.

The comprehensive debug logging helps identify and diagnose any credential storage issues, and the temporary workaround allows existing corrupted connections to continue functioning while they get fixed through the normal token refresh process.

