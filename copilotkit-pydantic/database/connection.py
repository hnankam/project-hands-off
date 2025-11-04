"""Database connection utilities for PostgreSQL (Neon)."""

import os
import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager
import asyncio

from config import logger
_pool: AsyncConnectionPool | None = None
_pool_lock = asyncio.Lock()



def get_connection_string() -> str:
    """Build PostgreSQL connection string from environment variables."""
    host = os.getenv('DB_HOST')
    port = os.getenv('DB_PORT', '5432')
    database = os.getenv('DB_DATABASE')
    username = os.getenv('DB_USERNAME')
    password = os.getenv('DB_PASSWORD')
    other_params = os.getenv('DB_OTHER_PARAMS', 'sslmode=require')
    
    if not all([host, database, username, password]):
        raise ValueError("Database connection parameters not fully configured in .env")
    
    return f"postgresql://{username}:{password}@{host}:{port}/{database}?{other_params}"


@asynccontextmanager
async def get_db_connection():
    """Get an async database connection from the pool with automatic cleanup."""
    global _pool
    if _pool is None:
        await init_connection_pool()
    assert _pool is not None
    try:
        async with _pool.connection() as conn:
            # ensure rows are returned as dicts and apply sensible timeouts per session
            conn.row_factory = dict_row
            try:
                async with conn.cursor() as cur:
                    # 10s statement timeout, 5min idle in transaction timeout
                    await cur.execute(
                        "SET statement_timeout TO 10000; SET idle_in_transaction_session_timeout TO 300000;"
                    )
            except Exception:
                # Ignore if SET fails (e.g., insufficient perms); continue
                pass
            yield conn
    except psycopg.OperationalError as exc:
        logger.warning("[DB] Connection error; resetting pool", exc_info=True)
        await reset_connection_pool(force=True)
        await init_connection_pool()
        raise


async def init_connection_pool(min_size: int = 1, max_size: int = 10) -> None:
    """Initialize the global async connection pool (idempotent)."""
    global _pool
    async with _pool_lock:
        if _pool is not None:
            return
        conn_string = get_connection_string()
        _pool = AsyncConnectionPool(
            conninfo=conn_string,
            min_size=min_size,
            max_size=max_size,
            timeout=10,
            kwargs={"autocommit": True},
            open=False,
        )
        await _pool.open()
        logger.info("Initialized PostgreSQL async connection pool")


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
            await _pool.close()
        finally:
            _pool = None


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
    DROP TABLE IF EXISTS base_instructions CASCADE;
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

