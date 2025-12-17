# Quick OAuth Setup Guide

## Step 1: Add to your `.env` file

Add these environment variables to `/copilot-runtime-server/.env`:

```env
# Encryption Key for OAuth Tokens (REQUIRED)
ENCRYPTION_MASTER_SECRET=2fac1bc45f77c8855f0f89daadc7bd6e79dba2282283b72dc2c3fb7ef862c0b1

# Gmail OAuth (Google Cloud Console)
GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here

# Outlook OAuth (Microsoft Azure)
MICROSOFT_CLIENT_ID=your_microsoft_client_id_here
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret_here

# Slack OAuth (Slack API)
SLACK_CLIENT_ID=your_slack_client_id_here
SLACK_CLIENT_SECRET=your_slack_client_secret_here
```

## Step 2: Set Up Gmail OAuth (Google Cloud Console)

### 2.1 Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to **APIs & Services** → **Credentials**
4. Click **+ CREATE CREDENTIALS** → **OAuth client ID**

### 2.2 Configure OAuth Consent Screen (if not done)

If prompted to configure the consent screen:
1. Click **CONFIGURE CONSENT SCREEN**
2. Choose **External** user type
3. Fill in required fields:
   - App name: `Your App Name`
   - User support email: Your email
   - Developer contact: Your email
4. Click **SAVE AND CONTINUE**
5. On Scopes page, click **ADD OR REMOVE SCOPES**:
   - Add `https://www.googleapis.com/auth/gmail.readonly`
   - Add `https://www.googleapis.com/auth/userinfo.email`
6. Click **SAVE AND CONTINUE**
7. Add test users (your Gmail address)
8. Click **SAVE AND CONTINUE**

### 2.3 Create Web Application Credentials

1. Back on Credentials page, click **+ CREATE CREDENTIALS** → **OAuth client ID**
2. Application type: **Web application**
3. Name: `Workspace Gmail Connection` (or any name)
4. Under **Authorized redirect URIs**, click **+ ADD URI**
5. Add exactly: `http://localhost:3001/api/oauth/gmail/callback`
6. Click **CREATE**

### 2.4 Copy Credentials

1. A dialog will show your **Client ID** and **Client secret**
2. Copy both values
3. Add to your `.env`:
   ```env
   GOOGLE_CLIENT_ID=123456789-abc...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   ```

## Step 3: Set Up Slack OAuth

### 3.1 Create Slack App

1. Go to [Slack API](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. App name: `Your App Name`
4. Choose your workspace
5. Click **Create App**

### 3.2 Configure OAuth

1. In the left sidebar, click **OAuth & Permissions**
2. Scroll to **Redirect URLs**
3. Click **Add New Redirect URL**
4. Add exactly: `http://localhost:3001/api/oauth/slack/callback`
5. Click **Add**
6. Click **Save URLs**

### 3.3 Add OAuth Scopes

Scroll to **Scopes** section, under **User Token Scopes** (NOT Bot Token Scopes):

Click **Add an OAuth Scope** for each:
- `search:read`
- `channels:history`
- `channels:read`
- `groups:history`
- `groups:read`
- `im:history`
- `im:read`
- `mpim:history`
- `mpim:read`
- `users:read`

### 3.4 Get Credentials

1. Scroll up to **App Credentials** section
2. Copy **Client ID** and **Client Secret**
3. Add to your `.env`:
   ```env
   SLACK_CLIENT_ID=1234567890.1234567890
   SLACK_CLIENT_SECRET=abcdef1234567890...
   ```

### 3.5 (Optional) Install to Your Workspace

1. In the left sidebar, click **Install App**
2. Click **Install to Workspace**
3. Click **Allow**

This pre-authorizes the app for testing.

## Step 4: Set Up Outlook OAuth (Optional)

### 4.1 Register App in Azure

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **+ New registration**
4. Name: `Your App Name`
5. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
6. Redirect URI: 
   - Platform: **Web**
   - URI: `http://localhost:3001/api/oauth/outlook/callback`
7. Click **Register**

### 4.2 Create Client Secret

1. In your app, go to **Certificates & secrets**
2. Click **+ New client secret**
3. Description: `Workspace Connection`
4. Expires: **12 months** or **24 months**
5. Click **Add**
6. **IMPORTANT**: Copy the **Value** immediately (shown only once)

### 4.3 Configure API Permissions

1. Go to **API permissions**
2. Click **+ Add a permission**
3. Select **Microsoft Graph**
4. Click **Delegated permissions**
5. Search and add:
   - `Mail.Read`
   - `User.Read`
   - `offline_access`
6. Click **Add permissions**

### 4.4 Copy Credentials

1. Go to **Overview**
2. Copy **Application (client) ID**
3. Add to your `.env`:
   ```env
   MICROSOFT_CLIENT_ID=12345678-1234-1234-1234-123456789012
   MICROSOFT_CLIENT_SECRET=abc~...
   ```

## Step 5: Restart Server

After updating `.env`:

```bash
cd copilot-runtime-server
# Stop the current server (Ctrl+C if running)
npm run dev
```

## Step 6: Test Connections

1. Reload your Chrome extension
2. Go to **Workspace** → **Connections** tab
3. Click **Connect** for Gmail or Slack
4. Complete the OAuth flow
5. You should see "✓ Connected"

## Troubleshooting

### Gmail: "redirect_uri_mismatch"
- **Cause**: Redirect URI in Google Cloud Console doesn't match
- **Fix**: Ensure you added exactly: `http://localhost:3001/api/oauth/gmail/callback`
- **Note**: No trailing slash, exact port 3001

### Slack: "OAuth not configured"
- **Cause**: Missing credentials in `.env`
- **Fix**: Add `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET` to `.env`
- **Restart**: Must restart the server after changing `.env`

### "Please allow popups"
- **Cause**: Browser blocked the OAuth popup
- **Fix**: Allow popups for `localhost:3001` in your browser

### Connection shows "error" status
- **Cause**: OAuth flow failed or was cancelled
- **Fix**: Click "Disconnect", then try "Connect" again

## Security Notes

- ✅ Never commit `.env` file to git
- ✅ Keep `ENCRYPTION_MASTER_SECRET` secure
- ✅ OAuth tokens are encrypted before storage
- ✅ Use HTTPS in production
- ✅ Update redirect URIs for production domain

## What You Get

Once connected, the AI agent can:

### Gmail
- Search your emails
- Fetch specific threads
- Summarize conversations
- Find emails by sender, subject, date

### Slack
- Search your messages
- Retrieve channel history
- Find conversations by keyword
- Access DMs and group messages

### Example Chat Commands

> "Search my emails from john@example.com about the project proposal"

> "Find Slack messages in #engineering from last week"

> "Show me my most recent emails from my boss"

> "What did Sarah say in the #marketing channel yesterday?"

## Next Steps

1. ✅ Add credentials to `.env`
2. ✅ Restart server
3. ✅ Connect your accounts
4. 🎯 Start chatting with AI using your email/Slack data!

