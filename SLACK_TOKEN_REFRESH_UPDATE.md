# Slack Token Refresh Update

## Overview

Added the same robust automatic token refresh logic to all Slack endpoints that Gmail already had. Slack connections are now equally protected from token expiration issues.

## What Was Added

### 3 Slack Endpoints Updated

1. **`GET /api/workspace/connections/:connectionId/slack/conversations`**
   - Fetches list of Slack channels
   
2. **`GET /api/workspace/connections/:connectionId/slack/messages`**
   - Fetches recent Slack messages across all channels
   
3. **`GET /api/workspace/connections/:connectionId/slack/channel/:channelId/messages`**
   - Fetches messages from a specific Slack channel

### Features Added to Each Endpoint

#### ✅ 1. Safe Decryption with Error Handling

**Before:**
```javascript
let tokens;
try {
  tokens = decryptOAuthTokens(connection.encrypted_credentials, userId);
} catch (error) {
  console.error('[Workspace] Failed to decrypt Slack tokens:', error);
  return res.status(500).json({ error: 'Failed to decrypt credentials' });
}
```

**After:**
```javascript
const tokens = await safeDecryptOAuthTokens(
  connection.encrypted_credentials, 
  userId, 
  connectionId, 
  pool
);

if (!tokens) {
  return res.status(401).json({ 
    error: 'Connection credentials are invalid or corrupted. Please disconnect and reconnect your Slack account.',
    action: 'reconnect_required',
    connectionId 
  });
}
```

**Benefits:**
- Graceful handling of decryption errors
- Automatic detection of corrupted credentials
- Clear error messages for users

#### ✅ 2. Proactive Token Refresh (Before Expiry)

**Added:**
```javascript
// Check if token needs refresh (5 minutes before expiry)
if (tokens.expires_at && shouldRefreshToken(tokens.expires_at)) {
  console.log('[Workspace] Slack token expired or expiring soon, refreshing...');
  try {
    const refreshedTokens = await refreshAndUpdateToken(
      connection, 
      userId, 
      tokens, 
      'slack'
    );
    Object.assign(tokens, refreshedTokens);
  } catch (refreshError) {
    console.error('[Workspace] Failed to refresh token:', refreshError);
    return res.status(401).json({ 
      error: 'Authentication expired. Please reconnect your Slack account.',
      details: refreshError.message 
    });
  }
}
```

**Benefits:**
- Tokens refresh automatically 5 minutes before expiry
- Users never experience authentication failures
- Seamless user experience

#### ✅ 3. Reactive 401 Error Handling with Retry

**Added:**
```javascript
catch (apiError) {
  // Check if it's a 401 authentication error
  if (apiError.message && apiError.message.includes('401')) {
    console.log('[Workspace] Got 401 error, attempting token refresh...');
    try {
      // Refresh token
      const refreshedTokens = await refreshAndUpdateToken(
        connection, 
        userId, 
        tokens, 
        'slack'
      );
      
      // Retry the original API call with new token
      const result = await fetchSlackMessages(
        refreshedTokens.access_token, 
        ...
      );
      
      return res.json(result);
    } catch (retryError) {
      // Only mark as invalid if refresh token itself is invalid
      const isRefreshTokenError = retryError.message && (
        retryError.message.includes('refresh token') ||
        retryError.message.includes('invalid_grant') ||
        retryError.message.includes('No refresh token')
      );
      
      if (isRefreshTokenError) {
        await pool.query(
          `UPDATE workspace_connections SET status = 'invalid' WHERE id = $1`,
          [connectionId]
        );
      }
      
      return res.status(401).json({ 
        error: 'Authentication failed. Please reconnect your Slack account.',
        details: retryError.message 
      });
    }
  }
  
  // Handle other API errors normally
  console.error('[Workspace] Slack API error:', apiError);
  res.status(500).json({ 
    error: 'Failed to fetch Slack data', 
    details: apiError.message 
  });
}
```

**Benefits:**
- Automatic recovery from expired tokens
- Transparent retry - user doesn't notice
- Smart error handling - only marks invalid for actual token errors
- Other API errors handled separately

## Impact on Users

### Before This Update

❌ **Slack token expires** → User sees error  
❌ **User must manually reconnect** Slack account  
❌ **Disrupted workflow**  

### After This Update

✅ **Slack token expires** → Automatically refreshes  
✅ **User continues working** seamlessly  
✅ **No manual intervention** needed  

## Consistency Across Services

Both Gmail and Slack now have identical, production-ready OAuth token management:

| Feature | Gmail | Slack |
|---------|-------|-------|
| Safe Decryption | ✅ | ✅ |
| Proactive Refresh | ✅ | ✅ |
| Reactive 401 Retry | ✅ | ✅ |
| Smart Error Handling | ✅ | ✅ |
| Automatic Recovery | ✅ | ✅ |

## When Users Need to Reconnect

Users will only need to reconnect in these scenarios (applies to both Gmail and Slack):

1. **User explicitly disconnects** in the UI
2. **User revokes access** in their OAuth provider settings
3. **Encryption key changes** (if `ENCRYPTION_SECRET` in .env changes)
4. **Provider revokes refresh token** (rare, usually due to suspicious activity)

## Expected Logs

### Successful Proactive Refresh
```
[Workspace] Slack token expired or expiring soon, refreshing...
[OAuth] Refreshing slack token for connection <id>
[OAuth] Successfully refreshed and updated slack token
```

### Successful Reactive Refresh (401 Retry)
```
[Workspace] Got 401 error, attempting token refresh...
[OAuth] Refreshing slack token for connection <id>
[OAuth] Successfully refreshed and updated slack token
# Request succeeds after retry
```

### Decryption Error (Corrupted Credentials)
```
[Workspace Debug] Encrypted credentials type from DB: object
[Workspace Debug] Is Buffer from DB? true
Decryption error: Error: Unsupported state or unable to authenticate data
[Workspace] Connection credentials are invalid or corrupted
# Returns 401 with reconnect_required action
```

## Testing

### Manual Testing Steps

1. **Connect Slack account** (if not already connected)
2. **Use Slack features** (view channels, messages, etc.)
3. **Verify logs** show no errors
4. **(Optional) Manually expire token** in database to test refresh
5. **Use Slack features again** - should auto-refresh and work

### What to Verify

- ✅ Slack channels load successfully
- ✅ Slack messages load successfully
- ✅ No authentication errors in logs
- ✅ Token refresh happens automatically if expired
- ✅ User never needs to reconnect due to token expiration

## Related Documentation

- `OAUTH_TOKEN_REFRESH_FIX.md` - Main token refresh fix documentation
- `GMAIL_SLACK_IMPLEMENTATION.md` - Original implementation docs
- `copilot-runtime-server/utils/oauth-refresh.js` - Token refresh utilities
- `copilot-runtime-server/routes/workspace.js` - Updated endpoints

## Conclusion

Slack connections are now production-ready with automatic token refresh. Users will have a seamless experience without needing to manually reconnect due to token expiration. Both Gmail and Slack now have identical, robust OAuth token management! 🎉

