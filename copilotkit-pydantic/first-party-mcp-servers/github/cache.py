"""GitHub client connection pooling with TTL-based cache.

Credentials are resolved from credential keys at runtime.
The cache keys are based on credential keys, not the resolved values.
"""

import sys
from pathlib import Path

from github import Github
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
github_client_cache = TTLCache(maxsize=1000, ttl=3600)
cache_lock = Lock()


def get_github_client(token_credential_key: str, base_url_credential_key: str = "") -> Github:
    """
    Get cached GitHub client or create new one.
    
    Caches clients by credential keys. Credentials are resolved from the database
    using the shared credential_resolver module.

    Args:
        token_credential_key: Globally unique key for the GitHub Personal Access Token credential
        base_url_credential_key: Globally unique key for the GitHub API base URL credential (optional, defaults to public GitHub)

    Returns:
        Github instance (cached or new)
    """
    # Cache key is based on credential keys (stable and readable)
    cache_key = f"gh:{token_credential_key}:{base_url_credential_key}"

    with cache_lock:
        if cache_key in github_client_cache:
            logger.debug(f"Cache HIT for GitHub client (token_key: {token_credential_key})")
            return github_client_cache[cache_key]

        logger.info(f"Cache MISS - creating new GitHub client (token_key: {token_credential_key})")

        # Resolve credential keys to actual values
        token = resolve_credential(token_credential_key)
        base_url = resolve_credential(base_url_credential_key) if base_url_credential_key else "https://api.github.com"

        # Create GitHub client
        if base_url == "https://api.github.com":
            # Public GitHub
            client = Github(token)
        else:
            # GitHub Enterprise
            client = Github(base_url=base_url, login_or_token=token)

        # Store in cache
        github_client_cache[cache_key] = client
        
        return client


def clear_cache():
    """Clear all cached clients (for testing/maintenance)."""
    with cache_lock:
        github_client_cache.clear()
        logger.info("GitHub client cache cleared")


def get_cache_info():
    """Get cache statistics."""
    with cache_lock:
        return {
            "github_cache_size": len(github_client_cache),
            "github_cache_maxsize": github_client_cache.maxsize,
            "github_cache_ttl": github_client_cache.ttl,
        }

