# Workspace Feature - Configuration Guide

## Overview

The Workspace feature enables users to manage personal resources and make them available to AI agents:

- **📁 Files**: Upload documents with automatic text extraction and search
- **📝 Notes**: Create and organize personal notes
- **🔐 Credentials**: Store API keys, passwords, and other credentials securely (AES-256-GCM encryption)
- **☁️ Connections**: Securely connect cloud services via OAuth 2.0:
  - **Email**: Gmail, Outlook
  - **Messaging**: Slack
  - **Cloud Storage**: Google Drive, OneDrive, Dropbox

## Required Environment Variables

### Firebase Configuration

```bash
# Firebase Storage Bucket (required for file uploads)
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
# Or use the Vite prefix if sharing config with frontend:
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com

# Firebase API Key (required for authenticated uploads)
FIREBASE_API_KEY=your-firebase-api-key
# Or use the Vite prefix:
VITE_FIREBASE_API_KEY=your-firebase-api-key

# Encryption Secret (required for securing OAuth credentials)
ENCRYPTION_MASTER_SECRET=your-strong-32-character-secret-key-here
```

### OAuth Configuration (Optional - for connections)

```bash
# Google (Gmail & Google Drive)
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Microsoft (Outlook & OneDrive)
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret

# Slack
SLACK_CLIENT_ID=your_slack_client_id.apps.slack.com
SLACK_CLIENT_SECRET=your_slack_client_secret

# Dropbox
DROPBOX_CLIENT_ID=your_dropbox_app_key
DROPBOX_CLIENT_SECRET=your_dropbox_app_secret
```

**Note**: Gmail and Google Drive share the same OAuth credentials. Similarly, Outlook and OneDrive share credentials.

### Where to Find Firebase Values

1. **FIREBASE_STORAGE_BUCKET**: 
   - Go to Firebase Console → Storage
   - The bucket name is shown at the top (e.g., `your-project.appspot.com`)

2. **FIREBASE_API_KEY**:
   - Go to Firebase Console → Project Settings → General
   - Under "Your apps", find the Web API Key

### Setting Up OAuth Applications

#### Gmail (Google Cloud Console)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Gmail API** and **Google+ API**
4. Go to **Credentials** → **Create Credentials** → **OAuth client ID**
5. Application type: **Web application**
6. Authorized redirect URIs:
   - Development: `http://localhost:3001/api/oauth/gmail/callback`
   - Production: `https://yourdomain.com/api/oauth/gmail/callback`
7. Copy **Client ID** and **Client Secret** to your `.env` file

#### Outlook (Microsoft Azure Portal)

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **New registration**
4. Name your app and select **Accounts in any organizational directory and personal Microsoft accounts**
5. Redirect URI: Web → `http://localhost:3001/api/oauth/outlook/callback`
6. After creation:
   - Go to **Certificates & secrets** → **New client secret**
   - Copy **Application (client) ID** and **Client secret value**
   - Go to **API permissions** → **Microsoft Graph** → Add:
     - `Mail.Read` (Delegated)
     - `User.Read` (Delegated)
     - `offline_access` (Delegated)

#### Slack (Slack API)

