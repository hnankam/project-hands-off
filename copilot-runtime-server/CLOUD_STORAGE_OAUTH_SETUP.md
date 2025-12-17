# Cloud Storage OAuth Integration Guide

This guide covers OAuth 2.0 setup for Google Drive, OneDrive, and Dropbox integrations.

## Table of Contents
- [Google Drive Setup](#google-drive-setup)
- [OneDrive Setup](#onedrive-setup)
- [Dropbox Setup](#dropbox-setup)
- [Environment Variables](#environment-variables)
- [Testing Connections](#testing-connections)

---

## Google Drive Setup

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Click **"Select Project"** at the top

### 2. Enable Google Drive API

1. In the left sidebar, go to **"APIs & Services" > "Library"**
2. Search for **"Google Drive API"**
3. Click on it and press **"Enable"**

### 3. Configure OAuth Consent Screen

1. Go to **"APIs & Services" > "OAuth consent screen"**
2. Select **"External"** (or Internal if using Google Workspace)
3. Fill in the required fields:
   - **App name**: Your App Name
   - **User support email**: Your email
   - **Developer contact email**: Your email
4. Click **"Save and Continue"**
5. On the **"Scopes"** page, click **"Add or Remove Scopes"**
6. Add these scopes:
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/drive.metadata.readonly`
   - `https://www.googleapis.com/auth/userinfo.email`
7. Click **"Update"** then **"Save and Continue"**
8. Add test users (if in testing mode)
9. Review and click **"Back to Dashboard"**

### 4. Create OAuth Credentials

1. Go to **"APIs & Services" > "Credentials"**
2. Click **"Create Credentials" > "OAuth client ID"**
3. Select **"Web application"**
4. Name it (e.g., "Google Drive Integration")
5. Under **"Authorized redirect URIs"**, add:
   - For local development: `http://localhost:3001/api/oauth/google-drive/callback`
   - For ngrok: `https://YOUR-NGROK-URL.ngrok.io/api/oauth/google-drive/callback`
   - For production: `https://yourdomain.com/api/oauth/google-drive/callback`
6. Click **"Create"**
7. Copy the **Client ID** and **Client Secret**

### 5. Add to Environment Variables

```bash
# Google Drive (uses same credentials as Gmail)
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
```

**Note**: Google Drive uses the same OAuth credentials as Gmail if you already have Gmail set up.

---

## OneDrive Setup

### 1. Register Application in Azure Portal

1. Go to [Azure Portal](https://portal.azure.com/)
2. Search for and select **"Azure Active Directory"** (or **"Microsoft Entra ID"**)
3. In the left menu, select **"App registrations"**
4. Click **"New registration"**

### 2. Configure App Registration

1. **Name**: Your App Name (e.g., "Workspace OneDrive Integration")
2. **Supported account types**: Select one of:
   - **"Accounts in any organizational directory and personal Microsoft accounts"** (recommended)
   - Or the option that fits your use case
3. **Redirect URI**:
   - Platform: **Web**
   - URI: `http://localhost:3001/api/oauth/onedrive/callback`
4. Click **"Register"**

### 3. Note Application IDs

On the **Overview** page, copy:
- **Application (client) ID** - You'll need this for `MICROSOFT_CLIENT_ID`
- **Directory (tenant) ID** - Note this for reference

### 4. Create Client Secret

1. In the left menu, go to **"Certificates & secrets"**
2. Click **"New client secret"**
3. Add a description (e.g., "OneDrive OAuth Secret")
4. Choose expiration (24 months recommended)
5. Click **"Add"**
6. **IMPORTANT**: Copy the **Value** immediately (it won't be shown again!)
   - This is your `MICROSOFT_CLIENT_SECRET`

### 5. Configure API Permissions

1. In the left menu, go to **"API permissions"**
2. Click **"Add a permission"**
3. Select **"Microsoft Graph"**
4. Select **"Delegated permissions"**
5. Add these permissions:
   - **Files.Read.All** - Read all files user can access
   - **User.Read** - Sign in and read user profile
   - **offline_access** - Maintain access to data you have given it access to
6. Click **"Add permissions"**
7. (Optional) Click **"Grant admin consent"** if you have admin rights

### 6. Add Redirect URIs

1. Go to **"Authentication"** in the left menu
2. Under **"Web" > "Redirect URIs"**, add:
   - `http://localhost:3001/api/oauth/onedrive/callback`
   - For ngrok: `https://YOUR-NGROK-URL.ngrok.io/api/oauth/onedrive/callback`
   - For production: `https://yourdomain.com/api/oauth/onedrive/callback`
3. Under **"Implicit grant and hybrid flows"**, optionally enable:
   - ✅ **ID tokens**
4. Click **"Save"**

### 7. Add to Environment Variables

```bash
# Microsoft/OneDrive (uses same credentials as Outlook)
MICROSOFT_CLIENT_ID=your_microsoft_client_id_here
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret_here
```

**Note**: OneDrive uses the same OAuth credentials as Outlook if you already have Outlook set up.

---

## Dropbox Setup

### 1. Create Dropbox App

1. Go to [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Click **"Create app"**

### 2. Choose API and Access Type

1. **Choose an API**: Select **"Scoped access"**
2. **Choose the type of access**: Select **"Full Dropbox"** or **"App folder"**
   - **Full Dropbox**: Access to all files and folders
   - **App folder**: Access only to a dedicated folder
3. **Name your app**: Enter a unique name (e.g., "Workspace Integration")
4. **Choose Dropbox account**: Select the account to use
5. Check the box agreeing to the terms
6. Click **"Create app"**

### 3. Configure App Settings

On the app settings page:

1. **App key** and **App secret** are displayed at the top
   - Copy these for your environment variables

### 4. Set OAuth Redirect URIs

1. Scroll to **"OAuth 2" > "Redirect URIs"**
2. Add the following URIs:
   - `http://localhost:3001/api/oauth/dropbox/callback`
   - For ngrok: `https://YOUR-NGROK-URL.ngrok.io/api/oauth/dropbox/callback`
   - For production: `https://yourdomain.com/api/oauth/dropbox/callback`
3. Click **"Add"** for each URI

### 5. Configure Permissions

1. Scroll to **"Permissions"** tab
2. Under **"Files and folders"**, enable:
   - ✅ **files.metadata.read** - View metadata for files and folders
   - ✅ **files.content.read** - View content of files
3. Click **"Submit"** at the bottom

**Important**: After changing permissions, you must:
- Go back to the **"Settings"** tab
- Get users to re-authorize the app

### 6. Additional Settings (Optional)

1. **Branding**: Add app icon and description
2. **App folder name**: If using App folder access
3. **Development users**: Add test users during development

### 7. Add to Environment Variables

```bash
# Dropbox
DROPBOX_CLIENT_ID=your_dropbox_app_key_here
DROPBOX_CLIENT_SECRET=your_dropbox_app_secret_here
```

---

## Environment Variables

### Complete `.env` File

Add these to your `copilot-runtime-server/.env` file:

```bash
# Existing OAuth Encryption Key (if not already set)
OAUTH_ENCRYPTION_KEY=your_32_character_encryption_key_here

# Google (Gmail & Google Drive)
GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# Microsoft (Outlook & OneDrive)
MICROSOFT_CLIENT_ID=your_microsoft_client_id_here
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret_here

# Slack
SLACK_CLIENT_ID=your_slack_client_id_here
SLACK_CLIENT_SECRET=your_slack_client_secret_here

# Dropbox
DROPBOX_CLIENT_ID=your_dropbox_app_key_here
DROPBOX_CLIENT_SECRET=your_dropbox_app_secret_here

# Optional: For development with ngrok
NGROK_URL=https://your-ngrok-url.ngrok.io

# Optional: For production
# BASE_URL=https://yourdomain.com
```

### Generate Encryption Key

If you don't have an encryption key yet:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Testing Connections

### 1. Start Your Server

```bash
cd copilot-runtime-server
npm install
npm run dev
```

### 2. Test OAuth Flow

For each service:

1. Open your app and navigate to **Workspace > Connections**
2. Click the connect button for the service
3. You'll be redirected to the provider's authorization page
4. Grant the requested permissions
5. You should be redirected back with a success message

### 3. Verify Connection

Check that the connection appears in your **Connections** list with status "CONNECTED"

### 4. Test API Endpoints

You can test the connection endpoints directly:

```bash
# Test Google Drive connection
curl http://localhost:3001/api/oauth/google-drive/test \
  -H "Cookie: your-session-cookie"

# Test OneDrive connection
curl http://localhost:3001/api/oauth/onedrive/test \
  -H "Cookie: your-session-cookie"

# Test Dropbox connection
curl http://localhost:3001/api/oauth/dropbox/test \
  -H "Cookie: your-session-cookie"
```

---

## Troubleshooting

### Common Issues

#### 1. "redirect_uri_mismatch" Error

**Problem**: The redirect URI doesn't match what's configured in the OAuth app.

**Solution**:
- Ensure redirect URIs in the OAuth provider console exactly match your callback URLs
- Include the full URL with protocol (http:// or https://)
- For ngrok, update the redirect URI when your ngrok URL changes

#### 2. "invalid_client" Error

**Problem**: Client ID or Secret is incorrect.

**Solution**:
- Double-check your `.env` file has the correct credentials
- Ensure no extra spaces or quotes around the values
- Verify you copied the complete client ID and secret

#### 3. "insufficient_permissions" or "invalid_scope" Error

**Problem**: The requested scopes aren't enabled or approved.

**Solution**:
- Verify all required scopes are added in the OAuth app settings
- For Dropbox, ensure you submitted the permission changes
- Some apps may need admin consent for certain scopes

#### 4. HTTPS Required Errors

**Problem**: OAuth providers require HTTPS for redirect URIs.

**Solution**:
- For local development, use `http://localhost:3001` (most providers allow this)
- For testing with external URLs, use ngrok:
  ```bash
  ngrok http 3001
  ```
- Set `NGROK_URL` in your `.env` file
- Update all redirect URIs in OAuth provider consoles

#### 5. Connection Shows But Doesn't Work

**Problem**: Connection is saved but API calls fail.

**Solution**:
- Check if the access token has expired
- Verify refresh token is being stored and used
- Check the encrypted data is properly decrypted
- Review server logs for specific error messages

### Debug Mode

Enable detailed logging in `copilot-runtime-server/routes/oauth.js`:

```javascript
console.log('OAuth Response:', {
  service,
  hasAccessToken: !!tokenData.access_token,
  hasRefreshToken: !!tokenData.refresh_token,
  expiresIn: tokenData.expires_in,
});
```

---

## Security Best Practices

1. **Never commit credentials**: Keep `.env` files in `.gitignore`
2. **Use environment-specific credentials**: Different keys for dev/staging/production
3. **Rotate secrets regularly**: Update client secrets periodically
4. **Limit scopes**: Only request permissions your app actually needs
5. **Secure token storage**: Tokens are encrypted in the database using AES-256-GCM
6. **HTTPS in production**: Always use HTTPS for production redirect URIs
7. **Validate redirect URIs**: The backend checks the state parameter to prevent CSRF attacks

---

## API Scopes Reference

### Google Drive Scopes

- `https://www.googleapis.com/auth/drive.readonly` - Read all files
- `https://www.googleapis.com/auth/drive.metadata.readonly` - Read file metadata
- `https://www.googleapis.com/auth/userinfo.email` - Get user email

### Microsoft OneDrive Scopes

- `Files.Read.All` - Read all files the user can access
- `User.Read` - Sign in and read user profile
- `offline_access` - Get refresh tokens

### Dropbox Scopes

- `files.metadata.read` - View file and folder metadata
- `files.content.read` - Read file contents

---

## Next Steps

After setting up OAuth:

1. **Implement workspace tools** to fetch files from connected storage
2. **Add file syncing** to automatically import files to workspace
3. **Create search functionality** to search across connected storage
4. **Add file preview** to view files from cloud storage
5. **Implement sharing** to let users share cloud files with the AI agent

For questions or issues, refer to the official documentation:
- [Google Drive API](https://developers.google.com/drive/api/guides/about-sdk)
- [Microsoft Graph OneDrive](https://learn.microsoft.com/en-us/onedrive/developer/)
- [Dropbox API](https://www.dropbox.com/developers/documentation)

