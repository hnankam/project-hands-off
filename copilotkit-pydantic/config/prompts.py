"""Agent prompt configurations loaded from a configuration file."""

import os
import json
from pathlib import Path
from typing import Dict, Any, List


# Internal cache
_agents_cache: Dict[str, Any] | None = None
_agent_types_cache: List[str] | None = None


def _load_config() -> Dict[str, Any]:
    """Load agents configuration JSON.
    
    Path is resolved from environment variable AGENTS_CONFIG_PATH or defaults to
    copilotkit-pydantic/config/agents.json.
    """
    default_path = Path(__file__).parent / 'agents.json'
    config_path = Path(os.getenv('AGENTS_CONFIG_PATH', str(default_path)))
    if not config_path.exists():
        raise FileNotFoundError(f"Agents configuration not found at {config_path}")
    with config_path.open('r', encoding='utf-8') as f:
        return json.load(f)


def _build_agent_prompts(config: Dict[str, Any]) -> Dict[str, str]:
    """Build agent prompts from configuration with variable substitution."""
    base_instructions = config.get('base_instructions', {})
    general_instruction = base_instructions.get('general_instruction', '')
    planning_instruction = base_instructions.get('planning_instruction', '')
    
    prompts: Dict[str, str] = {}
    
    for agent_cfg in config.get('agents', []):
        if not agent_cfg.get('enabled', True):
            continue
            
        agent_type = agent_cfg['type']
        prompt_template = agent_cfg['prompt']
        
        # Substitute base instructions into prompt template
        prompt = prompt_template.format(
            general_instruction=general_instruction,
            planning_instruction=planning_instruction
        )
        
        prompts[agent_type] = prompt.strip()
    
    return prompts


def get_agent_prompts() -> Dict[str, str]:
    """Get the agent prompts dictionary (lazy-loaded from JSON config)."""
    global _agents_cache, _agent_types_cache
    if _agents_cache is None:
        config = _load_config()
        _agents_cache = _build_agent_prompts(config)
        _agent_types_cache = list(_agents_cache.keys())
    return _agents_cache


def get_agent_types() -> List[str]:
    """Get list of available agent types without loading prompts."""
    global _agent_types_cache
    if _agent_types_cache is None:
        # Load types directly from config without building prompts
        config = _load_config()
        _agent_types_cache = [
            a['type'] for a in config.get('agents', [])
            if a.get('enabled', True)
        ]
    return _agent_types_cache or []


def get_agent_info(agent_type: str) -> Dict[str, Any] | None:
    """Get agent metadata (name, description, etc.) for a specific agent type."""
    config = _load_config()
    for agent_cfg in config.get('agents', []):
        if agent_cfg['type'] == agent_type and agent_cfg.get('enabled', True):
            return {
                'type': agent_cfg['type'],
                'name': agent_cfg.get('name', agent_type),
                'description': agent_cfg.get('description', ''),
                'enabled': agent_cfg.get('enabled', True),
            }
    return None


# Backward-compat exports
AGENT_PROMPTS = None
agent_types = None


# Provide attribute access for lazy loading
def __getattr__(name):
    if name == 'AGENT_PROMPTS':
        return get_agent_prompts()
    if name == 'agent_types':
        return get_agent_types()
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")

