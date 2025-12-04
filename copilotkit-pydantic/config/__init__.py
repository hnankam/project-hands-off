"""Configuration module for Pydantic Agent Server."""

from .environment import DEBUG, logger, HOST, PORT, ABLY_API_KEY
from .models import (
    get_models,
    get_model_names,
    get_models_for_context,
    get_model_names_for_context,
    store_models_for_context,
    clear_context_models,
)
from .prompts import (
    get_agent_prompts,
    get_agent_types,
    get_agent_info,
    get_agent_prompts_for_context,
    get_agent_types_for_context,
    get_agent_info_for_context,
    store_prompts_for_context,
    clear_context_prompts,
)
from .tools import (
    get_tools_for_context,
    get_mcp_servers_for_context,
    store_tools_for_context,
    clear_context_tools,
)

# Lazy-loaded MODELS and AGENT_PROMPTS
def __getattr__(name):
    if name == 'MODELS':
        return get_models()
    if name == 'MODEL_NAMES':
        # keep lazy evaluation for model names
        from .models import get_model_names as _gm
        return _gm()
    if name == 'AGENT_PROMPTS':
        return get_agent_prompts()
    if name == 'agent_types':
        return get_agent_types()
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")

__all__ = [
    'DEBUG',
    'logger',
    'HOST',
    'PORT',
    'ABLY_API_KEY',
    'get_models',
    'get_model_names',
    'get_models_for_context',
    'get_model_names_for_context',
    'store_models_for_context',
    'clear_context_models',
    'get_agent_prompts',
    'get_agent_types',
    'get_agent_info',
    'get_agent_prompts_for_context',
    'get_agent_types_for_context',
    'get_agent_info_for_context',
    'store_prompts_for_context',
    'clear_context_prompts',
    'get_tools_for_context',
    'get_mcp_servers_for_context',
    'store_tools_for_context',
    'clear_context_tools',
    'AGENT_PROMPTS',
    'agent_types',
]

