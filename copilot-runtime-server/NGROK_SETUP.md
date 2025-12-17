# ngrok Setup Guide for OAuth HTTPS

This guide shows how to use ngrok to create an HTTPS tunnel for OAuth development.

## Why ngrok?

Some OAuth providers (like Slack) require HTTPS redirect URIs even for development. ngrok creates a secure HTTPS tunnel to your local server.

## Step 1: Start ngrok

ngrok is already installed on your system. Start a tunnel to your local server:

```bash
ngrok http 3001
```

You'll see output like this:

```
ngrok                                                                    

Session Status                online
Account                       your-account (Plan: Free)
Version                       3.x.x
Region                        United States (us)
Latency                       -
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc123def456.ngrok.io -> http://localhost:3001

Connections                   ttl     opn     rt1     rt5     p50     p90
                              0       0       0.00    0.00    0.00    0.00
```

**Important**: Copy the HTTPS forwarding URL (e.g., `https://abc123def456.ngrok.io`)

## Step 2: Add ngrok URL to .env

Open `copilot-runtime-server/.env` and add:

```env
# ngrok HTTPS tunnel (update this each time you restart ngrok)
NGROK_URL=https://abc123def456.ngrok.io
```

**Note**: The ngrok URL changes each time you restart ngrok (unless you have a paid plan with reserved domains).

## Step 3: Update OAuth App Redirect URIs

### For Slack:

1. Go to https://api.slack.com/apps
2. Click your app → **OAuth & Permissions**
3. Under **Redirect URLs**, click **Add New Redirect URL**
4. Add: `https://abc123def456.ngrok.io/api/oauth/slack/callback`
5. Click **Add**, then **Save URLs**

### For Gmail:

1. Go to https://console.cloud.google.com/apis/credentials
2. Click your OAuth 2.0 Client ID
3. Under **Authorized redirect URIs**, click **+ ADD URI**
4. Add: `https://abc123def456.ngrok.io/api/oauth/gmail/callback`
5. Click **Save**

### For Outlook:

1. Go to https://portal.azure.com/
2. Azure AD → App registrations → Your app
3. Under **Authentication**, add redirect URI:
4. Add: `https://abc123def456.ngrok.io/api/oauth/outlook/callback`
5. Click **Save**

## Step 4: Restart Your Server

```bash
cd copilot-runtime-server
# Stop the server (Ctrl+C)
npm run dev
```

## Step 5: Test OAuth Connection

1. Reload your Chrome extension
2. Go to **Workspace** → **Connections** tab
3. Click **Connect** for Slack/Gmail
4. OAuth should now work with HTTPS! ✅

## Important Notes

### ngrok URL Changes

The free ngrok URL changes every time you restart ngrok. When this happens:

1. Get the new ngrok URL from the terminal
2. Update `NGROK_URL` in `.env`
3. Update redirect URIs in all OAuth apps
4. Restart your server

### Keep ngrok Running

While testing OAuth:
- Keep the ngrok terminal window open
- Don't stop the ngrok process
- If it stops, you'll need to update URLs again

### Production

For production, you don't need ngrok. Use your actual domain:

```env
# Production
BASE_URL=https://yourdomain.com
```

And update redirect URIs to:
- `https://yourdomain.com/api/oauth/slack/callback`
- `https://yourdomain.com/api/oauth/gmail/callback`
- etc.

## Troubleshooting

### "redirect_uri_mismatch"

**Cause**: The redirect URI doesn't match what's configured in the OAuth app.

**Fix**:
1. Check the ngrok URL in `.env` matches the terminal output
2. Verify the redirect URI in the OAuth app includes `/api/oauth/{service}/callback`
3. Make sure there's no trailing slash
4. Restart your server after changing `.env`

### ngrok "Session Expired"

**Cause**: Free ngrok sessions timeout after a few hours.

**Fix**: Restart ngrok and update URLs:
```bash
# Stop old ngrok (Ctrl+C)
# Start new ngrok
ngrok http 3001

# Copy new URL and update .env
# Update OAuth app redirect URIs
# Restart server
```

### Can't Access ngrok Web Interface

ngrok provides a local web interface at http://127.0.0.1:4040 where you can:
- See all HTTP requests
- Inspect request/response details
- Replay requests
- Very useful for debugging OAuth!

## Alternative: ngrok Reserved Domain (Paid)

With ngrok's paid plan, you can get a reserved domain that doesn't change:

```bash
ngrok http 3001 --domain=your-reserved-domain.ngrok.io
```

Then you only need to configure redirect URIs once!

## Quick Reference

```bash
# Start ngrok
ngrok http 3001

# In another terminal - start server
cd copilot-runtime-server
npm run dev

# Test OAuth at ngrok URL
# Example: https://abc123def456.ngrok.io
```

## Environment Variables Summary

Your `.env` should have:

```env
# Existing variables
PORT=3001
ENCRYPTION_MASTER_SECRET=2fac1bc45f77c8855f0f89daadc7bd6e79dba2282283b72dc2c3fb7ef862c0b1

# OAuth credentials
SLACK_CLIENT_ID=1234567890.1234567890
SLACK_CLIENT_SECRET=abc123...
GOOGLE_CLIENT_ID=123...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123...

# ngrok URL (update when ngrok restarts)
NGROK_URL=https://abc123def456.ngrok.io
```

Now your OAuth will work with HTTPS! 🚀

