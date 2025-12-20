"""Confluence client connection pooling with TTL-based cache."""

from atlassian import Confluence
from cachetools import TTLCache
import hashlib
from threading import Lock
import logging
from typing import Optional

logger = logging.getLogger(__name__)

confluence_client_cache = TTLCache(maxsize=1000, ttl=3600)
cache_lock = Lock()


def get_confluence_client(url: str, api_token: str, username: Optional[str] = "", cloud: bool = False) -> Confluence:
    """
    Get cached Confluence client or create new one.

    Caches clients by hash of (url + username + api_token + cloud) to reuse connections
    for the same user/Confluence instance combination.

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        username: Username or email (for Cloud) or empty string (for Server PAT). Defaults to "".
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        Confluence instance (cached or new)
    """
    cache_key = hashlib.sha256(f"{url}:{username}:{api_token}:{cloud}".encode()).hexdigest()

    with cache_lock:
        if cache_key in confluence_client_cache:
            logger.debug(f"Cache HIT for Confluence: {url}")
            return confluence_client_cache[cache_key]

        logger.info(f"Cache MISS - creating new Confluence client for: {url}")

        if cloud:
            # Confluence Cloud uses username and API token as password
            if not username:
                raise ValueError("Username (email) is required for Confluence Cloud authentication.")
            client = Confluence(url=url, username=username, password=api_token, cloud=True)
        else:
            # Confluence Server/Data Center uses Personal Access Token (PAT) via 'token' parameter
            # No username is provided for PAT authentication
            client = Confluence(url=url, token=api_token)

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
            "confluence_cache_size": len(confluence_client_cache),
            "confluence_cache_maxsize": confluence_client_cache.maxsize,
            "confluence_cache_ttl": confluence_client_cache.ttl,
        }

