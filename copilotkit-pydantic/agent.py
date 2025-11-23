"""
Agent module - Backward compatibility layer.

This file provides backward compatibility by re-exporting from the new modular structure.
For new code, please import directly from the appropriate modules:

- config/ : Configuration (environment, models, prompts)
- core/ : Core business logic (models, agent factory)
- services/ : Business services (session, websocket, usage tracking)
- utils/ : Utility functions (anthropic cache, message processor)
- tools/ : Agent tools
"""

from config import (
    DEBUG,
    logger,
    get_models,
    get_agent_prompts,
)

# Lazy load constants and functions
def __getattr__(name):
    if name == 'MODELS':
        return get_models()
    if name == 'AGENT_PROMPTS':
        return get_agent_prompts()
    if name == 'keep_recent_messages':
        from utils import keep_recent_messages
        return keep_recent_messages
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")

from core import (
    Step,
    Plan,
    JSONPatchOp,
    AgentState,
    StepStatus,
    create_agent,
    get_agent,
)

from services import (
    create_usage_tracking_callback,
)

from pydantic_ai.ag_ui import StateDeps

__all__ = [
    'DEBUG',
    'logger',
    'get_models',
    'AGENT_PROMPTS',
    'Step',
    'Plan',
    'JSONPatchOp',
    'AgentState',
    'StepStatus',
    'create_agent',
    'get_agent',
    'keep_recent_messages',
    'create_usage_tracking_callback',
    'StateDeps',
]
