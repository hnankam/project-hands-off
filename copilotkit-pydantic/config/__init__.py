"""Configuration module for Pydantic Agent Server."""

from .environment import DEBUG, logger, HOST, PORT
from .models import (
    get_models,
    get_model_names,
    model_settings,
    google_model_settings,
    anthropic_model_settings,
    bedrock_model_settings,
)
from .prompts import (
    get_agent_prompts,
    get_agent_types,
    get_agent_info,
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
    'get_models',
    'get_model_names',
    'model_settings',
    'google_model_settings',
    'anthropic_model_settings',
    'bedrock_model_settings',
    'get_agent_prompts',
    'get_agent_types',
    'get_agent_info',
    'AGENT_PROMPTS',
    'agent_types',
]

