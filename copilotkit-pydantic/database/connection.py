"""Database connection utilities for PostgreSQL (Neon-optimized).

Connection Pool Configuration:
- DB_HOST: PostgreSQL host (should be Neon pooling endpoint)
- DB_PORT: PostgreSQL port (default: 5432)
- DB_DATABASE: Database name
- DB_USERNAME: Database user
- DB_PASSWORD: Database password
- DB_OTHER_PARAMS: Additional connection params (default: sslmode=require)
- DB_POOL_MIN_SIZE: Minimum connections (default: 0 for Neon)
- DB_POOL_MAX_SIZE: Maximum connections (default: 5 for Neon)
- DB_CONNECT_TIMEOUT: Connection timeout in seconds (default: 10)
- DB_STATEMENT_TIMEOUT: Statement timeout in milliseconds (default: 10000)

Note: When using Neon's pooling endpoint, keep application pool small (0-5 connections)
as Neon's pooler handles the real connection pooling.
"""

import os
import time
import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager
import asyncio

from config import logger

# Connection pool configuration from environment (Neon-optimized defaults)
DB_POOL_MIN_SIZE = int(os.getenv("DB_POOL_MIN_SIZE", "0"))  # 0 for Neon - on-demand connections
DB_POOL_MAX_SIZE = int(os.getenv("DB_POOL_MAX_SIZE", "5"))  # Small pool - Neon handles pooling
DB_CONNECT_TIMEOUT = int(os.getenv("DB_CONNECT_TIMEOUT", "10"))  # 10s for cold starts
DB_STATEMENT_TIMEOUT = int(os.getenv("DB_STATEMENT_TIMEOUT", "10000"))  # 10s default

_pool: AsyncConnectionPool | None = None
_pool_lock = asyncio.Lock()
_last_successful_query_time = time.time()  # Track for cold start detection



def get_connection_string() -> str:
    """Build PostgreSQL connection string from environment variables.
    
    Optimized for Neon with connection-level defaults that work with transaction pooling.
    """
    host = os.getenv('DB_HOST')
    port = os.getenv('DB_PORT', '5432')
    database = os.getenv('DB_DATABASE')
    username = os.getenv('DB_USERNAME')
    password = os.getenv('DB_PASSWORD')
    other_params = os.getenv('DB_OTHER_PARAMS', 'sslmode=require')
    
    if not all([host, database, username, password]):
        raise ValueError("Database connection parameters not fully configured in .env")
    
    # Build connection string with timeout parameter
    # Note: We don't set statement_timeout in the connection string for Neon's transaction pooling
    # as session-level parameters don't persist across pooled transactions
    conn_string = f"postgresql://{username}:{password}@{host}:{port}/{database}"
    
    # Add connection timeout to other_params if not already present
    if 'connect_timeout' not in other_params:
        if other_params:
            other_params += f'&connect_timeout={DB_CONNECT_TIMEOUT}'
        else:
            other_params = f'connect_timeout={DB_CONNECT_TIMEOUT}'
    
    if other_params:
        conn_string += f'?{other_params}'
    
    return conn_string


@asynccontextmanager
async def get_db_connection():
    """Get an async database connection from the pool with Neon cold-start handling.
    
    Optimized for Neon serverless architecture:
    - Handles cold starts (database wake-up after auto-suspend)
    - Works with Neon's transaction-level pooling
    - No aggressive pool resets (lets retries handle issues)
    - Tracks connection timing for monitoring
    """
    global _pool, _last_successful_query_time
    if _pool is None:
        await init_connection_pool()
    assert _pool is not None
    
    start_time = time.time()
    max_retries = 3
    
    for attempt in range(max_retries):
        try:
            async with _pool.connection() as conn:
                # Configure connection
                conn.row_factory = dict_row
                
                # Health check with cold-start tolerance
                try:
                    async with conn.cursor() as cur:
                        # Simple health check
                        await cur.execute("SELECT 1")
                except Exception as e:
                    # Connection is bad, retry
                    if attempt < max_retries - 1:
                        wait_time = 3 if attempt == 0 else 1  # Longer wait on first retry
                        logger.warning(
                            f"[DB] Connection health check failed (attempt {attempt + 1}/{max_retries}): {e}. "
                            f"Retrying in {wait_time}s..."
                        )
                        await asyncio.sleep(wait_time)
                        continue
                    raise
                
                # Log potential cold starts
                time_since_last_query = start_time - _last_successful_query_time
                if time_since_last_query > 300:  # 5+ minutes since last query
                    logger.info(
                        f"[DB] Potential cold start detected - {time_since_last_query:.0f}s since last query"
                    )
                
                yield conn
                
                # Update last successful query time and record stats
                _last_successful_query_time = time.time()
                connection_time = time.time() - start_time
                
                # Record connection stats for monitoring
                try:
                    from database.monitoring import get_connection_stats
                    stats = get_connection_stats()
                    stats.record_connection(connection_time, True, connection_time > 2)
                except ImportError:
                    pass  # Monitoring module not available
                
                # Log slow connection acquisitions (likely cold starts)
                if connection_time > 2:
                    logger.warning(
                        f"[DB] Slow connection acquisition: {connection_time:.2f}s (possible cold start)"
                    )
                
                return  # Success
                
        except psycopg.OperationalError as exc:
            error_msg = str(exc).lower()
            
            # Check if it's a cold start scenario
            is_cold_start = any(keyword in error_msg for keyword in [
                'timeout', 'connection refused', 'could not connect',
                'no route to host', 'network unreachable', 'connection timed out'
            ])
            
            if attempt < max_retries - 1:
                # Record retry for monitoring
                try:
                    from database.monitoring import get_connection_stats
                    stats = get_connection_stats()
                    stats.record_retry()
                except ImportError:
                    pass
                
                wait_time = 3 if is_cold_start else 0.5
                logger.warning(
                    f"[DB] Connection error (attempt {attempt + 1}/{max_retries}, "
                    f"cold_start={is_cold_start}): {exc}. Retrying in {wait_time}s..."
                )
                await asyncio.sleep(wait_time)
                continue
            
            # Final attempt failed - record error
            connection_time = time.time() - start_time
            try:
                from database.monitoring import get_connection_stats
                stats = get_connection_stats()
                stats.record_error(str(exc))
            except ImportError:
                pass
            
            logger.error(
                f"[DB] Connection failed after {max_retries} attempts ({connection_time:.2f}s): {exc}"
            )
            raise


