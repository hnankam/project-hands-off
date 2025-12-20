"""GraphServiceClient connection pooling with TTL-based cache."""

from msgraph import GraphServiceClient
from azure.identity import ClientSecretCredential
from cachetools import TTLCache
import hashlib
from threading import Lock
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Cache for Graph clients (key: hash of credentials, value: GraphServiceClient)
graph_client_cache = TTLCache(maxsize=1000, ttl=3600)  # 1 hour TTL
cache_lock = Lock()


def get_graph_client(
    tenant_id: str,
    client_id: str,
    client_secret: str,
) -> GraphServiceClient:
    """
    Get cached GraphServiceClient or create new one.

    Caches clients by hash of (tenant_id + client_id + client_secret) to reuse
    connections for the same user/tenant combination.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret

    Returns:
        GraphServiceClient instance (cached or new)
    """
    # Create cache key from credentials
    cache_key = hashlib.sha256(
        f"{tenant_id}:{client_id}:{client_secret}".encode()
    ).hexdigest()

    with cache_lock:
        if cache_key in graph_client_cache:
            logger.debug(f"Cache HIT for tenant: {tenant_id}")
            return graph_client_cache[cache_key]

        logger.info(f"Cache MISS - creating new GraphServiceClient for tenant: {tenant_id}")

        # Create credentials
        credentials = ClientSecretCredential(
            tenant_id=tenant_id,
            client_id=client_id,
            client_secret=client_secret,
        )

        # Create Graph client
        client = GraphServiceClient(credentials=credentials)
        
        graph_client_cache[cache_key] = client
        return client


def clear_cache():
    """Clear all cached clients (for testing/maintenance)."""
    with cache_lock:
        graph_client_cache.clear()
        logger.info("Graph client cache cleared")


def get_cache_info():
    """Get cache statistics."""
    with cache_lock:
        return {
            "graph_cache_size": len(graph_client_cache),
            "graph_cache_maxsize": graph_client_cache.maxsize,
            "graph_cache_ttl": graph_client_cache.ttl,
        }

