/**
 * OAuth routes for workspace connections
 * Handles Gmail, Outlook, Slack, Google Drive, OneDrive, and Dropbox OAuth flows
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPool } from '../config/database.js';
import { encryptOAuthTokens, decryptOAuthTokens } from '../utils/encryption.js';

const router = express.Router();

// OAuth Configuration
const OAUTH_CONFIG = {
  gmail: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    clientId: process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  outlook: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: [
      'https://graph.microsoft.com/Mail.Read',
      'https://graph.microsoft.com/User.Read',
      'offline_access',
    ],
    clientId: process.env.MICROSOFT_CLIENT_ID || process.env.VITE_MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  },
  slack: {
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: [
      'search:read',
      'channels:history',
      'channels:read',
      'groups:history',
      'groups:read',
      'im:history',
      'im:read',
      'mpim:history',
      'mpim:read',
      'users:read',
    ],
    clientId: process.env.SLACK_CLIENT_ID || process.env.VITE_SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
  },
  'google-drive': {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    clientId: process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  'onedrive': {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: [
      'https://graph.microsoft.com/Files.Read.All',
      'https://graph.microsoft.com/User.Read',
      'offline_access',
    ],
    clientId: process.env.MICROSOFT_CLIENT_ID || process.env.VITE_MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  },
  'dropbox': {
    authUrl: 'https://www.dropbox.com/oauth2/authorize',
    tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
    scopes: [
      'files.metadata.read',
      'files.content.read',
    ],
    clientId: process.env.DROPBOX_CLIENT_ID || process.env.VITE_DROPBOX_CLIENT_ID,
    clientSecret: process.env.DROPBOX_CLIENT_SECRET,
  },
};

/**
 * Initiate OAuth flow
 * GET /api/oauth/:service/authorize
 */
router.get('/:service/authorize', requireAuth, (req, res) => {
  const { service } = req.params;
  const userId = req.auth.user.id;
  
  const config = OAUTH_CONFIG[service];
  if (!config) {
    return res.status(400).json({ error: 'Invalid service' });
  }
  
  if (!config.clientId) {
    return res.status(500).json({ 
      error: `${service} OAuth not configured. Set ${service === 'gmail' ? 'GOOGLE' : service.toUpperCase()}_CLIENT_ID environment variable.` 
    });
  }
  
  // Build callback URL - use NGROK_URL or BASE_URL if set, otherwise use request host
  const baseUrl = process.env.NGROK_URL || process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${baseUrl}/api/oauth/${service}/callback`;
  
  // Generate state token (includes userId for verification)
  const state = Buffer.from(JSON.stringify({ 
    userId, 
    timestamp: Date.now(),
    nonce: Math.random().toString(36).substring(7)
  })).toString('base64');
  
  // Store state in session or temporary storage (for production, use Redis)
  // For now, we'll validate the userId on callback
  
  // Build authorization URL
  // Note: Slack OAuth v2 uses 'user_scope' for user tokens, not 'scope'
  const scopeParam = service === 'slack' ? 'user_scope' : 'scope';
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    [scopeParam]: config.scopes.join(' '),
    state,
    access_type: service === 'gmail' || service === 'google-drive' ? 'offline' : undefined,
    prompt: service === 'gmail' || service === 'google-drive' ? 'consent' : undefined,
    token_access_type: service === 'dropbox' ? 'offline' : undefined,
  });
  
  // Remove undefined values
  Object.keys(Object.fromEntries(params)).forEach(key => {
    if (params.get(key) === 'undefined') {
      params.delete(key);
    }
  });
  
  const authUrl = `${config.authUrl}?${params.toString()}`;
  
  console.log(`[OAuth] Redirecting to ${service} authorization:`, authUrl);
  res.redirect(authUrl);
});

/**
 * OAuth callback handler
 * GET /api/oauth/:service/callback
 */
router.get('/:service/callback', async (req, res) => {
  const { service } = req.params;
  const { code, state, error, error_description } = req.query;
  
  // Handle OAuth errors
  if (error) {
    console.error(`[OAuth] ${service} authorization error:`, error, error_description);
    return res.redirect(`/api/oauth/complete?success=false&service=${service}&error=${encodeURIComponent(error_description || error)}`);
  }
  
  if (!code || !state) {
    return res.redirect(`/api/oauth/complete?success=false&service=${service}&error=Missing authorization code`);
  }
  
  const config = OAUTH_CONFIG[service];
  if (!config) {
    return res.redirect(`/api/oauth/complete?success=false&service=${service}&error=Invalid service`);
  }
  
  try {
    // Decode and validate state
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { userId, timestamp } = stateData;
    
    // Check if state is not too old (15 minutes)
    if (Date.now() - timestamp > 15 * 60 * 1000) {
      return res.redirect(`/api/oauth/complete?success=false&service=${service}&error=Authorization expired. Please try again.`);
    }
    
    // Exchange code for tokens - use same base URL as authorization
    const baseUrl = process.env.NGROK_URL || process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${baseUrl}/api/oauth/${service}/callback`;
    
    const tokenParams = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    
    console.log(`[OAuth] Exchanging code for ${service} tokens...`);
    
    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: tokenParams.toString(),
    });
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error(`[OAuth] Token exchange failed:`, errorText);
      return res.redirect(`/api/oauth/complete?success=false&service=${service}&error=Failed to exchange authorization code`);
    }
    
    const tokens = await tokenResponse.json();
    
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
    
    console.log(`[OAuth] Successfully obtained ${service} tokens`);
    
    // Encrypt tokens
    const { encrypted } = encryptOAuthTokens({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
      scopes: config.scopes,
    }, userId);
    
    // Calculate token expiration
    const expiresAt = expiresIn 
      ? new Date(Date.now() + expiresIn * 1000)
      : null;
    
    // Store connection in database
    const pool = getPool();
    await pool.query(
      `INSERT INTO workspace_connections 
       (user_id, connection_name, connection_type, service_name, encrypted_credentials, 
        token_expires_at, scopes, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id, service_name) 
       DO UPDATE SET
         encrypted_credentials = EXCLUDED.encrypted_credentials,
         token_expires_at = EXCLUDED.token_expires_at,
         scopes = EXCLUDED.scopes,
         status = EXCLUDED.status,
         updated_at = CURRENT_TIMESTAMP`,
      [
        userId,
        `${service.charAt(0).toUpperCase() + service.slice(1)} Account`,
        `oauth2_${service}`,
        service,
        encrypted,
        expiresAt,
        config.scopes,
        'active',
        JSON.stringify({ connected_at: new Date().toISOString() })
      ]
    );
    
    console.log(`[OAuth] Saved ${service} connection for user ${userId}`);
    
    // Redirect to completion page which will show success and auto-close the popup
    res.redirect(`/api/oauth/complete?success=true&service=${service}`);
    
  } catch (error) {
    console.error('[OAuth] Callback error:', error);
    res.redirect(`/api/oauth/complete?success=false&service=${service}&error=${encodeURIComponent(error.message || 'Connection failed')}`);
  }
});