async def init_connection_pool(
    min_size: int | None = None, 
    max_size: int | None = None
) -> None:
    """Initialize the global async connection pool (idempotent).
    
    Optimized for Neon serverless PostgreSQL:
    - Small pool size (Neon's pooler handles real connection pooling)
    - Longer timeout for cold starts
    - Short max_idle to avoid stale connections
    - Disabled keepalives (Neon's pooler handles this)
    
    Args:
        min_size: Minimum pool size (default: DB_POOL_MIN_SIZE env var or 0)
        max_size: Maximum pool size (default: DB_POOL_MAX_SIZE env var or 5)
    """
    global _pool
    async with _pool_lock:
        if _pool is not None:
            return
        
        min_size = min_size if min_size is not None else DB_POOL_MIN_SIZE
        max_size = max_size if max_size is not None else DB_POOL_MAX_SIZE
        
        conn_string = get_connection_string()
        _pool = AsyncConnectionPool(
            conninfo=conn_string,
            min_size=min_size,  # 0 for Neon - connections created on demand
            max_size=max_size,  # Small (5) - Neon handles the real pooling
            timeout=30,  # Longer timeout for cold starts
            max_lifetime=600,  # 10 minutes - recycle before Neon auto-suspend
            max_idle=120,  # 2 minutes - avoid stale connections
            num_workers=2,  # Fewer background workers
            kwargs={
                "autocommit": True,
                "connect_timeout": DB_CONNECT_TIMEOUT,
            },
            open=False,
        )
        await _pool.open()
        logger.info(
            "PostgreSQL pool initialized for Neon (min=%d, max=%d, timeout=30s, "
            "max_lifetime=600s, max_idle=120s)",
            min_size, max_size
        )


async def reset_connection_pool(force: bool = False) -> None:
    """Close and discard the current pool so the next call re-initializes it."""
    global _pool
    async with _pool_lock:
        if _pool is None:
            return
        if not force and not _pool.closed:
            # No need to reset a healthy pool unless forced
            return
        try:
            # logger.debug("Closing connection pool...")
            await _pool.close()
            # Give more time for connections to fully close and cleanup
            await asyncio.sleep(0.3)
            # logger.debug("Connection pool closed")
        finally:
            _pool = None


async def close_connection_pool() -> None:
    """Gracefully close the connection pool."""
    global _pool
    async with _pool_lock:
        if _pool is None:
            return
        await _pool.close()
        _pool = None
        logger.info("Connection pool closed")


async def init_database(schema_file: Optional[str] = None):
    """Initialize database with schema.
    
    Args:
        schema_file: Path to SQL schema file. Defaults to database/schema.sql
    """
    if schema_file is None:
        schema_file = Path(__file__).parent / 'schema.sql'
    else:
        schema_file = Path(schema_file)
    
    if not schema_file.exists():
        raise FileNotFoundError(f"Schema file not found: {schema_file}")
    
    logger.info(f"Initializing database with schema: {schema_file}")
    
    with open(schema_file, 'r') as f:
        schema_sql = f.read()
    
    # Use a standalone connection for schema initialization
    async with await psycopg.AsyncConnection.connect(get_connection_string()) as conn:
        async with conn.cursor() as cur:
            # Execute schema
            await cur.execute(schema_sql)
            await conn.commit()
            logger.info("Database schema created successfully")
    
    return True


async def test_connection():
    """Test database connection."""
    try:
        async with get_db_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT version()")
                result = await cur.fetchone()
                logger.info(f"Database connected: {result['version'][:50]}...")
                return True
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return False


async def drop_all_tables():
    """Drop all tables (DANGEROUS - use only for dev/testing)."""
    logger.warning("Dropping all tables...")
    
    drop_sql = """
    DROP TABLE IF EXISTS audit_logs CASCADE;
    DROP TABLE IF EXISTS usage CASCADE;
    DROP TABLE IF EXISTS config_versions CASCADE;
    DROP TABLE IF EXISTS agents CASCADE;
    DROP TABLE IF EXISTS models CASCADE;
    DROP TABLE IF EXISTS providers CASCADE;
    DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;
    """
    
    async with await psycopg.AsyncConnection.connect(get_connection_string()) as conn:
        async with conn.cursor() as cur:
            await cur.execute(drop_sql)
            await conn.commit()
            logger.info("All tables dropped")
    
    return True

