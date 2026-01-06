#!/usr/bin/env python3
"""Test script for credential resolution.

This script tests the credential resolver independently of the MCP server.
Use this to verify your database setup and encryption is working correctly.
"""

import sys
from pathlib import Path
import os

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    
    # Try to load .env from copilotkit-pydantic directory
    env_paths = [
        Path(__file__).parent.parent.parent / '.env',  # copilotkit-pydantic/.env
        Path(__file__).parent.parent / '.env',          # first-party-mcp-servers/.env
        Path(__file__).parent / '.env',                 # databricks/.env
    ]
    
    env_loaded = False
    for env_path in env_paths:
        if env_path.exists():
            load_dotenv(env_path)
            print(f"Loaded environment from: {env_path}")
            env_loaded = True
            break
    
    if not env_loaded:
        print("Warning: No .env file found. Using system environment variables.")
    print()
    
except ImportError:
    print("Warning: python-dotenv not installed. Install with: pip install python-dotenv")
    print("Using system environment variables only.")
    print()

# Add parent directory to path
parent_path = Path(__file__).parent.parent
if str(parent_path) not in sys.path:
    sys.path.insert(0, str(parent_path))

from shared.credential_resolver import (
    resolve_credential,
    get_credential_cache_info,
    get_db_pool_info,
    close_db_pool
)

def test_credential_resolution():
    """Test resolving a credential from the database."""
    
    print("=" * 60)
    print("Credential Resolution Test")
    print("=" * 60)
    print()
    
    # Check environment variables
    print("1. Checking environment variables...")
    required_vars = ['DB_HOST', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD', 'ENCRYPTION_MASTER_SECRET']
    missing = [v for v in required_vars if not os.getenv(v)]
    
    if missing:
        print(f"❌ Missing environment variables: {', '.join(missing)}")
        print("\nPlease set these in your .env file or environment:")
        for var in missing:
            print(f"  export {var}=your_value")
        return False
    
    print("✅ All required environment variables are set")
    print()
    
    # Get credential key from user
    print("2. Enter a credential key to test:")
    print("   (This is the 'key' column in workspace_credentials table, e.g., 'my_databricks_host')")
    credential_key = input("   Credential key: ").strip()
    
    if not credential_key:
        print("❌ No credential key provided")
        return False
    
    print()
    print(f"3. Attempting to resolve credential: {credential_key}")
    
    try:
        # Resolve credential
        value = resolve_credential(credential_key)
        
        # Show result (masked)
        print(f"✅ Successfully resolved credential!")
        print(f"   Value: {value[:10]}...{value[-5:]} ({len(value)} characters)")
        print()
        
        # Show cache stats
        cache_stats = get_credential_cache_info()
        print("4. Credential cache statistics:")
        print(f"   Cached credentials: {cache_stats['size']}")
        print(f"   Cache size limit: {cache_stats['maxsize']}")
        print(f"   TTL: {cache_stats['ttl']} seconds")
        print()
        
        # Show database pool stats
        pool_stats = get_db_pool_info()
        print("5. Database connection pool statistics:")
        if 'error' in pool_stats:
            print(f"   ⚠️  {pool_stats['error']}")
        else:
            print(f"   Pool name: {pool_stats.get('name', 'N/A')}")
            print(f"   Min pool size: {pool_stats.get('min_size', 0)}")
            print(f"   Max pool size: {pool_stats.get('max_size', 0)}")
            print(f"   Connection timeout: {pool_stats.get('timeout', 0)}s")
            print(f"   Max waiting: {pool_stats.get('max_waiting', 0)}")
            print(f"   Workers: {pool_stats.get('num_workers', 0)}")
        print()
        
        # Test cache hit
        print("6. Testing cache hit (should be faster)...")
        import time
        start = time.time()
        value2 = resolve_credential(credential_key)
        cache_time = (time.time() - start) * 1000
        print(f"✅ Cache hit: {cache_time:.2f}ms")
        print()
        
        # Test connection pool reuse
        print("7. Testing connection pool reuse...")
        print("   (Resolving a second time to verify pool is reused)")
        start = time.time()
        value3 = resolve_credential(credential_key)
        reuse_time = (time.time() - start) * 1000
        print(f"✅ Pool reuse: {reuse_time:.2f}ms")
        print(f"   Connection pool is being reused efficiently")
        print()
        
        print("=" * 60)
        print("✅ All tests passed!")
        print("=" * 60)
        return True
        
    except ValueError as e:
        print(f"❌ Credential not found: {e}")
        print()
        print("Possible causes:")
        print("  1. Credential key doesn't exist in database")
        print("  2. Database connection failed")
        print("  3. Credential not associated with a user")
        return False
        
    except Exception as e:
        print(f"❌ Error: {type(e).__name__}: {e}")
        print()
        print("Possible causes:")
        print("  1. Encryption key mismatch (ENCRYPTION_MASTER_SECRET)")
        print("  2. Database connection failed")
        print("  3. Credential data is corrupted")
        return False


if __name__ == "__main__":
    try:
        success = test_credential_resolution()
        
        # Cleanup: close the database pool
        print("\n8. Cleaning up...")
        close_db_pool()
        print("✅ Database connection pool closed")
        print()
        
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\nTest cancelled by user")
        print("Cleaning up...")
        close_db_pool()
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        print("\nCleaning up...")
        close_db_pool()
        sys.exit(1)

