"""Firebase configuration loaded from environment variables."""

import os
from typing import Optional
from pathlib import Path
from dotenv import load_dotenv

# Ensure .env is loaded before reading environment variables
load_dotenv()

class FirebaseConfig:
    """Firebase configuration for image upload to Storage."""
    
    # Firebase Web App configuration (matching frontend constants)
    API_KEY = os.getenv('FIREBASE_API_KEY', 'AIzaSyCCLmP_BJd55Z_lkMQ02GEXPCv0un3_jPw')
    AUTH_DOMAIN = os.getenv('FIREBASE_AUTH_DOMAIN', 'adbe-gcp0814.firebaseapp.com')
    PROJECT_ID = os.getenv('FIREBASE_PROJECT_ID', 'adbe-gcp0814')
    STORAGE_BUCKET = os.getenv('FIREBASE_STORAGE_BUCKET', 'adbe-gcp0814.firebasestorage.app')
    MESSAGING_SENDER_ID = os.getenv('FIREBASE_MESSAGING_SENDER_ID', '1095327983558')
    APP_ID = os.getenv('FIREBASE_APP_ID', '1:1095327983558:web:7178975fca572f8fe534c7')
    
    # Note: Using API key authentication like the frontend
    # No service account key needed!
    
    @classmethod
    def to_dict(cls) -> dict:
        """Convert config to dictionary format.
        
        Returns:
            Dictionary with Firebase configuration
        """
        return {
            'apiKey': cls.API_KEY,
            'authDomain': cls.AUTH_DOMAIN,
            'projectId': cls.PROJECT_ID,
            'storageBucket': cls.STORAGE_BUCKET,
            'messagingSenderId': cls.MESSAGING_SENDER_ID,
            'appId': cls.APP_ID,
        }
    
    @classmethod
    def get_storage_bucket(cls) -> str:
        """Get the storage bucket name.
        
        Returns:
            Storage bucket name
        """
        return cls.STORAGE_BUCKET
    
    @classmethod
    def get_project_id(cls) -> str:
        """Get the project ID.
        
        Returns:
            Firebase project ID
        """
        return cls.PROJECT_ID
    
    @classmethod
    def print_config(cls) -> None:
        """Print current Firebase configuration for debugging."""
        print("🔍 Firebase Configuration (API Key Auth):")
        print(f"   PROJECT_ID: {cls.PROJECT_ID}")
        print(f"   STORAGE_BUCKET: {cls.STORAGE_BUCKET}")
        print(f"   API_KEY: {cls.API_KEY[:20]}...{cls.API_KEY[-10:] if len(cls.API_KEY) > 30 else cls.API_KEY}")
        print(f"   AUTH_DOMAIN: {cls.AUTH_DOMAIN}")
        print(f"   ✅ Using REST API (no service account needed)")


# Export for convenience
firebase_config = FirebaseConfig()

# Print config on module load for debugging
if os.getenv('DEBUG', '').lower() in {'1', 'true', 'yes'}:
    FirebaseConfig.print_config()

