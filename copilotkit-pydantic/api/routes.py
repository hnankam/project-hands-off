"""API route handlers for agent endpoints."""

from typing import Any, Dict
from fastapi import FastAPI, Request, BackgroundTasks
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
import asyncio
import json

from config import DEBUG, logger
from config.db_loaders import _sync_cache as _context_cache  # for readiness check
from database.connection import get_db_connection
from core import get_agent
from core.models import AgentState
from services import (
    cleanup_session,
    get_all_sessions,
    ably_publisher,
    create_usage_tracking_callback,
    log_usage_failure,
    ensure_agent_ready,
    deploy_context,
    restart_context,
    get_context_status,
    list_deployments,
    list_endpoints,
    prewarm_user_context,
)

from ag_ui.encoder import EventEncoder
from anyio import create_memory_object_stream, create_task_group
from anyio.streams.memory import MemoryObjectSendStream
from pydantic import ValidationError

from services.deployment_manager import DeploymentError
from pydantic_ai.ag_ui import AGUIAdapter, run_ag_ui
from pydantic_ai.ui import SSE_CONTENT_TYPE
from ag_ui.core import CustomEvent, RunAgentInput
from core.models import UnifiedDeps

class DeploymentRequest(BaseModel):
    organization_id: str
    team_id: str
    force: bool = False


# Track which organizations have been prewarmed to avoid redundant work
_prewarmed_orgs = set()


def _make_not_found(message: str) -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": message})


def _make_unauthorized(message: str) -> JSONResponse:
    return JSONResponse(status_code=401, content={"error": message})


def _extract_auth_context(request: Request) -> tuple[str | None, ...]:
    """Extract authentication context headers from request."""
    return (
        request.headers.get("x-copilot-session-id"),
        request.headers.get("x-copilot-thread-id"),
        request.headers.get("x-copilot-user-id"),
        request.headers.get("x-copilot-organization-id"),
        request.headers.get("x-copilot-team-id"),
    )


def _trigger_prewarm(organization_id: str, background_tasks: BackgroundTasks) -> None:
    """Trigger prewarming for an organization if not already done."""
    if organization_id not in _prewarmed_orgs:
        _prewarmed_orgs.add(organization_id)
        background_tasks.add_task(prewarm_user_context, organization_id, None)


