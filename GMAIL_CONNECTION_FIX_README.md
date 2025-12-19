# Gmail Connection Fix - Quick Start

## What Happened?

Your Gmail OAuth credentials in the database are corrupted due to a previous bug. The data is stored as a Buffer (correct type), but the **contents of the Buffer are invalid**, so decryption fails.

## Quick Fix (Choose ONE)

### ✅ Option 1: SQL Script (Recommended - Fastest)

```bash
cd /Users/hnankam/Downloads/data/project-hands-off
psql $DATABASE_URL -f fix-gmail-connection.sql
```

### ✅ Option 2: Node.js Utility

```bash
cd /Users/hnankam/Downloads/data/project-hands-off
node copilot-runtime-server/utils/fix-corrupted-connections.js
```

### ✅ Option 3: Manual SQL

Run this in your database client:

```sql
UPDATE workspace_connections
SET status = 'invalid', updated_at = CURRENT_TIMESTAMP
WHERE service_name = 'gmail' AND status = 'active';
```

## After Running the Fix

1. **Restart your server** (important!)
2. **Open the app** - Gmail will show as disconnected
3. **Click to reconnect Gmail** - complete OAuth flow
4. **Done!** - Credentials now stored correctly

## What This Does

- Marks your existing Gmail connection as 'invalid'
- Forces you to reconnect through OAuth
- New credentials are stored in the correct format
- Token refresh will work properly going forward

## Verify It Worked

After reconnecting, the logs should show:

```
✅ [Workspace Debug] Is Buffer from DB? true
✅ [OAuth Debug] Stored credentials in database
✅ No decryption errors!
```

## Need Help?

See detailed explanation in: `OAUTH_TOKEN_REFRESH_FIX.md`

