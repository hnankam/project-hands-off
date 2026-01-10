/**
 * Credential key management utilities
 * 
 * Handles generation of unique credential keys with suffixes and
 * extraction of display names from keys for UI presentation.
 * 
 * Format: {user_input}_{4_char_suffix}
 * Example: "production_7a3f" -> Display: "production"
 */

/**
 * Generate a random 4-character alphanumeric suffix (lowercase)
 * 
 * @returns {string} 4-character suffix (e.g., "7a3f")
 */
export function generateSuffix() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return suffix;
}

/**
 * Generate a unique credential key with suffix
 * 
 * @param {string} baseName - User's desired name (e.g., "Databricks_Host")
 * @param {string[]} existingKeys - Array of existing credential keys to check uniqueness
 * @param {number} maxAttempts - Maximum number of generation attempts (default: 100)
 * @returns {string} Unique key with suffix (e.g., "Databricks_Host_7a3f")
 * @throws {Error} If unable to generate unique key after maxAttempts
 */
export function generateCredentialKey(baseName, existingKeys = [], maxAttempts = 100) {
  // Sanitize base name: trim whitespace but preserve case
  const sanitized = baseName.trim();
  
  if (!sanitized) {
    throw new Error('Base name cannot be empty');
  }
  
  // Create case-insensitive set for collision detection
  const existingKeysLower = new Set(existingKeys.map(k => k.toLowerCase()));
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const suffix = generateSuffix();
    const uniqueKey = `${sanitized}_${suffix}`;
    
    // Check case-insensitively to prevent similar keys
    if (!existingKeysLower.has(uniqueKey.toLowerCase())) {
      return uniqueKey;
    }
  }
  
  throw new Error(`Failed to generate unique credential key after ${maxAttempts} attempts`);
}

/**
 * Extract display name from credential key by removing suffix
 * 
 * @param {string} uniqueKey - Full key with suffix (e.g., "production_7a3f")
 * @returns {string} Display name without suffix (e.g., "production")
 */
export function extractDisplayName(uniqueKey) {
  if (!uniqueKey) {
    return '';
  }
  
  // Pattern: match everything before the last underscore followed by exactly 4 alphanumeric chars
  const match = uniqueKey.match(/^(.+)_[a-z0-9]{4}$/);
  
  if (match) {
    return match[1];
  }
  
  // Fallback: if pattern doesn't match, return as-is
  // (shouldn't happen if all keys are properly generated)
  return uniqueKey;
}

/**
 * Extract the suffix from a credential key
 * 
 * @param {string} uniqueKey - Full key with suffix (e.g., "production_7a3f")
 * @returns {string|null} The 4-character suffix or null if not found
 */
export function extractSuffix(uniqueKey) {
  if (!uniqueKey) {
    return null;
  }
  
  const match = uniqueKey.match(/^.+_([a-z0-9]{4})$/);
  return match ? match[1] : null;
}

/**
 * Update credential key with new base name, preserving suffix
 * Used when editing a credential to keep the same unique identifier
 * 
 * @param {string} oldKey - Current key (e.g., "Databricks_Host_7a3f")
 * @param {string} newBaseName - New name from user (e.g., "DataBricks_Prod")
 * @param {string[]} existingKeys - Array of existing keys to check collisions
 * @returns {string} Updated key with same suffix (e.g., "DataBricks_Prod_7a3f")
 * @throws {Error} If new key would collide with existing key
 */
export function updateCredentialKey(oldKey, newBaseName, existingKeys = []) {
  const sanitized = newBaseName.trim();
  
  if (!sanitized) {
    throw new Error('Base name cannot be empty');
  }
  
  // Extract the old suffix
  const oldSuffix = extractSuffix(oldKey);
  
  if (!oldSuffix) {
    // If old key doesn't have suffix (legacy data), generate new key with suffix
    return generateCredentialKey(sanitized, existingKeys);
  }
  
  // Create new key with same suffix, preserving user's case
  const newKey = `${sanitized}_${oldSuffix}`;
  
  // Check if new key would collide with a different existing credential (case-insensitive)
  // (It's OK if it matches the oldKey itself, even in different case)
  const existingKeysLower = existingKeys.map(k => k.toLowerCase());
  const oldKeyLower = oldKey.toLowerCase();
  const newKeyLower = newKey.toLowerCase();
  
  if (existingKeysLower.includes(newKeyLower) && newKeyLower !== oldKeyLower) {
    throw new Error(`Credential key "${sanitized}" already exists`);
  }
  
  return newKey;
}

/**
 * Check if a base name already exists (has any key starting with base name + underscore)
 * Used for validation before creating new credentials
 * Performs case-insensitive check to prevent similar keys
 * 
 * @param {string} baseName - User's desired name
 * @param {string[]} existingKeys - Array of existing credential keys
 * @returns {boolean} True if base name is already in use
 */
export function baseNameExists(baseName, existingKeys = []) {
  const sanitized = baseName.trim();
  // Escape special regex characters and create case-insensitive pattern
  const escapedBase = sanitized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedBase}_[a-z0-9]{4}$`, 'i'); // 'i' flag for case-insensitive
  
  return existingKeys.some(key => pattern.test(key));
}

/**
 * Validate credential key format
 * 
 * @param {string} key - Key to validate
 * @returns {boolean} True if key matches expected format
 */
export function isValidKeyFormat(key) {
  if (!key || typeof key !== 'string') {
    return false;
  }
  
  return /^.+_[a-z0-9]{4}$/.test(key);
}
