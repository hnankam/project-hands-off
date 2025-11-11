"""Session-based state management for agents."""

from collections import defaultdict
from typing import Dict
import time
import os
from pydantic_ai.ag_ui import StateDeps

from config import logger
from core.models import AgentState
from utils.context import context_tuple

# Session-based state management
# Structure: session_states[session_id][agent_type:model] = StateDeps
session_states: Dict[str, Dict[str, StateDeps[AgentState]]] = defaultdict(dict)

# Track last access for session and per-key to support TTL/LRU eviction
_session_last_access: Dict[str, float] = {}
_state_last_access: Dict[str, Dict[str, float]] = defaultdict(dict)

# Limits
TTL_SECONDS = int(os.getenv("SESSION_TTL_SECONDS", "3600"))
MAX_STATES_PER_SESSION = int(os.getenv("MAX_STATES_PER_SESSION", "20"))


def get_or_create_session_state(
    session_id: str,
    agent_type: str,
    model: str,
    organization_id: str | None,
    team_id: str | None,
) -> StateDeps[AgentState]:
    """Get or create state for a specific session and agent/model combo.
    
    Args:
        session_id: The session/thread ID from the request
        agent_type: The type of agent (general, wiki, etc.)
        model: The model name (gemini-2.5-flash-lite, etc.)
    
    Returns:
        StateDeps instance for this session
    """
    org_token, team_token = context_tuple(organization_id, team_id)
    key = f"{org_token}:{team_token}:{agent_type}:{model}"

    # TTL cleanup for the session
    _cleanup_expired_sessions()

    # Enforce per-session cap via LRU eviction
    if key not in session_states[session_id] and len(session_states[session_id]) >= MAX_STATES_PER_SESSION:
        # evict least-recently used state in this session
        per_state_access = _state_last_access.get(session_id, {})
        if per_state_access:
            lru_key = min(per_state_access.items(), key=lambda kv: kv[1])[0]
            session_states[session_id].pop(lru_key, None)
            per_state_access.pop(lru_key, None)
            logger.info(f"Evicted least-recently used state session={session_id} key={lru_key}")

    if key not in session_states[session_id]:
        logger.debug(
            "Creating new state session=%s agent=%s model=%s org=%s team=%s",
            session_id,
            agent_type,
            model,
            organization_id,
            team_id,
        )
        session_states[session_id][key] = StateDeps(AgentState())
        print(f"[AGENT_STATE_BACKEND] 🆕 Created NEW state for session={session_id[:8]} - steps={len(session_states[session_id][key].state.steps)}")
    else:
        logger.debug(
            "Reusing state session=%s agent=%s model=%s org=%s team=%s",
            session_id,
            agent_type,
            model,
            organization_id,
            team_id,
        )
        state_obj = session_states[session_id][key].state
        print(f"[AGENT_STATE_BACKEND] ♻️  REUSING state for session={session_id[:8]}")
        print(f"[AGENT_STATE_BACKEND]    State has {len(state_obj.steps)} steps:")
        for i, step in enumerate(state_obj.steps):
            print(f"[AGENT_STATE_BACKEND]      Step {i}: {step.description[:50]}... (status={step.status})")

    now = time.time()
    _session_last_access[session_id] = now
    _state_last_access[session_id][key] = now
    return session_states[session_id][key]


def cleanup_session(session_id: str) -> None:
    """Remove a session and all its states.
    
    Args:
        session_id: The session ID to clean up
    """
    if session_id in session_states:
        logger.info(f"Cleaning up session session={session_id}")
        del session_states[session_id]
        _session_last_access.pop(session_id, None)
        _state_last_access.pop(session_id, None)


def _cleanup_expired_sessions() -> None:
    """Remove sessions not accessed within TTL."""
    if TTL_SECONDS <= 0:
        return
    now = time.time()
    expired = [sid for sid, ts in _session_last_access.items() if (now - ts) > TTL_SECONDS]
    for sid in expired:
        cleanup_session(sid)

