"""Configuration module for Pydantic Agent Server."""

from .environment import DEBUG, logger, HOST, PORT
from .models import get_models, MODEL_NAMES, model_settings, google_model_settings, anthropic_model_settings, bedrock_model_settings
from .prompts import AGENT_PROMPTS, agent_types

# Lazy-loaded MODELS
def __getattr__(name):
    if name == 'MODELS':
        return get_models()
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")

__all__ = [
    'DEBUG',
    'logger',
    'HOST',
    'PORT',
    'get_models',
    'MODEL_NAMES',
    'model_settings',
    'google_model_settings',
    'anthropic_model_settings',
    'bedrock_model_settings',
    'AGENT_PROMPTS',
    'agent_types',
]