1. Go to [Slack API](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Choose app name and development workspace
4. Go to **OAuth & Permissions**
5. Add **Redirect URLs**:
   - `http://localhost:3001/api/oauth/slack/callback`
   - `https://yourdomain.com/api/oauth/slack/callback` (production)
6. Under **Scopes**, add **User Token Scopes**:
   - `search:read`, `channels:history`, `channels:read`
   - `groups:history`, `groups:read`
   - `im:history`, `im:read`
   - `mpim:history`, `mpim:read`
   - `users:read`
7. Copy **Client ID** and **Client Secret** from **App Credentials**

### Security Notes

- **ENCRYPTION_MASTER_SECRET**: Must be at least 32 characters for production use
- **OAuth tokens** are encrypted using AES-256-GCM before storage
- Firebase Storage should have appropriate security rules configured
- Consider using Firebase Storage rules to restrict access:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /workspace/{userId}/{allPaths=**} {
      // Only authenticated users can read/write their own workspace files
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## File Upload Implementation

The workspace uses **Firebase Storage REST API** (not Admin SDK) for file operations.

### Firebase Storage Structure
All user files are stored in a consistent path structure:
```
workspace/{userId}/{timestamp}-{filename}
```

This applies to:
- **Direct uploads** via Workspace tab (`/api/workspace/files/upload`)
- **Chat attachments** via chat input (automatically registered in workspace)

### Upload Flow (Workspace Tab)
1. User uploads file via `/api/workspace/files/upload`
2. Server receives multipart/form-data with the file
3. Server uploads to Firebase Storage using REST API:
   - Endpoint: `POST https://firebasestorage.googleapis.com/v0/b/{bucket}/o?uploadType=media&name={path}`
   - Path: `workspace/{userId}/{timestamp}-{filename}`
   - Headers: `Content-Type: {file mime type}`
   - Body: Binary file data
4. Server stores metadata and public URL in PostgreSQL

### Upload Flow (Chat Attachments)
1. User attaches file in chat
2. Frontend uploads directly to Firebase Storage (same path structure)
3. After upload, frontend registers file via `/api/workspace/files/register`
4. File appears in workspace with `folder: 'chat-uploads'`

### Delete Flow
1. User deletes file via `DELETE /api/workspace/files/:fileId`
2. Server deletes from database
3. Server deletes from Firebase Storage using REST API:
   - Endpoint: `DELETE https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}`

### Supported File Types
- Documents: PDF, DOC, DOCX, TXT, MD, CSV, JSON
- Spreadsheets: XLS, XLSX
- Images: JPG, JPEG, PNG, GIF, WEBP
- Maximum file size: 50MB

### Migration Note
**Previous path structure** (before consistency update):
- Chat uploads used: `attachments/{sessionId}/{timestamp}-{filename}`

**Current unified structure** (all uploads):
- All files use: `workspace/{userId}/{timestamp}-{filename}`

Files uploaded with the old path structure will continue to work (URLs remain valid), but new uploads use the consistent structure.

## Database Schema

The workspace feature uses three tables:

- `workspace_files` - User uploaded files
- `workspace_notes` - Personal notes
- `workspace_connections` - OAuth connections (Gmail, Slack - coming soon)

Run migration: `025_add_workspace_tables.sql`

## API Endpoints

### Files
- `GET /api/workspace/files` - List user's files
- `POST /api/workspace/files/upload` - Upload file
- `DELETE /api/workspace/files/:fileId` - Delete file

### Notes
- `GET /api/workspace/notes` - List notes
- `GET /api/workspace/notes/:noteId` - Get single note
- `POST /api/workspace/notes` - Create note
- `PUT /api/workspace/notes/:noteId` - Update note
- `DELETE /api/workspace/notes/:noteId` - Delete note

### Connections
- `GET /api/workspace/connections` - List OAuth connections
- `DELETE /api/workspace/connections/:connectionId` - Disconnect

### OAuth
- `GET /api/oauth/:service/authorize` - Initiate OAuth flow
- `GET /api/oauth/:service/callback` - OAuth callback handler
- `POST /api/oauth/:service/test` - Test connection validity

Supported services: `gmail`, `outlook`, `slack`, `google-drive`, `onedrive`, `dropbox`

### Summary
- `GET /api/workspace/summary` - Get workspace summary for AI context

All endpoints require authentication and are user-scoped.

## Additional Documentation

### OAuth Setup Guides

- **Quick Start**: [`CLOUD_STORAGE_QUICKSTART.md`](./CLOUD_STORAGE_QUICKSTART.md) - Fast setup for Google Drive, OneDrive, and Dropbox
- **Detailed Guide**: [`CLOUD_STORAGE_OAUTH_SETUP.md`](./CLOUD_STORAGE_OAUTH_SETUP.md) - Complete OAuth integration with troubleshooting
- **Email & Slack**: [`OAUTH_QUICK_SETUP.md`](./OAUTH_QUICK_SETUP.md) - Setup for Gmail, Outlook, and Slack
- **Ngrok Setup**: [`NGROK_SETUP.md`](./NGROK_SETUP.md) - Using ngrok for local OAuth development

### Other Resources

- **Environment Checklist**: [`ENV_CHECKLIST.md`](./ENV_CHECKLIST.md) - Complete list of environment variables
- **Microsoft OAuth**: [`MICROSOFT_OAUTH_SETUP.md`](./MICROSOFT_OAUTH_SETUP.md) - Detailed Azure setup

