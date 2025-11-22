"""Model configurations loaded from database and cached per context."""

from __future__ import annotations

import importlib
from typing import Any, Dict, List, Tuple

from anthropic import AsyncAnthropicBedrock
from openai import AsyncAzureOpenAI, AsyncOpenAI

from pydantic_ai import ModelSettings
from pydantic_ai.models.google import GoogleModel, GoogleModelSettings
from pydantic_ai.models.anthropic import AnthropicModelSettings
from pydantic_ai.models.bedrock import BedrockModelSettings
from pydantic_ai.models.openai import OpenAIModelSettings, OpenAIResponsesModel
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.providers.anthropic import AnthropicProvider
from pydantic_ai.providers.openai import OpenAIProvider

from utils.context import context_tuple


# Internal caches keyed by context tuple (<org>, <team>)
_models_cache_by_context: Dict[Tuple[str, str], Dict[str, Dict[str, Any]]] = {}
_model_names_by_context: Dict[Tuple[str, str], List[str]] = {}
_backcompat_by_context: Dict[Tuple[str, str], Dict[str, Any]] = {}


def clear_context_models(organization_id: str | None = None, team_id: str | None = None) -> None:
    """Clear cached models for a specific context or all contexts."""

    if organization_id is None and team_id is None:
        _models_cache_by_context.clear()
        _model_names_by_context.clear()
        _backcompat_by_context.clear()
        return

    key = context_tuple(organization_id, team_id)
    _models_cache_by_context.pop(key, None)
    _model_names_by_context.pop(key, None)
    _backcompat_by_context.pop(key, None)


def _load_config() -> Dict[str, Any]:
    """Load models configuration from database.
    
    All model configurations, providers, and credentials are loaded from PostgreSQL.
    """
    from .db_loaders import get_models_config_from_db
    from . import logger
    logger.info("Loading models configuration from database")
    return get_models_config_from_db()


def _build_providers(config: Dict[str, Any]) -> Dict[str, Any]:
    """Build provider instances from configuration.
    
    All credentials must be provided in the configuration file.
    For multi-tenant support, each team/org will have their own credential set.
    """
    providers: Dict[str, Any] = {}

    for provider_key, provider_cfg in (config.get('providers') or {}).items():
        provider_type = provider_cfg.get('type')
        credentials = provider_cfg.get('credentials', {})
        
        if provider_type == 'google':
            # Direct credential from config (required)
            api_key = credentials.get('api_key')
            if not api_key:
                raise ValueError(f"Provider '{provider_key}': api_key is required in credentials")
            
            providers[provider_key] = GoogleProvider(api_key=api_key)
            
        elif provider_type in {'anthropic', 'anthropic_bedrock'}:
            # Bedrock Anthropic - pass credentials directly to the client
            aws_access_key_id = credentials.get('aws_access_key_id')
            aws_secret_access_key = credentials.get('aws_secret_access_key')
            aws_session_token = credentials.get('aws_session_token')
            region = credentials.get('region')
            
            if not aws_access_key_id or not aws_secret_access_key:
                raise ValueError(f"Provider '{provider_key}': aws_access_key_id and aws_secret_access_key are required")
            if not region:
                raise ValueError(f"Provider '{provider_key}': region is required")
            
            providers[provider_key] = AnthropicProvider(
                anthropic_client=AsyncAnthropicBedrock(
                    aws_access_key=aws_access_key_id,
                    aws_secret_key=aws_secret_access_key,
                    aws_session_token=aws_session_token,
                    aws_region=region,
                )
            )
            
        elif provider_type == 'openai':
            # OpenAI (non-Azure)
            api_key = credentials.get('api_key')
            if not api_key:
                raise ValueError(f"Provider '{provider_key}': api_key is required in credentials")
            providers[provider_key] = OpenAIProvider(openai_client=AsyncOpenAI(api_key=api_key))
        elif provider_type == 'azure_openai':
            # Azure OpenAI
            endpoint = credentials.get('endpoint')
            api_version = credentials.get('api_version')
            api_key = credentials.get('api_key')
            if not endpoint:
                raise ValueError(f"Provider '{provider_key}': endpoint is required in credentials")
            if not api_version:
                raise ValueError(f"Provider '{provider_key}': api_version is required in credentials")
            if not api_key:
                raise ValueError(f"Provider '{provider_key}': api_key is required in credentials")
            providers[provider_key] = OpenAIProvider(openai_client=AsyncAzureOpenAI(
                azure_endpoint=endpoint,
                api_version=api_version,
                api_key=api_key,
            ))
        else:
            raise ValueError(f"Unsupported provider type: {provider_type}")
    return providers


