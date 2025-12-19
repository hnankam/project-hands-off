"""WorkspaceClient connection pooling with TTL-based cache."""

from databricks.sdk import WorkspaceClient
from cachetools import TTLCache
import hashlib
from threading import Lock
import logging

logger = logging.getLogger(__name__)

# Cache configuration
# - maxsize: Maximum number of cached clients
# - ttl: Time-to-live in seconds (1 hour)
client_cache = TTLCache(maxsize=1000, ttl=3600)
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
        if cache_key in client_cache:
            logger.debug(f"Cache HIT for workspace: {host}")
            return client_cache[cache_key]
        
        logger.info(f"Cache MISS - creating new client for workspace: {host}")
        
        # Create new client (no network call until first API request)
        client = WorkspaceClient(host=host, token=token)
        
        # Store in cache
        client_cache[cache_key] = client
        
        return client

def clear_cache():
    """Clear all cached clients (for testing/maintenance)."""
    with cache_lock:
        client_cache.clear()
        logger.info("Client cache cleared")

def get_cache_info():
    """Get cache statistics."""
    with cache_lock:
        return {
            "size": len(client_cache),
            "maxsize": client_cache.maxsize,
            "ttl": client_cache.ttl
        }

