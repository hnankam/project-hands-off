"""Request middleware for agent and model tracking."""

import uuid
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from config import DEBUG, logger


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
    
    if DEBUG:
        logger.info(f"[{req_id}] Agent={agent_type} Model={model_name} {request.method} {request.url.path}")
    
    # Annotate request context for downstream handlers
    request.state.agent_type = agent_type
    request.state.model_name = model_name
    if DEBUG:
        logger.info(f"[{req_id}] Using agent={agent_type} model={model_name}")
    
    response = await call_next(request)
    return response

