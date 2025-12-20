"""Jira client connection pooling with TTL-based cache."""

from atlassian import Jira
from cachetools import TTLCache
import hashlib
from threading import Lock
import logging

logger = logging.getLogger(__name__)

# Cache configuration
# - maxsize: Maximum number of cached clients
# - ttl: Time-to-live in seconds (1 hour)
jira_client_cache = TTLCache(maxsize=1000, ttl=3600)
cache_lock = Lock()


def get_jira_client(url: str, username: str, api_token: str, cloud: bool = False) -> Jira:
    """
    Get cached Jira client or create new one.
    
    Caches clients by hash of (url + username + api_token) to reuse connections
    for the same user/instance combination.
    
    SECURITY: Only token-based authentication is supported (no passwords).
    
    Args:
        url: Jira instance URL (e.g., "https://yoursite.atlassian.net" for Cloud,
             "https://jira.company.com" for Server/Data Center)
        username: Email address (Cloud) or empty string (Server/Data Center)
        api_token: API token (Cloud) or Personal Access Token (Server/Data Center)
        cloud: Set to True for Jira Cloud, False for Server/Data Center (default: False)
    
    Returns:
        Jira client instance (cached or new)
        
    Authentication Methods:
        1. Jira Cloud (cloud=True):
           - Requires: username (email) + API token
           - Uses Basic Auth with API token
           - Get token: https://id.atlassian.com/manage-profile/security/api-tokens
           
        2. Jira Server/Data Center (cloud=False):
           - Requires: Personal Access Token (PAT) only
           - Token-based authentication (no username needed)
           - Get PAT: Profile → Personal Access Tokens → Create token
           - Minimum version: Jira 8.14+
    """
    # Create stable cache key from credentials
    cache_key = hashlib.sha256(f"{url}:{username}:{api_token}:{cloud}".encode()).hexdigest()
    
    with cache_lock:
        if cache_key in jira_client_cache:
            logger.debug(f"Cache HIT for Jira instance: {url}")
            return jira_client_cache[cache_key]
        
        logger.info(f"Cache MISS - creating new client for Jira instance: {url}")
        
        # Create new client with appropriate token authentication
        if cloud:
            # Jira Cloud: API token with username (Basic Auth)
            logger.debug("Using Jira Cloud API token authentication")
            client = Jira(
                url=url,
                username=username,
                password=api_token,
                cloud=True
            )
        else:
            # Jira Server/Data Center: Personal Access Token (PAT) - no username
            logger.debug("Using Jira Server/Data Center PAT authentication")
            client = Jira(url=url, token=api_token)
        
        # Store in cache
        jira_client_cache[cache_key] = client
        
        return client


def clear_cache():
    """Clear all cached clients (for testing/maintenance)."""
    with cache_lock:
        jira_client_cache.clear()
        logger.info("Jira client cache cleared")


def get_cache_info():
    """Get cache statistics."""
    with cache_lock:
        return {
            "size": len(jira_client_cache),
            "maxsize": jira_client_cache.maxsize,
            "ttl": jira_client_cache.ttl
        }

