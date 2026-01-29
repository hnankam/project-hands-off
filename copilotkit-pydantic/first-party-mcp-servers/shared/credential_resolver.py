"""Credential resolver using credential IDs (UUIDs only).

This module fetches and decrypts workspace credentials from the database
using their UUID identifiers. It's designed for first-party MCP servers
that need to access user credentials securely.

Security Note:
- Credentials are stored encrypted in the database (AES-256-GCM)
- Decryption happens server-side only, never exposed to agents
- Uses the same encryption scheme as the Node.js backend
"""

import os
import hashlib
import time
from pathlib import Path
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend
from cachetools import TTLCache
from threading import Lock
import logging
from typing import Optional, Callable, Any

# Load .env file on module import
try:
    from dotenv import load_dotenv
    
    # Try to load .env from common locations
    env_paths = [
        Path(__file__).parent.parent.parent / '.env',  # copilotkit-pydantic/.env
        Path(__file__).parent.parent / '.env',          # first-party-mcp-servers/.env
        Path(__file__).parent / '.env',                 # shared/.env
    ]
    
    for env_path in env_paths:
        if env_path.exists():
            load_dotenv(env_path)
            break
except ImportError:
    pass  # python-dotenv not installed, rely on system env vars

logger = logging.getLogger(__name__)

# Cache for resolved credentials (by ID)
# TTL of 1 hour to match client cache
_credential_cache = TTLCache(maxsize=1000, ttl=3600)
_cache_lock = Lock()

# Synchronous connection pool for credential fetching
# Separate from main app's async pool since MCP tools run synchronously
_db_pool: ConnectionPool | None = None
_db_pool_lock = Lock()

# Encryption configuration (must match Node.js encryption.js)
IV_LENGTH = 16
AUTH_TAG_LENGTH = 16
KEY_LENGTH = 32
ITERATIONS = 100000


def _get_connection_string() -> str:
    """Build PostgreSQL connection string from environment variables."""
    host = os.getenv('DB_HOST')
    port = os.getenv('DB_PORT', '5432')
    database = os.getenv('DB_DATABASE')
    username = os.getenv('DB_USERNAME')
    password = os.getenv('DB_PASSWORD')
    other_params = os.getenv('DB_OTHER_PARAMS', 'sslmode=require')
    
    if not all([host, database, username, password]):
        raise ValueError("Database connection parameters not fully configured")
    
    conn_string = f"postgresql://{username}:{password}@{host}:{port}/{database}"
    if other_params:
        conn_string += f'?{other_params}'
    
    return conn_string


def _derive_key(user_id: str) -> bytes:
    """Derive encryption key from master secret and user ID.
    
    Uses PBKDF2 for key derivation (same as Node.js implementation).
    
    Args:
        user_id: User ID used as salt for key derivation
        
    Returns:
        32-byte encryption key
    """
    master_secret = os.getenv('ENCRYPTION_MASTER_SECRET', 'default-secret-change-in-production')
    
    if master_secret == 'default-secret-change-in-production':
        logger.warning("⚠️  Using default encryption secret. Set ENCRYPTION_MASTER_SECRET in production!")
    
    # Create salt from user_id (matches Node.js: sha256 hash of organizationId)
    salt = hashlib.sha256((user_id or 'global').encode()).digest()
    
    # Derive key using PBKDF2 (matches Node.js)
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=KEY_LENGTH,
        salt=salt,
        iterations=ITERATIONS,
        backend=default_backend()
    )
    
    return kdf.derive(master_secret.encode())


