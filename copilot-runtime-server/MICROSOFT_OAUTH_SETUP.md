# Microsoft/Outlook OAuth Setup Guide

Complete step-by-step guide to set up Outlook email integration via Microsoft Azure.

## Overview

This allows users to connect their Microsoft 365 or Outlook.com accounts to access emails in the AI agent.

## Step 1: Access Azure Portal

1. Go to [Azure Portal](https://portal.azure.com/)
2. Sign in with your Microsoft account
3. If you don't have an Azure subscription, you can still create apps (free)

## Step 2: Register Application

### Navigate to App Registrations

1. In the Azure Portal, search for **"App registrations"** in the top search bar
2. Click on **App registrations** from the results
3. Click **+ New registration** button

### Configure Basic Settings

Fill in the registration form:

**Name**: `Hands-off Workspace Outlook Connection` (or any name you prefer)

**Supported account types**: Select **"Accounts in any organizational directory and personal Microsoft accounts"**
- This allows both work/school accounts AND personal @outlook.com/@hotmail.com accounts

**Redirect URI**:
- Platform: Select **Web**
- URI: Enter your ngrok URL:
  ```
  https://elizbeth-nontelepathic-sonya.ngrok-free.dev/api/oauth/outlook/callback
  ```

Click **Register**

## Step 3: Note Application (Client) ID

After registration, you'll see the app's **Overview** page.

1. Copy the **Application (client) ID**
   - Format: `12345678-1234-1234-1234-123456789012`
2. Save this - you'll add it to `.env` as `MICROSOFT_CLIENT_ID`

## Step 4: Create Client Secret

### Generate Secret

1. In the left sidebar, click **Certificates & secrets**
2. Click the **Client secrets** tab
3. Click **+ New client secret**

### Configure Secret

- **Description**: `Workspace Connection Secret`
- **Expires**: Choose **12 months** or **24 months** (recommended)
  - Note: You'll need to generate a new secret before expiration
- Click **Add**

### Copy Secret Value

**⚠️ IMPORTANT**: The secret **Value** is shown only once!

1. Copy the **Value** column (not the "Secret ID")
   - Format: `abc~XYZ123...`
2. Save it immediately - you can't view it again
3. You'll add this to `.env` as `MICROSOFT_CLIENT_SECRET`

If you miss copying it, you'll need to create a new secret.

## Step 5: Configure API Permissions

### Add Microsoft Graph Permissions

1. In the left sidebar, click **API permissions**
2. Click **+ Add a permission**
3. Select **Microsoft Graph**
4. Select **Delegated permissions**

### Add Required Scopes

Search for and add each permission:

✅ **Mail.Read**
- Description: Read user mail
- Type: Delegated
- Admin consent: Not required

✅ **User.Read**
- Description: Sign in and read user profile
- Type: Delegated
- Admin consent: Not required

✅ **offline_access**
- Description: Maintain access to data you have given it access to
- Type: Delegated
- Admin consent: Not required

### Grant Permissions

After adding all three permissions:
1. Your permissions list should show:
   - `Mail.Read`
   - `User.Read`
   - `offline_access`
2. *(Optional)* If you're an admin, click **"Grant admin consent for [Organization]"**
   - This pre-approves for all users in your org
   - Not required for personal accounts

Click **Save** or **Update** if prompted

## Step 6: Update Environment Variables

Open `copilot-runtime-server/.env` and add:

```env
# Microsoft/Outlook OAuth
MICROSOFT_CLIENT_ID=12345678-1234-1234-1234-123456789012
MICROSOFT_CLIENT_SECRET=abc~XYZ123...

# ngrok URL (should already be there)
NGROK_URL=https://elizbeth-nontelepathic-sonya.ngrok-free.dev
```

Replace with your actual values from Azure Portal.

## Step 7: Verify Configuration

### Your .env should now have:

```env
# Encryption
ENCRYPTION_MASTER_SECRET=2fac1bc45f77c8855f0f89daadc7bd6e79dba2282283b72dc2c3fb7ef862c0b1

# ngrok
NGROK_URL=https://elizbeth-nontelepathic-sonya.ngrok-free.dev

# Gmail
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

# Slack
SLACK_CLIENT_ID=1234567890.1234567890
SLACK_CLIENT_SECRET=abc123...

# Outlook (NEW)
MICROSOFT_CLIENT_ID=12345678-1234-1234-1234-123456789012
MICROSOFT_CLIENT_SECRET=abc~XYZ123...
```

## Step 8: Restart Server

```bash
cd copilot-runtime-server
# Stop server (Ctrl+C)
npm run dev
```

## Step 9: Test Connection

1. Reload your Chrome extension
2. Go to **Home** → **Workspace** → **Connections** tab
3. You should now see three services:
   - 📧 Gmail
   - 📨 Outlook
   - 💬 Slack
4. Click **Connect** for Outlook
5. Sign in with your Microsoft account
6. Grant permissions
7. Should see "✓ Connected"

## Troubleshooting

### "AADSTS50011: The redirect URI specified in the request does not match"

**Cause**: Redirect URI mismatch

**Fix**:
1. Check Azure Portal → Your App → **Authentication**
2. Under **Web** platform, verify redirect URI is exactly:
   ```
   https://elizbeth-nontelepathic-sonya.ngrok-free.dev/api/oauth/outlook/callback
   ```
3. No trailing slash
4. Must match your ngrok URL

### "AADSTS700016: Application not found"

**Cause**: Wrong Client ID

**Fix**:
1. Go to Azure Portal → App registrations → Your app
2. Copy the **Application (client) ID** from Overview page
3. Update `MICROSOFT_CLIENT_ID` in `.env`
4. Restart server

### "invalid_client"

**Cause**: Wrong Client Secret or it expired

**Fix**:
1. Azure Portal → Your app → **Certificates & secrets**
2. Check secret expiration date
3. If expired, create a new secret
4. Update `MICROSOFT_CLIENT_SECRET` in `.env`
5. Restart server

### "AADSTS65001: User did not consent"

**Cause**: User cancelled or denied permissions

**Fix**: Try connecting again and click "Accept" when prompted

### Can't find App Registrations

**Navigation Path**:
1. Azure Portal home
2. Search bar at top → type "App registrations"
3. Or: **Azure Active Directory** → **App registrations** (left menu)

## Advanced: Organizational Restrictions

If setting up for an organization with restrictions:

### Admin Consent Required

Some organizations require admin approval for app permissions:
1. Contact your Azure AD administrator
2. Provide them with your **Application (client) ID**
3. They can grant organization-wide consent in Azure Portal

### Restrict to Specific Tenant

If you want to limit to your organization only:
1. Azure Portal → Your app → **Authentication**
2. Under **Supported account types**, select **"Accounts in this organizational directory only"**
3. This blocks personal Microsoft accounts

## Security Notes

✅ **Client Secret Expiration**: Mark your calendar to renew before expiration
✅ **Least Privilege**: Only requested `Mail.Read` (read-only)
✅ **Token Storage**: Access tokens are encrypted in database
✅ **Refresh Tokens**: Automatically refreshed when expired

## What Users Can Do

Once connected, the AI agent can:
- Search user's emails
- Read specific email threads
- Summarize email conversations
- Find emails by sender, subject, date range
- Access both inbox and sent items

Example chat commands:
> "Search my Outlook emails from boss@company.com about the budget"
> "What did the client say in their last email?"
> "Summarize my unread emails from today"

## Next Steps

✅ Outlook configured  
✅ Gmail configured (already done)  
✅ Slack configured (already done)  

All three services ready to use! 🎉

## Quick Reference

**Azure Portal**: https://portal.azure.com/  
**App Registrations**: Azure AD → App registrations  
**Your App**: Hands-off Workspace Outlook Connection  
**Redirect URI**: `https://your-ngrok-url/api/oauth/outlook/callback`  
**Permissions**: Mail.Read, User.Read, offline_access  

