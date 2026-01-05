"""Seed database with data from JSON configuration files."""

import json
from pathlib import Path
from typing import Dict, Any
import psycopg
from psycopg import sql

from config import logger
from .connection import get_connection_string


async def seed_database(
    models_json_path: str = None,
    agents_json_path: str = None
):
    """Seed database with initial configuration data.
    
    Args:
        models_json_path: Path to models.json (defaults to config/models.json)
        agents_json_path: Path to agents.json (defaults to config/agents.json)
    """
    # Load configuration files
    if models_json_path is None:
        models_json_path = Path(__file__).parent.parent / 'config' / 'models.json'
    else:
        models_json_path = Path(models_json_path)
    
    if agents_json_path is None:
        agents_json_path = Path(__file__).parent.parent / 'config' / 'agents.json'
    else:
        agents_json_path = Path(agents_json_path)
    
    logger.info(f"Loading models from: {models_json_path}")
    logger.info(f"Loading agents from: {agents_json_path}")
    
    with open(models_json_path, 'r') as f:
        models_config = json.load(f)
    
    with open(agents_json_path, 'r') as f:
        agents_config = json.load(f)
    
    async with await psycopg.AsyncConnection.connect(get_connection_string()) as conn:
        async with conn.cursor() as cur:
            # Seed providers
            logger.info("Seeding providers...")
            providers = models_config.get('providers', {})
            provider_ids = {}
            
            for provider_key, provider_config in providers.items():
                provider_type = provider_config.get('type')
                credentials = json.dumps(provider_config.get('credentials', {}))
                model_settings = json.dumps(provider_config.get('model_settings', {}))
                bedrock_settings = json.dumps(provider_config.get('bedrock_model_settings', {})) if 'bedrock_model_settings' in provider_config else None
                
                await cur.execute(
                    """
                    INSERT INTO providers (
                        provider_key, provider_type, credentials,
                        model_settings, bedrock_model_settings, enabled
                    )
                    VALUES (%s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s)
                    ON CONFLICT (provider_key) DO UPDATE SET
                        provider_type = EXCLUDED.provider_type,
                        credentials = EXCLUDED.credentials,
                        model_settings = EXCLUDED.model_settings,
                        bedrock_model_settings = EXCLUDED.bedrock_model_settings
                    RETURNING id
                    """,
                    (provider_key, provider_type, credentials, model_settings, bedrock_settings, True)
                )
                provider_result = await cur.fetchone()
                provider_ids[provider_key] = provider_result[0]
            
            logger.info(f"Seeded {len(providers)} providers")
            
            # Seed models
            logger.info("Seeding models...")
            models = models_config.get('models', [])
            
            for model_config in models:
                model_key = model_config['key']
                provider_key = model_config['provider']
                model_name = model_config['name']
                display_name = model_key.replace('-', ' ').title()
                
                provider_id = provider_ids.get(provider_key)
                if not provider_id:
                    logger.warning(f"Provider not found for model {model_key}: {provider_key}")
                    continue
                
                model_settings_override = json.dumps(model_config.get('model_settings', {})) if 'model_settings' in model_config else None
                
                await cur.execute(
                    """
                    INSERT INTO models (
                        provider_id, model_key, model_name,
                        display_name, model_settings_override, enabled
                    )
                    VALUES (%s, %s, %s, %s, %s::jsonb, %s)
                    ON CONFLICT (model_key) DO UPDATE SET
                        provider_id = EXCLUDED.provider_id,
                        model_name = EXCLUDED.model_name,
                        display_name = EXCLUDED.display_name,
                        model_settings_override = EXCLUDED.model_settings_override
                    """,
                    (provider_id, model_key, model_name, display_name, model_settings_override, True)
                )
            
            logger.info(f"Seeded {len(models)} models")
            
            # Seed agents
            logger.info("Seeding agents...")
            agents = agents_config.get('agents', [])
            
            for agent_config in agents:
                agent_type = agent_config['type']
                agent_name = agent_config.get('name', agent_type)
                description = agent_config.get('description', '')
                prompt_template = agent_config['prompt']
                enabled = agent_config.get('enabled', True)
                
                await cur.execute(
                    """
                    INSERT INTO agents (
                        agent_type, agent_name,
                        description, prompt_template, enabled
                    )
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (agent_type) DO UPDATE SET
                        agent_name = EXCLUDED.agent_name,
                        description = EXCLUDED.description,
                        prompt_template = EXCLUDED.prompt_template,
                        enabled = EXCLUDED.enabled
                    """,
                    (agent_type, agent_name, description, prompt_template, enabled)
                )
            
            logger.info(f"Seeded {len(agents)} agents")
            
            # Commit all changes
            await conn.commit()
            logger.info("Database seeding completed successfully!")
            
            # Print summary
            await cur.execute("SELECT COUNT(*) FROM providers")
            provider_count = (await cur.fetchone())[0]
            
            await cur.execute("SELECT COUNT(*) FROM models")
            model_count = (await cur.fetchone())[0]
            
            await cur.execute("SELECT COUNT(*) FROM agents")
            agent_count = (await cur.fetchone())[0]
            
            logger.info("=" * 60)
            logger.info("SEEDING SUMMARY")
            logger.info("=" * 60)
            logger.info(f"Providers: {provider_count}")
            logger.info(f"Models: {model_count}")
            logger.info(f"Agents: {agent_count}")
            logger.info("=" * 60)
    
    return {
        'providers': provider_count,
        'models': model_count,
        'agents': agent_count,
    }