def _decrypt_credential(encrypted_data: bytes, user_id: str) -> str:
    """Decrypt credential data using AES-256-GCM.
    
    Format: IV (16 bytes) + Auth Tag (16 bytes) + Ciphertext
    
    Args:
        encrypted_data: Encrypted credential bytes
        user_id: User ID for key derivation
        
    Returns:
        Decrypted plaintext string
    """
    if len(encrypted_data) < IV_LENGTH + AUTH_TAG_LENGTH:
        raise ValueError("Invalid encrypted data format")
    
    # Extract components (matches Node.js format)
    iv = encrypted_data[:IV_LENGTH]
    auth_tag = encrypted_data[IV_LENGTH:IV_LENGTH + AUTH_TAG_LENGTH]
    ciphertext = encrypted_data[IV_LENGTH + AUTH_TAG_LENGTH:]
    
    # Derive key
    key = _derive_key(user_id)
    
    # Decrypt using AESGCM
    # Note: AESGCM expects nonce + ciphertext + tag concatenated for decryption
    # But we need to reconstruct it for the cryptography library
    aesgcm = AESGCM(key)
    
    # The cryptography library wants ciphertext + tag concatenated
    ciphertext_with_tag = ciphertext + auth_tag
    
    plaintext = aesgcm.decrypt(iv, ciphertext_with_tag, None)
    
    return plaintext.decode('utf-8')


def _get_db_pool() -> ConnectionPool:
    """Get or create the synchronous connection pool.
    
    Creates a lightweight connection pool for credential fetching.
    This is separate from the main app's async pool since MCP tools
    run synchronously.
    
    Returns:
        ConnectionPool instance
    """
    global _db_pool
    
    if _db_pool is None:
        with _db_pool_lock:
            # Double-check after acquiring lock
            if _db_pool is None:
                conn_string = _get_connection_string()
                
                # Create a small synchronous pool
                # min_size=0: connections created on demand
                # max_size=3: small pool for credential lookups
                # timeout=30: wait up to 30s for connection
                _db_pool = ConnectionPool(
                    conninfo=conn_string,
                    min_size=0,
                    max_size=3,
                    timeout=30,
                    kwargs={"row_factory": dict_row},
                    open=True
                )
                logger.info("Initialized credential resolver connection pool (max_size=3)")
    
    return _db_pool


def _exponential_backoff_retry(
    func: Callable[[], Any],
    max_retries: int = 3,
    initial_delay: float = 0.5,
    max_delay: float = 10.0,
    exponential_base: float = 2.0
) -> Any:
    """Execute a function with exponential backoff retry logic.
    
    Args:
        func: Function to execute
        max_retries: Maximum number of retry attempts
        initial_delay: Initial delay in seconds
        max_delay: Maximum delay between retries
        exponential_base: Base for exponential backoff calculation
        
    Returns:
        Result of the function call
        
    Raises:
        Last exception if all retries fail
    """
    last_exception = None
    delay = initial_delay
    
    for attempt in range(max_retries + 1):
        try:
            return func()
        except (psycopg.OperationalError, psycopg.InterfaceError, ConnectionError) as e:
            last_exception = e
            
            if attempt == max_retries:
                logger.error(f"All {max_retries} retry attempts failed: {e}")
                raise
            
            # Calculate next delay with exponential backoff
            delay = min(initial_delay * (exponential_base ** attempt), max_delay)
            
            logger.warning(
                f"Database operation failed (attempt {attempt + 1}/{max_retries + 1}): {e}. "
                f"Retrying in {delay:.2f}s..."
            )
            
            time.sleep(delay)
    
    # Should never reach here, but just in case
    if last_exception:
        raise last_exception


