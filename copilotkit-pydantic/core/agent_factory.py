"""Agent factory for creating and caching agent instances."""

from __future__ import annotations

from typing import Dict, Optional, Tuple, TYPE_CHECKING, Any

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
from config.skills import get_skills_for_context
from config import logger
from config.environment import TOOL_TIMEOUT
from core.models import AgentState, UnifiedDeps, StepStatus
from utils.context import context_tuple

if TYPE_CHECKING:
    from tools.agent_tools import register_agent_tools

# Agent cache for reusing agent instances scoped by organization/team
# Cache key: (org_token, team_token, agent_type, model_name, output_type_key)
_agent_cache: Dict[Tuple[str, str, str, str, str], Agent] = {}


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
        
        # If value is a JSON string, parse it
        if isinstance(value, str):
            import json
            try:
                value = json.loads(value)
            except (json.JSONDecodeError, TypeError):
                # If parsing fails, use the string as-is
                pass
        
        # Format specific context types in markdown structure
        formatted = _format_context_value(description, value)
        if formatted:
            parts.append(formatted)
    
    return "".join(parts)


def _format_context_value(description: str, value: any) -> str:
    """Format a specific context value based on its type.
    
    Args:
        description: Context description
        value: Context value (dict, list, or other)
        
    Returns:
        Formatted markdown string
    """
    if not isinstance(value, dict):
        # Fallback for non-dict values
        return f"\n**{description}**:\n```\n{value}\n```\n"
    
    # Detect context type by description text (more reliable than structure)
    desc_lower = description.lower()
    
    # Multi-page Context
    if 'multi-page' in desc_lower or ('current page' in desc_lower and 'selected' in desc_lower):
        return _format_multipage_context(value)
    
    # User Context
    elif 'authenticated user' in desc_lower or ('user information' in desc_lower and 'organization' in desc_lower):
        return _format_user_context(value)
    
    # Workspace Context (but not selected notes/credentials)
    elif 'workspace' in desc_lower and 'uploaded files' in desc_lower:
        return _format_workspace_context(value)
    
    # Selected Notes Context
    elif 'selected' in desc_lower and 'notes' in desc_lower and 'full content' in desc_lower:
        return _format_selected_notes_context(value)
    
    # Selected Credentials Context
    elif 'credentials' in desc_lower and 'api calls' in desc_lower:
        return _format_selected_credentials_context(value)
    
    # Fallback: try structure-based detection
    elif 'currentPage' in value or 'selectedPages' in value:
        return _format_multipage_context(value)
    elif 'user' in value and isinstance(value.get('user'), dict):
        return _format_user_context(value)
    elif 'files' in value and 'notes' in value:
        return _format_workspace_context(value)
    elif 'selectedNotes' in value:
        return _format_selected_notes_context(value)
    elif 'selectedCredentials' in value:
        return _format_selected_credentials_context(value)
    
    # Fallback for unknown formats
    else:
        return f"\n**{description}**:\n```\n{value}\n```\n"


def _format_multipage_context(value: dict) -> str:
    """Format multi-page context in markdown."""
    parts = ["\n## Multi-page Context\n"]
    
    current = value.get('currentPage', {})
    if current:
        parts.append(f"**Current Page**: {current.get('pageTitle', 'Untitled')}\n")
        parts.append(f"- URL: `{current.get('pageURL', 'N/A')}`\n")
        if current.get('hasEmbeddings'):
            parts.append(f"- Content: Indexed with {current.get('totalHtmlChunks', 0)} HTML chunks, "
                        f"{current.get('totalFormChunks', 0)} form chunks, "
                        f"{current.get('totalClickableChunks', 0)} clickable elements\n")
    
    # selectedPages is an object with 'pages' array inside it
    selected_pages_obj = value.get('selectedPages', {})
    if selected_pages_obj and isinstance(selected_pages_obj, dict):
        pages = selected_pages_obj.get('pages', [])
        count = selected_pages_obj.get('count', 0)
        
        if pages and isinstance(pages, list) and count > 0:
            parts.append(f"\n**Selected Pages** ({count} pages):\n")
            for page in pages:
                if isinstance(page, dict):
                    parts.append(f"- {page.get('pageTitle', 'Untitled')} (`{page.get('pageURL', 'N/A')}`)")
                    # Selected pages use different field names: htmlChunkCount, formChunkCount, clickableChunkCount
                    html_chunks = page.get('htmlChunkCount', 0)
                    form_chunks = page.get('formChunkCount', 0)
                    clickable_chunks = page.get('clickableChunkCount', 0)
                    if html_chunks > 0 or form_chunks > 0 or clickable_chunks > 0:
                        parts.append(f" - Indexed with {html_chunks} HTML chunks, "
                                    f"{form_chunks} form chunks, "
                                    f"{clickable_chunks} clickable elements")
                    parts.append("\n")
    
    return "".join(parts)


