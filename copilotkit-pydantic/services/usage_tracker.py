"""Usage tracking and reporting for agent runs."""

import asyncio
import json
from typing import Any, Callable, Awaitable, Optional, Union

from pydantic_ai.run import AgentRunResult

from config import logger
from database.connection import get_db_connection


async def _persist_usage_event(
    *,
    session_id: str,
    agent_id: str,
    model_id: str,
    organization_id: Optional[str],
    team_id: Optional[str],
    user_id: Optional[str],
    request_tokens: int,
    response_tokens: int,
    status: str,
    error_message: Optional[str],
    auth_session_id: Optional[str],
    usage_details: Optional[dict],
    metadata: Optional[dict] = None,
) -> None:
    """Insert a usage event into the database."""

    metadata = dict(metadata or {})
    if auth_session_id:
        metadata["auth_session_id"] = auth_session_id

    metadata_json = json.dumps(metadata or {}, default=str)
    usage_details_json = json.dumps(usage_details or {}, default=str) if usage_details else None

    try:
        async with get_db_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    INSERT INTO usage (
                        agent_id,
                        model_id,
                        session_id,
                        user_id,
                        organization_id,
                        team_id,
                        request_tokens,
                        response_tokens,
                        status,
                        error_message,
                        usage_details,
                        metadata
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        agent_id,
                        model_id,
                        session_id,
                        user_id,
                        organization_id,
                        team_id,
                        request_tokens,
                        response_tokens,
                        status,
                        error_message,
                        usage_details_json,
                        metadata_json,
                    ),
                )
            await conn.commit()
    except Exception as exc:
        logger.error(
            "Failed to persist usage event session=%s agent=%s model=%s: %s",
            session_id,
            agent_id,
            model_id,
            exc,
        )


def create_usage_tracking_callback(
    session_id: str,
    agent_id: str,
    model_id: str,
    broadcast_func: Callable[[str, dict], Awaitable[None]],
    *,
    agent_label: Optional[str] = None,
    model_label: Optional[str] = None,
    auth_session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    organization_id: Optional[str] = None,
    team_id: Optional[str] = None,
):
    """Factory function that creates an OnCompleteFunc that broadcasts usage via WebSocket.
    
    Args:
        session_id: The session ID to associate with this usage
        agent_id: Primary key identifier for the agent used
        model_id: Primary key identifier for the model used
        broadcast_func: Async function to broadcast usage updates
        agent_label: Optional human-readable agent identifier to include in telemetry
        model_label: Optional human-readable model identifier to include in telemetry
        auth_session_id: Optional Supabase session identifier for auditing
        user_id: User ID from authentication system
        organization_id: Organization scope for the usage event
        team_id: Team scope for the usage event
        
    Returns:
        An async callback function that broadcasts usage on completion.
    """
    agent_label = agent_label or agent_id
    model_label = model_label or model_id

    def _safe_int(value: Any) -> int:
        try:
            if isinstance(value, (list, tuple)):
                return int(value[0])
            return int(value)
        except Exception:
            return 0

    async def on_complete_usage_tracking(result: AgentRunResult[Any]):
        """OnCompleteFunc to track token usage and broadcast via WebSocket."""
        usage = result.usage()
        details_dict = usage.details if isinstance(getattr(usage, "details", None), dict) else None

        logger.debug(f"Raw usage object: {usage}")

        req_tokens = 0
        res_tokens = 0
        total_tokens = 0

        if hasattr(usage, 'input_tokens') and hasattr(usage, 'output_tokens'):
            raw_input = getattr(usage, 'input_tokens', 0)
            raw_output = getattr(usage, 'output_tokens', 0)
            logger.debug(f"Direct attributes - input: {raw_input}, output: {raw_output}")
            if raw_input > 0 or raw_output > 0:
                req_tokens = _safe_int(raw_input)
                res_tokens = _safe_int(raw_output)
                total_tokens = req_tokens + res_tokens
                logger.debug(
                    "✓ Using direct attributes - request: %s, response: %s, total: %s",
                    req_tokens,
                    res_tokens,
                    total_tokens,
                )

        if req_tokens == 0 and res_tokens == 0 and details_dict is not None:
            logger.debug(f"Checking details dict: {details_dict}")
            if 'input_tokens' in details_dict and 'output_tokens' in details_dict:
                req_tokens = _safe_int(details_dict.get('input_tokens', 0))
                res_tokens = _safe_int(details_dict.get('output_tokens', 0))
                total_tokens = req_tokens + res_tokens
                logger.debug(
                    "✓ Using details dict (Anthropic) - request: %s, response: %s, total: %s",
                    req_tokens,
                    res_tokens,
                    total_tokens,
                )
            elif 'prompt_tokens' in details_dict and 'completion_tokens' in details_dict:
                req_tokens = _safe_int(details_dict.get('prompt_tokens', 0))
                res_tokens = _safe_int(details_dict.get('completion_tokens', 0))
                total_tokens = _safe_int(details_dict.get('total_tokens', req_tokens + res_tokens))
                logger.debug(
                    "✓ Using details dict (OpenAI) - request: %s, response: %s, total: %s",
                    req_tokens,
                    res_tokens,
                    total_tokens,
                )

        if req_tokens == 0 and res_tokens == 0 and hasattr(usage, 'request_tokens'):
            request_tokens_attr = getattr(usage, 'request_tokens')
            response_tokens_attr = getattr(usage, 'response_tokens')
            total_tokens_attr = getattr(usage, 'total_tokens')
            if callable(request_tokens_attr):
                req_tokens = _safe_int(request_tokens_attr())
                res_tokens = _safe_int(response_tokens_attr())
                total_tokens = _safe_int(total_tokens_attr())
            else:
                req_tokens = _safe_int(request_tokens_attr)
                res_tokens = _safe_int(response_tokens_attr)
                total_tokens = _safe_int(total_tokens_attr)
            if req_tokens > 0 or res_tokens > 0:
                logger.debug(
                    "✓ Using token properties - request: %s, response: %s, total: %s",
                    req_tokens,
                    res_tokens,
                    total_tokens,
                )

        if req_tokens == 0 and res_tokens == 0:
            logger.warning("⚠ Could not extract non-zero usage. Usage repr: %s", repr(usage))

        usage_data = {
            "session_id": session_id,
            "agent_id": str(agent_id) if agent_id else None,
            "model_id": str(model_id) if model_id else None,
            "agent_type": agent_label,
            "model": model_label,
            "request_tokens": req_tokens,
            "response_tokens": res_tokens,
            "total_tokens": total_tokens,
            "timestamp": None,
            "status": "success",
            "error_message": None,
        }
        if auth_session_id:
            usage_data["auth_session_id"] = auth_session_id
        if details_dict:
            usage_data["usage_details"] = details_dict

        asyncio.create_task(
            _persist_usage_event(
                session_id=session_id,
                agent_id=agent_id,
                model_id=model_id,
                user_id=user_id,
                organization_id=organization_id,
                team_id=team_id,
                request_tokens=req_tokens,
                response_tokens=res_tokens,
                status="success",
                error_message=None,
                auth_session_id=auth_session_id,
                usage_details=details_dict,
                metadata={"event": "completion"},
            )
        )

        auth_suffix = f" authSession={auth_session_id}" if auth_session_id else ""
        logger.info(
            "usage session=%s agent=%s model=%s req=%s res=%s total=%s%s",
            session_id,
            agent_label,
            model_label,
            req_tokens,
            res_tokens,
            total_tokens,
            auth_suffix,
        )

        await broadcast_func(session_id, usage_data)

    return on_complete_usage_tracking


