# Firebase Storage Setup for Image Generation

This document explains how to set up Firebase Storage for the image generation backend.

## Overview

The `generate_images` backend tool uses Gemini's image generation capability and uploads the generated images to Firebase Storage, matching the same Firebase configuration as the frontend `takeScreenshot` function.

## Firebase Configuration

The backend uses Firebase configuration loaded from environment variables (see `config/firebase.py`):
- **Project ID**: `adbe-gcp0814` (configurable via `FIREBASE_PROJECT_ID`)
- **Storage Bucket**: `adbe-gcp0814.firebasestorage.app` (configurable via `FIREBASE_STORAGE_BUCKET`)

Generated images are stored in the `generations/` folder in Firebase Storage.

Configuration is loaded from environment variables with sensible defaults matching the frontend setup.

## Setup Instructions

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

This will install `requests` and `google-cloud-storage` for Firebase Storage REST API access.

### 2. Configuration (Optional)

The backend uses the same Firebase configuration as the frontend, with sensible defaults already set in `config/firebase.py`.

**No environment variables or service account keys are required!** The default configuration matches the frontend:

- Project ID: `adbe-gcp0814`
- Storage Bucket: `adbe-gcp0814.firebasestorage.app`
- API Key: Matches frontend configuration

If you need to override these defaults, create a `.env` file:

```bash
# Optional overrides
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-bucket.firebasestorage.app
FIREBASE_API_KEY=your-api-key
```

### 3. Configure Firebase Storage Rules

Ensure your Firebase Storage rules allow uploads to the `generations/` folder:

1. Go to [Firebase Console](https://console.firebase.google.com/project/adbe-gcp0814/storage)
2. Click **Rules** tab
3. Add or update rules:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Allow public read access
    match /{allPaths=**} {
      allow read: if true;
    }
    
    // Allow uploads to generations folder
    match /generations/{allPaths=**} {
      allow write: if true;  // Or add your auth requirements
    }
  }
}
```

### 4. Test Your Setup

Run the test script to verify everything is configured correctly:

```bash
python test_firebase.py
```

## How It Works

### Image Generation Flow

1. User requests image generation via the `generate_images` tool
2. Backend calls Gemini 2.5 Flash with image generation capability
3. Gemini returns `BinaryImage` objects containing the generated images
4. Each image is uploaded to Firebase Storage in the `generations/` folder
5. Public URLs are returned to the frontend
6. Frontend displays the images in the `ImageGalleryCard` component

### Code Structure

- **`utils/firebase_storage.py`**: Firebase Storage utility functions
  - `upload_binary_image_to_storage()`: Uploads binary image data
  - `upload_base64_image_to_storage()`: Uploads base64-encoded images
  
- **`tools/backend_tools.py`**: Image generation tool
  - `generate_images()`: Main function that generates and uploads images
  - Uses `ImageGenerationTool` from Pydantic AI
  - Configured with Gemini 2.5 Flash model

### Storage Structure

```
Firebase Storage
└── generations/
    ├── 1736870400000-abc123de.png
    ├── 1736870401000-xyz456fg.png
    └── ...
```

Each image filename includes:
- Timestamp (milliseconds since epoch)
- Random 8-character string
- File extension based on content type

## Fallback Behavior

If Firebase upload fails (e.g., credentials not configured), the `generate_images` function will:
1. Log a warning message
2. Return placeholder image URLs as fallback
3. Continue functioning without interruption

This ensures the application works even without Firebase configured, though images won't be persisted.

## Security Notes

- All uploaded images are made publicly accessible (via `blob.make_public()`)
- Images are stored with unique, random filenames to prevent collisions
- No authentication is required to access the generated images
- Consider implementing cleanup policies in Firebase Storage to manage storage costs

## Troubleshooting

### "Failed to upload image to Firebase"
- **Check Firebase Storage Rules**: Ensure the `/generations/` folder allows write access
- **Verify Network Connectivity**: Test with `python test_firebase.py`
- **Check Storage Bucket Name**: Should be `adbe-gcp0814.firebasestorage.app`
- **Review Quotas**: Check Firebase console for any storage/bandwidth limits
- **CORS Issues**: If uploading from web, ensure CORS is configured

### Upload returns 403 Forbidden
- Firebase Storage rules may be too restrictive
- Update rules to allow write access to `/generations/**`
- See configuration section above for example rules

### Images upload but aren't accessible
- Check that read rules allow public access: `allow read: if true`
- Verify the URL format is correct
- Check browser console for CORS errors

## Related Files

### Backend
- `config/firebase.py` - Firebase configuration loaded from environment
- `utils/firebase_storage.py` - Firebase Storage upload utilities
- `tools/backend_tools.py` - Image generation tool implementation
- `ENV_VARIABLES.md` - Complete environment variables documentation

### Frontend
- `pages/side-panel/src/constants/index.ts` - Frontend Firebase config (hardcoded)
- `pages/side-panel/src/utils/firebaseStorage.ts` - Frontend Firebase utilities
- `pages/side-panel/src/actions/content/takeScreenshot.ts` - Screenshot upload example
- `pages/side-panel/src/components/ImageGalleryCard.tsx` - Image gallery display

