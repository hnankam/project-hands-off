#!/usr/bin/env python3
"""Test Firebase configuration and authentication.

Run this script to verify your Firebase setup:
    python test_firebase.py
"""

import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from config.firebase import FirebaseConfig
from dotenv import load_dotenv

# Load environment
load_dotenv()

def main():
    print("=" * 60)
    print("Firebase Configuration Test")
    print("=" * 60)
    print()
    
    # Print environment variables
    print("📋 Environment Variables:")
    env_vars = [
        'FIREBASE_API_KEY',
        'FIREBASE_AUTH_DOMAIN', 
        'FIREBASE_PROJECT_ID',
        'FIREBASE_STORAGE_BUCKET',
        'FIREBASE_MESSAGING_SENDER_ID',
        'FIREBASE_APP_ID',
    ]
    
    for var in env_vars:
        value = os.getenv(var)
        if value:
            # Mask API keys for security
            if 'KEY' in var or 'API' in var:
                masked = value[:10] + '...' + value[-10:] if len(value) > 20 else value
                print(f"   ✅ {var}: {masked}")
            else:
                print(f"   ✅ {var}: {value}")
        else:
            print(f"   ⚠️  {var}: NOT SET (using default if available)")
    
    print()
    print("=" * 60)
    
    # Print loaded config
    print()
    FirebaseConfig.print_config()
    print()
    
    # Check API key
    print("🔑 Authentication Method:")
    print(f"   Using Firebase REST API with API key")
    print(f"   No service account credentials needed")
    print(f"   Matches frontend authentication approach")
    
    print()
    print("=" * 60)
    
    # Test Firebase Storage REST API connectivity
    print()
    print("🔥 Testing Firebase Storage REST API...")
    print()
    
    try:
        import requests
        
        # Test connectivity to Firebase Storage
        storage_bucket = FirebaseConfig.get_storage_bucket()
        test_url = f"https://firebasestorage.googleapis.com/v0/b/{storage_bucket}/o"
        
        print(f"   Testing connection to: {test_url}")
        response = requests.get(test_url, timeout=10)
        
        if response.status_code in [200, 403]:  # 200 = OK, 403 = bucket exists but may need auth for listing
            print(f"   ✅ Firebase Storage is reachable (status: {response.status_code})")
            print()
            print("=" * 60)
            print("✅ SUCCESS! Firebase is properly configured")
            print("=" * 60)
            print()
            print("📝 Next steps:")
            print("   1. Ensure Firebase Storage rules allow uploads to /generations/")
            print("   2. Test image upload with: python -m tools.backend_tools")
            print("   3. Generated images will be stored in the 'generations' folder")
            print()
            return 0
        else:
            print(f"   ⚠️ Unexpected response status: {response.status_code}")
            print(f"   Response: {response.text[:200]}")
            print()
            print("=" * 60)
            print("⚠️ WARNING: Firebase Storage may not be configured correctly")
            print("=" * 60)
            return 1
            
    except Exception as e:
        print()
        print("=" * 60)
        print(f"❌ FAILED! Exception during connectivity test:")
        print(f"   {e}")
        print("=" * 60)
        import traceback
        traceback.print_exc()
        return 1

if __name__ == '__main__':
    sys.exit(main())

