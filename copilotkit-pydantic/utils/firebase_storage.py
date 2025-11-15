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


def _generate_unique_filename(extension: str = 'png') -> str:
    """Generate a unique filename with timestamp and random string."""
    timestamp = int(datetime.now().timestamp() * 1000)
    random_str = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"{timestamp}-{random_str}.{extension}"


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
        
        # Firebase Storage REST API endpoint
        # Use the upload endpoint that doesn't require authentication for public buckets
        upload_url = (
            f"https://firebasestorage.googleapis.com/v0/b/{storage_bucket}/o"
            f"?uploadType=media&name={blob_path}"
        )
        
        # Upload the file
        print(f"📤 Uploading to Firebase Storage: {blob_path}")
        
        headers = {
            'Content-Type': content_type,
        }
        
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
            
            print(f"✅ Uploaded successfully: {blob_path}")
            print(f"   URL: {public_url}")
            return public_url
        else:
            print(f"❌ Upload failed with status {response.status_code}")
            print(f"   Response: {response.text}")
            return None
        
    except Exception as e:
        print(f"❌ Failed to upload image to Firebase: {e}")
        import traceback
        traceback.print_exc()
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
        print(f"❌ Failed to decode/upload base64 image: {e}")
        return None


# Legacy function name for backwards compatibility
_initialize_firebase = lambda: print("✅ Firebase REST API mode - no initialization needed")
