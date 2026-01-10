"""Session-based state management for agents with Redis support.

This module manages agent session state with two modes:
1. Redis mode (production): Distributed state across multiple instances
2. In-memory mode (fallback): Local state when Redis unavailable

When Redis is enabled, session state is stored in Redis allowing:
- Multiple server instances to share state
- Load balancer can route requests to any instance
- Session state survives server restarts (if Redis has persistence)

When Redis is unavailable:
- Falls back to in-memory dictionaries
- Sessions are local to each server instance
- NOT suitable for multi-instance deployment
"""

from collections import defaultdict
from typing import Dict, Optional
import time
import os
import asyncio
from pydantic_ai.ag_ui import StateDeps

from config import logger
from core.models import AgentState
from utils.context import context_tuple
from database.redis_connection import (
    is_redis_available,
    redis_get,
    redis_set,
    redis_delete,
    redis_exists,
    redis_expire,
)

# Limits
TTL_SECONDS = int(os.getenv("SESSION_TTL_SECONDS", "3600"))
MAX_STATES_PER_SESSION = int(os.getenv("MAX_STATES_PER_SESSION", "20"))

# ============================================================================
# IN-MEMORY FALLBACK (when Redis unavailable)
# ============================================================================

# Session-based state management (in-memory fallback)
# Structure: session_states[session_id][agent_type:model] = StateDeps
_memory_session_states: Dict[str, Dict[str, StateDeps[AgentState]]] = defaultdict(dict)

# Track last access for session and per-key to support TTL/LRU eviction
_memory_session_last_access: Dict[str, float] = {}
_memory_state_last_access: Dict[str, Dict[str, float]] = defaultdict(dict)

# Throttling cleanup to avoid scanning all sessions on every request
_last_cleanup_time: float = 0
CLEANUP_INTERVAL_SECONDS = 60.0


def _cleanup_expired_sessions_memory() -> None:
    """Remove sessions not accessed within TTL (in-memory mode).
    
    Throttled to run at most once every CLEANUP_INTERVAL_SECONDS.
    """
    if TTL_SECONDS <= 0:
        return

    global _last_cleanup_time
    now = time.time()
    
    if now - _last_cleanup_time < CLEANUP_INTERVAL_SECONDS:
        return
        
    _last_cleanup_time = now
    
    expired = [
        sid for sid, ts in _memory_session_last_access.items() 
        if (now - ts) > TTL_SECONDS
    ]
    for sid in expired:
        _cleanup_session_memory(sid)


def _cleanup_session_memory(session_id: str) -> None:
    """Remove a session and all its states (in-memory mode)."""
    if session_id in _memory_session_states:
        logger.info(f"Cleaning up in-memory session session={session_id}")
        del _memory_session_states[session_id]
        _memory_session_last_access.pop(session_id, None)
        _memory_state_last_access.pop(session_id, None)


def _get_or_create_session_state_memory(
    session_id: str,
    key: str,
    agent_type: str,
    model: str,
    organization_id: str | None,
    team_id: str | None,
) -> StateDeps[AgentState]:
    """Get or create state for a session (in-memory mode)."""
    # TTL cleanup
    _cleanup_expired_sessions_memory()

    # Enforce per-session cap via LRU eviction
    if key not in _memory_session_states[session_id] and len(_memory_session_states[session_id]) >= MAX_STATES_PER_SESSION:
        # evict least-recently used state in this session
        per_state_access = _memory_state_last_access.get(session_id, {})
        if per_state_access:
            lru_key = min(per_state_access.items(), key=lambda kv: kv[1])[0]
            _memory_session_states[session_id].pop(lru_key, None)
            per_state_access.pop(lru_key, None)
            logger.info(f"Evicted least-recently used state session={session_id} key={lru_key}")

    if key not in _memory_session_states[session_id]:
        if logger.isEnabledFor(10):  # DEBUG
            logger.debug(
                "Creating new state (in-memory) session=%s agent=%s model=%s org=%s team=%s",
                session_id,
                agent_type,
                model,
                organization_id,
                team_id,
            )
        _memory_session_states[session_id][key] = StateDeps(AgentState())
    else:
        if logger.isEnabledFor(10):  # DEBUG
            state_obj = _memory_session_states[session_id][key].state
            logger.debug(
                "Reusing state (in-memory) session=%s steps=%d",
                session_id,
                len(state_obj.steps)
            )

    now = time.time()
    _memory_session_last_access[session_id] = now
    _memory_state_last_access[session_id][key] = now
    return _memory_session_states[session_id][key]


# ============================================================================
# REDIS MODE (production)
# ============================================================================

async def _get_or_create_session_state_redis(
    session_id: str,
    key: str,
    agent_type: str,
    model: str,
    organization_id: str | None,
    team_id: str | None,
) -> StateDeps[AgentState]:
    """Get or create state for a session (Redis mode)."""
    redis_key = f"session:{session_id}:{key}"
    
    # Try to get from Redis
    state_deps = await redis_get(redis_key)
    
    if state_deps is not None:
        if logger.isEnabledFor(10):  # DEBUG
            logger.debug(
                "Reusing state (Redis) session=%s agent=%s model=%s",
                session_id[:8],
                agent_type,
                model,
            )
        # Update TTL on access
        await redis_expire(redis_key, TTL_SECONDS)
        return state_deps
    
    # Create new state
    if logger.isEnabledFor(10):  # DEBUG
        logger.debug(
            "Creating new state (Redis) session=%s agent=%s model=%s org=%s team=%s",
            session_id[:8],
            agent_type,
            model,
            organization_id,
            team_id,
        )
    
    state_deps = StateDeps(AgentState())
    
    # Save to Redis with TTL
    await redis_set(redis_key, state_deps, ttl=TTL_SECONDS)
    
    return state_deps


