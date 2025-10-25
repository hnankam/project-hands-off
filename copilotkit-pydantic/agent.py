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
    model_settings,
    google_model_settings,
    anthropic_model_settings,
    bedrock_model_settings,
    AGENT_PROMPTS,
)

# Lazy load MODELS
def __getattr__(name):
    if name == 'MODELS':
        return get_models()
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

from utils import (
    keep_recent_messages,
)

from services import (
    create_usage_tracking_callback,
)

from pydantic_ai.ag_ui import StateDeps

__all__ = [
    'DEBUG',
    'logger',
    'get_models',
    'model_settings',
    'google_model_settings',
    'anthropic_model_settings',
    'bedrock_model_settings',
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
