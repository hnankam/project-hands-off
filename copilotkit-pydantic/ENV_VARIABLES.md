# Environment Variables Configuration

This document describes all environment variables used by the backend application.

## Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Server host address |
| `PORT` | `8001` | Server port |
| `DEBUG` | `true` | Enable debug mode and detailed logging |
| `LOG_FORMAT` | `plain` | Log format: `plain` or `json` |

## Firebase Configuration

Firebase is used to store generated images in Firebase Storage, matching the frontend configuration.

### Required Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FIREBASE_PROJECT_ID` | `adbe-gcp0814` | Firebase project ID |
| `FIREBASE_STORAGE_BUCKET` | `adbe-gcp0814.firebasestorage.app` | Firebase Storage bucket name |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FIREBASE_API_KEY` | `AIzaSyCCLmP_BJd55Z_lkMQ02GEXPCv0un3_jPw` | Firebase Web API key |
| `FIREBASE_AUTH_DOMAIN` | `adbe-gcp0814.firebaseapp.com` | Firebase auth domain |
| `FIREBASE_MESSAGING_SENDER_ID` | `1095327983558` | Firebase messaging sender ID |
| `FIREBASE_APP_ID` | `1:1095327983558:web:7178975fca572f8fe534c7` | Firebase app ID |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | _(none)_ | Path to Firebase service account JSON key file |

### Authentication Methods

The backend supports two authentication methods for Firebase:

#### 1. Service Account Key (Recommended for Production)

Set the path to your service account JSON key:

```bash
export FIREBASE_SERVICE_ACCOUNT_KEY=/path/to/service-account-key.json
```

To get a service account key:
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: `adbe-gcp0814`
3. Go to **Project Settings** → **Service Accounts**
4. Click **Generate New Private Key**
5. Download and save the JSON file securely

#### 2. Application Default Credentials (Development)

If `FIREBASE_SERVICE_ACCOUNT_KEY` is not set, the backend will use Application Default Credentials.

To set up locally:
```bash
gcloud auth application-default login
```

This works automatically in Google Cloud environments (Cloud Run, GKE, etc.).

## Configuration Files

### `.env` File (Local Development)

Create a `.env` file in the `copilotkit-pydantic/` directory:

```bash
# Server
HOST=0.0.0.0
PORT=8001
DEBUG=true

# Firebase
FIREBASE_PROJECT_ID=adbe-gcp0814
FIREBASE_STORAGE_BUCKET=adbe-gcp0814.firebasestorage.app
FIREBASE_SERVICE_ACCOUNT_KEY=/path/to/your/service-account-key.json
```

### Docker/Container Environment

For Docker or container deployments, pass environment variables via:

**Docker Compose:**
```yaml
services:
  backend:
    environment:
      - FIREBASE_PROJECT_ID=adbe-gcp0814
      - FIREBASE_STORAGE_BUCKET=adbe-gcp0814.firebasestorage.app
      - FIREBASE_SERVICE_ACCOUNT_KEY=/app/credentials/firebase-key.json
    volumes:
      - ./firebase-key.json:/app/credentials/firebase-key.json:ro
```

**Kubernetes:**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: backend-config
data:
  FIREBASE_PROJECT_ID: "adbe-gcp0814"
  FIREBASE_STORAGE_BUCKET: "adbe-gcp0814.firebasestorage.app"
---
apiVersion: v1
kind: Secret
metadata:
  name: firebase-credentials
type: Opaque
stringData:
  key.json: |
    {
      "type": "service_account",
      ...
    }
```

## Configuration Priority

The backend loads configuration in this order (later values override earlier):

1. **Default values** in `config/firebase.py`
2. **Environment variables** from `.env` file (via `python-dotenv`)
3. **System environment variables** (overrides all)

## Frontend-Backend Compatibility

The Firebase configuration must match between frontend and backend:

**Frontend** (`pages/side-panel/src/constants/index.ts`):
```typescript
FIREBASE: {
  apiKey: "AIzaSyCCLmP_BJd55Z_lkMQ02GEXPCv0un3_jPw",
  projectId: "adbe-gcp0814",
  storageBucket: "adbe-gcp0814.firebasestorage.app",
  ...
}
```

**Backend** (environment variables):
```bash
FIREBASE_PROJECT_ID=adbe-gcp0814
FIREBASE_STORAGE_BUCKET=adbe-gcp0814.firebasestorage.app
```

## Troubleshooting

### Firebase not initializing

**Problem:** Logs show "Firebase initialization failed"

**Solutions:**
1. Verify `FIREBASE_PROJECT_ID` and `FIREBASE_STORAGE_BUCKET` are set correctly
2. Check service account key path is correct: `FIREBASE_SERVICE_ACCOUNT_KEY`
3. Ensure service account has "Storage Admin" role
4. Try using Application Default Credentials: `gcloud auth application-default login`

### Images not uploading

**Problem:** Images generate but don't upload to Firebase

**Solutions:**
1. Check Firebase Storage rules allow uploads
2. Verify storage bucket name matches exactly
3. Review Firebase console quota/billing
4. Check network connectivity to Firebase

### Permission denied

**Problem:** "Permission denied" errors when uploading

**Solutions:**
1. Verify service account has correct IAM roles:
   - `Storage Admin` or `Storage Object Admin`
2. Check Firebase Storage rules:
   ```
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /generations/{allPaths=**} {
         allow read, write: if true;
       }
     }
   }
   ```

## Security Notes

- ⚠️ Never commit `.env` files or service account keys to version control
- ✅ Use `.gitignore` to exclude `.env` and `*.json` credential files
- ✅ In production, use secret management (e.g., Google Secret Manager, AWS Secrets Manager)
- ✅ Rotate service account keys periodically
- ✅ Use minimal IAM permissions (principle of least privilege)

## Related Files

- `config/firebase.py` - Firebase configuration class
- `config/environment.py` - General environment configuration
- `utils/firebase_storage.py` - Firebase Storage upload utilities
- `tools/backend_tools.py` - Image generation tool implementation

