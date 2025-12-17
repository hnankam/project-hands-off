# .env File Checklist for OAuth Connections

## ✅ Required Variables for Workspace OAuth

Copy these to your `.env` file in the `copilot-runtime-server` directory:

```env
# 1. ENCRYPTION KEY (Required - already generated for you)
ENCRYPTION_MASTER_SECRET=2fac1bc45f77c8855f0f89daadc7bd6e79dba2282283b72dc2c3fb7ef862c0b1

# 2. GMAIL OAuth App Credentials
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your_client_secret

# 3. SLACK OAuth App Credentials  
SLACK_CLIENT_ID=1234567890.1234567890
SLACK_CLIENT_SECRET=abcdef1234567890abcdef1234567890

# 4. OUTLOOK OAuth App Credentials (Optional)
MICROSOFT_CLIENT_ID=12345678-1234-1234-1234-123456789012
MICROSOFT_CLIENT_SECRET=abc~your_client_secret
```

## ❌ DO NOT ADD THESE (Common Mistake!)

These should **NOT** be in your `.env` file:

```env
# ❌ WRONG - Remove if you added these:
SLACK_ACCESS_TOKEN=xoxp-...
SLACK_REFRESH_TOKEN=xoxr-...
SLACK_BOT_TOKEN=xoxb-...
GOOGLE_ACCESS_TOKEN=ya29...
GOOGLE_REFRESH_TOKEN=1//...
```

## 🔍 Why Not Add Access Tokens?

| Variable Type | Where It Goes | When It's Created | Who It Belongs To |
|--------------|---------------|-------------------|-------------------|
| `CLIENT_ID` + `CLIENT_SECRET` | `.env` file | When you create the app | Your application |
| `ACCESS_TOKEN` + `REFRESH_TOKEN` | Database (encrypted) | When user clicks "Connect" | Individual user |

### The Flow:

1. **You configure** (in `.env`):
   - `SLACK_CLIENT_ID` = Your app's identity
   - `SLACK_CLIENT_SECRET` = Your app's password

2. **User clicks "Connect"**:
   - OAuth popup opens
   - User logs into Slack/Gmail
   - User grants permission

3. **System automatically receives**:
   - Access token (to read user's data)
   - Refresh token (to renew access)
   - These get **encrypted and stored in PostgreSQL**

## 📍 Where to Get Each Value

### SLACK_CLIENT_ID and SLACK_CLIENT_SECRET

1. Go to https://api.slack.com/apps
2. Click your app (or create new app)
3. Look for **"App Credentials"** section (usually at the top)
4. You'll see:
   ```
   Client ID: 1234567890.1234567890
   Client Secret: [Show] ← Click to reveal
   ```
5. Copy these exact values

**Not** the Bot User OAuth Token (xoxb-...)  
**Not** the User OAuth Token (xoxp-...)

### GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET

1. Go to https://console.cloud.google.com/apis/credentials
2. Click on your OAuth 2.0 Client ID
3. You'll see:
   ```
   Client ID: 123456789-abc...apps.googleusercontent.com
   Client Secret: GOCSPX-abc123...
   ```

### MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET

1. Go to https://portal.azure.com/
2. Azure Active Directory → App registrations → Your app
3. Overview page shows **Application (client) ID**
4. Certificates & secrets → Client secrets → Your secret **Value**

## ✅ Verification Checklist

Before restarting the server, verify:

- [ ] `ENCRYPTION_MASTER_SECRET` is 64 characters (hex)
- [ ] `SLACK_CLIENT_ID` looks like: `1234567890.1234567890`
- [ ] `SLACK_CLIENT_SECRET` is around 32 characters
- [ ] `GOOGLE_CLIENT_ID` ends with `.apps.googleusercontent.com`
- [ ] `GOOGLE_CLIENT_SECRET` starts with `GOCSPX-`
- [ ] NO variables named `*_ACCESS_TOKEN` or `*_REFRESH_TOKEN`
- [ ] NO variables named `*_BOT_TOKEN`

## 🔄 After Updating .env

1. **Save the file**
2. **Restart the server**:
   ```bash
   cd copilot-runtime-server
   # Stop current server (Ctrl+C)
   npm run dev
   ```
3. **Reload extension** in Chrome
4. **Test connection** in Workspace → Connections tab

## 🐛 Common Errors

### "slack OAuth not configured"
- **Cause**: Missing or incorrect `SLACK_CLIENT_ID` or `SLACK_CLIENT_SECRET`
- **Check**: Values are from "App Credentials", not "OAuth Tokens"
- **Fix**: Copy the correct values and restart server

### "redirect_uri_mismatch" (Gmail)
- **Cause**: Redirect URI in Google Console doesn't match
- **Fix**: Must be exactly: `http://localhost:3001/api/oauth/gmail/callback`

### "invalid_client" (Any service)
- **Cause**: Wrong Client ID or Client Secret
- **Fix**: Double-check you copied the full values correctly

## 💡 Pro Tips

1. **Don't confuse** "App Credentials" with "User Tokens"
   - App Credentials = Your app's identity (goes in .env)
   - User Tokens = User's permission (stored in database)

2. **Client Secret is shown only once** in some platforms
   - Azure: Shows secret value only when created
   - Copy it immediately or create a new one

3. **Restart server** is required after changing .env
   - Node.js doesn't hot-reload environment variables

4. **Test one service at a time**
   - Get Slack working first (simpler setup)
   - Then add Gmail
   - Finally add Outlook

## 🎯 Quick Test

After setting up, test if variables are loaded:

```bash
cd copilot-runtime-server
node -e "require('dotenv').config(); console.log('Slack Client ID:', process.env.SLACK_CLIENT_ID ? '✓ Set' : '✗ Missing')"
```

Should output: `Slack Client ID: ✓ Set`

