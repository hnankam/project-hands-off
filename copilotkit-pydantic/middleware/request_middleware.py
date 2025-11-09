"""Request middleware for agent and model tracking."""

import uuid
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from config import DEBUG, logger
from pydantic_ai.exceptions import AgentRunError, ModelHTTPError


def _model_http_error_response(request: Request, exc: ModelHTTPError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code or 502,
        content={
            "error": "model_http_error",
            "message": str(exc),
            "model": exc.model_name,
            "details": exc.body,
            "request_id": getattr(request.state, "req_id", None),
        },
    )


async def agent_model_middleware(request: Request, call_next):
    """Middleware for request ID tracking and agent/model selection.
    
    Args:
        request: The incoming FastAPI request
        call_next: The next middleware or endpoint handler
        
    Returns:
        The response from the next handler
    """
    req_id = request.headers.get("x-request-id") or f"py_{uuid.uuid4().hex[:8]}"
    request.state.req_id = req_id
    
    # Get agent type and model from custom headers
    agent_type = (
        request.headers.get("x-copilot-agent-type") or
        request.headers.get("X-Copilot-Agent-Type") or
        "general"
    )
    
    model_name = (
        request.headers.get("x-copilot-model-type") or
        request.headers.get("X-Copilot-Model-Type") or
        "gemini-2.5-flash-lite"
    )
    
    # Extract user, organization, and team information from headers
    user_id = (
        request.headers.get("x-copilot-user-id") or
        request.headers.get("X-Copilot-User-Id")
    )
    user_email = (
        request.headers.get("x-copilot-user-email") or
        request.headers.get("X-Copilot-User-Email")
    )
    user_name = (
        request.headers.get("x-copilot-user-name") or
        request.headers.get("X-Copilot-User-Name")
    )
    organization_id = (
        request.headers.get("x-copilot-organization-id") or
        request.headers.get("X-Copilot-Organization-Id")
    )
    organization_name = (
        request.headers.get("x-copilot-organization-name") or
        request.headers.get("X-Copilot-Organization-Name")
    )
    organization_slug = (
        request.headers.get("x-copilot-organization-slug") or
        request.headers.get("X-Copilot-Organization-Slug")
    )
    member_role = (
        request.headers.get("x-copilot-member-role") or
        request.headers.get("X-Copilot-Member-Role")
    )
    team_id = (
        request.headers.get("x-copilot-team-id") or
        request.headers.get("X-Copilot-Team-Id")
    )
    team_name = (
        request.headers.get("x-copilot-team-name") or
        request.headers.get("X-Copilot-Team-Name")
    )
    
    if DEBUG:
        logger.info(f"[{req_id}] Agent={agent_type} Model={model_name} {request.method} {request.url.path}")
        if user_id:
            logger.info(
                f"[{req_id}] User={user_email} Org={organization_name or 'none'} ({organization_slug or 'none'}) "
                f"Team={team_name or 'none'} Role={member_role or 'none'}"
            )
            logger.info(
                f"[{req_id}] IDs - UserID={user_id} OrgID={organization_id or 'none'} "
                f"TeamID={team_id or 'none'}"
            )
    
    # Annotate request context for downstream handlers
    request.state.agent_type = agent_type
    request.state.model_name = model_name
    request.state.user_id = user_id
    request.state.user_email = user_email
    request.state.user_name = user_name
    request.state.organization_id = organization_id
    request.state.organization_name = organization_name
    request.state.organization_slug = organization_slug
    request.state.member_role = member_role
    request.state.team_id = team_id
    request.state.team_name = team_name
    
    if DEBUG:
        logger.info(f"[{req_id}] Using agent={agent_type} model={model_name}")
        if user_id:
            logger.info(
                f"[{req_id}] Auth context: user={user_email}, org={organization_name} ({organization_slug}), "
                f"team={team_name}, userID={user_id}, orgID={organization_id}, teamID={team_id}"
            )
    
    response = await call_next(request)
    return response


async def agent_error_middleware(request: Request, call_next):
    """Middleware to catch agent execution errors and return structured responses."""

    try:
        return await call_next(request)
    except ModelHTTPError as exc:
        logger.error(
            "[%s] ModelHTTPError while processing request: model=%s status=%s",
            getattr(request.state, "req_id", "unknown"),
            exc.model_name,
            exc.status_code,
            exc_info=exc,
        )
        return _model_http_error_response(request, exc)
    except AgentRunError as exc:
        logger.error(
            "[%s] AgentRunError while processing request",
            getattr(request.state, "req_id", "unknown"),
            exc_info=exc,
        )
        return JSONResponse(
            status_code=500,
            content={
                "error": "agent_run_error",
                "message": str(exc),
                "request_id": getattr(request.state, "req_id", None),
            },
        )

