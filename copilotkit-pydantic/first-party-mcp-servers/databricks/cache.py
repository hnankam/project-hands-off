"""WorkspaceClient and AccountClient connection pooling with TTL-based cache."""

from databricks.sdk import WorkspaceClient, AccountClient
from cachetools import TTLCache
import hashlib
from threading import Lock
import logging

logger = logging.getLogger(__name__)

# Cache configuration
# - maxsize: Maximum number of cached clients
# - ttl: Time-to-live in seconds (1 hour)
workspace_client_cache = TTLCache(maxsize=1000, ttl=3600)
account_client_cache = TTLCache(maxsize=1000, ttl=3600)
cache_lock = Lock()

def get_workspace_client(host: str, token: str) -> WorkspaceClient:
    """
    Get cached WorkspaceClient or create new one.
    
    Caches clients by hash of (host + token) to reuse connections
    for the same user/workspace combination.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
    
    Returns:
        WorkspaceClient instance (cached or new)
    """
    # Create stable cache key from credentials
    cache_key = hashlib.sha256(f"{host}:{token}".encode()).hexdigest()
    
    with cache_lock:
        if cache_key in workspace_client_cache:
            logger.debug(f"Cache HIT for workspace: {host}")
            return workspace_client_cache[cache_key]
        
        logger.info(f"Cache MISS - creating new client for workspace: {host}")
        
        # Create new client (no network call until first API request)
        client = WorkspaceClient(host=host, token=token)
        
        # Store in cache
        workspace_client_cache[cache_key] = client
        
        return client


def get_account_client(host: str, account_id: str, token: str) -> AccountClient:
    """
    Get cached AccountClient or create new one.
    
    Caches clients by hash of (host + account_id + token) to reuse connections
    for the same user/account combination.
    
    Args:
        host: Databricks account console URL
        account_id: Databricks account ID
        token: Personal Access Token or OAuth token
    
    Returns:
        AccountClient instance (cached or new)
    """
    # Create stable cache key from credentials
    cache_key = hashlib.sha256(f"{host}:{account_id}:{token}".encode()).hexdigest()
    
    with cache_lock:
        if cache_key in account_client_cache:
            logger.debug(f"Cache HIT for account: {account_id}")
            return account_client_cache[cache_key]
        
        logger.info(f"Cache MISS - creating new client for account: {account_id}")
        
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

