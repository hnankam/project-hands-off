/**
 * OAuth Token Refresh Utility
 * Handles automatic refresh of expired OAuth2 access tokens
 */

import fetch from 'node-fetch';

/**
 * Refresh an expired Google OAuth token
 * @param {string} refreshToken - The refresh token
 * @param {string} clientId - Google OAuth client ID
 * @param {string} clientSecret - Google OAuth client secret
 * @returns {Promise<object>} New tokens
 */
export async function refreshGoogleToken(refreshToken, clientId, clientSecret) {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(error);
      } catch (e) {
        errorData = { error: error };
      }
      
      // Check for specific error cases that require re-authentication
      if (errorData.error === 'invalid_grant') {
        const customError = new Error(`Token refresh failed: ${response.status} - ${error}`);
        customError.requiresReauth = true; // Flag that user needs to re-authenticate
        customError.errorCode = 'invalid_grant';
        throw customError;
      }
      
      throw new Error(`Token refresh failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    
    return {
      access_token: data.access_token,
      expires_in: data.expires_in,
      scope: data.scope,
      token_type: data.token_type,
      // Keep the original refresh_token (not returned in response)
      refresh_token: refreshToken,
    };
  } catch (error) {
    console.error('[OAuth Refresh] Error refreshing Google token:', error);
    
    // If the error has requiresReauth flag, preserve it
    if (error.requiresReauth) {
      throw error;
    }
    
    throw error;
  }
}

/**
 * Refresh an expired Slack OAuth token
 * @param {string} refreshToken - The refresh token
 * @param {string} clientId - Slack OAuth client ID
 * @param {string} clientSecret - Slack OAuth client secret
 * @returns {Promise<object>} New tokens
 */
export async function refreshSlackToken(refreshToken, clientId, clientSecret) {
  try {
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }
    
    return {
      access_token: data.authed_user?.access_token || data.access_token,
      expires_in: data.expires_in,
      refresh_token: data.refresh_token || refreshToken,
      scope: data.scope,
    };
  } catch (error) {
    console.error('[OAuth Refresh] Error refreshing Slack token:', error);
    throw error;
  }
}

/**
 * Check if an access token is expired or about to expire
 * @param {number} expiresAt - Unix timestamp when token expires
 * @param {number} bufferSeconds - Refresh this many seconds before expiry (default: 300 = 5 minutes)
 * @returns {boolean} True if token needs refresh
 */
export function shouldRefreshToken(expiresAt, bufferSeconds = 300) {
  if (!expiresAt) {
    // If no expiry info, assume we should try with current token
    return false;
  }
  
  const now = Math.floor(Date.now() / 1000);
  const expiryWithBuffer = expiresAt - bufferSeconds;
  
  return now >= expiryWithBuffer;
}

/**
 * Calculate expiry timestamp from expires_in seconds
 * @param {number} expiresIn - Seconds until expiry
 * @returns {number} Unix timestamp of expiry
 */
export function calculateExpiryTimestamp(expiresIn) {
  return Math.floor(Date.now() / 1000) + expiresIn;
}