def _format_user_context(value: dict) -> str:
    """Format user context in markdown."""
    parts = ["\n## User Context\n"]
    
    user = value.get('user', {})
    if user:
        parts.append(f"\n**User**: {user.get('name', 'N/A')}\n")
        parts.append(f"- Email: {user.get('email', 'N/A')}\n")
    
    org = value.get('organization')
    if org:
        parts.append(f"- Organization: {org.get('name', 'N/A')}\n")
    
    return "".join(parts)


def _format_workspace_context(value: dict) -> str:
    """Format workspace context in markdown."""
    parts = ["\n## Workspace Context\n"]
    
    files = value.get('files', {})
    if files:
        count = files.get('count', 0)
        parts.append(f"\n**Files**: {count} total\n")
        recent = files.get('recent', [])
        if recent and isinstance(recent, list):
            parts.append("Recent files:\n")
            for f in recent:
                if isinstance(f, dict):
                    parts.append(f"- {f.get('name', 'Untitled')} ({f.get('type', 'unknown')})\n")
    
    notes = value.get('notes', {})
    if notes:
        count = notes.get('count', 0)
        parts.append(f"\n**Notes**: {count} total\n")
        recent = notes.get('recent', [])
        if recent and isinstance(recent, list):
            parts.append("Recent notes:\n")
            for n in recent:
                if isinstance(n, dict):
                    parts.append(f"- {n.get('title', 'Untitled')}\n")
    
    storage = value.get('storage_used')
    if storage:
        parts.append(f"\n**Storage Used**: {storage}\n")
    
    return "".join(parts)


def _format_selected_notes_context(value: dict) -> str:
    """Format selected notes context in markdown."""
    notes = value.get('selectedNotes', [])
    if not notes or not isinstance(notes, list):
        return ""
    
    parts = [f"\n## Selected Notes ({len(notes)} notes)\n"]
    
    for note in notes:
        if not isinstance(note, dict):
            continue
        parts.append(f"\n### {note.get('title', 'Untitled')}\n")
        content = note.get('content', '')
        if content:
            parts.append(f"{content}\n")
    
    return "".join(parts)


def _format_selected_credentials_context(value: dict) -> str:
    """Format selected credentials context in markdown."""
    creds = value.get('selectedCredentials', [])
    if not creds or not isinstance(creds, list):
        return ""
    
    parts = [f"\n## Selected Credentials ({len(creds)} credentials)\n"]
    parts.append("\n**Available for API calls** (passwords/secrets stored securely server-side):\n")
    
    for cred in creds:
        if not isinstance(cred, dict):
            continue
        parts.append(f"- **{cred.get('name', 'Unnamed')}** ({cred.get('type', 'unknown')})")
        key = cred.get('key')
        if key:
            parts.append(f" - Key: `{key}`")
        desc = cred.get('description')
        if desc is not None and str(desc).strip():
            parts.append(f" - Description: {str(desc).strip()}")
        parts.append("\n")
    
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