async def _cleanup_session_redis(session_id: str) -> None:
    """Remove a session and all its states (Redis mode)."""
    from database.redis_connection import redis_delete_pattern
    
    logger.info(f"Cleaning up Redis session session={session_id[:8]}")
    
    # Delete all keys matching session:session_id:*
    deleted = await redis_delete_pattern(f"session:{session_id}:*")
    
    if logger.isEnabledFor(10):  # DEBUG
        logger.debug(f"Deleted {deleted} keys for session {session_id[:8]}")


# ============================================================================
# PUBLIC API (mode-agnostic)
# ============================================================================

def get_or_create_session_state(
    session_id: str,
    agent_type: str,
    model: str,
    organization_id: str | None,
    team_id: str | None,
) -> StateDeps[AgentState]:
    """Get or create state for a specific session and agent/model combo.
    
    Uses Redis when available, falls back to in-memory when unavailable.
    
    Args:
        session_id: The session/thread ID from the request
        agent_type: The type of agent (general, wiki, etc.)
        model: The model name (gemini-2.5-flash-lite, etc.)
        organization_id: Organization ID for multi-tenancy
        team_id: Team ID for multi-tenancy
    
    Returns:
        StateDeps instance for this session
    """
    org_token, team_token = context_tuple(organization_id, team_id)
    key = f"{org_token}:{team_token}:{agent_type}:{model}"
    
    # Check if Redis is available
    if is_redis_available():
        # Redis mode - need to run async operation
        # Since this is called from sync context, we need to handle it
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # We're already in an async context, create a task
                # This is a workaround - ideally this function should be async
                # but we need to maintain backward compatibility
                logger.warning(
                    "get_or_create_session_state called from async context - "
                    "consider making this function async"
                )
                # For now, fall back to memory
                return _get_or_create_session_state_memory(
                    session_id, key, agent_type, model, organization_id, team_id
                )
            else:
                # Run the async operation
                return loop.run_until_complete(
                    _get_or_create_session_state_redis(
                        session_id, key, agent_type, model, organization_id, team_id
                    )
                )
        except RuntimeError:
            # No event loop, create one
            return asyncio.run(
                _get_or_create_session_state_redis(
                    session_id, key, agent_type, model, organization_id, team_id
                )
            )
    else:
        # In-memory fallback
        return _get_or_create_session_state_memory(
            session_id, key, agent_type, model, organization_id, team_id
        )


async def get_or_create_session_state_async(
    session_id: str,
    agent_type: str,
    model: str,
    organization_id: str | None,
    team_id: str | None,
) -> StateDeps[AgentState]:
    """Async version of get_or_create_session_state.
    
    Prefer using this version when called from async context.
    
    Args:
        session_id: The session/thread ID from the request
        agent_type: The type of agent (general, wiki, etc.)
        model: The model name (gemini-2.5-flash-lite, etc.)
        organization_id: Organization ID for multi-tenancy
        team_id: Team ID for multi-tenancy
    
    Returns:
        StateDeps instance for this session
    """
    org_token, team_token = context_tuple(organization_id, team_id)
    key = f"{org_token}:{team_token}:{agent_type}:{model}"
    
    if is_redis_available():
        return await _get_or_create_session_state_redis(
            session_id, key, agent_type, model, organization_id, team_id
        )
    else:
        return _get_or_create_session_state_memory(
            session_id, key, agent_type, model, organization_id, team_id
        )


def cleanup_session(session_id: str) -> None:
    """Remove a session and all its states.
    
    Works in both Redis and in-memory modes.
    
    Args:
        session_id: The session ID to clean up
    """
    if is_redis_available():
        # Redis mode - need async
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # Create task if in async context
                asyncio.create_task(_cleanup_session_redis(session_id))
            else:
                loop.run_until_complete(_cleanup_session_redis(session_id))
        except RuntimeError:
            asyncio.run(_cleanup_session_redis(session_id))
    else:
        # In-memory mode
        _cleanup_session_memory(session_id)


async def cleanup_session_async(session_id: str) -> None:
    """Async version of cleanup_session.
    
    Prefer using this version when called from async context.
    
    Args:
        session_id: The session ID to clean up
    """
    if is_redis_available():
        await _cleanup_session_redis(session_id)
    else:
        _cleanup_session_memory(session_id)


def get_all_sessions() -> Dict[str, Dict[str, any]]:
    """Get information about all active sessions.
    
    Note: In Redis mode, this only returns in-memory fallback sessions.
    Redis sessions are distributed and not tracked centrally.
    
    Returns:
        Dictionary mapping session_id to session info
    """
    if is_redis_available():
        logger.warning(
            "get_all_sessions() called in Redis mode - "
            "Redis sessions are not tracked centrally. "
            "Returning empty dict. Consider implementing Redis SCAN for session enumeration."
        )
        return {}
    else:
        # In-memory mode - return session info
        return {
            session_id: {
                "agents": list(states.keys()),
                "agent_count": len(states),
            }
            for session_id, states in _memory_session_states.items()
        }
