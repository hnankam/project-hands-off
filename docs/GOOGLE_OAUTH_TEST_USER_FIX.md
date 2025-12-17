# Google OAuth "Access Blocked" Error Fix

## Error Message

```
Access blocked: elizbeth-nontelepathic-sonya.ngrok-free.dev has not completed the Google verification process

Error 403: access_denied
```

## Root Cause

When using Google OAuth in **testing mode** (not verified), you must explicitly add test users who are allowed to connect. Your email (`chrisnankam24@gmail.com`) needs to be added to the allowed test users list.

## Solution: Add Test User

### Step 1: Go to OAuth Consent Screen

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (the one with Gmail/Google Drive OAuth)
3. Navigate to **APIs & Services** → **OAuth consent screen**

### Step 2: Add Test Users

1. Scroll down to the **Test users** section
2. Click **+ ADD USERS**
3. Enter your email: `chrisnankam24@gmail.com`
4. Click **SAVE**

### Step 3: Also Add Ngrok Redirect URI

Since you're using ngrok (`elizbeth-nontelepathic-sonya.ngrok-free.dev`), you need to add the ngrok redirect URI:

1. Go to **APIs & Services** → **Credentials**
2. Click on your OAuth 2.0 Client ID
3. Under **Authorized redirect URIs**, add:
   ```
   https://elizbeth-nontelepathic-sonya.ngrok-free.dev/api/oauth/gmail/callback
   ```
4. Click **SAVE**

### Step 4: Update Environment Variable (if needed)

Make sure your `.env` has the ngrok URL:

```bash
# In copilot-runtime-server/.env
NGROK_URL=https://elizbeth-nontelepathic-sonya.ngrok-free.dev
```

### Step 5: Try Again

1. Go back to your app
2. Click **Connect** for Gmail
3. The OAuth flow should now work!

## For Google Drive Connections

If you also want to connect Google Drive, repeat the same steps:

1. Add test user in OAuth consent screen
2. Add ngrok redirect URI for Google Drive:
   ```
   https://elizbeth-nontelepathic-sonya.ngrok-free.dev/api/oauth/google-drive/callback
   ```

## Alternative: Publish App (Not Recommended for Testing)

Instead of adding test users, you could publish your app for verification, but this:
- Takes weeks for Google to review
- Requires detailed security assessment
- Is overkill for personal/development use

**Recommendation**: Just add yourself as a test user!

## Testing vs Production

### Testing Mode (Current)
- ✅ Fast setup
- ✅ No verification needed
- ✅ Perfect for development
- ⚠️ Requires adding each user manually
- ⚠️ Limited to 100 test users

### Production Mode (After Verification)
- ✅ Any user can connect
- ✅ No test user limit
- ⚠️ Requires Google verification
- ⚠️ Takes 4-6 weeks
- ⚠️ Requires security review

For your use case (personal workspace connections), **testing mode is perfect**!

## Troubleshooting

### Error persists after adding test user?
- Wait 1-2 minutes for Google's cache to update
- Try in an incognito window
- Clear browser cookies for Google

### Multiple Google accounts?
- Make sure you're signing in with the test user email
- If you have multiple Google accounts, choose the right one during OAuth

### Still seeing the error?
Double-check:
- ✅ Correct email added as test user
- ✅ Ngrok URL matches in redirect URIs
- ✅ Using the same Google account that's added as test user

## Summary

**Quick Steps:**
1. Go to Google Cloud Console → OAuth consent screen
2. Add `chrisnankam24@gmail.com` as test user
3. Go to Credentials → Add ngrok redirect URI
4. Try connecting Gmail again

That's it! 🎉

