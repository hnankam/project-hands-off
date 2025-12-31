# Security Update: Credentials Management

## Overview
This update removes credential passwords/secrets from the agent context to prevent them from being sent to LLM providers (OpenAI, Anthropic, etc.). This is a critical security improvement.

## Changes Made

### ✅ Step 1: Updated ChatInner.tsx
**File:** `pages/side-panel/src/components/chat/ChatInner.tsx`

**Changes:**
- Removed `password` field from `SelectedCredentialsContext`
- Updated description to clarify that agent only sees metadata
- Added security notes explaining that credentials must be used via server-side actions

**Before:**
```typescript
selectedCredentials: credentials.map(cred => ({
  id: cred.id,
  name: cred.name,
  type: cred.type,
  key: cred.key,
  password: cred.password,  // ❌ SECURITY RISK
}))
```

**After:**
```typescript
selectedCredentials: credentials.map(cred => ({
  id: cred.id,
  name: cred.name,
  type: cred.type,
  key: cred.key,  // Public identifier only
  // ✅ password field removed
}))
```

### ✅ Step 2: Updated ContextSelector.tsx
**File:** `pages/side-panel/src/components/selectors/ContextSelector.tsx`

**Changes:**
1. Removed `CredentialWithSecret` interface
2. Changed prop from `onCredentialsWithSecretsChange` to `onCredentialsWithMetadataChange`
3. Updated `handleToggleCredential` to call `/metadata` endpoint instead of `/bulk`
4. Updated function to only fetch metadata (no passwords)

**Key Changes:**
```typescript
// Removed interface
interface CredentialWithSecret extends Credential {
  password?: string | null;
}

// Updated prop type
onCredentialsWithMetadataChange?: (credentials: Credential[]) => void;

// Changed API endpoint
const response = await fetch(`${baseURL}/api/workspace/credentials/metadata`, {
  // ... changed from /bulk
});
```

### ✅ Step 3: Updated CustomInputV2.tsx
**File:** `pages/side-panel/src/components/chat/CustomInputV2.tsx`

**Changes:**
1. Renamed state variable from `localCredentialsWithSecrets` to `localCredentialsMetadata`
2. Updated prop name from `onCredentialsWithSecretsChange` to `onCredentialsWithMetadataChange`

**Before:**
```typescript
const [localCredentialsWithSecrets, setLocalCredentialsWithSecrets] = useState<any[]>([]);
```

**After:**
```typescript
const [localCredentialsMetadata, setLocalCredentialsMetadata] = useState<any[]>([]);
```

### ✅ Step 4: Added Metadata Endpoint
**File:** `copilot-runtime-server/routes/workspace.js`

**Changes:**
1. Added new `/api/workspace/credentials/metadata` endpoint (secure)
2. Added deprecation warning to `/api/workspace/credentials/bulk` endpoint

**New Endpoint:**
```javascript
/**
 * POST /api/workspace/credentials/metadata
 * Returns only public metadata, never passwords/secrets
 */
router.post('/credentials/metadata', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, type, key, created_at, updated_at
     FROM workspace_credentials
     WHERE user_id = $1 AND id = ANY($2::uuid[])`,
    [userId, ids]
  );
  
  // ✅ Never includes encrypted_data or decrypts passwords
  res.json({ credentials: rows });
});
```

**Updated Bulk Endpoint:**
```javascript
/**
 * POST /api/workspace/credentials/bulk - DEPRECATED
 * ⚠️ This endpoint returns decrypted passwords
 * Should only be used server-side, never from frontend
 */
router.post('/credentials/bulk', requireAuth, async (req, res) => {
  console.warn('[SECURITY] /credentials/bulk endpoint accessed');
  // ... existing code with security warning
});
```

## Security Improvements

### Before (Insecure) ❌
```
User selects credential → Frontend fetches password → Sent to LLM provider
                                                    ↓
                                        OpenAI/Anthropic sees password
```

### After (Secure) ✅
```
User selects credential → Frontend fetches metadata only → Sent to LLM provider
                                                          ↓
                                              LLM sees: {id, name, type, key}
                                              NO PASSWORD ✅

When agent needs to use credential:
  Agent → Server-side action → Backend fetches password → Makes API call
                                                        ↓
                                            Password never leaves server
```

## Testing Checklist

- [ ] Verify credentials appear in context selector
- [ ] Verify selecting credentials works
- [ ] Verify agent can see credential metadata (name, type, ID)
- [ ] Verify agent CANNOT see passwords in context
- [ ] Verify `/api/workspace/credentials/metadata` endpoint works
- [ ] Verify no TypeScript errors
- [ ] Verify no console errors
- [ ] Test credential selection in chat input

## Next Steps (Future Implementation)

### Step 5: Add Server-Side Credential Action
To allow agents to actually USE credentials, implement a server-side action:

```javascript
// In postgres-agent-runner.js
{
  name: 'use_credential',
  description: 'Make an authenticated API call using a stored credential',
  parameters: {
    credential_id: 'string',
    api_config: {
      url: 'string',
      method: 'GET|POST|PUT|DELETE',
      headers: 'object',
      body: 'object'
    }
  },
  handler: async ({ credential_id, api_config }, { userId }) => {
    // 1. Fetch credential from database (server-side)
    // 2. Decrypt password (server-side)
    // 3. Make authenticated API call
    // 4. Return result (without credential)
    // 5. Log usage for audit
  }
}
```

### Step 6: Add Audit Logging
```sql
CREATE TABLE credential_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID REFERENCES workspace_credentials(id),
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  api_endpoint TEXT,
  ip_address INET,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
```

### Step 7: Add Rate Limiting
Prevent credential abuse by limiting usage per minute/hour.

## Migration Notes

- **No database changes required** - This is purely a frontend/API change
- **Backward compatible** - Old `/bulk` endpoint still works (with warning)
- **No user action required** - Changes are transparent to users
- **No data loss** - All credentials remain encrypted in database

## Security Benefits

✅ Credentials never sent to LLM providers  
✅ Reduced risk of credential leakage  
✅ Compliant with security best practices  
✅ Maintains full functionality (via server-side actions)  
✅ Audit trail ready (when Step 6 implemented)  
✅ No additional infrastructure needed  

## Files Modified

1. `pages/side-panel/src/components/chat/ChatInner.tsx`
2. `pages/side-panel/src/components/selectors/ContextSelector.tsx`
3. `pages/side-panel/src/components/chat/CustomInputV2.tsx`
4. `copilot-runtime-server/routes/workspace.js`

## Verification Commands

```bash
# Check for any remaining references to secrets
grep -r "onCredentialsWithSecretsChange" pages/side-panel/src/
grep -r "CredentialWithSecret" pages/side-panel/src/
grep -r "localCredentialsWithSecrets" pages/side-panel/src/

# Should return no results (except in this documentation)
```

## Rollback Plan

If issues arise, the `/bulk` endpoint still exists and can be re-enabled by:
1. Reverting prop names back to `onCredentialsWithSecretsChange`
2. Changing API calls back to `/bulk` endpoint
3. Re-adding password field to context

However, this is **NOT RECOMMENDED** for security reasons.

---

**Status:** ✅ Steps 1-4 Complete  
**Next:** Implement Step 5 (use_credential server-side action)  
**Priority:** High - Enables agents to actually use credentials securely

