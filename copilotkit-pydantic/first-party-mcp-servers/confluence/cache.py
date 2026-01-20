"""Confluence client connection pooling with TTL-based cache.

Credentials are resolved from credential keys at runtime.
The cache keys are based on credential keys, not the resolved values.
"""

import sys
from pathlib import Path

from atlassian import Confluence
from cachetools import TTLCache
from threading import Lock
import logging

# Add parent directory to path to import shared module
parent_path = Path(__file__).parent.parent
if str(parent_path) not in sys.path:
    sys.path.insert(0, str(parent_path))

from shared.credential_resolver import resolve_credential  # type: ignore

logger = logging.getLogger(__name__)

# Cache configuration
# - maxsize: Maximum number of cached clients
# - ttl: Time-to-live in seconds (1 hour)
confluence_client_cache = TTLCache(maxsize=1000, ttl=3600)
cache_lock = Lock()


def get_confluence_client(
    url_credential_key: str,
    token_credential_key: str,
    username_credential_key: str = "",
    cloud: bool = False
) -> Confluence:
    """
    Get cached Confluence client or create new one.
    
    Caches clients by credential keys. Credentials are resolved from the database
    using the shared credential_resolver module.
    
    SECURITY: Only token-based authentication is supported (no passwords).
    
    Args:
        url_credential_key: Globally unique key for the Confluence instance URL credential
        token_credential_key: Globally unique key for the API token credential
        username_credential_key: Globally unique key for the username credential (Cloud only, default: "")
        cloud: Set to True for Confluence Cloud, False for Server/Data Center (default: False)
    
    Returns:
        Confluence client instance (cached or new)
        
    Authentication Methods:
        1. Confluence Cloud (cloud=True):
           - Requires: username (email) + API token
           - Uses Basic Auth with API token
           - Get token: https://id.atlassian.com/manage-profile/security/api-tokens
           
        2. Confluence Server/Data Center (cloud=False):
           - Requires: Personal Access Token (PAT) only
           - Token-based authentication (no username needed)
           - Get PAT: Profile → Personal Access Tokens → Create token
    """
    # Cache key is based on credential keys (stable and readable)
    cache_key = f"confluence:{url_credential_key}:{token_credential_key}:{username_credential_key}:{cloud}"
    
    with cache_lock:
        if cache_key in confluence_client_cache:
            logger.debug(f"Cache HIT for Confluence client (url_key: {url_credential_key})")
            return confluence_client_cache[cache_key]
        
        logger.info(f"Cache MISS - creating new Confluence client (url_key: {url_credential_key})")
        
        # Resolve credential keys to actual values
        url = resolve_credential(url_credential_key)
        api_token = resolve_credential(token_credential_key)
        username = resolve_credential(username_credential_key) if username_credential_key else ""
        
        # Create new client with appropriate token authentication
        if cloud:
            # Confluence Cloud: API token with username (Basic Auth)
            logger.debug("Using Confluence Cloud API token authentication")
            if not username:
                raise ValueError("Username (email) is required for Confluence Cloud authentication.")
            client = Confluence(url=url, username=username, password=api_token, cloud=True)
        else:
            # Confluence Server/Data Center: Personal Access Token (PAT) - no username
            logger.debug("Using Confluence Server/Data Center PAT authentication")
            client = Confluence(url=url, token=api_token)
        
        # Store in cache
        confluence_client_cache[cache_key] = client
        
        return client


def clear_cache():
    """Clear all cached clients (for testing/maintenance)."""
    with cache_lock:
        confluence_client_cache.clear()
        logger.info("Confluence client cache cleared")


def get_cache_info():
    """Get cache statistics."""
    with cache_lock:
        return {
            "size": len(confluence_client_cache),
            "maxsize": confluence_client_cache.maxsize,
            "ttl": confluence_client_cache.ttl
        }