async def _resolve_tracking_ids(
    agent_type: str, model: str, organization_id: str, team_id: str
) -> tuple[str | None, str | None]:
    """Resolve database IDs for agent and model for usage tracking."""
    agent_db_id = None
    model_db_id = None
    try:
        async with get_db_connection() as conn:
            async with conn.cursor() as cur:
                # Resolve Agent ID
                await cur.execute(
                    """
                    SELECT a.id,
                           CASE
                             WHEN EXISTS (SELECT 1 FROM agent_teams at WHERE at.agent_id = a.id AND at.team_id = %s) 
                                  AND a.organization_id = %s THEN 0
                             WHEN NOT EXISTS (SELECT 1 FROM agent_teams at WHERE at.agent_id = a.id) 
                                  AND a.organization_id = %s THEN 1
                             WHEN a.organization_id IS NULL 
                                  AND NOT EXISTS (SELECT 1 FROM agent_teams at WHERE at.agent_id = a.id) THEN 2
                         ELSE 3
                           END as priority
                      FROM agents a
                     WHERE a.agent_type = %s
                       AND (a.organization_id IS NULL OR a.organization_id = %s)
                       AND (
                           NOT EXISTS (SELECT 1 FROM agent_teams at WHERE at.agent_id = a.id)
                           OR EXISTS (SELECT 1 FROM agent_teams at WHERE at.agent_id = a.id AND at.team_id = %s)
                       )
                     ORDER BY priority, a.created_at DESC
                     LIMIT 1
                    """,
                    (
                        team_id,
                        organization_id,
                        organization_id,
                        agent_type,
                        organization_id,
                        team_id,
                    ),
                )
                agent_row = await cur.fetchone()
                if agent_row:
                    agent_db_id = agent_row.get("id")

                # Resolve Model ID
                await cur.execute(
                    """
                    SELECT m.id,
                           CASE
                             WHEN EXISTS (SELECT 1 FROM model_teams mt WHERE mt.model_id = m.id AND mt.team_id = %s) 
                                  AND m.organization_id = %s THEN 0
                             WHEN NOT EXISTS (SELECT 1 FROM model_teams mt WHERE mt.model_id = m.id) 
                                  AND m.organization_id = %s THEN 1
                             WHEN m.organization_id IS NULL 
                                  AND NOT EXISTS (SELECT 1 FROM model_teams mt WHERE mt.model_id = m.id) THEN 2
                         ELSE 3
                           END as priority
                      FROM models m
                     WHERE m.model_key = %s
                       AND (m.organization_id IS NULL OR m.organization_id = %s)
                       AND (
                           NOT EXISTS (SELECT 1 FROM model_teams mt WHERE mt.model_id = m.id)
                           OR EXISTS (SELECT 1 FROM model_teams mt WHERE mt.model_id = m.id AND mt.team_id = %s)
                       )
                     ORDER BY priority, m.created_at DESC
                     LIMIT 1
                    """,
                    (
                        team_id,
                        organization_id,
                        organization_id,
                        model,
                        organization_id,
                        team_id,
                    ),
                )
                model_row = await cur.fetchone()
                if model_row:
                    model_db_id = model_row.get("id")
    except Exception as exc:
        logger.warning(
            "Failed to resolve agent/model IDs for usage tracking: %s",
            exc,
        )

    if agent_db_id is None:
        logger.warning(
            "Falling back to agent type for usage tracking id resolution: %s",
            agent_type,
        )
    if model_db_id is None:
        logger.warning(
            "Falling back to model key for usage tracking id resolution: %s",
            model,
        )

    return agent_db_id, model_db_id


async def _preprocess_binary_attachments(request_data: dict, model: str) -> None:
    """Preprocess binary attachments in request messages.
    
    Converts HTTP URLs to data URLs for latest message only.
    For historical messages: removes binary content to prevent fetching.
    URLs are preserved in original messages but not included in request.
    
    Args:
        request_data: The request JSON data (modified in-place)
        model: The model name (unused, kept for API compatibility)
    """
    import base64
    import aiohttp
    
    messages = request_data.get('messages', [])
    if not messages:
        return
    
    last_idx = len(messages) - 1
    for msg_idx, msg in enumerate(messages):
        if not isinstance(msg.get('content'), list):
            continue
        
        is_latest = (msg_idx == last_idx)
        content = msg['content']
        new_content = []
        needs_update = False
        
        for item in content:
            if isinstance(item, dict) and item.get('type') == 'binary':
                url = item.get('url', '')
                
                if is_latest and url.startswith('http'):
                    # Latest message: fetch URL and convert to data URL
                    try:
                        async with aiohttp.ClientSession() as session:
                            async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as response:
                                if response.status == 200:
                                    base64_data = base64.b64encode(await response.read()).decode('utf-8')
                                    item['url'] = f"data:{item.get('mimeType', 'application/octet-stream')};base64,{base64_data}"
                                    new_content.append(item)
                                else:
                                    new_content.append(item)
                    except Exception:
                        new_content.append(item)
                elif not is_latest:
                    # Historical message: remove binary content to prevent fetching
                    needs_update = True
                else:
                    new_content.append(item)
            else:
                new_content.append(item)
        
        if needs_update:
            msg['content'] = new_content


