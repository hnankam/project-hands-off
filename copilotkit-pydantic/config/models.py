"""Model configurations for different AI providers."""

import os
from anthropic import AsyncAnthropicBedrock
from pydantic_ai import ModelSettings
from pydantic_ai.models.google import GoogleModel, GoogleModelSettings
from pydantic_ai.models.anthropic import AnthropicModelSettings
from pydantic_ai.models.bedrock import BedrockModelSettings
from pydantic_ai.models.openai import OpenAIModel, OpenAIModelSettings
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.providers.anthropic import AnthropicProvider
from pydantic_ai.providers.openai import OpenAIProvider
from openai import AsyncAzureOpenAI

# Model Settings
model_settings = ModelSettings(
    temperature=0.0,
    max_tokens=2048,
)

google_model_settings = GoogleModelSettings(
    google_thinking_config={'include_thoughts': True, 'thinking_budget': 1024},
    temperature=0.0,
    max_tokens=1024,
)

anthropic_model_settings = AnthropicModelSettings(
    extra_headers={
        "anthropic-beta": "fine-grained-tool-streaming-2025-05-14,context-1m-2025-08-07"
    },
    temperature=0.0,
    max_tokens=4096,
)

bedrock_model_settings = BedrockModelSettings(
    bedrock_additional_model_requests_fields={
        "thinking": {"type": "enabled", "budget_tokens": 1024},
        "max_tokens": 4096,
    },
)

openai_model_settings = OpenAIModelSettings(
    temperature=0.0,
    max_tokens=4096,
)

# Model Providers
google_provider = GoogleProvider(api_key=os.getenv('GOOGLE_API_KEY'))
anthropic_provider = AnthropicProvider(anthropic_client=AsyncAnthropicBedrock())

# Azure OpenAI provider configuration
openai_provider = OpenAIProvider(openai_client=AsyncAzureOpenAI(
    azure_endpoint=os.getenv('AZURE_OPENAI_ENDPOINT'),
    api_version=os.getenv('AZURE_OPENAI_API_VERSION'),
    api_key=os.getenv('AZURE_OPENAI_API_KEY'),
))


def _get_models():
    """Lazy initialization of models to avoid circular imports."""
    from utils.anthropic_cache import AnthropicModelWithCache
    
    return {
        'gemini-2.5-flash-lite': {
            'model': GoogleModel('gemini-2.5-flash-lite', provider=google_provider),
            'model_settings': google_model_settings
        },
        'gemini-2.5-flash': {
            'model': GoogleModel('gemini-2.5-flash', provider=google_provider),
            'model_settings': google_model_settings
        },
        'gemini-2.5-pro': {
            'model': GoogleModel('gemini-2.5-pro', provider=google_provider),
            'model_settings': google_model_settings
        },
        'claude-3.5-sonnet': {
            'model': AnthropicModelWithCache('us.anthropic.claude-3-5-sonnet-20241022-v2:0', provider=anthropic_provider),
            'model_settings': anthropic_model_settings
        },
        'claude-3.7-sonnet': {
            'model': AnthropicModelWithCache('us.anthropic.claude-3-7-sonnet-20250219-v1:0', provider=anthropic_provider),
            'model_settings': anthropic_model_settings
        },
        'claude-4.1-opus': {
            'model': AnthropicModelWithCache('us.anthropic.claude-opus-4-1-20250805-v1:0', provider=anthropic_provider),
            'model_settings': anthropic_model_settings
        },
        'claude-4.5-sonnet': {
            'model': AnthropicModelWithCache('us.anthropic.claude-sonnet-4-5-20250929-v1:0', provider=anthropic_provider),
            'model_settings': anthropic_model_settings
        },
        'claude-4.5-haiku': {
            'model': AnthropicModelWithCache('us.anthropic.claude-haiku-4-5-20251001-v1:0', provider=anthropic_provider),
            'model_settings': anthropic_model_settings
        },
        'gpt-5-mini': {
            'model': OpenAIModel('gpt-5-mini', provider=openai_provider),
            'model_settings': openai_model_settings
        },
        'gpt-5': {
            'model': OpenAIModel('gpt-5', provider=openai_provider),
            'model_settings': openai_model_settings
        },
        'gpt5-pro': {
            'model': OpenAIModel('gpt5-pro', provider=openai_provider),
            'model_settings': openai_model_settings
        },
    }


# Lazy-loaded models dictionary
_models_cache = None


def get_models():
    """Get the models dictionary (lazy-loaded)."""
    global _models_cache
    if _models_cache is None:
        _models_cache = _get_models()
    return _models_cache


# For backward compatibility, expose MODELS as a property-like access
MODELS = property(lambda self: get_models())

# For direct module-level access
def __getattr__(name):
    if name == 'MODELS':
        return get_models()
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")

# Available model names for route generation
MODEL_NAMES = [
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash', 
    'gemini-2.5-pro',
    'claude-3.5-sonnet',
    'claude-3.7-sonnet',
    'claude-4.1-opus',
    'claude-4.5-sonnet',
    'claude-4.5-haiku',
    'gpt-5-mini',
    'gpt-5',
    'gpt5-pro',
]

