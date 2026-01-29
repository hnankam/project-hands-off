/**
 * Encryption utilities for workspace credentials
 * Uses AES-256-GCM for secure credential storage
 */

import crypto from 'crypto';

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

/**
 * Derive encryption key from master secret and organization ID
 * Uses PBKDF2 for key derivation
 * 
 * @param {string} organizationId - Organization ID used as additional entropy
 * @returns {Buffer} 32-byte encryption key
 */
function deriveKey(organizationId) {
  // Master secret from environment (should be 32+ characters)
  const masterSecret = process.env.ENCRYPTION_MASTER_SECRET || 'default-secret-change-in-production';
  
  // CRITICAL: Fail fast in production if encryption secret is not set
  const isProduction = process.env.NODE_ENV === 'production';
  if (masterSecret === 'default-secret-change-in-production' && isProduction) {
    throw new Error(
      'ENCRYPTION_MASTER_SECRET must be set to a secure value in production. ' +
      'Generate a strong secret with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }
  
  if (masterSecret === 'default-secret-change-in-production') {
    console.warn('⚠️  WARNING: Using default encryption secret. Set ENCRYPTION_MASTER_SECRET environment variable in production!');
  }
  
  // Use organization ID as salt for key derivation
  const salt = crypto.createHash('sha256').update(organizationId || 'global').digest();
  
  // Derive key using PBKDF2
  const key = crypto.pbkdf2Sync(
    masterSecret,
    salt,
    ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );
  
  return key;
}

/**
 * Encrypt credential data
 * 
 * @param {string|object} plaintext - Credential data to encrypt (will be JSON stringified if object)
 * @param {string} organizationId - Organization ID for key derivation
 * @returns {Object} Object with encrypted buffer and metadata
 * @returns {Buffer} returns.encrypted - Encrypted data (IV + authTag + ciphertext)
 * @returns {string} returns.algorithm - Encryption algorithm used
 */
function encryptCredential(plaintext, organizationId) {
  try {
    // Convert to string if object
    const dataString = typeof plaintext === 'object' 
      ? JSON.stringify(plaintext) 
      : String(plaintext);
    
    // Derive encryption key
    const key = deriveKey(organizationId);
    
    // Generate random IV
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt data
    let encrypted = cipher.update(dataString, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // Get auth tag
    const authTag = cipher.getAuthTag();
    
    // Combine IV + authTag + encrypted data into single buffer
    const combined = Buffer.concat([iv, authTag, encrypted]);
    
    return {
      encrypted: combined,
      algorithm: ALGORITHM
    };
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt credential: ' + error.message);
  }
}

/**
 * Decrypt credential data
 * 
 * @param {Buffer} encryptedData - Encrypted data (IV + authTag + ciphertext)
 * @param {string} organizationId - Organization ID for key derivation
 * @returns {string} Decrypted plaintext
 */
function decryptCredential(encryptedData, organizationId) {
  try {
    if (!Buffer.isBuffer(encryptedData)) {
      throw new Error('Encrypted data must be a Buffer');
    }
    
    if (encryptedData.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error('Invalid encrypted data format');
    }
    
    // Extract IV, authTag, and encrypted data
    const iv = encryptedData.slice(0, IV_LENGTH);
    const authTag = encryptedData.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = encryptedData.slice(IV_LENGTH + AUTH_TAG_LENGTH);
    
    // Derive encryption key
    const key = deriveKey(organizationId);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt data
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt credential: ' + error.message);
  }
}

/**
 * Encrypt OAuth2 tokens
 * 
 * @param {Object} tokens - OAuth tokens object
 * @param {string} tokens.access_token - Access token
 * @param {string} [tokens.refresh_token] - Refresh token (optional)
 * @param {number} [tokens.expires_in] - Token expiration in seconds (optional)
 * @param {string[]} [tokens.scopes] - OAuth scopes (optional)
 * @param {string} organizationId - Organization ID for key derivation
 * @returns {Object} Encrypted tokens and metadata
 */
function encryptOAuthTokens(tokens, organizationId) {
  // Calculate expires_at timestamp if expires_in is provided
  // Accept both expires_at (timestamp) and expires_in (seconds) for flexibility
  let expiresAt = tokens.expires_at || null;
  if (!expiresAt && tokens.expires_in) {
    expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;
  }
  
  const tokenData = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || null,
    expires_at: expiresAt,  // Store as timestamp for consistent checking
    expires_in: tokens.expires_in || null,  // Keep for backwards compatibility
    scopes: tokens.scopes || tokens.scope?.split(' ') || [],
    encrypted_at: new Date().toISOString()
  };
  
  // Debug logging for token storage
  console.log('[Encryption] Storing OAuth tokens:');
  console.log('[Encryption]   - access_token present:', !!tokenData.access_token);
  console.log('[Encryption]   - refresh_token present:', !!tokenData.refresh_token);
  console.log('[Encryption]   - expires_at:', tokenData.expires_at ? new Date(tokenData.expires_at * 1000).toISOString() : 'not set');
  
  return encryptCredential(tokenData, organizationId);
}

/**
 * Decrypt OAuth2 tokens
 * 
 * @param {Buffer} encryptedData - Encrypted token data
 * @param {string} organizationId - Organization ID for key derivation
 * @returns {Object} Decrypted tokens object
 */
function decryptOAuthTokens(encryptedData, organizationId) {
  const decrypted = decryptCredential(encryptedData, organizationId);
  const tokens = JSON.parse(decrypted);
  
  // Debug logging for token retrieval
  console.log('[Encryption] Retrieved OAuth tokens:');
  console.log('[Encryption]   - access_token present:', !!tokens.access_token);
  console.log('[Encryption]   - refresh_token present:', !!tokens.refresh_token);
  console.log('[Encryption]   - expires_at:', tokens.expires_at ? new Date(tokens.expires_at * 1000).toISOString() : 'not set');
  
  // Warn if refresh token is missing - this will cause issues when access token expires
  if (!tokens.refresh_token) {
    console.warn('[Encryption] WARNING: No refresh_token stored! Token refresh will fail when access_token expires.');
    console.warn('[Encryption] The user may need to re-authenticate to get a new refresh token.');
  }
  
  return tokens;
}

/**
 * Check if OAuth token is expired
 * 
 * @param {Date|string} expiresAt - Token expiration timestamp
 * @param {number} bufferMinutes - Buffer time in minutes (default 5)
 * @returns {boolean} True if token is expired or will expire soon
 */
function isTokenExpired(expiresAt, bufferMinutes = 5) {
  if (!expiresAt) {
    return false; // No expiration set
  }
  
  const expirationTime = new Date(expiresAt).getTime();
  const currentTime = Date.now();
  const bufferMs = bufferMinutes * 60 * 1000;
  
  return currentTime >= (expirationTime - bufferMs);
}

export {
  encryptCredential,
  decryptCredential,
  encryptOAuthTokens,
  decryptOAuthTokens,
  isTokenExpired,
  // Export for testing
  deriveKey as _deriveKey,
};