def register_agent_routes(app: FastAPI) -> None:
    """Register agent routes with parameterized handler."""

    @app.post("/agent/{agent_type}/{model}")
    async def run_agent(
        agent_type: str, model: str, request: Request, background_tasks: BackgroundTasks
    ):
        # Extract session/thread IDs early for logging
        session_id_header = request.headers.get("x-copilot-session-id")
        thread_id_header = request.headers.get("x-copilot-thread-id")

        # Enforce authentication context propagated from runtime
        (
            session_id,
            thread_id,
            user_id,
            organization_id,
            team_id,
        ) = _extract_auth_context(request)

        if not session_id or not user_id or not organization_id or not team_id:
            return _make_unauthorized("Missing authentication context")

        conversation_id = thread_id or session_id
        _trigger_prewarm(organization_id, background_tasks)

        try:
            await ensure_agent_ready(organization_id, team_id, agent_type, model)
        except DeploymentError as exc:  # pragma: no cover - translated to HTTP
            logger.warning(
                "Deployment error for org=%s team=%s agent=%s model=%s: %s",
                organization_id,
                team_id,
                agent_type,
                model,
                exc,
            )
            await log_usage_failure(
                session_id=conversation_id,
                agent_id=agent_type,
                model_id=model,
                agent_label=agent_type,
                model_label=model,
                error_message=exc,
                broadcast_func=ably_publisher.broadcast_to_session,
                organization_id=organization_id,
                team_id=team_id,
                user_id=user_id,
                auth_session_id=session_id,
                metadata={
                    "stage": "ensure_agent_ready",
                    "thread_id": thread_id,
                    "error_type": type(exc).__name__,
                },
            )
            return JSONResponse(
                status_code=exc.status_code, content={"error": str(exc)}
            )

        agent_db_id, model_db_id = await _resolve_tracking_ids(
            agent_type, model, organization_id, team_id
        )

        usage_callback = create_usage_tracking_callback(
            session_id=conversation_id,
            agent_id=agent_db_id or agent_type,
            model_id=model_db_id or model,
            agent_label=agent_type,
            model_label=model,
            broadcast_func=ably_publisher.broadcast_to_session,
            auth_session_id=session_id,
            user_id=user_id,
            organization_id=organization_id,
            team_id=team_id,
        )

        try:
            accept = request.headers.get('accept', SSE_CONTENT_TYPE)
            try:
                request_data = await request.json()
                await _preprocess_binary_attachments(request_data, model)
                run_input = RunAgentInput.model_validate(request_data)
            except ValidationError as e:  
                return JSONResponse(
                    content=e.errors(),
                    status_code=422,
                )

            # Initialize agent once
            agent_instance = await get_agent(agent_type, model, organization_id, team_id)

            adapter = AGUIAdapter(
                run_input=run_input,
                agent=agent_instance,
                accept=accept,
            )

            send_stream, receive_stream = create_memory_object_stream[str]()

            async def run_agent_task(send_stream: MemoryObjectSendStream[str]) -> None:
                try:
                    # Get agent info for auxiliary agents
                    from config.prompts import get_agent_info_for_context
                    agent_info = get_agent_info_for_context(agent_type, organization_id, team_id) or {}
                    
                    # Extract AGUI context from run_input (from frontend's useCopilotReadableData)
                    # Context items are Pydantic models, convert to dicts for easier handling
                    agui_context_raw = run_input.context or []
                    agui_context = [
                        item.model_dump() if hasattr(item, 'model_dump') else item
                        for item in agui_context_raw
                    ]
                    
                    deps = UnifiedDeps(
                        state=AgentState(),
                        send_stream=send_stream,
                        adapter=adapter,
                        organization_id=organization_id,
                        team_id=team_id,
                        agent_type=agent_type,
                        agent_info=agent_info,
                        # Usage tracking context for sub-agents in multi-agent graphs
                        session_id=conversation_id,
                        user_id=user_id,
                        auth_session_id=session_id,
                        broadcast_func=ably_publisher.broadcast_to_session,
                        # Database IDs for usage tracking (passed to sub-agents)
                        agent_id=agent_db_id,
                        model_id=model_db_id,
                        # AGUI context from frontend (useCopilotReadableData / useAgentContext)
                        agui_context=agui_context,
                    )
                    
                    event_stream = run_ag_ui(
                        agent=agent_instance,
                        run_input=run_input,
                        deps=deps,
                        on_complete=usage_callback
                    )
                    async for event in event_stream:
                        await send_stream.send(event)
                except Exception as e:
                    from pydantic import ValidationError
                    if isinstance(e, ValidationError):
                        logger.error(f"Agent state validation error: {e}")
                        logger.error(f"Validation errors: {e.errors()}")
                    else:
                        logger.error(f"Agent execution error: {e}")
                finally:
                    try:
                        await send_stream.aclose()
                    except Exception:
                        pass

            async def event_generator():
                """Generate SSE events from memory stream."""
                async with create_task_group() as tg:
                    # Start agent task in task group (same cancel scope as streams)
                    tg.start_soon(run_agent_task, send_stream)
                    
                    # Yield events from receive_stream in same task group context
                    # When client disconnects, task group will cancel agent task cleanly
                    try:
                        async for event_str in receive_stream:
                            yield event_str
                    except Exception as e:
                        logger.error(f"Event streaming error: {e}")
                    finally:
                        try:
                            await receive_stream.aclose()
                        except Exception:
                            pass

            response = StreamingResponse(event_generator(), media_type=accept)

        except Exception as exc:
            logger.exception(
                "Agent invocation failed session=%s org=%s team=%s agent=%s model=%s",
                conversation_id,
                organization_id,
                team_id,
                agent_type,
                model,
            )
            await log_usage_failure(
                session_id=conversation_id,
                agent_id=agent_db_id or agent_type,
                model_id=model_db_id or model,
                agent_label=agent_type,
                model_label=model,
                error_message=exc,
                broadcast_func=ably_publisher.broadcast_to_session,
                organization_id=organization_id,
                team_id=team_id,
                user_id=user_id,
                auth_session_id=session_id,
                metadata={
                    "stage": "agent_execution",
                    "thread_id": thread_id,
                    "error_type": type(exc).__name__,
                },
            )
            raise

        # if DEBUG:
        #     logger.info(
        #         "[%s] Completed agent call session=%s org=%s team=%s",
        #         getattr(request.state, "req_id", "unknown"),
        #         conversation_id,
        #         organization_id,
        #         team_id,
        #     )
        return response

    logger.info("Registered: POST /agent/{agent_type}/{model}")


