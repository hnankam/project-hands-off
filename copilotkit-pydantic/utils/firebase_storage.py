"""Firebase Storage utility for uploading files using API key authentication.

This module provides utilities to upload files to Firebase Storage using
the same API key approach as the frontend, without requiring service account credentials.
"""

import base64
import requests
from typing import Optional
from datetime import datetime
import random
import string
from pathlib import Path
import sys

# Import Firebase configuration from environment
sys.path.append(str(Path(__file__).parent.parent))
from config.firebase import FirebaseConfig
from config import logger


def _generate_unique_filename(extension: str = 'png') -> str:
    """Generate a unique filename with timestamp and random string."""
    timestamp = int(datetime.now().timestamp() * 1000)
    random_str = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"{timestamp}-{random_str}.{extension}"


def _get_firebase_auth_token() -> Optional[str]:
    """Get a Firebase Auth ID token using anonymous authentication via REST API.
    
    This uses Firebase Auth REST API to sign in anonymously and get an ID token
    that can be used to authenticate Storage uploads.
    
    Returns:
        Firebase ID token string, or None if authentication fails
    """
    try:
        api_key = FirebaseConfig.API_KEY
        if not api_key:
            logger.error("Firebase API key not configured")
            return None
        
        # Firebase Auth REST API endpoint for anonymous sign-in
        auth_url = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={api_key}"
        
        # Request anonymous authentication
        response = requests.post(
            auth_url,
            json={"returnSecureToken": True},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            id_token = data.get('idToken')
            if id_token:
                logger.debug("Successfully obtained Firebase Auth token")
                return id_token
            else:
                logger.error("Firebase Auth response missing idToken")
                return None
        elif response.status_code == 400:
            error_data = response.json()
            error_code = error_data.get('error', {}).get('code', 'UNKNOWN')
            
            if error_code == 'CONFIGURATION_NOT_FOUND':
                logger.warning(
                    "Firebase Auth Anonymous sign-in is not enabled. "
                    "Please enable it in Firebase Console: "
                    "Authentication > Sign-in method > Anonymous > Enable"
                )
            else:
                logger.error(
                    "Failed to get Firebase Auth token: status=%d, code=%s, response=%s",
                    response.status_code,
                    error_code,
                    response.text
                )
            return None
        else:
            logger.error(
                "Failed to get Firebase Auth token: status=%d, response=%s",
                response.status_code,
                response.text
            )
            return None
            
    except Exception as e:
        logger.error("Exception getting Firebase Auth token: %s", e)
        return None


async def upload_binary_image_to_storage(
    image_data: bytes,
    folder: str = "generations",
    content_type: str = "image/png"
) -> Optional[str]:
    """Upload binary image data to Firebase Storage using REST API.
    
    This uses the Firebase Storage REST API with API key authentication,
    matching the frontend approach without requiring service account credentials.
    
    Args:
        image_data: Binary image data (bytes)
        folder: Folder path in storage (default: "generations")
        content_type: MIME type of the image (default: "image/png")
        
    Returns:
        Public URL of the uploaded image, or None if upload fails
    """
    try:
        # Generate unique filename
        extension = content_type.split('/')[-1] if '/' in content_type else 'png'
        filename = _generate_unique_filename(extension)
        blob_path = f"{folder}/{filename}"
        
        # Get Firebase config
        storage_bucket = FirebaseConfig.get_storage_bucket()
        api_key = FirebaseConfig.API_KEY
        
        if not api_key:
            logger.error("Firebase API key not configured")
            return None
        
        # Try to get Firebase Auth token for authentication
        # If Auth is not configured, we'll try with API key in URL
        auth_token = _get_firebase_auth_token()
        
        # Firebase Storage REST API endpoint
        upload_url = (
            f"https://firebasestorage.googleapis.com/v0/b/{storage_bucket}/o"
            f"?uploadType=media&name={blob_path}"
        )
        
        # Upload the file with authentication
        logger.info("📤 Uploading to Firebase Storage: %s", blob_path)
        
        headers = {
            'Content-Type': content_type,
        }
        
        # Add Authorization header if we have a token
        if auth_token:
            headers['Authorization'] = f'Bearer {auth_token}'
        else:
            logger.warning(
                "No auth token available. Upload may fail if Storage rules require authentication. "
                "Enable Firebase Auth Anonymous sign-in in Firebase Console."
            )
        
        response = requests.post(
            upload_url,
            data=image_data,
            headers=headers,
            timeout=30
        )
        
        if response.status_code in [200, 201]:
            # Get the public download URL
            # Format: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media
            encoded_path = requests.utils.quote(blob_path, safe='')
            public_url = (
                f"https://firebasestorage.googleapis.com/v0/b/{storage_bucket}/o/{encoded_path}"
                f"?alt=media"
            )
            
            logger.info("✅ Uploaded successfully: %s", blob_path)
            logger.debug("   URL: %s", public_url)
            return public_url
        else:
            logger.error(
                "❌ Upload failed with status %d: %s",
                response.status_code,
                response.text
            )
            return None
        
    except Exception as e:
        logger.exception("❌ Failed to upload image to Firebase")
        return None


async def upload_base64_image_to_storage(
    base64_data: str,
    folder: str = "generations",
    content_type: str = "image/png"
) -> Optional[str]:
    """Upload base64-encoded image to Firebase Storage.
    
    Args:
        base64_data: Base64-encoded image data (with or without data URI prefix)
        folder: Folder path in storage (default: "generations")
        content_type: MIME type of the image (default: "image/png")
        
    Returns:
        Public URL of the uploaded image, or None if upload fails
    """
    try:
        # Remove data URI prefix if present
        if ',' in base64_data:
            base64_data = base64_data.split(',', 1)[1]
        
        # Decode base64 to bytes
        image_bytes = base64.b64decode(base64_data)
        
        # Upload using binary upload function
        return await upload_binary_image_to_storage(
            image_bytes,
            folder=folder,
            content_type=content_type
        )
        
    except Exception as e:
        logger.exception("❌ Failed to decode/upload base64 image")
        return None


# Legacy function name for backwards compatibility
_initialize_firebase = lambda: print("✅ Firebase REST API mode - no initialization needed")
