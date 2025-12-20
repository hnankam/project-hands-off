"""GitHub client connection pooling with TTL-based cache."""

from github import Github
from cachetools import TTLCache
import hashlib
from threading import Lock
import logging

logger = logging.getLogger(__name__)

github_client_cache = TTLCache(maxsize=1000, ttl=3600)
cache_lock = Lock()


def get_github_client(token: str, base_url: str = "https://api.github.com") -> Github:
    """
    Get cached GitHub client or create new one.

    Caches clients by hash of (token + base_url) to reuse connections
    for the same user/GitHub instance combination.

    Args:
        token: Personal Access Token or Fine-grained token
        base_url: GitHub API base URL (default: public GitHub, use for GitHub Enterprise)

    Returns:
        Github instance (cached or new)
    """
    cache_key = hashlib.sha256(f"{token}:{base_url}".encode()).hexdigest()

    with cache_lock:
        if cache_key in github_client_cache:
            logger.debug(f"Cache HIT for GitHub: {base_url}")
            return github_client_cache[cache_key]

        logger.info(f"Cache MISS - creating new GitHub client for: {base_url}")

        # Create GitHub client
        if base_url == "https://api.github.com":
            # Public GitHub
            client = Github(token)
        else:
            # GitHub Enterprise
            client = Github(base_url=base_url, login_or_token=token)

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