def register_info_routes(app: FastAPI) -> None:
    """Register information and session management routes.

    Args:
        app: The FastAPI application instance
    """

    @app.get("/")
    async def root():
        """Root endpoint with server info."""
        return {
            "status": "running",
            "message": "Pydantic AI Agent Server with Ably Pub/Sub",
            "endpoints": {
                "agents": "POST /agent/{agent_type}/{model}",
                "sessions": "GET /sessions",
                "cleanup": "POST /sessions/{session_id}/cleanup",
            },
            "realtime": "Subscribe to Ably channel 'usage:{session_id}' for live updates",
        }

    @app.get("/healthz")
    async def healthz():
        return {"status": "ok"}

    @app.get("/readyz")
    async def readyz():
        # Check DB and basic cache presence
        db_ok = False
        try:
            async with get_db_connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("SELECT 1")
                    _ = await cur.fetchone()
                    db_ok = True
        except Exception as e:
            logger.warning(f"Readiness DB check failed: {e}")
        caches_ok = bool(_context_cache)
        status = "ok" if db_ok and caches_ok else "degraded"
        return {"status": status, "db": db_ok, "caches": caches_ok}

    @app.post("/sessions/{session_id}/cleanup")
    async def cleanup_session_endpoint(session_id: str):
        """Clean up a specific session's state.

        Args:
            session_id: The session ID to clean up

        Returns:
            Success status message
        """
        cleanup_session(session_id)
        return {"status": "success", "message": f"Session {session_id} cleaned up"}

    @app.get("/sessions")
    async def list_sessions():
        """List all active sessions.

        Returns:
            Dictionary with session information
        """
        sessions = get_all_sessions()
        return {
            "sessions": sessions,
            "total_sessions": len(sessions),
            "realtime_provider": "ably",
        }

    @app.post("/deployments/context")
    async def deploy_context_endpoint(payload: DeploymentRequest):
        await deploy_context(
            payload.organization_id, payload.team_id, force=payload.force
        )
        return get_context_status(payload.organization_id, payload.team_id)

    @app.post("/deployments/context/restart")
    async def restart_context_endpoint(payload: DeploymentRequest):
        await restart_context(payload.organization_id, payload.team_id)
        return get_context_status(payload.organization_id, payload.team_id)

    @app.get("/deployments/context")
    async def get_context_status_endpoint(organization_id: str, team_id: str):
        return get_context_status(organization_id, team_id)

    @app.get("/deployments")
    async def list_deployments_endpoint(
        request: Request, background_tasks: BackgroundTasks
    ):
        # Try to get authentication context for prewarming
        organization_id = request.headers.get("x-copilot-organization-id")
        team_id = request.headers.get("x-copilot-team-id")

        # Prewarm organization deployments on first authenticated request
        if organization_id:
             _trigger_prewarm(organization_id, background_tasks)

        return {"deployments": list_deployments()}

    @app.get("/deployments/endpoints")
    async def list_endpoints_endpoint(
        request: Request, background_tasks: BackgroundTasks
    ):
        # Try to get authentication context for prewarming
        organization_id = request.headers.get("x-copilot-organization-id")
        team_id = request.headers.get("x-copilot-team-id")

        # Prewarm organization deployments on first authenticated request
        if organization_id:
            _trigger_prewarm(organization_id, background_tasks)
        
        return {"endpoints": list_endpoints()}

    @app.get("/tools/{agent_type}/{model}")
    async def list_agent_tools(
        agent_type: str, model: str, request: Request, background_tasks: BackgroundTasks
    ):
        """List all tools available for a specific agent and model.

        Args:
            agent_type: The type of agent (e.g., 'planner')
            model: The model identifier (e.g., 'gpt-4')
            request: The FastAPI request object

        Returns:
            List of tool definitions with their signatures
        """
        # Enforce authentication context
        organization_id = request.headers.get("x-copilot-organization-id")
        team_id = request.headers.get("x-copilot-team-id")

        if not organization_id or not team_id:
            return _make_unauthorized("Missing authentication context")

        # Prewarm organization deployments on first authenticated request
        _trigger_prewarm(organization_id, background_tasks)

        try:
            # Ensure agent is ready before fetching tools
            try:
                await ensure_agent_ready(organization_id, team_id, agent_type, model)
            except DeploymentError as exc:
                return JSONResponse(
                    status_code=exc.status_code, content={"error": str(exc)}
                )

            # Get the agent instance
            agent = await get_agent(agent_type, model, organization_id, team_id)

            # Get tool definitions and agent info for context
            from config.tools import get_tools_for_context, get_mcp_servers_for_context
            from config.prompts import get_agent_info_for_context

            tool_definitions = get_tools_for_context(organization_id, team_id)
            mcp_servers = get_mcp_servers_for_context(organization_id, team_id)
            mcp_servers_by_id: dict[str, dict] = {}
            for server_key, server_data in mcp_servers.items():
                if not isinstance(server_data, dict):
                    continue
                server_id = server_data.get("id")
                if server_id is not None:
                    mcp_servers_by_id[str(server_id)] = server_data
                # Also allow lookup by server key for completeness
                if server_key:
                    mcp_servers_by_id.setdefault(str(server_key), server_data)
            agent_info = (
                get_agent_info_for_context(agent_type, organization_id, team_id) or {}
            )
            allowed_tool_keys = agent_info.get("allowed_tools")

            # If no allowed_tools specified (None or empty list), include all enabled tools
            if not allowed_tool_keys:
                allowed_tool_keys = [
                    key
                    for key, data in tool_definitions.items()
                    if data.get("enabled", True)
                ]

            # Extract tool information drawn from configuration and runtime
            tools: list[dict] = []
            def _extract_parameters(config_entry: dict | None) -> list[dict]:
                params: list[dict] = []
                if not isinstance(config_entry, dict):
                    return params
                param_list = config_entry.get("parameters")
                if isinstance(param_list, list):
                    for param in param_list:
                        if not isinstance(param, dict):
                            continue
                        params.append(
                            {
                                "name": param.get("name", ""),
                                "type": param.get("type", "any"),
                                "required": param.get("required", False),
                                "description": param.get("description", ""),
                            }
                        )
                return params

            # Track filtering for debugging
            filtered_count = {"mcp_no_server": 0, "total_processed": 0}
            
            # Build entries from database tool definitions
            for tool_key in allowed_tool_keys:
                filtered_count["total_processed"] += 1
                tool_cfg = tool_definitions.get(tool_key)
                if not tool_cfg:
                    continue

                tool_type = (tool_cfg.get("tool_type") or "custom").lower()
                name = tool_cfg.get("tool_name") or tool_key
                entry = {
                    "key": tool_key,  # Tool identifier (e.g., "clickElement")
                    "name": name,  # Display name (e.g., "Click Element")
                    "description": tool_cfg.get("description", ""),
                    "parameters": _extract_parameters(tool_cfg.get("config")),
                    "source": tool_type,
                    "available": "enabled"
                    if tool_cfg.get("enabled", True)
                    else "disabled",
                    "metadata": tool_cfg.get("metadata", {}),
                }

                if tool_type == "mcp":
                    server_id = tool_cfg.get("mcp_server_id")
                    entry["mcp_server_id"] = server_id
                    entry["remote_tool_name"] = tool_cfg.get("remote_tool_name")
                    server_info = None
                    if server_id is not None:
                        server_info = mcp_servers_by_id.get(str(server_id))
                    # Fall back to lookup by server key if present in tool config
                    if server_info is None:
                        server_key = tool_cfg.get("mcp_server_key") or tool_cfg.get(
                            "mcp_server"
                        )
                        if server_key:
                            server_info = mcp_servers_by_id.get(
                                str(server_key)
                            ) or mcp_servers.get(server_key)
                    
                    # Filter out MCP tools whose servers are not available to this team
                    if not server_info:
                        filtered_count["mcp_no_server"] += 1
                        logger.debug(
                            "Filtering out MCP tool '%s' (server_id=%s) - server not available to team %s",
                            tool_key,
                            server_id,
                            team_id
                        )
                        continue  # Skip this tool entirely
                    
                    if server_info:
                        entry["mcp_server"] = (
                            server_info.get("display_name")
                            or server_info.get("server_key")
                            or server_id
                        )
                        entry["mcp_server_key"] = server_info.get("server_key")

                tools.append(entry)

            # Include runtime-registered tools that may not be present in config (custom, builtin, etc.)
            seen_runtime = {(item.get("source"), item.get("name")) for item in tools}

            # Custom @agent.tool registrations
            if hasattr(agent, "_function_tools") and agent._function_tools:
                import inspect

                for tool_name, tool_def in agent._function_tools.items():
                    identifier = ("custom", tool_name)
                    if identifier in seen_runtime:
                        continue

                    params: list[dict] = []
                    if hasattr(tool_def, "function"):
                        sig = inspect.signature(tool_def.function)
                        for param_name, param in sig.parameters.items():
                            if param_name == "ctx":
                                continue
                            params.append(
                                {
                                    "name": param_name,
                                    "required": param.default
                                    == inspect.Parameter.empty,
                                    "type": str(param.annotation)
                                    if param.annotation != inspect.Parameter.empty
                                    else "any",
                                }
                            )

                    tools.append(
                        {
                            "name": tool_name,
                            "description": tool_def.description or "",
                            "parameters": params,
                            "source": "custom",
                        }
                    )
                    seen_runtime.add(identifier)

            # Built-in tools instantiated at runtime
            if hasattr(agent, "_builtin_tools") and agent._builtin_tools:
                for builtin_tool in agent._builtin_tools:
                    tool_name = type(builtin_tool).__name__
                    normalized_name = tool_name.replace("Tool", "").lower()
                    identifier = ("builtin", normalized_name)
                    if identifier in seen_runtime:
                        continue

                    tools.append(
                        {
                            "name": normalized_name,
                            "description": f"Built-in {tool_name}",
                            "parameters": [],
                            "source": "builtin",
                        }
                    )
                    seen_runtime.add(identifier)

            # MCP toolsets loaded at runtime (may expose additional metadata)
            if hasattr(agent, "_user_toolsets") and agent._user_toolsets:
                async def _fetch_mcp_tools(toolset):
                    extracted = []
                    if not hasattr(toolset, "tool_prefix"):
                        return extracted

                    try:
                        if hasattr(toolset, "__aenter__"):
                            await toolset.__aenter__()

                        if not hasattr(toolset, "list_tools"):
                            return extracted

                        tool_list = await toolset.list_tools()
                        for mcp_tool in tool_list:
                            tool_name = (
                                mcp_tool.name
                                if hasattr(mcp_tool, "name")
                                else str(mcp_tool)
                            )
                            display_name = f"{toolset.tool_prefix}_{tool_name}"
                            
                            parameters: list[dict] = []
                            if hasattr(mcp_tool, "inputSchema"):
                                schema = mcp_tool.inputSchema
                                if isinstance(schema, dict):
                                    properties = schema.get("properties", {})
                                    required = schema.get("required", [])
                                    for prop_name, prop_schema in properties.items():
                                        parameters.append(
                                            {
                                                "name": prop_name,
                                                "required": prop_name in required,
                                                "type": prop_schema.get("type", "any"),
                                                "description": prop_schema.get(
                                                    "description", ""
                                                ),
                                            }
                                        )

                            extracted.append({
                                "name": display_name,
                                "description": getattr(mcp_tool, "description", "") or "",
                                "parameters": parameters,
                                "source": "mcp",
                                "mcp_server": getattr(toolset, "id", None),
                            })
                    except Exception as exc:  # pragma: no cover
                        logger.error(
                            "Failed to extract MCP tools from %s: %s",
                            getattr(toolset, "id", "unknown"),
                            exc,
                            exc_info=True,
                        )
                    return extracted

                # Fetch all toolsets in parallel
                mcp_results = await asyncio.gather(
                    *[_fetch_mcp_tools(ts) for ts in agent._user_toolsets]
                )
                
                for toolset_tools in mcp_results:
                    for tool in toolset_tools:
                        identifier = ("mcp", tool["name"])
                        if identifier in seen_runtime:
                            continue
                        tools.append(tool)
                        seen_runtime.add(identifier)

            # Compute breakdown for logging
            source_counts = {
                "frontend": len([t for t in tools if t.get("source") == "frontend"]),
                "backend": len([t for t in tools if t.get("source") == "backend"]),
                "builtin": len([t for t in tools if t.get("source") == "builtin"]),
                "mcp": len([t for t in tools if t.get("source") == "mcp"]),
                "custom": len([t for t in tools if t.get("source") == "custom"]),
            }

            return {
                "agent_type": agent_type,
                "model": model,
                "tools": tools,
                "total_tools": len(tools),
            }

        except Exception as e:
            logger.error(f"Error listing tools for agent {agent_type}/{model}: {e}")
            return JSONResponse(
                status_code=500, content={"error": f"Failed to list tools: {str(e)}"}
            )
