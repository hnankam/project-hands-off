"""Agent factory for creating and caching agent instances."""

from pydantic_ai import Agent
from pydantic_ai.ag_ui import StateDeps

from config import AGENT_PROMPTS, get_models, logger
from core.models import AgentState
from utils.message_processor import keep_recent_messages
from tools.agent_tools import register_agent_tools

# Agent cache for reusing agent instances
_agent_cache = {}


def create_agent(agent_type: str, model_name: str) -> Agent:
    """Create an agent with the specified type and model.
    
    Args:
        agent_type: Type of agent (general, wiki, sharepoint, etc.)
        model_name: Name of the model to use
        
    Returns:
        Configured Agent instance
    """
    MODELS = get_models()
    instructions = AGENT_PROMPTS.get(agent_type, AGENT_PROMPTS["general"])
    model = MODELS.get(model_name, MODELS['claude-4.5-haiku'])['model']
    model_settings = MODELS.get(model_name, MODELS['claude-4.5-haiku'])['model_settings']
    
    agent = Agent(
        model,
        instructions=instructions,
        deps_type=StateDeps[AgentState],
        model_settings=model_settings,
        history_processors=[keep_recent_messages],
        retries=3,
    )
    
    agent.sequential_tool_calls()
    
    # Register tools for this agent
    register_agent_tools(agent)
    
    return agent


def get_agent(agent_type: str, model_name: str) -> Agent:
    """Get or create an agent with caching.
    
    Args:
        agent_type: Type of agent (general, wiki, sharepoint, etc.)
        model_name: Name of the model to use
        
    Returns:
        Cached or newly created Agent instance
    """
    cache_key = f"{agent_type}:{model_name}"
    
    if cache_key not in _agent_cache:
        logger.info(f"Creating new agent type={agent_type} model={model_name}")
        _agent_cache[cache_key] = create_agent(agent_type, model_name)
    
    return _agent_cache[cache_key]

