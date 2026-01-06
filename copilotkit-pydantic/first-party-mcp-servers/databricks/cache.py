"""WorkspaceClient and AccountClient connection pooling with TTL-based cache.

Credentials are resolved from credential keys at runtime.
The cache keys are based on credential keys, not the resolved values.
"""

import sys
from pathlib import Path

from databricks.sdk import WorkspaceClient, AccountClient
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
workspace_client_cache = TTLCache(maxsize=1000, ttl=3600)
account_client_cache = TTLCache(maxsize=1000, ttl=3600)
cache_lock = Lock()


def get_workspace_client(host_credential_key: str, token_credential_key: str) -> WorkspaceClient:
    """
    Get cached WorkspaceClient or create new one.
    
    Caches clients by credential keys. Credentials are resolved from the database
    using the shared credential_resolver module.
    
    Args:
        host_credential_key: Globally unique key for the Databricks workspace URL credential
        token_credential_key: Globally unique key for the Personal Access Token credential
    
    Returns:
        WorkspaceClient instance (cached or new)
    """
    # Cache key is based on credential keys (stable and readable)
    cache_key = f"ws:{host_credential_key}:{token_credential_key}"
    
    with cache_lock:
        if cache_key in workspace_client_cache:
            logger.debug(f"Cache HIT for workspace client (host_key: {host_credential_key})")
            return workspace_client_cache[cache_key]
        
        logger.info(f"Cache MISS - creating new workspace client (host_key: {host_credential_key})")
        
        # Resolve credential keys to actual values
        host = resolve_credential(host_credential_key)
        token = resolve_credential(token_credential_key)
        
        # Create new client (no network call until first API request)
        client = WorkspaceClient(host=host, token=token)
        
        # Store in cache
        workspace_client_cache[cache_key] = client
        
        return client


def get_account_client(
    host_credential_key: str, 
    account_id_credential_key: str, 
    token_credential_key: str
) -> AccountClient:
    """
    Get cached AccountClient or create new one.
    
    Caches clients by credential keys. Credentials are resolved from the database
    using the shared credential_resolver module.
    
    Args:
        host_credential_key: Globally unique key for the Databricks account console URL credential
        account_id_credential_key: Globally unique key for the Databricks account ID credential
        token_credential_key: Globally unique key for the Personal Access Token credential
    
    Returns:
        AccountClient instance (cached or new)
    """
    # Cache key is based on credential keys (stable and readable)
    cache_key = f"ac:{host_credential_key}:{account_id_credential_key}:{token_credential_key}"
    
    with cache_lock:
        if cache_key in account_client_cache:
            logger.debug(f"Cache HIT for account client (account_key: {account_id_credential_key})")
            return account_client_cache[cache_key]
        
        logger.info(f"Cache MISS - creating new account client (account_key: {account_id_credential_key})")
        
        # Resolve credential keys to actual values
        host = resolve_credential(host_credential_key)
        account_id = resolve_credential(account_id_credential_key)
        token = resolve_credential(token_credential_key)
        
        # Create new client (no network call until first API request)
        client = AccountClient(host=host, account_id=account_id, token=token)
        
        # Store in cache
        account_client_cache[cache_key] = client
        
        return client


def clear_cache():
    """Clear all cached clients (for testing/maintenance)."""
    with cache_lock:
        workspace_client_cache.clear()
        account_client_cache.clear()
        logger.info("Client caches cleared")


def get_cache_info():
    """Get cache statistics."""
    with cache_lock:
        return {
            "workspace": {
                "size": len(workspace_client_cache),
                "maxsize": workspace_client_cache.maxsize,
                "ttl": workspace_client_cache.ttl
            },
            "account": {
                "size": len(account_client_cache),
                "maxsize": account_client_cache.maxsize,
                "ttl": account_client_cache.ttl
            }
        }