def _build_settings_factories(config: Dict[str, Any]) -> Dict[str, Any]:
    """Create per-provider default ModelSettings instances for back-compat and reuse."""
    factories: Dict[str, Any] = {}
    for provider_key, provider_cfg in (config.get('providers') or {}).items():
        provider_type = provider_cfg.get('type')
        settings_cfg: Dict[str, Any] = provider_cfg.get('model_settings') or {}

        if provider_type == 'google':
            factories[provider_key] = GoogleModelSettings(
                google_thinking_config=settings_cfg.get('google_thinking_config'),
                temperature=settings_cfg.get('temperature', 0.0),
                max_tokens=settings_cfg.get('max_tokens', 4096),
            )
        elif provider_type in {'anthropic', 'anthropic_bedrock'}:
            factories[provider_key] = AnthropicModelSettings(
                extra_headers=settings_cfg.get('extra_headers') or {},
                temperature=settings_cfg.get('temperature', 0.0),
                max_tokens=settings_cfg.get('max_tokens', 4096),
            )
        elif provider_type in {'openai', 'azure_openai'}:
            factories[provider_key] = OpenAIModelSettings(
                temperature=settings_cfg.get('temperature', 0.0),
                max_tokens=settings_cfg.get('max_tokens', 4096),
            )
    return factories


def _build_models(config: Dict[str, Any]) -> tuple[Dict[str, Dict[str, Any]], Dict[str, Any]]:
    """Instantiate models and settings from config.
    
    Returns a tuple of (models_dict, backcompat_settings) where models_dict maps
    model key -> {'model': Model, 'model_settings': ModelSettings}
    and backcompat_settings contains representative settings for backward exports.
    """
    providers = _build_providers(config)
    settings_factories = _build_settings_factories(config)

    # Note: We delay imports of custom model classes until we need them to avoid circular imports
    models: Dict[str, Dict[str, Any]] = {}

    for model_cfg in (config.get('models') or []):
        key = model_cfg['key']
        provider_ref = model_cfg['provider']
        model_name = model_cfg['name']
        provider = providers.get(provider_ref)
        if provider is None:
            raise ValueError(f"Model '{key}' references unknown provider '{provider_ref}'")

        # Per-model overrides for settings
        per_model_settings_cfg = (model_cfg.get('model_settings') or {})
        provider_type = (config['providers'][provider_ref]).get('type')

        if provider_type == 'google':
            # Lazy import to avoid circular dependency - use importlib to bypass utils.__init__
            google_module = importlib.import_module('utils.google_attachments')
            GoogleModelWithAttachments = google_module.GoogleModelWithAttachments
            
            factory_settings = settings_factories.get(provider_ref, {})
            settings = GoogleModelSettings(**per_model_settings_cfg)
            model_instance = GoogleModelWithAttachments(model_name, provider=provider)
        elif provider_type in {'anthropic', 'anthropic_bedrock'}:
            # Lazy import to avoid circular dependency - use importlib to bypass utils.__init__
            anthropic_module = importlib.import_module('utils.anthropic_cache')
            AnthropicModelWithCache = anthropic_module.AnthropicModelWithCache
            
            factory_settings = settings_factories.get(provider_ref, {})
            settings = AnthropicModelSettings(**per_model_settings_cfg)
            model_instance = AnthropicModelWithCache(model_name, provider=provider)
        elif provider_type in {'openai', 'azure_openai'}:
            factory_settings = settings_factories.get(provider_ref, {})
            settings = OpenAIModelSettings(**per_model_settings_cfg)
            model_instance = OpenAIResponsesModel(model_name, provider=provider)
        else:
            # Fallback generic
            settings = ModelSettings(**per_model_settings_cfg)
            model_instance = OpenAIResponsesModel(model_name, provider=provider)  # pragma: no cover

        models[key] = {
            'model': model_instance,
            'model_settings': settings,
        }

    # Backward-compat representative settings (first seen for each type)
    backcompat: Dict[str, Any] = {}
    for provider_key, provider_cfg in (config.get('providers') or {}).items():
        ptype = provider_cfg.get('type')
        if ptype == 'google' and 'google_model_settings' not in backcompat:
            backcompat['google_model_settings'] = settings_factories[provider_key]
        elif ptype in {'anthropic', 'anthropic_bedrock'} and 'anthropic_model_settings' not in backcompat:
            backcompat['anthropic_model_settings'] = settings_factories[provider_key]
            # Provide a Bedrock settings object for parity if present in config
            bedrock_cfg = provider_cfg.get('bedrock_model_settings') or {}
            backcompat['bedrock_model_settings'] = BedrockModelSettings(
                bedrock_additional_model_requests_fields=bedrock_cfg.get('bedrock_additional_model_requests_fields')
            ) if bedrock_cfg else BedrockModelSettings(
                bedrock_additional_model_requests_fields={'thinking': {'type': 'enabled', 'budget_tokens': 1024}, 'max_tokens': 4096}
            )
        elif ptype in {'openai', 'azure_openai'} and 'openai_model_settings' not in backcompat:
            backcompat['openai_model_settings'] = settings_factories[provider_key]

    return models, backcompat