def _build_skills_toolset(
    organization_id: str | None,
    team_id: str | None,
    agent_info: dict,
) -> Optional[Any]:
    """Build SkillsToolset from stored skills, filtered by agent's allowed_skills."""
    try:
        from pydantic_ai_skills import SkillsToolset
        from pydantic_ai_skills.types import Skill, SkillResource
        from pydantic_ai_skills.registries.git import GitCloneOptions, GitSkillsRegistry
    except ImportError:
        logger.debug("pydantic-ai-skills not installed; skipping skills toolset")
        return None

    skill_definitions = {}
    try:
        skill_definitions = get_skills_for_context(organization_id, team_id)
    except RuntimeError:
        return None

    allowed_skill_keys = agent_info.get('allowed_skills')
    if not allowed_skill_keys:
        return None
    skill_definitions = {
        k: v for k, v in skill_definitions.items()
        if k in allowed_skill_keys and v.get('enabled', True)
    }

    if not skill_definitions:
        return None

    programmatic_skills: list = []
    registries: list = []

    for skill_key, skill_cfg in skill_definitions.items():
        source_type = skill_cfg.get('source_type', 'manual')
        if source_type == 'git':
            git_config = skill_cfg.get('git_config') or {}
            raw_clone = git_config.get('clone_options')
            clone_options = None
            if raw_clone and isinstance(raw_clone, dict):
                sparse = raw_clone.get('sparse_paths')
                if isinstance(sparse, str):
                    sparse = [s.strip() for s in sparse.split(',') if s.strip()]
                elif not isinstance(sparse, list):
                    sparse = []
                clone_options = GitCloneOptions(
                    depth=raw_clone.get('depth'),
                    branch=raw_clone.get('branch'),
                    single_branch=raw_clone.get('single_branch', False),
                    sparse_paths=sparse,
                    env=raw_clone.get('env') or {},
                    multi_options=raw_clone.get('multi_options') or [],
                    git_options=raw_clone.get('git_options') or {},
                )
            try:
                registry = GitSkillsRegistry(
                    repo_url=git_config.get('repo_url', ''),
                    path=git_config.get('path') or '',
                    target_dir=git_config.get('target_dir'),
                    token=git_config.get('token'),
                    ssh_key_file=git_config.get('ssh_key_file'),
                    clone_options=clone_options,
                )
                registries.append(registry)
            except Exception as exc:
                logger.warning("Failed to create GitSkillsRegistry for skill '%s': %s", skill_key, exc)
        else:
            metadata = skill_cfg.get('metadata') or {}
            resources = []
            for r in metadata.get('resources') or []:
                if isinstance(r, dict) and r.get('name') is not None:
                    resources.append(SkillResource(name=r['name'], content=r.get('content', '')))
            skill = Skill(
                name=skill_key,
                description=skill_cfg.get('description', ''),
                content=skill_cfg.get('content') or '',
                resources=resources if resources else None,
            )
            programmatic_skills.append(skill)

    if not programmatic_skills and not registries:
        return None

    kwargs: dict = {}
    if programmatic_skills:
        kwargs['skills'] = programmatic_skills
    if registries:
        kwargs['registries'] = registries
    return SkillsToolset(**kwargs)


