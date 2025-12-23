"""Agent factory for creating and caching agent instances."""

from __future__ import annotations

from typing import Dict, Tuple, TYPE_CHECKING, Any

from pydantic_ai import Agent, RunContext
from pydantic_ai.builtin_tools import (
    CodeExecutionTool,
    ImageGenerationTool,
    MemoryTool,
    UrlContextTool,
    WebSearchTool,
)

from config.models import get_models_for_context
from config.prompts import get_agent_prompts_for_context, get_agent_info_for_context
from config.tools import get_tools_for_context, get_mcp_servers_for_context
from config import logger
from core.models import AgentState, UnifiedDeps, StepStatus
from utils.context import context_tuple

if TYPE_CHECKING:
    from tools.agent_tools import register_agent_tools

# Agent cache for reusing agent instances scoped by organization/team
_agent_cache: Dict[Tuple[str, str, str, str], Agent] = {}


def format_agui_context(context_items: list[dict | Any]) -> str:
    """Format AGUI context items for inclusion in agent instructions.
    
    Converts context items from frontend (useCopilotReadableData / useAgentContext)
    into a formatted string for agent instructions.
    
    Args:
        context_items: List of context items (dicts or Pydantic models) with 'description' and 'value'
        
    Returns:
        Formatted context string, or empty string if no context items
    """
    if not context_items:
        return ""
    
    parts = ["\n\n=== User Session Context ===\n"]
    for item in context_items:
        # Handle both dict and Pydantic model formats
        if hasattr(item, 'model_dump'):
            # Pydantic model
            item_dict = item.model_dump()
        elif isinstance(item, dict):
            # Already a dict
            item_dict = item
        else:
            # Try to access as attributes
            try:
                item_dict = {'description': getattr(item, 'description', 'Context'), 'value': getattr(item, 'value', '')}
            except AttributeError:
                continue
        
        description = item_dict.get('description', 'Context')
        value = item_dict.get('value', '')
        
        if not value:
            continue
        
        # Format: Description followed by value in code block
        parts.append(f"\n**{description}**:\n```\n{value}\n```\n")
    
    return "".join(parts)

BUILTIN_TOOL_REGISTRY = {
    'builtin_web_search': WebSearchTool,
    'builtin_code_execution': CodeExecutionTool,
    'builtin_image_generation': ImageGenerationTool,
    'builtin_memory': MemoryTool,
    'builtin_url_context': UrlContextTool,
}


def clear_agent_cache(organization_id: str | None = None, team_id: str | None = None) -> None:
    """Clear cached agent instances for a specific context or all contexts."""

    if organization_id is None and team_id is None:
        _agent_cache.clear()
        return

    org_token, team_token = context_tuple(organization_id, team_id)
    keys_to_remove = [
        key for key in _agent_cache
        if key[0] == org_token and key[1] == team_token
    ]
    for key in keys_to_remove:
        _agent_cache.pop(key, None)


def _resolve_allowed_tool_keys(
    agent_type: str,
    agent_info: dict,
    tool_definitions: dict
) -> list[str]:
    """Resolve and deduplicate allowed tool keys for an agent."""
    allowed_tool_keys = agent_info.get('allowed_tools')
    
    # Handle None or empty list - default to all enabled tools
    if not allowed_tool_keys:
        allowed_tool_keys = [
            key
            for key, data in tool_definitions.items()
            if data.get('enabled', True) and data.get('tool_type') in {'backend', 'builtin', 'mcp', 'frontend'}
        ]
    else:
        # When agent has explicit allowed_tools, include them if they exist in definitions
        # Don't filter by enabled - if agent explicitly allows a tool, use it regardless of global status
        allowed_tool_keys = [
            key
            for key in allowed_tool_keys
            if key in tool_definitions
        ]

    # Preserve order while removing duplicates
    return list(dict.fromkeys(allowed_tool_keys))


def _categorize_tools(
    allowed_tool_keys: list[str],
    tool_definitions: dict,
    agent_type: str,
    organization_id: str | None,
    team_id: str | None
) -> tuple[list, list[str], list[str], list[str]]:
    """Categorize tools into instances and type-specific key lists."""
    builtin_tool_instances = []
    allowed_backend_keys: list[str] = []
    allowed_mcp_keys: list[str] = []
    frontend_tool_keys: list[str] = []

    for key in allowed_tool_keys:
        tool_cfg = tool_definitions.get(key)
        if not tool_cfg:
            logger.warning(
                "Tool '%s' referenced by agent '%s' is not defined for org=%s team=%s",
                key, agent_type, organization_id, team_id
            )
            continue

        tool_type = tool_cfg.get('tool_type')
        if tool_type == 'builtin':
            cls = BUILTIN_TOOL_REGISTRY.get(key)
            if not cls:
                logger.warning(
                    "No builtin tool class registered for key '%s' (agent=%s)", key, agent_type
                )
                continue
            try:
                builtin_tool_instances.append(cls())
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("Failed to instantiate builtin tool '%s': %s", key, exc)
        elif tool_type == 'backend':
            allowed_backend_keys.append(key)
        elif tool_type == 'mcp':
            allowed_mcp_keys.append(key)
        elif tool_type == 'frontend':
            frontend_tool_keys.append(key)
            
    return builtin_tool_instances, allowed_backend_keys, allowed_mcp_keys, frontend_tool_keys