def _fetch_credential_from_db(credential_key: str) -> dict:
    """Fetch credential from database by key using connection pool with retry logic.
    
    The key column must be globally unique across all users.
    
    Args:
        credential_key: The globally unique credential key (e.g., "my_databricks_host")
        
    Returns:
        Dict with credential data including encrypted_data and user_id
    """
    def _fetch():
        pool = _get_db_pool()
        
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, user_id, name, type, key, encrypted_data
                    FROM workspace_credentials
                    WHERE key = %s
                    """,
                    (credential_key,)
                )
                result = cur.fetchone()
                
                if not result:
                    raise ValueError(f"Credential not found with key: {credential_key}")
                
                # Convert hex string to bytes (matches Node.js storage format)
                # Node.js stores as: encrypted.toString('hex')
                if result['encrypted_data']:
                    result['encrypted_data'] = bytes.fromhex(result['encrypted_data'])
                
                return result
    
    # Execute with exponential backoff retry
    return _exponential_backoff_retry(_fetch, max_retries=3)


def resolve_credential(credential_key: str) -> str:
    """Resolve a credential key to its decrypted value.
    
    This is the main function for MCP servers to use. It handles:
    - Caching (credentials are cached by key for 1 hour)
    - Database lookup (by globally unique key)
    - Decryption
    
    Args:
        credential_key: The globally unique credential key (e.g., "my_databricks_host")
        
    Returns:
        Decrypted credential value (password/secret/token)
        
    Raises:
        ValueError: If credential not found or decryption fails
        
    Example:
        host = resolve_credential("my_databricks_host")
        token = resolve_credential("my_databricks_token")
        client = WorkspaceClient(host=host, token=token)
    """
    # Check cache first
    with _cache_lock:
        if credential_key in _credential_cache:
            logger.debug(f"Cache HIT for credential: {credential_key}")
            return _credential_cache[credential_key]
    
    logger.info(f"Cache MISS - resolving credential: {credential_key}")
    
    # Fetch from database by key
    cred_data = _fetch_credential_from_db(credential_key)
    
    # Check if encrypted_data exists
    if not cred_data.get('encrypted_data'):
        raise ValueError(f"Credential '{credential_key}' has no encrypted data")
    
    # Decrypt (encrypted_data is already converted to bytes in _fetch_credential_from_db)
    decrypted_value = _decrypt_credential(cred_data['encrypted_data'], cred_data['user_id'])
    
    # Cache the result
    with _cache_lock:
        _credential_cache[credential_key] = decrypted_value
    
    logger.info(f"Credential resolved successfully: {credential_key}")
    return decrypted_value


def clear_credential_cache():
    """Clear the credential cache (for testing/maintenance)."""
    with _cache_lock:
        _credential_cache.clear()
        logger.info("Credential cache cleared")


def get_credential_cache_info() -> dict:
    """Get credential cache statistics."""
    with _cache_lock:
        return {
            "size": len(_credential_cache),
            "maxsize": _credential_cache.maxsize,
            "ttl": _credential_cache.ttl
        }


def close_db_pool():
    """Close the database connection pool (for cleanup)."""
    global _db_pool
    
    with _db_pool_lock:
        if _db_pool is not None:
            _db_pool.close()
            _db_pool = None
            logger.info("Closed credential resolver connection pool")


def get_db_pool_info() -> dict:
    """Get database connection pool statistics."""
    pool = _get_db_pool()
    
    # Get pool statistics (psycopg ConnectionPool attributes)
    try:
        return {
            "name": pool.name,
            "min_size": pool.min_size,
            "max_size": pool.max_size,
            "timeout": pool.timeout,
            "max_waiting": pool.max_waiting,
            "max_lifetime": pool.max_lifetime,
            "max_idle": pool.max_idle,
            "num_workers": pool.num_workers,
        }
    except AttributeError as e:
        # Fallback if attributes don't exist
        return {
            "error": f"Could not get pool stats: {e}",
            "pool_type": str(type(pool).__name__)
        }


def health_check() -> dict:
    """Perform health check on credential resolver.
    
    Tests database connectivity and returns status information.
    
    Returns:
        Dict with health check status and details
    """
    status = {
        "healthy": False,
        "database": {"connected": False, "error": None},
        "cache": {"size": 0, "maxsize": 0, "ttl": 0},
        "pool": {"initialized": False, "info": None}
    }
    
    # Check cache
    try:
        cache_info = get_credential_cache_info()
        status["cache"] = cache_info
    except Exception as e:
        logger.warning(f"Cache health check failed: {e}")
    
    # Check database connection
    try:
        pool = _get_db_pool()
        status["pool"]["initialized"] = True
        
        # Try a simple query with retry
        def _test_query():
            with pool.connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    result = cur.fetchone()
                    return result is not None
        
        db_ok = _exponential_backoff_retry(_test_query, max_retries=2)
        status["database"]["connected"] = db_ok
        
        if db_ok:
            status["pool"]["info"] = get_db_pool_info()
            status["healthy"] = True
    except Exception as e:
        status["database"]["error"] = str(e)
        logger.error(f"Database health check failed: {e}")
    
    return status

