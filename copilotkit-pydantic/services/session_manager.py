"""Session-based state management for agents."""

from collections import defaultdict
from typing import Dict
from pydantic_ai.ag_ui import StateDeps

from config import logger
from core.models import AgentState

# Session-based state management
# Structure: session_states[session_id][agent_type:model] = StateDeps
session_states: Dict[str, Dict[str, StateDeps[AgentState]]] = defaultdict(dict)


def get_or_create_session_state(
    session_id: str, 
    agent_type: str, 
    model: str
) -> StateDeps[AgentState]:
    """Get or create state for a specific session and agent/model combo.
    
    Args:
        session_id: The session/thread ID from the request
        agent_type: The type of agent (general, wiki, etc.)
        model: The model name (gemini-2.5-flash-lite, etc.)
    
    Returns:
        StateDeps instance for this session
    """
    key = f"{agent_type}:{model}"
    if key not in session_states[session_id]:
        logger.debug(f"Creating new state session={session_id} agent={agent_type} model={model}")
        session_states[session_id][key] = StateDeps(AgentState())
    else:
        logger.debug(f"Reusing state session={session_id} agent={agent_type} model={model}")
    return session_states[session_id][key]


def cleanup_session(session_id: str) -> None:
    """Remove a session and all its states.
    
    Args:
        session_id: The session ID to clean up
    """
    if session_id in session_states:
        logger.info(f"Cleaning up session session={session_id}")
        del session_states[session_id]

