# Firebase API Key Authentication (REST API)

## Overview

The backend now uses **Firebase Storage REST API with API key authentication**, matching the frontend approach. This eliminates the need for service account credentials or gcloud authentication.

## Key Changes

### What Changed
- ❌ **Removed**: `firebase-admin` SDK dependency
- ❌ **Removed**: Service account JSON key requirement
- ❌ **Removed**: Application Default Credentials requirement
- ✅ **Added**: Firebase Storage REST API implementation
- ✅ **Added**: Direct HTTP uploads using `requests` library
- ✅ **Added**: API key authentication (same as frontend)

### Benefits
1. **Simpler Setup**: No service account keys or gcloud auth needed
2. **Frontend Parity**: Uses same authentication method as frontend
3. **Easier Deployment**: Works everywhere without credential configuration
4. **No Special Permissions**: Uses public Firebase Storage rules

## How It Works

### Frontend (JavaScript)
```javascript
// Uses Firebase Web SDK
const storage = getStorage(app);
const storageRef = ref(storage, path);
await uploadString(storageRef, dataUrl, 'data_url');
const url = await getDownloadURL(storageRef);
```

### Backend (Python) - **NOW**
```python
# Uses Firebase Storage REST API
upload_url = f"https://firebasestorage.googleapis.com/v0/b/{bucket}/o?uploadType=media&name={path}"
response = requests.post(upload_url, data=image_bytes, headers={'Content-Type': 'image/png'})
public_url = f"https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encoded_path}?alt=media"
```

Both approaches:
- Use the same Firebase project
- Upload to the same storage bucket
- Generate publicly accessible URLs
- Require the same Firebase Storage rules

## Configuration

### Default Configuration (No Setup Needed)
The backend includes these defaults matching the frontend:

```python
API_KEY = 'AIzaSyCCLmP_BJd55Z_lkMQ02GEXPCv0un3_jPw'
PROJECT_ID = 'adbe-gcp0814'
STORAGE_BUCKET = 'adbe-gcp0814.firebasestorage.app'
AUTH_DOMAIN = 'adbe-gcp0814.firebaseapp.com'
```

### Optional Overrides
If needed, create `.env` file:
```bash
FIREBASE_PROJECT_ID=your-project
FIREBASE_STORAGE_BUCKET=your-bucket.firebasestorage.app
FIREBASE_API_KEY=your-api-key
```

## Firebase Storage Rules

The backend uploads require write permissions. Update your Firebase Storage rules:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Public read access
    match /{allPaths=**} {
      allow read: if true;
    }
    
    // Allow uploads to generations folder
    match /generations/{allPaths=**} {
      allow write: if true;  // Public write for image generation
    }
    
    // Restrict other folders
    match /screenshots/{allPaths=**} {
      allow write: if request.auth != null;  // Authenticated users only
    }
    match /attachments/{allPaths=**} {
      allow write: if request.auth != null;  // Authenticated users only
    }
  }
}
```

## Testing

Run the test script to verify:
```bash
python test_firebase.py
```

Expected output:
```
✅ Firebase Storage is reachable
✅ SUCCESS! Firebase is properly configured
```

## Migration Notes

### For Existing Deployments

**No migration needed!** The backend will work immediately with the new approach.

If you had previously set `FIREBASE_SERVICE_ACCOUNT_KEY`:
1. Remove it from your `.env` file
2. Remove any service account JSON files
3. No other changes needed

### Dependencies

Update requirements.txt:
```bash
pip install -r requirements.txt
```

**Removed:**
- `firebase-admin>=7.1.0`

**Added:**
- `requests>=2.31.0`
- `google-cloud-storage>=2.10.0` (for future enhancements)

## Security Considerations

### Public Write Access
The `/generations/` folder has public write access to allow the backend to upload images without authentication.

**Mitigation strategies:**
1. **Rate Limiting**: Implement rate limits in your backend API
2. **Validation**: Validate image content before upload
3. **Size Limits**: Enforce maximum file sizes
4. **Cleanup**: Implement automated cleanup of old images
5. **Monitoring**: Monitor storage usage and unusual activity

### API Key Exposure
The API key is included in the codebase with default values.

**Why this is okay:**
- Firebase API keys are not secret (they're in frontend code too)
- Security is enforced through Firebase Storage Rules
- API keys can be restricted in Firebase Console to specific domains/IPs

**Best practices:**
- Restrict API key to your domains in Firebase Console
- Use environment variables in production
- Monitor usage in Firebase Console

## Comparison: Admin SDK vs REST API

| Feature | Admin SDK (Before) | REST API (Now) |
|---------|-------------------|----------------|
| **Authentication** | Service Account JSON | API Key |
| **Setup Complexity** | High (credentials) | Low (none needed) |
| **Deployment** | Requires secrets management | Works everywhere |
| **Permissions** | Full admin access | Follows Storage Rules |
| **Frontend Parity** | Different approach | Same as frontend |
| **Dependencies** | firebase-admin (~50MB) | requests (~500KB) |

## Future Enhancements

Potential improvements:
1. **Signed URLs**: Generate time-limited access URLs
2. **Authentication**: Add optional user authentication for uploads
3. **Compression**: Optimize image sizes before upload
4. **CDN**: Use Firebase CDN for faster delivery
5. **Cleanup**: Automated deletion of old generated images

## Related Documentation

- [FIREBASE_SETUP.md](FIREBASE_SETUP.md) - Complete setup guide
- [ENV_VARIABLES.md](ENV_VARIABLES.md) - Environment configuration
- [Firebase Storage REST API](https://firebase.google.com/docs/storage/web/upload-files) - Official docs
- [Firebase Storage Rules](https://firebase.google.com/docs/storage/security) - Security rules guide