async def log_usage_failure(
    *,
    session_id: str,
    agent_id: str,
    model_id: str,
    agent_label: str,
    model_label: str,
    error_message: Union[str, Exception],
    broadcast_func: Callable[[str, dict], Awaitable[None]],
    organization_id: Optional[str] = None,
    team_id: Optional[str] = None,
    user_id: Optional[str] = None,
    auth_session_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    """Record a failed agent invocation for debugging and analytics."""

    metadata = dict(metadata or {})
    metadata.setdefault("event", "failure")

    error_text = str(error_message)
    if not isinstance(error_message, str):
        metadata.setdefault("error_type", type(error_message).__name__)
    elif "error_type" in metadata and metadata["error_type"] is None:
        metadata.pop("error_type", None)

    asyncio.create_task(
        _persist_usage_event(
            session_id=session_id,
            agent_id=agent_id,
            model_id=model_id,
            user_id=user_id,
            organization_id=organization_id,
            team_id=team_id,
            request_tokens=0,
            response_tokens=0,
            status="error",
            error_message=error_text,
            auth_session_id=auth_session_id,
            usage_details=None,
            metadata=metadata,
        )
    )

    payload = {
        "session_id": session_id,
        "agent_id": str(agent_id) if agent_id else None,
        "model_id": str(model_id) if model_id else None,
        "agent_type": agent_label,
        "model": model_label,
        "request_tokens": 0,
        "response_tokens": 0,
        "total_tokens": 0,
        "status": "error",
        "error_message": error_text,
        "timestamp": None,
    }
    if auth_session_id:
        payload["auth_session_id"] = auth_session_id
    if metadata:
        payload["metadata"] = metadata

    try:
        await broadcast_func(session_id, payload)
    except Exception as exc:
        logger.warning("Failed to broadcast usage failure for session=%s: %s", session_id, exc)