async def create_agent(
    agent_type: str,
    model_name: str,
    organization_id: str | None,
    team_id: str | None,
    output_type: Optional[Any] = None,
) -> Agent:
    """Create an agent with the specified type, model, and context."""

    from pydantic_ai_summarization import create_context_manager_middleware, resolve_max_tokens
    from utils.message_processor import (
        count_tokens_with_model_fallback,
        remove_orphaned_tool_results_after_compaction,
        sanitize_invalid_tool_call_args,
        sanitize_tool_message_alignment,
        set_run_context_for_token_counter,
    )

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

    # Resolve genai-prices compatible model name from model instance (provider:model format)
    # For FallbackModel, use the first model in the chain for context window resolution
    _model_for_context = model
    if hasattr(model, 'models') and model.models:
        logger.info(
            "Using FallbackModel for agent '%s' (model=%s): chain has %d models",
            agent_type,
            model_name,
            len(model.models),
        )
        _model_for_context = model.models[0]
    genai_model_name = getattr(_model_for_context, 'model_id', None) or (
        f"{getattr(_model_for_context, 'system', '')}:{getattr(_model_for_context, 'model_name', '')}"
        if hasattr(_model_for_context, 'system') else None
    )
    # 90% of genai-prices max context window for fraction-based keep
    max_context = resolve_max_tokens(genai_model_name) if genai_model_name else None
    if max_context:
        max_input_tokens = int(max_context * 0.75)
        context_max_tokens = None  # let middleware resolve from genai-prices
    else:
        # Fallback when genai-prices has no context_window: 1M for Gemini, 200k otherwise
        model_ref = (genai_model_name or getattr(_model_for_context, "model_name", "") or "").lower()
        if "gemini" in model_ref:
            context_max_tokens = 1_000_000
            max_input_tokens = 900_000  # 90% of 1M
        else:
            context_max_tokens = 200_000
            max_input_tokens = 150_000  # 75% of 200k

    context_manager = create_context_manager_middleware(
        model_name=genai_model_name,
        max_tokens=context_max_tokens,
        compress_threshold=0.9,
        keep=("fraction", 0.3),
        max_input_tokens=max_input_tokens,
        token_counter=count_tokens_with_model_fallback,
        on_usage_update=lambda pct, cur, mx: logger.info(
            f"Context: {pct:.0%} used ({cur:,}/{mx:,})"
        ),
    )

    tool_definitions = get_tools_for_context(organization_id, team_id)
    mcp_servers = get_mcp_servers_for_context(organization_id, team_id)
    agent_info = get_agent_info_for_context(agent_type, organization_id, team_id) or {}

    # Build custom auxiliary agents instructions and append to base instructions
    # This is done at agent creation time (static) since aux agents config doesn't change per-run
    # Import here to avoid circular import
    from tools.auxiliary_agents import build_custom_auxiliary_agents_instructions
    agent_metadata = agent_info.get('metadata', {})
    custom_aux_instructions = build_custom_auxiliary_agents_instructions(
        agent_metadata,
        organization_id,
        team_id,
    )
    if custom_aux_instructions:
        instructions = instructions + "\n" + custom_aux_instructions
        logger.debug(
            "Appended custom auxiliary agents instructions to agent '%s'",
            agent_type,
        )

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

    # Build skills toolset if skills are configured
    skills_toolset = _build_skills_toolset(organization_id, team_id, agent_info)
    all_toolsets = list(mcp_toolsets) if mcp_toolsets else []
    if skills_toolset is not None:
        all_toolsets.append(skills_toolset)

    agent_kwargs: Dict[str, Any] = {
        "model": model,
        "instructions": instructions,
        "deps_type": UnifiedDeps,
        "model_settings": model_settings,
        "history_processors": [
            set_run_context_for_token_counter,
            sanitize_tool_message_alignment,
            sanitize_invalid_tool_call_args,  # Fix truncated JSON in ToolCallPart args before count_tokens
            context_manager,
            remove_orphaned_tool_results_after_compaction,  # After context_manager - it may drop messages and create orphans
        ],
        "builtin_tools": builtin_tool_instances,
        "tools": backend_tools,  # Backend callable functions
        "toolsets": all_toolsets,  # MCP toolsets + SkillsToolset
        "retries": 10,
        "tool_timeout": TOOL_TIMEOUT,
    }
    if output_type is not None:
        agent_kwargs["output_type"] = output_type
    agent = Agent(**agent_kwargs)

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

    # Add skills instructions when SkillsToolset is present
    if skills_toolset is not None:

        @agent.instructions
        async def add_skills_instructions(ctx: RunContext[Any]) -> str | None:
            """Add skills instructions to the agent's context."""
            return await skills_toolset.get_instructions(ctx)

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
        
        return context

    # agent.sequential_tool_calls()

    return agent


def _output_type_cache_key(output_type: Optional[Any]) -> str:
    """Cache key for output_type; used to distinguish agents with different output types."""
    if output_type is None:
        return ""
    return getattr(output_type, "__name__", str(type(output_type).__name__))


async def get_agent(
    agent_type: str,
    model_name: str,
    organization_id: str | None,
    team_id: str | None,
    output_type: Optional[Any] = None,
) -> Agent:
    """Get or create an agent with caching for the specified context.

    Args:
        output_type: Optional override for agent output type (e.g. BinaryImage for image generation).
            When set, the agent expects that output type instead of default str.
    """

    org_token, team_token = context_tuple(organization_id, team_id)
    output_key = _output_type_cache_key(output_type)
    cache_key = (org_token, team_token, agent_type, model_name, output_key)

    if cache_key not in _agent_cache:
        _agent_cache[cache_key] = await create_agent(
            agent_type, model_name, organization_id, team_id, output_type=output_type
        )

    return _agent_cache[cache_key]

