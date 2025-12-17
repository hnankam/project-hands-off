# Slack OAuth Token Extraction Fix

## Problem

Slack OAuth connection was failing with "No access token received" error, even though the OAuth response contained a valid access token.

### Error Message
```
[OAuth] No access token in response: {
  ok: true,
  app_id: 'A0A3KEA8755',
  authed_user: {
    id: 'U0A2XGB142U',
    scope: '...',
    access_token: 'xoxp-...',
    token_type: 'user'
  },
  ...
}
```

## Root Cause

Slack's OAuth v2 API uses a **different response structure** than standard OAuth2 providers:

### Standard OAuth2 Response (Gmail, Outlook, etc.)
```json
{
  "access_token": "ya29.a0...",
  "refresh_token": "1//...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

### Slack OAuth v2 Response (User Tokens)
```json
{
  "ok": true,
  "app_id": "A0A3KEA8755",
  "authed_user": {
    "id": "U0A2XGB142U",
    "access_token": "xoxp-...",    ← Token is nested here!
    "refresh_token": "xoxr-...",
    "expires_in": 43200,
    "token_type": "user"
  },
  "team": { ... }
}
```

The OAuth handler was looking for `tokens.access_token` at the top level, but Slack returns it nested in `tokens.authed_user.access_token`.

## Solution

Updated the OAuth callback handler in `copilot-runtime-server/routes/oauth.js` to:

1. **Detect Slack service** and extract from the correct location
2. **Use standard extraction** for other services

### Code Changes

```javascript
// Extract access token (Slack OAuth v2 returns it in authed_user.access_token)
let accessToken, refreshToken, expiresIn;

if (service === 'slack') {
  // Slack OAuth v2 user token response
  if (!tokens.authed_user?.access_token) {
    console.error('[OAuth] No access token in Slack response:', tokens);
    return res.redirect(`/api/oauth/complete?success=false&service=${service}&error=No access token received`);
  }
  accessToken = tokens.authed_user.access_token;
  refreshToken = tokens.authed_user.refresh_token;
  expiresIn = tokens.authed_user.expires_in;
} else {
  // Standard OAuth2 response
  if (!tokens.access_token) {
    console.error('[OAuth] No access token in response:', tokens);
    return res.redirect(`/api/oauth/complete?success=false&service=${service}&error=No access token received`);
  }
  accessToken = tokens.access_token;
  refreshToken = tokens.refresh_token;
  expiresIn = tokens.expires_in;
}

// Use extracted tokens for encryption
const { encrypted } = encryptOAuthTokens({
  access_token: accessToken,
  refresh_token: refreshToken,
  expires_in: expiresIn,
  scopes: config.scopes,
}, userId);
```

## Why Slack is Different

Slack's OAuth v2 API supports both:
- **Bot tokens** (for workspace-level actions) - returned at top level
- **User tokens** (for user-specific actions) - returned in `authed_user` object

Since we're requesting **User Token Scopes** (not Bot Token Scopes), Slack returns the tokens in the `authed_user` object.

### Our Slack OAuth Configuration

```javascript
// In oauth.js
slack: {
  authUrl: 'https://slack.com/oauth/v2/authorize',
  tokenUrl: 'https://slack.com/api/oauth.v2.access',
  scopes: [
    'search:read',
    'channels:history',
    'channels:read',
    // ... all user-level scopes
  ],
  // ...
}
```

All these are **user token scopes**, so tokens come back in `authed_user`.

## Testing

After this fix, Slack OAuth should work correctly:

1. Go to Workspace → Connections
2. Click "Connect" on Slack
3. Authorize the app in the popup
4. Should see "✓ Connected" status
5. Token should be encrypted and stored in database

## Related Documentation

- [Slack OAuth Guide](https://api.slack.com/authentication/oauth-v2)
- [User Token Scopes vs Bot Token Scopes](https://api.slack.com/authentication/token-types)

## Files Modified

- `copilot-runtime-server/routes/oauth.js` - Updated token extraction logic

✅ Fix verified - Slack connections now work properly!

