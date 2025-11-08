"""Agent tool definitions and registration."""

from __future__ import annotations

from typing import Any, Dict

from pydantic_ai import Agent, RunContext
from pydantic_ai.ag_ui import StateDeps
from ag_ui.core import EventType, StateSnapshotEvent

from core.models import AgentState, Step, StepStatus
from tools.mcp_loader import load_mcp_toolsets


def register_agent_tools(
    agent: Agent,
    *,
    agent_type: str,
    organization_id: str | None,
    team_id: str | None,
    tool_definitions: Dict[str, Dict[str, Any]],
    mcp_servers: Dict[str, Dict[str, Any]],
    allowed_backend_tools: set[str],
    allowed_mcp_tools: set[str],
) -> None:
    """Register backend and MCP tools for the given agent based on configuration."""

    import logging
    from collections import defaultdict

    logger = logging.getLogger(__name__)

    allowed_backend_tools = set(allowed_backend_tools or set())
    allowed_mcp_tools = set(allowed_mcp_tools or set())

    def _is_backend_enabled(key: str) -> bool:
        cfg = tool_definitions.get(key)
        return (
            cfg is not None
            and cfg.get('type') == 'backend'
            and cfg.get('enabled', True)
        )

    def _is_mcp_enabled(key: str) -> bool:
        cfg = tool_definitions.get(key)
        return (
            cfg is not None
            and cfg.get('type') == 'mcp'
            and cfg.get('enabled', True)
            and cfg.get('mcp_server_id') is not None
            and cfg.get('remote_tool_name') is not None
        )

    if 'create_plan' in allowed_backend_tools and _is_backend_enabled('create_plan'):
        @agent.tool(sequential=True, retries=0)
        async def create_plan(ctx: RunContext[StateDeps[AgentState]], steps: list[str]) -> StateSnapshotEvent:
            """Create a plan with multiple steps."""
            print(f"📝 Creating plan with {len(steps)} steps")
            print(f"   Current state before: steps={len(ctx.deps.state.steps)}")
            ctx.deps.state.steps = [Step(description=step) for step in steps]
            print(f"   State after: steps={len(ctx.deps.state.steps)}")
            state_dict = ctx.deps.state.model_dump()
            print(f"   Returning snapshot: {state_dict}")
            return StateSnapshotEvent(
                type=EventType.STATE_SNAPSHOT,
                snapshot=state_dict,
            )
    else:
        if 'create_plan' in allowed_backend_tools:
            logger.warning("Backend tool 'create_plan' is not enabled for agent %s", agent_type)

    if 'update_plan_step' in allowed_backend_tools and _is_backend_enabled('update_plan_step'):
        @agent.tool(sequential=True, retries=0)
        async def update_plan_step(
            ctx: RunContext[StateDeps[AgentState]],
            index: int,
            description: str | None = None,
            status: StepStatus | None = None
        ) -> StateSnapshotEvent:
            """Update the plan with new steps or changes."""
            print(f"🔄 Updating step {index}: description={description}, status={status}")
            print(f"   Current state: {len(ctx.deps.state.steps)} steps")

            if not ctx.deps.state.steps or index >= len(ctx.deps.state.steps):
                error_msg = f"Step at index {index} does not exist. Current steps count: {len(ctx.deps.state.steps)}"
                print(f"   ❌ ERROR: {error_msg}")
                print(f"   Current steps: {[s.description for s in ctx.deps.state.steps]}")
                raise ValueError(error_msg)

            if description is not None:
                ctx.deps.state.steps[index].description = description
            if status is not None:
                ctx.deps.state.steps[index].status = status

            state_dict = ctx.deps.state.model_dump()
            print(f"   ✅ Updated step {index}, returning full snapshot: {state_dict}")

            return StateSnapshotEvent(
                type=EventType.STATE_SNAPSHOT,
                snapshot=state_dict,
            )
    else:
        if 'update_plan_step' in allowed_backend_tools:
            logger.warning("Backend tool 'update_plan_step' is not enabled for agent %s", agent_type)

    if 'get_weather' in allowed_backend_tools and _is_backend_enabled('get_weather'):
        @agent.tool(sequential=True, retries=0)
        def get_weather(_: RunContext[StateDeps[AgentState]], location: str) -> str:
            """Get the weather for a given location."""
            return f"The weather in {location} is sunny."
    else:
        if 'get_weather' in allowed_backend_tools:
            logger.warning("Backend tool 'get_weather' is not enabled for agent %s", agent_type)

    if not allowed_mcp_tools:
        return

    grouped_tools = defaultdict(lambda: {'tool_keys': [], 'remote_names': set()})

    for key in allowed_mcp_tools:
        if not _is_mcp_enabled(key):
            logger.warning("MCP tool '%s' is not enabled or missing configuration for agent %s", key, agent_type)
            continue
        cfg = tool_definitions[key]
        server_id = cfg['mcp_server_id']
        remote_name = cfg['remote_tool_name']
        server_cfg = mcp_servers.get(server_id)
        if not server_cfg or not server_cfg.get('enabled', True):
            logger.warning(
                "MCP server '%s' required for tool '%s' is not available for agent %s",
                server_id,
                key,
                agent_type,
            )
            continue
        grouped_tools[server_id]['tool_keys'].append(key)
        grouped_tools[server_id]['remote_names'].add(remote_name)

    if not grouped_tools:
        logger.warning("No MCP toolsets available for agent %s after filtering", agent_type)
        return

    server_configs = {}
    allowed_remote_names_by_key: Dict[str, set[str]] = {}

    for server_id, data in grouped_tools.items():
        server = mcp_servers.get(server_id)
        if not server:
            continue
        server_key = server.get('server_key')
        if not server_key:
            logger.warning("MCP server without server_key encountered (id=%s)", server_id)
            continue

        config_entry: Dict[str, Any] = {
            'transport': server.get('transport', 'stdio'),
        }
        if server.get('command'):
            config_entry['command'] = server['command']
        if server.get('args'):
            config_entry['args'] = server['args']
        if server.get('env'):
            config_entry['env'] = server['env']
        if server.get('url'):
            config_entry['url'] = server['url']
        metadata = server.get('metadata') or {}
        if isinstance(metadata, dict) and 'max_retries' in metadata:
            config_entry['max_retries'] = metadata['max_retries']

        server_configs[server_key] = config_entry
        allowed_remote_names_by_key[server_key] = data['remote_names']

    if not server_configs:
        logger.warning("No MCP server configurations available for agent %s", agent_type)
        return

    class FilteredToolset:
        def __init__(self, base_toolset, allowed_names: set[str]):
            self._base = base_toolset
            self._allowed = set(allowed_names)

        async def list_tools(self):
            tools = await self._base.list_tools()
            return [tool for tool in tools if getattr(tool, 'name', None) in self._allowed]

        async def call_tool(self, name, *args, **kwargs):
            if name not in self._allowed:
                raise ValueError(f"Tool '{name}' is not permitted for this agent")
            return await self._base.call_tool(name, *args, **kwargs)

        def __getattr__(self, item):
            return getattr(self._base, item)

    mcp_toolsets = load_mcp_toolsets(server_configs)
    successful_toolsets = []

    for toolset in mcp_toolsets:
        server_key = getattr(toolset, 'id', None)
        if not server_key or server_key not in allowed_remote_names_by_key:
            continue
        allowed_names = allowed_remote_names_by_key[server_key]
        if not allowed_names:
            continue
        filtered_toolset = FilteredToolset(toolset, allowed_names)
        try:
            agent._user_toolsets.append(filtered_toolset)
            successful_toolsets.append(server_key)
            logger.debug("✓ Registered MCP toolset %s for agent %s", server_key, agent_type)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning(
                "Failed to register MCP toolset %s for agent %s: %s",
                server_key,
                agent_type,
                exc,
            )

    if successful_toolsets:
        logger.info(
            "Registered %d MCP toolset(s) for agent %s: %s",
            len(successful_toolsets),
            agent_type,
            ", ".join(successful_toolsets),
        )
    else:
        logger.warning("No MCP toolsets were successfully registered for agent %s", agent_type)

