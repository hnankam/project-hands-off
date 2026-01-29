"""Redis connection utilities for distributed caching and state management.

Redis Configuration:
- REDIS_HOST: Redis host (default: localhost)
- REDIS_PORT: Redis port (default: 6379)
- REDIS_DB: Redis database number (default: 0)
- REDIS_PASSWORD: Redis password (optional)
- REDIS_SSL: Enable SSL (default: false)
- REDIS_ENABLED: Enable Redis (default: true, falls back to in-memory if false)
- REDIS_MAX_CONNECTIONS: Max connection pool size (default: 50)
- REDIS_SOCKET_TIMEOUT: Socket timeout in seconds (default: 5)
- REDIS_SOCKET_CONNECT_TIMEOUT: Connection timeout in seconds (default: 5)

Note: For production, use Redis with persistence (RDB/AOF) to survive restarts.
For development, in-memory fallback is provided when Redis is unavailable.
"""

import os
import asyncio
import pickle
from typing import Any, Optional
from contextlib import asynccontextmanager

try:
    import redis.asyncio as redis
    from redis.asyncio import Redis, ConnectionPool
    from redis.exceptions import ConnectionError, TimeoutError, RedisError
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    Redis = None
    ConnectionPool = None

from config import logger

# Redis configuration from environment
REDIS_ENABLED = os.getenv("REDIS_ENABLED", "true").lower() == "true"
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "0"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD")
REDIS_SSL = os.getenv("REDIS_SSL", "false").lower() == "true"
REDIS_MAX_CONNECTIONS = int(os.getenv("REDIS_MAX_CONNECTIONS", "50"))
REDIS_SOCKET_TIMEOUT = int(os.getenv("REDIS_SOCKET_TIMEOUT", "5"))
REDIS_SOCKET_CONNECT_TIMEOUT = int(os.getenv("REDIS_SOCKET_CONNECT_TIMEOUT", "5"))

_redis_client: Optional[Redis] = None
_redis_pool: Optional[ConnectionPool] = None
_redis_lock = asyncio.Lock()
_redis_connection_error = False  # Track if Redis is unavailable


async def init_redis_connection() -> bool:
    """Initialize Redis connection pool.
    
    Returns:
        True if Redis is available and connected, False otherwise
    """
    global _redis_client, _redis_pool, _redis_connection_error
    
    if not REDIS_AVAILABLE:
        logger.warning("⚠️  Redis package not installed. Install with: pip install 'redis[hiredis]>=5.0.0'")
        logger.warning("⚠️  Falling back to in-memory state management (NOT suitable for multi-instance deployment)")
        return False
    
    if not REDIS_ENABLED:
        logger.info("ℹ️  Redis disabled via REDIS_ENABLED=false")
        logger.warning("⚠️  Using in-memory state management (NOT suitable for multi-instance deployment)")
        return False
    
    async with _redis_lock:
        if _redis_client is not None:
            return True
        
        try:
            # Build connection pool kwargs
            pool_kwargs = {
                "host": REDIS_HOST,
                "port": REDIS_PORT,
                "db": REDIS_DB,
                "password": REDIS_PASSWORD if REDIS_PASSWORD else None,
                "max_connections": REDIS_MAX_CONNECTIONS,
                "socket_timeout": REDIS_SOCKET_TIMEOUT,
                "socket_connect_timeout": REDIS_SOCKET_CONNECT_TIMEOUT,
                "decode_responses": False,  # We'll handle encoding/decoding manually for pickle
                "retry_on_timeout": True,
                "health_check_interval": 30,
            }
            
            # Add SSL if enabled (redis-py 5.x uses connection_class for SSL)
            if REDIS_SSL:
                from redis.asyncio import SSLConnection
                pool_kwargs["connection_class"] = SSLConnection
            
            # Create connection pool
            _redis_pool = ConnectionPool(**pool_kwargs)
            
            # Create client
            _redis_client = Redis(connection_pool=_redis_pool)
            
            # Test connection
            await _redis_client.ping()
            
            logger.info(
                f"✅ Redis connected: {REDIS_HOST}:{REDIS_PORT} (db={REDIS_DB}, pool_size={REDIS_MAX_CONNECTIONS})"
            )
            _redis_connection_error = False
            return True
            
        except (ConnectionError, TimeoutError) as e:
            logger.error(f"❌ Redis connection failed: {e}")
            logger.warning("⚠️  Falling back to in-memory state management (NOT suitable for multi-instance deployment)")
            _redis_connection_error = True
            _redis_client = None
            _redis_pool = None
            return False
        except Exception as e:
            logger.error(f"❌ Unexpected error initializing Redis: {e}")
            logger.warning("⚠️  Falling back to in-memory state management (NOT suitable for multi-instance deployment)")
            _redis_connection_error = True
            _redis_client = None
            _redis_pool = None
            return False


async def close_redis_connection() -> None:
    """Close Redis connection pool."""
    global _redis_client, _redis_pool
    
    async with _redis_lock:
        if _redis_client is not None:
            await _redis_client.aclose()
            _redis_client = None
        
        if _redis_pool is not None:
            await _redis_pool.aclose()
            _redis_pool = None
        
        logger.info("Redis connection closed")


