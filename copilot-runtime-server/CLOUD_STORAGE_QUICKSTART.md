# Cloud Storage OAuth - Quick Start Guide

This is a condensed guide to get Google Drive, OneDrive, and Dropbox OAuth working quickly.

## Prerequisites

✅ Backend already configured! The OAuth routes support all three services.

## Quick Setup Steps

### 1. Add Environment Variables

Add to `copilot-runtime-server/.env`:

```bash
# Google (for Google Drive - reuses Gmail credentials if already set)
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Microsoft (for OneDrive - reuses Outlook credentials if already set)
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret

# Dropbox (new)
DROPBOX_CLIENT_ID=your_dropbox_app_key
DROPBOX_CLIENT_SECRET=your_dropbox_app_secret
```

### 2. Configure OAuth Apps

#### Google Drive
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Google Drive API**
3. Create OAuth credentials
4. Add redirect URI: `http://localhost:3001/api/oauth/google-drive/callback`
5. Add scopes:
   - `drive.readonly`
   - `drive.metadata.readonly`
   - `userinfo.email`

#### OneDrive
1. Go to [Azure Portal](https://portal.azure.com/)
2. Register app in **Azure Active Directory**
3. Add **Microsoft Graph** permissions:
   - `Files.Read.All`
   - `User.Read`
   - `offline_access`
4. Add redirect URI: `http://localhost:3001/api/oauth/onedrive/callback`

#### Dropbox
1. Go to [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Create app with **Scoped access**
3. Add redirect URI: `http://localhost:3001/api/oauth/dropbox/callback`
4. Enable permissions:
   - `files.metadata.read`
   - `files.content.read`

### 3. Test the Connections

1. Start your server: `npm run dev`
2. Open your app → **Workspace** → **Connections** tab
3. Click connect for each service
4. Authorize the app
5. You should see "CONNECTED" status

## Already Configured OAuth?

- **Google Drive** shares credentials with **Gmail**
- **OneDrive** shares credentials with **Outlook**
- Only **Dropbox** needs new credentials

If you already have Gmail or Outlook working, you just need to:
1. Enable the additional APIs in the respective consoles
2. Add the new redirect URIs
3. The same credentials will work!

## Need More Details?

See the complete guide: `CLOUD_STORAGE_OAUTH_SETUP.md`

## Troubleshooting

### Error: "OAuth not configured"
→ Missing environment variables. Check your `.env` file.

### Error: "redirect_uri_mismatch"
→ Redirect URI in OAuth console doesn't match the callback URL.
→ Should be: `http://localhost:3001/api/oauth/{service}/callback`

### Error: "invalid_scope"
→ Scope not enabled in OAuth app settings.
→ For Dropbox, click "Submit" after adding permissions.

### Need HTTPS for testing?
Use ngrok:
```bash
ngrok http 3001
# Update NGROK_URL in .env
# Update redirect URIs in OAuth consoles
```

## Backend Routes Already Configured

✅ `GET /api/oauth/google-drive/authorize` - Start OAuth flow
✅ `GET /api/oauth/google-drive/callback` - Handle callback
✅ `GET /api/oauth/google-drive/test` - Test connection

Same for `onedrive` and `dropbox`!

## What's Already Working

- ✅ OAuth flow handling
- ✅ Token encryption (AES-256-GCM)
- ✅ Refresh token support
- ✅ Connection storage in database
- ✅ Frontend UI (Connections tab)
- ✅ Official brand logos

## What You Need to Do

1. Set up OAuth apps in provider consoles (5-10 min each)
2. Add credentials to `.env`
3. Restart server
4. Test connections!

That's it! 🎉

