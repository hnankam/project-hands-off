"""Database loaders for models and agents configuration."""

import json
from typing import Dict, Any, List
import asyncio
from functools import lru_cache

from database import get_db_connection
from config import logger


# Cache for database configurations
_db_cache: Dict[str, Any] = {}
_cache_valid = False


def invalidate_cache():
    """Invalidate the configuration cache."""
    global _cache_valid
    _cache_valid = False
    _db_cache.clear()
    logger.info("Configuration cache invalidated")


async def load_providers_from_db() -> Dict[str, Any]:
    """Load providers configuration from database.
    
    Returns:
        Dict mapping provider_key to provider configuration
    """
    providers = {}
    
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT 
                    provider_key,
                    provider_type,
                    credentials,
                    model_settings,
                    bedrock_model_settings,
                    enabled
                FROM providers
                WHERE enabled = true
                ORDER BY provider_key
            """)
            
            rows = await cur.fetchall()
            
            for row in rows:
                providers[row['provider_key']] = {
                    'type': row['provider_type'],
                    'credentials': row['credentials'],
                    'model_settings': row['model_settings'],
                }
                
                # Add bedrock settings if present
                if row['bedrock_model_settings']:
                    providers[row['provider_key']]['bedrock_model_settings'] = row['bedrock_model_settings']
    
    logger.info(f"Loaded {len(providers)} providers from database")
    return providers


async def load_models_from_db() -> List[Dict[str, Any]]:
    """Load models configuration from database.
    
    Returns:
        List of model configurations
    """
    models = []
    
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT 
                    m.model_key,
                    m.model_name,
                    m.display_name,
                    m.model_settings_override,
                    p.provider_key
                FROM models m
                JOIN providers p ON m.provider_id = p.id
                WHERE m.enabled = true
                ORDER BY m.model_key
            """)
            
            rows = await cur.fetchall()
            
            for row in rows:
                model_config = {
                    'key': row['model_key'],
                    'provider': row['provider_key'],
                    'name': row['model_name'],
                }
                
                # Add model settings override if present
                if row['model_settings_override']:
                    model_config['model_settings'] = row['model_settings_override']
                
                models.append(model_config)
    
    logger.info(f"Loaded {len(models)} models from database")
    return models


async def load_agents_from_db() -> List[Dict[str, Any]]:
    """Load agents configuration from database.
    
    Returns:
        List of agent configurations
    """
    agents = []
    
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT 
                    agent_type,
                    agent_name,
                    description,
                    prompt_template
                FROM agents
                WHERE enabled = true
                ORDER BY agent_type
            """)
            
            rows = await cur.fetchall()
            
            for row in rows:
                agents.append({
                    'type': row['agent_type'],
                    'name': row['agent_name'],
                    'description': row['description'] or '',
                    'prompt': row['prompt_template'],
                    'enabled': True
                })
    
    logger.info(f"Loaded {len(agents)} agents from database")
    return agents


async def load_base_instructions_from_db() -> Dict[str, str]:
    """Load base instructions from database.
    
    Returns:
        Dict mapping instruction_key to instruction_value
    """
    instructions = {}
    
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT instruction_key, instruction_value
                FROM base_instructions
                ORDER BY instruction_key
            """)
            
            rows = await cur.fetchall()
            
            for row in rows:
                instructions[row['instruction_key']] = row['instruction_value']
    
    logger.info(f"Loaded {len(instructions)} base instructions from database")
    return instructions


def get_models_config_from_db() -> Dict[str, Any]:
    """Get complete models configuration from database (cached).
    
    Returns:
        Configuration dict with 'providers' and 'models' keys
    """
    global _cache_valid
    cache_key = 'models_config'
    if _cache_valid and cache_key in _db_cache:
        logger.debug("Returning cached models configuration")
        return _db_cache[cache_key]
    # If cache not ready and no loop running, load synchronously (e.g., at process startup)
    try:
        asyncio.get_running_loop()
        # Loop is running – avoid blocking; caller should use async variant and/or warm cache on startup
        raise RuntimeError("Models config cache not warmed; call get_models_config_from_db_async() at startup")
    except RuntimeError:
        providers = asyncio.run(load_providers_from_db())
        models = asyncio.run(load_models_from_db())
        config = {'providers': providers, 'models': models}
        _db_cache[cache_key] = config
        _cache_valid = True
        return config


def get_agents_config_from_db() -> Dict[str, Any]:
    """Get complete agents configuration from database (cached).
    
    Returns:
        Configuration dict with 'agents' and 'base_instructions' keys
    """
    global _cache_valid
    cache_key = 'agents_config'
    if _cache_valid and cache_key in _db_cache:
        logger.debug("Returning cached agents configuration")
        return _db_cache[cache_key]
    try:
        asyncio.get_running_loop()
        raise RuntimeError("Agents config cache not warmed; call get_agents_config_from_db_async() at startup")
    except RuntimeError:
        agents = asyncio.run(load_agents_from_db())
        base_instructions = asyncio.run(load_base_instructions_from_db())
        config = {'agents': agents, 'base_instructions': base_instructions}
        _db_cache[cache_key] = config
        _cache_valid = True
        return config


# Async versions for use in async contexts
async def get_models_config_from_db_async() -> Dict[str, Any]:
    """Get complete models configuration from database (async).
    
    Returns:
        Configuration dict with 'providers' and 'models' keys
    """
    providers = await load_providers_from_db()
    models = await load_models_from_db()
    
    return {
        'providers': providers,
        'models': models
    }


async def get_agents_config_from_db_async() -> Dict[str, Any]:
    """Get complete agents configuration from database (async).
    
    Returns:
        Configuration dict with 'agents' and 'base_instructions' keys
    """
    agents = await load_agents_from_db()
    base_instructions = await load_base_instructions_from_db()
    
    return {
        'agents': agents,
        'base_instructions': base_instructions
    }


async def warm_caches_on_startup() -> None:
    """Warm both models and agents caches for use in sync contexts."""
    providers = await load_providers_from_db()
    models = await load_models_from_db()
    agents = await load_agents_from_db()
    base_instructions = await load_base_instructions_from_db()

    _db_cache['models_config'] = {'providers': providers, 'models': models}
    _db_cache['agents_config'] = {'agents': agents, 'base_instructions': base_instructions}
    global _cache_valid
    _cache_valid = True
    logger.info("Configuration caches warmed from database")