def get_redis_client() -> Optional[Redis]:
    """Get the Redis client instance.
    
    Returns:
        Redis client if available, None otherwise
    """
    return _redis_client


def is_redis_available() -> bool:
    """Check if Redis is available and connected.
    
    Returns:
        True if Redis is available, False otherwise
    """
    return _redis_client is not None and not _redis_connection_error


async def test_redis_connection() -> bool:
    """Test Redis connection for health checks.
    
    Returns:
        True if Redis is available and responding, False otherwise
    """
    if not is_redis_available():
        return False
    
    try:
        client = get_redis_client()
        if client is None:
            return False
        
        # Simple PING test
        result = await client.ping()
        return result is True
    except Exception as e:
        logger.debug(f"Redis health check failed: {e}")
        return False


async def redis_get(key: str, default: Any = None) -> Any:
    """Get a value from Redis with automatic deserialization.
    
    Args:
        key: Redis key
        default: Default value if key doesn't exist or Redis unavailable
        
    Returns:
        Deserialized value or default
    """
    if not is_redis_available():
        return default
    
    try:
        value = await _redis_client.get(key)
        if value is None:
            return default
        return pickle.loads(value)
    except (RedisError, pickle.PickleError) as e:
        logger.warning(f"Redis get error for key '{key}': {e}")
        return default


async def redis_set(key: str, value: Any, ttl: Optional[int] = None) -> bool:
    """Set a value in Redis with automatic serialization.
    
    Args:
        key: Redis key
        value: Value to store (will be pickled)
        ttl: Time-to-live in seconds (optional)
        
    Returns:
        True if successful, False otherwise
    """
    if not is_redis_available():
        return False
    
    try:
        serialized = pickle.dumps(value, protocol=pickle.HIGHEST_PROTOCOL)
        if ttl:
            await _redis_client.setex(key, ttl, serialized)
        else:
            await _redis_client.set(key, serialized)
        return True
    except (RedisError, pickle.PickleError) as e:
        logger.warning(f"Redis set error for key '{key}': {e}")
        return False


async def redis_delete(key: str) -> bool:
    """Delete a key from Redis.
    
    Args:
        key: Redis key to delete
        
    Returns:
        True if successful, False otherwise
    """
    if not is_redis_available():
        return False
    
    try:
        await _redis_client.delete(key)
        return True
    except RedisError as e:
        logger.warning(f"Redis delete error for key '{key}': {e}")
        return False


async def redis_delete_pattern(pattern: str) -> int:
    """Delete all keys matching a pattern.
    
    Args:
        pattern: Redis key pattern (e.g., "session:*")
        
    Returns:
        Number of keys deleted, or 0 if Redis unavailable
    """
    if not is_redis_available():
        return 0
    
    try:
        deleted = 0
        async for key in _redis_client.scan_iter(match=pattern):
            await _redis_client.delete(key)
            deleted += 1
        return deleted
    except RedisError as e:
        logger.warning(f"Redis delete pattern error for pattern '{pattern}': {e}")
        return 0


async def redis_exists(key: str) -> bool:
    """Check if a key exists in Redis.
    
    Args:
        key: Redis key
        
    Returns:
        True if key exists, False otherwise
    """
    if not is_redis_available():
        return False
    
    try:
        return bool(await _redis_client.exists(key))
    except RedisError as e:
        logger.warning(f"Redis exists error for key '{key}': {e}")
        return False


async def redis_expire(key: str, ttl: int) -> bool:
    """Set TTL on an existing key.
    
    Args:
        key: Redis key
        ttl: Time-to-live in seconds
        
    Returns:
        True if successful, False otherwise
    """
    if not is_redis_available():
        return False
    
    try:
        await _redis_client.expire(key, ttl)
        return True
    except RedisError as e:
        logger.warning(f"Redis expire error for key '{key}': {e}")
        return False


async def redis_ttl(key: str) -> int:
    """Get remaining TTL for a key.
    
    Args:
        key: Redis key
        
    Returns:
        TTL in seconds, -1 if no TTL, -2 if key doesn't exist, 0 if Redis unavailable
    """
    if not is_redis_available():
        return 0
    
    try:
        return await _redis_client.ttl(key)
    except RedisError as e:
        logger.warning(f"Redis TTL error for key '{key}': {e}")
        return 0


# Context manager for batch operations
@asynccontextmanager
async def redis_pipeline():
    """Context manager for Redis pipeline (batch operations).
    
    Usage:
        async with redis_pipeline() as pipe:
            await pipe.set('key1', 'value1')
            await pipe.set('key2', 'value2')
            await pipe.execute()
    """
    if not is_redis_available():
        # Return a no-op pipeline if Redis unavailable
        class NoOpPipeline:
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                pass
            def __getattr__(self, name):
                async def method(*args, **kwargs):
                    pass
                return method
        
        yield NoOpPipeline()
        return
    
    try:
        async with _redis_client.pipeline() as pipe:
            yield pipe
    except RedisError as e:
        logger.warning(f"Redis pipeline error: {e}")
        yield NoOpPipeline()