def get_models() -> Dict[str, Dict[str, Any]]:
    """Get models for the global (unscoped) context."""

    key = context_tuple(None, None)
    if key not in _models_cache_by_context:
        config = _load_config()
        models, backcompat = _build_models(config)
        _models_cache_by_context[key] = models
        _model_names_by_context[key] = list(models.keys())
        _backcompat_by_context[key] = backcompat
    return _models_cache_by_context[key]


def get_models_for_context(organization_id: str | None, team_id: str | None) -> Dict[str, Dict[str, Any]]:
    """Get models for a specific organization/team context."""

    key = context_tuple(organization_id, team_id)
    models = _models_cache_by_context.get(key)
    if models is None:
        raise RuntimeError(
            f"Model configuration not loaded for org={organization_id} team={team_id}. "
            "The deployment manager must warm this context before usage."
        )
    return models


def get_model_names() -> list[str]:
    """Get list of available model names for the global context."""

    key = context_tuple(None, None)
    if key not in _model_names_by_context:
        config = _load_config()
        models, backcompat = _build_models(config)
        _models_cache_by_context[key] = models
        _model_names_by_context[key] = list(models.keys())
        _backcompat_by_context[key] = backcompat
    return _model_names_by_context[key]


def get_model_names_for_context(organization_id: str | None, team_id: str | None) -> List[str]:
    key = context_tuple(organization_id, team_id)
    names = _model_names_by_context.get(key)
    if names is None:
        raise RuntimeError(
            f"Model names not loaded for org={organization_id} team={team_id}. "
            "Warm the context via the deployment manager first."
        )
    return names


def store_models_for_context(
    organization_id: str | None,
    team_id: str | None,
    config: Dict[str, Any],
) -> None:
    """Build and cache models for a given context using raw configuration."""

    models, backcompat = _build_models(config)
    key = context_tuple(organization_id, team_id)
    _models_cache_by_context[key] = models
    _model_names_by_context[key] = list(models.keys())
    _backcompat_by_context[key] = backcompat


# Backward-compat module-level exports
MODELS = property(lambda self: get_models())

# Keep exported settings names for callers that import them
# Use a generic base model_settings for callers expecting a ModelSettings
model_settings = ModelSettings(temperature=0.0, max_tokens=2048)

google_model_settings = None
anthropic_model_settings = None
bedrock_model_settings = None


# Provide attribute access for MODELS at module level
def __getattr__(name):
    if name == 'MODELS':
        return get_models()
    if name == 'MODEL_NAMES':
        return get_model_names()
    if name in {'google_model_settings', 'anthropic_model_settings', 'bedrock_model_settings'}:
        # Ensure models (and backcompat settings) are initialized on first access
        global google_model_settings, anthropic_model_settings, bedrock_model_settings
        key = context_tuple(None, None)
        if key not in _backcompat_by_context:
            _ = get_models()
        backcompat = _backcompat_by_context.get(key, {})
        google_model_settings = backcompat.get('google_model_settings')
        anthropic_model_settings = backcompat.get('anthropic_model_settings')
        bedrock_model_settings = backcompat.get('bedrock_model_settings')
        return {
            'google_model_settings': google_model_settings,
            'anthropic_model_settings': anthropic_model_settings,
            'bedrock_model_settings': bedrock_model_settings,
        }[name]
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")

# Available model names are provided lazily via get_model_names()