/**
 * OAuth completion page
 * GET /api/oauth/complete
 * Shows success/error message and auto-closes popup
 */
router.get('/complete', (req, res) => {
  const success = req.query.success === 'true';
  const service = req.query.service || '';
  const error = req.query.error || '';
  
  const serviceName = service 
    ? service.charAt(0).toUpperCase() + service.slice(1).replace(/-/g, ' ')
    : 'Service';
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${success ? 'Connection Successful' : 'Connection Failed'}</title>
      <meta name="color-scheme" content="light dark">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        /* Light theme (default) */
        :root {
          --bg-color: #f3f4f6;
          --card-bg: white;
          --card-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
          --badge-bg: rgba(59, 130, 246, 0.1);
          --badge-color: #2563eb;
          --title-color: #1f2937;
          --text-color: #6b7280;
          --closing-color: #9ca3af;
          --spinner-border: rgba(156, 163, 175, 0.3);
          --spinner-color: #9ca3af;
          --btn-bg: #f3f4f6;
          --btn-color: #374151;
          --btn-border: #e5e7eb;
          --btn-hover-bg: #e5e7eb;
          --error-bg: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        }
        
        /* Dark theme */
        @media (prefers-color-scheme: dark) {
          :root {
            --bg-color: #151C24;
            --card-bg: rgba(255, 255, 255, 0.05);
            --card-shadow: none;
            --badge-bg: rgba(255, 255, 255, 0.1);
            --badge-color: #93c5fd;
            --title-color: #ffffff;
            --text-color: #94a3b8;
            --closing-color: #64748b;
            --spinner-border: rgba(100, 116, 139, 0.3);
            --spinner-color: #64748b;
            --btn-bg: rgba(255, 255, 255, 0.1);
            --btn-color: #e2e8f0;
            --btn-border: rgba(255, 255, 255, 0.1);
            --btn-hover-bg: rgba(255, 255, 255, 0.15);
          }
        }
        
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
          display: flex; 
          justify-content: center; 
          align-items: center; 
          min-height: 100vh; 
          background: var(--bg-color);
          transition: background 0.2s;
        }
        .card { 
          text-align: center; 
          padding: 40px 32px; 
          background: var(--card-bg);
          border-radius: 16px; 
          backdrop-filter: blur(12px);
          box-shadow: var(--card-shadow);
          max-width: 380px;
          width: 90%;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 4px 10px;
          background: var(--badge-bg);
          border-radius: 8px;
          font-size: 11px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--badge-color);
          margin-bottom: 24px;
        }
        .badge-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }
        .icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: scaleIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .icon.success {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          box-shadow: 0 8px 24px rgba(16, 185, 129, 0.3);
        }
        .icon.error {
          background: var(--error-bg);
          box-shadow: 0 8px 24px rgba(239, 68, 68, 0.3);
        }
        .icon svg {
          width: 32px;
          height: 32px;
          stroke: white;
          stroke-width: 3;
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .icon.success svg {
          animation: drawCheck 0.4s ease-out 0.2s forwards;
          stroke-dasharray: 24;
          stroke-dashoffset: 24;
        }
        @keyframes scaleIn {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes drawCheck {
          to { stroke-dashoffset: 0; }
        }
        h1 { 
          color: var(--title-color); 
          margin-bottom: 8px; 
          font-size: 18px; 
          font-weight: 600;
          letter-spacing: -0.025em;
        }
        p { 
          color: var(--text-color); 
          font-size: 14px; 
          line-height: 1.5;
        }
        .error-details {
          margin-top: 16px;
          padding: 12px;
          background: rgba(239, 68, 68, 0.1);
          border-radius: 8px;
          font-size: 13px;
          color: var(--text-color);
          word-break: break-word;
        }
        .closing { 
          color: var(--closing-color); 
          font-size: 13px; 
          margin-top: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .closing-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid var(--spinner-border);
          border-top-color: var(--spinner-color);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .manual-close {
          display: inline-block;
          margin-top: 20px;
          padding: 10px 24px;
          background: var(--btn-bg);
          color: var(--btn-color);
          text-decoration: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid var(--btn-border);
          transition: all 0.2s;
        }
        .manual-close:hover {
          background: var(--btn-hover-bg);
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">
          <span class="badge-dot"></span>
          Project Hands-Off
        </div>
        <div class="icon ${success ? 'success' : 'error'}">
          ${success ? `
          <svg viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          ` : `
          <svg viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
          `}
        </div>
        <h1>${success ? 'Connection Successful!' : 'Connection Failed'}</h1>
        <p>${success 
          ? `${serviceName} has been connected to your workspace.` 
          : 'There was an error connecting your account.'
        }</p>
        ${!success && error ? `<div class="error-details">${error}</div>` : ''}
        <p class="closing">
          <span class="closing-spinner"></span>
          Closing automatically...
        </p>
        <button class="manual-close" onclick="window.close()">Close Window</button>
      </div>
      <script>
        // Auto-close the popup after a short delay
        setTimeout(() => {
          window.close();
        }, ${success ? 1500 : 3000});
      </script>
    </body>
    </html>
  `);
});

/**
 * Test connection (verify tokens still work)
 * POST /api/oauth/:service/test
 */
router.post('/:service/test', requireAuth, async (req, res) => {
  const { service } = req.params;
  const userId = req.auth.user.id;
  
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT encrypted_credentials FROM workspace_connections WHERE user_id = $1 AND service_name = $2 AND status = $3',
      [userId, service, 'active']
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }
    
    const tokens = decryptOAuthTokens(rows[0].encrypted_credentials, userId);
    
    // Test the token with a simple API call
    let testUrl;
    switch (service) {
      case 'gmail':
        testUrl = 'https://www.googleapis.com/gmail/v1/users/me/profile';
        break;
      case 'outlook':
        testUrl = 'https://graph.microsoft.com/v1.0/me';
        break;
      case 'slack':
        testUrl = 'https://slack.com/api/auth.test';
        break;
      default:
        return res.status(400).json({ error: 'Invalid service' });
    }
    
    const testResponse = await fetch(testUrl, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
      },
    });
    
    if (testResponse.ok) {
      res.json({ success: true, message: 'Connection is working' });
    } else {
      res.status(401).json({ success: false, message: 'Connection expired or invalid' });
    }
    
  } catch (error) {
    console.error('[OAuth] Test connection error:', error);
    res.status(500).json({ error: 'Failed to test connection' });
  }
});

export default router;

