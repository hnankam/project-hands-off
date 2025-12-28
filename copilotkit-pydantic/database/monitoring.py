"""Database connection monitoring utilities for Neon PostgreSQL.

Provides tools to monitor connection pool health, detect cold starts,
and track connection patterns for optimization.
"""

import time
from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime, timedelta

from config import logger


@dataclass
class ConnectionStats:
    """Statistics for database connection monitoring."""
    
    total_connections: int = 0
    successful_connections: int = 0
    failed_connections: int = 0
    cold_starts_detected: int = 0
    total_connection_time: float = 0.0
    slow_connections: int = 0  # > 2 seconds
    last_connection_time: Optional[datetime] = None
    last_error: Optional[str] = None
    last_error_time: Optional[datetime] = None
    retry_attempts: int = 0
    
    def record_connection(self, duration: float, success: bool, is_cold_start: bool = False):
        """Record a connection attempt."""
        self.total_connections += 1
        self.last_connection_time = datetime.now()
        
        if success:
            self.successful_connections += 1
            self.total_connection_time += duration
            
            if is_cold_start:
                self.cold_starts_detected += 1
            
            if duration > 2.0:
                self.slow_connections += 1
        else:
            self.failed_connections += 1
    
    def record_error(self, error_msg: str):
        """Record a connection error."""
        self.last_error = error_msg
        self.last_error_time = datetime.now()
        self.failed_connections += 1
    
    def record_retry(self):
        """Record a retry attempt."""
        self.retry_attempts += 1
    
    @property
    def success_rate(self) -> float:
        """Calculate connection success rate."""
        if self.total_connections == 0:
            return 0.0
        return (self.successful_connections / self.total_connections) * 100
    
    @property
    def avg_connection_time(self) -> float:
        """Calculate average connection time."""
        if self.successful_connections == 0:
            return 0.0
        return self.total_connection_time / self.successful_connections
    
    def get_summary(self) -> dict:
        """Get a summary of connection statistics."""
        return {
            'total_connections': self.total_connections,
            'successful': self.successful_connections,
            'failed': self.failed_connections,
            'success_rate': f"{self.success_rate:.1f}%",
            'cold_starts': self.cold_starts_detected,
            'slow_connections': self.slow_connections,
            'avg_connection_time': f"{self.avg_connection_time:.3f}s",
            'retry_attempts': self.retry_attempts,
            'last_connection': self.last_connection_time.isoformat() if self.last_connection_time else None,
            'last_error': self.last_error,
            'last_error_time': self.last_error_time.isoformat() if self.last_error_time else None,
        }


# Global connection statistics
_connection_stats = ConnectionStats()


def get_connection_stats() -> ConnectionStats:
    """Get the global connection statistics."""
    return _connection_stats


def reset_connection_stats():
    """Reset connection statistics."""
    global _connection_stats
    _connection_stats = ConnectionStats()


def log_connection_stats():
    """Log current connection statistics."""
    stats = _connection_stats.get_summary()
    logger.info(
        "[DB Monitoring] Connection Stats: "
        f"total={stats['total_connections']}, "
        f"success_rate={stats['success_rate']}, "
        f"cold_starts={stats['cold_starts']}, "
        f"avg_time={stats['avg_connection_time']}, "
        f"retries={stats['retry_attempts']}"
    )


def log_pool_health():
    """Log pool health information."""
    from database.connection import _pool
    
    if _pool is None:
        logger.info("[DB Monitoring] Pool not initialized")
        return
    
    try:
        pool_stats = _pool.get_stats()
        logger.info(
            "[DB Monitoring] Pool Health: "
            f"size={pool_stats.pool_size}, "
            f"available={pool_stats.pool_available}, "
            f"waiting={pool_stats.requests_waiting}"
        )
    except Exception as e:
        logger.warning(f"[DB Monitoring] Could not get pool stats: {e}")


async def run_health_check() -> bool:
    """Run a database health check.
    
    Returns:
        True if database is healthy, False otherwise
    """
    from database.connection import get_db_connection
    
    start_time = time.time()
    try:
        async with get_db_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT 1 as health_check, NOW() as server_time")
                result = await cur.fetchone()
                
                duration = time.time() - start_time
                _connection_stats.record_connection(duration, True, duration > 2.0)
                
                logger.info(
                    f"[DB Health Check] ✓ Healthy (response_time={duration:.3f}s, "
                    f"server_time={result['server_time']})"
                )
                return True
                
    except Exception as e:
        duration = time.time() - start_time
        _connection_stats.record_error(str(e))
        logger.error(
            f"[DB Health Check] ✗ Unhealthy (error={e}, time={duration:.3f}s)"
        )
        return False


async def check_cold_start_status() -> dict:
    """Check if database is likely in cold start state.
    
    Returns:
        Dictionary with cold start information
    """
    from database.connection import _last_successful_query_time
    
    time_since_last_query = time.time() - _last_successful_query_time
    is_likely_cold = time_since_last_query > 300  # 5+ minutes
    
    return {
        'time_since_last_query': time_since_last_query,
        'is_likely_cold': is_likely_cold,
        'cold_start_threshold': 300,
        'recommendation': (
            'Database may be suspended. Next query may take 1-3 seconds.'
            if is_likely_cold
            else 'Database is likely warm.'
        )
    }


def get_monitoring_report() -> dict:
    """Get a comprehensive monitoring report.
    
    Returns:
        Dictionary with all monitoring information
    """
    from database.connection import _pool
    
    report = {
        'timestamp': datetime.now().isoformat(),
        'connection_stats': _connection_stats.get_summary(),
        'pool_initialized': _pool is not None,
    }
    
    if _pool is not None:
        try:
            pool_stats = _pool.get_stats()
            report['pool_stats'] = {
                'size': pool_stats.pool_size,
                'available': pool_stats.pool_available,
                'waiting': pool_stats.requests_waiting,
            }
        except Exception as e:
            report['pool_stats'] = {'error': str(e)}
    
    return report


# Periodic monitoring task (optional)
async def periodic_monitoring_task(interval_seconds: int = 300):
    """Run periodic monitoring and logging.
    
    Args:
        interval_seconds: Interval between monitoring runs (default: 5 minutes)
    """
    import asyncio
    
    logger.info(f"[DB Monitoring] Starting periodic monitoring (interval={interval_seconds}s)")
    
    while True:
        try:
            await asyncio.sleep(interval_seconds)
            
            # Log stats
            log_connection_stats()
            log_pool_health()
            
            # Run health check
            await run_health_check()
            
            # Check cold start status
            cold_start_info = await check_cold_start_status()
            if cold_start_info['is_likely_cold']:
                logger.info(
                    f"[DB Monitoring] {cold_start_info['recommendation']}"
                )
            
        except asyncio.CancelledError:
            logger.info("[DB Monitoring] Periodic monitoring stopped")
            break
        except Exception as e:
            logger.error(f"[DB Monitoring] Error in periodic monitoring: {e}")

