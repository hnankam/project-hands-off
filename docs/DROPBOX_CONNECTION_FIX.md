# Dropbox OAuth Connection Fix

## Problems Identified

### Problem 1: Database Constraint Violation

When attempting to add a Dropbox connection through the Connections tab, the OAuth flow failed with a database constraint violation error:

```
violates check constraint "workspace_connections_type_chk22"
```

### Problem 2: OAuth Redirect 404 Error

After fixing the database constraint, the OAuth callback was redirecting to `/side-panel.html` which doesn't exist in the runtime server, causing a 404 error:

```json
{
  "error": {
    "message": "Not Found",
    "code": "NOT_FOUND", 
    "status": 404,
    "path": "/side-panel.html?oauth_success=true&service=dropbox",
    "method": "GET"
  }
}
```

## Root Causes

### Root Cause 1: Incomplete Database Constraint

The `workspace_connections` table had a CHECK constraint that only allowed three connection types:
- `oauth2_gmail`
- `oauth2_slack`
- `api_key`

However, the OAuth handler was trying to insert connection types for cloud storage services:
- `oauth2_dropbox`
- `oauth2_google-drive`
- `oauth2_onedrive`
- `oauth2_outlook`

This caused the database insert to fail when these services were not in the allowed list.

### Root Cause 2: Missing OAuth Callback Page

The OAuth callback handler was redirecting to `/side-panel.html`, but:
1. The side panel is built as a Chrome extension, not served by the runtime server
2. The runtime server doesn't serve static HTML files for OAuth completion
3. The existing auth flow uses a dedicated inline HTML endpoint (`/api/auth/oauth-success`)

## Solutions

### Solution 1: Database Migration

Created and executed migration `028_update_workspace_connections_types.sql` which:

1. **Dropped** the old constraint that only allowed 3 connection types
2. **Added** an updated constraint supporting all OAuth services:
   - `oauth2_gmail`
   - `oauth2_outlook`
   - `oauth2_slack`
   - `oauth2_google-drive`
   - `oauth2_onedrive`
   - `oauth2_dropbox`
   - `api_key`

## Current Constraint

```sql
CHECK (connection_type IN (
  'oauth2_gmail',
  'oauth2_outlook',
  'oauth2_slack',
  'oauth2_google-drive',
  'oauth2_onedrive',
  'oauth2_dropbox',
  'api_key'
))
```

## Verification

The constraint was successfully updated in the database:

```sql
CHECK (((connection_type)::text = ANY ((ARRAY[
  'oauth2_gmail'::character varying,
  'oauth2_outlook'::character varying,
  'oauth2_slack'::character varying,
  'oauth2_google-drive'::character varying,
  'oauth2_onedrive'::character varying,
  'oauth2_dropbox'::character varying,
  'api_key'::character varying
])::text[])))
```

## All Supported Services

✅ **Email Services:**
- Gmail
- Outlook

✅ **Messaging:**
- Slack

✅ **Cloud Storage:**
- Google Drive
- OneDrive
- Dropbox

✅ **Custom:**
- API Key connections

## Testing

To verify the fix works:

1. Navigate to the Workspace page
2. Click on the Connections tab
3. Click "Connect" on any service (Gmail, Outlook, Slack, Google Drive, OneDrive, or Dropbox)
4. Complete the OAuth authorization
5. Verify the connection appears with "CONNECTED" status

The Dropbox OAuth flow should now complete successfully without database errors.

### Solution 2: OAuth Completion Endpoint

Added a dedicated OAuth completion endpoint at `/api/oauth/complete` that:
1. Accepts `success`, `service`, and `error` query parameters
2. Renders an inline HTML page with success/error UI
3. Matches the design pattern of the existing `/api/auth/oauth-success` endpoint
4. Auto-closes the popup window after showing the result (1.5s for success, 3s for error)
5. Provides a manual "Close Window" button as backup

Updated all OAuth callback redirects to use this new endpoint instead of `/side-panel.html`.

## Files Changed

### Database Migration
- **Created:** `copilotkit-pydantic/database/migrations/028_update_workspace_connections_types.sql`
- **Modified:** Database constraint `workspace_connections_type_chk`

### OAuth Routes  
- **Modified:** `copilot-runtime-server/routes/oauth.js`
  - Added `/api/oauth/complete` endpoint with inline HTML
  - Updated all redirect URLs to use the new completion endpoint
  - Improved error messaging with service context

## Changes Applied

### Migration Executed

```bash
python database/run_migration.py --file database/migrations/028_update_workspace_connections_types.sql
```

✅ Migration completed successfully on 2025-12-16 20:58:12

### Server Updated

The OAuth routes now follow the same pattern as the existing auth OAuth flow:
- ✅ Inline HTML response (no static files needed)
- ✅ Auto-closing popup with nice UI
- ✅ Dark mode support
- ✅ Error details displayed to user
- ✅ Consistent design with auth flow

