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
    API_KEY = os.getenv('FIREBASE_API_KEY')
    AUTH_DOMAIN = os.getenv('FIREBASE_AUTH_DOMAIN')
    PROJECT_ID = os.getenv('FIREBASE_PROJECT_ID')
    STORAGE_BUCKET = os.getenv('FIREBASE_STORAGE_BUCKET')
    MESSAGING_SENDER_ID = os.getenv('FIREBASE_MESSAGING_SENDER_ID')
    APP_ID = os.getenv('FIREBASE_APP_ID')
    
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


# Export for convenience
firebase_config = FirebaseConfig()