async def create_agent(
    agent_type: str,
    model_name: str,
    organization_id: str | None,
    team_id: str | None,
) -> Agent:
    """Create an agent with the specified type, model, and context."""

    from utils.message_processor import keep_recent_messages

    models = get_models_for_context(organization_id, team_id)
    if model_name not in models:
        raise KeyError(
            f"Model '{model_name}' is not available for org={organization_id} team={team_id}"
        )

    prompts = get_agent_prompts_for_context(organization_id, team_id)
    instructions = prompts.get(agent_type)
    if instructions is None:
        # Fall back to a generic instruction if present; otherwise raise
        instructions = prompts.get('general')
    if instructions is None:
        raise KeyError(
            f"Agent '{agent_type}' is not available for org={organization_id} team={team_id}"
        )

    model_entry = models[model_name]
    model = model_entry['model']
    model_settings = model_entry['model_settings']

    tool_definitions = get_tools_for_context(organization_id, team_id)
    mcp_servers = get_mcp_servers_for_context(organization_id, team_id)
    agent_info = get_agent_info_for_context(agent_type, organization_id, team_id) or {}

    # Resolve allowed tools
    allowed_tool_keys = _resolve_allowed_tool_keys(agent_type, agent_info, tool_definitions)

    # Categorize tools
    builtin_tool_instances, allowed_backend_keys, allowed_mcp_keys, frontend_tool_keys = _categorize_tools(
        allowed_tool_keys, tool_definitions, agent_type, organization_id, team_id
    )
    
    # Import here to avoid circular import
    from tools.agent_tools import get_agent_tools
    
    # logger.debug("Getting backend and MCP tools for agent '%s'", agent_type)
    backend_tools, mcp_toolsets = await get_agent_tools(
        agent_type=agent_type,
        organization_id=organization_id,
        team_id=team_id,
        tool_definitions=tool_definitions,
        mcp_servers=mcp_servers,
        allowed_backend_tools=set(allowed_backend_keys),
        allowed_mcp_tools=set(allowed_mcp_keys),
    )
    
    agent = Agent(
        model,
        instructions=instructions,
        deps_type=UnifiedDeps,
        model_settings=model_settings,
        history_processors=[keep_recent_messages],
        builtin_tools=builtin_tool_instances,
        tools=backend_tools,  # Backend callable functions
        toolsets=mcp_toolsets,  # MCP toolsets loaded from static config (TESTING)
        retries=10,
    )

    # Add dynamic instructions to inject AGUI context at runtime
    @agent.instructions
    def inject_agui_context(ctx: RunContext[Any]) -> str:
        """Dynamically inject AGUI context from frontend into agent instructions.
        
        This function is called for each agent run and adds context provided by
        the frontend through useCopilotReadableData / useAgentContext hooks.
        
        Context can be stored in either:
        - ctx.deps.agui_context (preferred - extracted from run_input)
        - ctx.deps.adapter.run_input.context (fallback - via AGUIAdapter)
        
        Args:
            ctx: The run context with access to dependencies
            
        Returns:
            Formatted context string to append to instructions, or empty string
        """
        context_items = None
        context_source = None
        
        # Try to get context from deps.agui_context (preferred path)
        if hasattr(ctx.deps, 'agui_context'):
            context_items = ctx.deps.agui_context
            if context_items:
                context_source = "deps.agui_context"
        
        # Fallback: try to get from adapter.run_input.context
        if not context_items and hasattr(ctx.deps, 'adapter'):
            adapter = ctx.deps.adapter
            if adapter and hasattr(adapter, 'run_input'):
                context_items = adapter.run_input.context
                if context_items:
                    context_source = "adapter.run_input.context"
        
        # Format and return context
        if context_items:
            return format_agui_context(context_items)
        
        return ""
    
    # Add multi-instance context instructions
    @agent.instructions
    def inject_multi_instance_context(ctx: RunContext[UnifiedDeps]) -> str:
        """Inject multi-instance plan/graph management context.
        
        Provides the agent with:
        - Current active/paused plans and graphs
        - Usage examples with names
        - Best practices for multi-instance management
        - Tool reference
        
        Args:
            ctx: The run context with agent state
            
        Returns:
            Multi-instance management instructions
        """
        # Safety check for state
        if not hasattr(ctx.deps, 'state') or ctx.deps.state is None:
            return ""
        
        state = ctx.deps.state
        
        # Extract current state
        active_plans = [p for p in state.plans.values() if p.status == "active"]
        paused_plans = [p for p in state.plans.values() if p.status == "paused"]
        active_graphs = [g for g in state.graphs.values() if g.status == "active"]
        
        # Build context string
        context = "\n\n=== Multi-Instance Workflow System ===\n\n"
        context += "You can manage multiple plans and graphs simultaneously. Each has:\n"
        context += "- **Unique ID**: Auto-generated (e.g., 'abc123def456')\n"
        context += "- **Human Name**: Descriptive, user-friendly (e.g., 'Build Dream House')\n"
        context += "- **Status**: Plans (active, paused, completed, cancelled) | Graphs (active, running, paused, completed, cancelled, waiting)\n\n"
        
        context += "## Targeting Plans & Graphs\n\n"
        context += "Reference by **NAME** or **ID**:\n"
        context += "- update_plan_step('Build House Plan', 0, status='completed')\n"
        context += "- update_plan_step('abc123def456', 0, status='completed')\n\n"
        context += "Names are case-insensitive and support partial matching.\n\n"
        
        # Add current active plans
        if active_plans:
            context += f"## Currently Active Plans ({len(active_plans)}):\n\n"
            for plan in active_plans:
                completed = sum(1 for s in plan.steps if s.status == 'completed')
                total = len(plan.steps)
                context += f'**"{plan.name}"** (ID: `{plan.plan_id}`)\n'
                context += f'  - Progress: {completed}/{total} steps completed\n\n'
        
        # Add paused plans
        if paused_plans:
            context += f"## Paused Plans ({len(paused_plans)}):\n\n"
            for plan in paused_plans:
                context += f'**"{plan.name}"** (ID: `{plan.plan_id}`)\n'
                context += f'  - Steps: {len(plan.steps)}\n\n'
            context += "Use `update_plan_status(name, 'active')` to resume\n\n"
        
        # Add active graphs
        if active_graphs:
            context += f"## Active Graph Executions ({len(active_graphs)}):\n\n"
            for graph in active_graphs:
                query_preview = graph.query[:60] + "..." if len(graph.query) > 60 else graph.query
                context += f'**"{graph.name}"** (ID: `{graph.graph_id}`)\n'
                context += f'  - Query: {query_preview}\n'
                context += f'  - Status: {graph.status}\n\n'
        
        # Add instructions if no active work
        if not active_plans and not paused_plans and not active_graphs:
            context += "## No Active Work\n\n"
            context += "Create a new plan: `create_plan(name='...', steps=[...])`\n\n"
        
        # Add best practices
        context += "## Best Practices\n\n"
        context += "1. **Use descriptive names** when creating plans/graphs\n"
        context += "   'Research Machine Learning Papers'\n"
        context += "   'Plan 1'\n\n"
        context += "2. **Keep names concise** - limit to 50 characters or less\n"
        context += "   'Build React Dashboard'\n"
        context += "   'Build a comprehensive full-stack React dashboard with authentication and real-time updates'\n\n"
        context += "3. **Use names when user mentions them**\n"
        context += "   User: 'Update @Build House Plan'\n"
        context += "   You: update_plan_step('Build House Plan', ...)\n\n"
        context += "4. **Use list_plans() if unsure** which plan to update\n\n"
        context += "5. **Multiple active plans are normal** - don't force single active\n\n"
        
        # Add quick tool reference
        context += "## Tools Available\n\n"
        context += "**Plans**: create_plan, update_plan_step, update_plan_status, "
        context += "rename_plan, list_plans, delete_plan\n"
        context += "**Graphs**: run_graph (multi-agent execution)\n"
        
        return context

    # agent.sequential_tool_calls()

    return agent


async def get_agent(
    agent_type: str,
    model_name: str,
    organization_id: str | None,
    team_id: str | None,
) -> Agent:
    """Get or create an agent with caching for the specified context."""

    org_token, team_token = context_tuple(organization_id, team_id)
    cache_key = (org_token, team_token, agent_type, model_name)

    if cache_key not in _agent_cache:
        _agent_cache[cache_key] = await create_agent(agent_type, model_name, organization_id, team_id)

    return _agent_cache[cache_key]

