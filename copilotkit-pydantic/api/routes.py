"""API route handlers for agent endpoints."""

import json
from fastapi import FastAPI, Request

from config import DEBUG, logger, get_agent_types, get_models, get_model_names
from core import get_agent
from services import (
    get_or_create_session_state,
    cleanup_session,
    session_states,
    manager,
    create_usage_tracking_callback
)
from pydantic_ai.ag_ui import handle_ag_ui_request


def register_agent_routes(app: FastAPI) -> None:
    """Register agent routes for all agent types and models.
    
    Args:
        app: The FastAPI application instance
    """
    # Create routes for all combinations with session-based state
    for agent_type in get_agent_types():
        for model in get_model_names():
            path = f"/agent/{agent_type}/{model}"
            agent = get_agent(agent_type, model)
            
            # Create a route handler for this specific agent/model
            def create_handler(agent_ref, agent_type_str, model_str):
                async def handler(request: Request):
                    # Extract session/thread ID from request body
                    session_id = 'default'
                    try:
                        # Read the body once
                        body_bytes = await request.body()
                        if body_bytes:
                            body = json.loads(body_bytes)
                            
                            # Try to get session ID from various possible fields
                            session_id = (
                                body.get('thread_id') or 
                                body.get('threadId') or
                                body.get('session_id') or 
                                body.get('sessionId') or
                                'default'
                            )
                            
                            if DEBUG:
                                logger.info(
                                    f"[{request.state.req_id}] session_id={session_id} "
                                    f"agent={agent_type_str} model={model_str}"
                                )
                        
                        # Store the body in the request state for potential re-reading
                        request._body = body_bytes
                        
                    except Exception as e:
                        logger.warning(
                            f"[{request.state.req_id}] Error extracting session ID: {e}. "
                            f"Using 'default'"
                        )
                        session_id = 'default'
                    
                    # Get or create state for this session
                    state_deps = get_or_create_session_state(session_id, agent_type_str, model_str)
                    
                    # Create usage callback that broadcasts via WebSocket
                    usage_callback = create_usage_tracking_callback(
                        session_id=session_id,
                        agent_type=agent_type_str,
                        model=model_str,
                        broadcast_func=manager.broadcast_to_session
                    )
                    
                    # Handle AG-UI request with on_complete callback
                    response = await handle_ag_ui_request(
                        agent=agent_ref,
                        request=request,
                        deps=state_deps,
                        on_complete=usage_callback,
                    )
                    
                    if DEBUG:
                        logger.info(
                            f"[{request.state.req_id}] Completed agent call "
                            f"session_id={session_id}"
                        )
                    return response
                return handler
            
            # Register the route with agent type and model captured
            app.post(path)(create_handler(agent, agent_type, model))
            logger.info(f"Registered: POST {path}")


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
            "message": "Pydantic AI Agent Server with WebSocket Usage Streaming",
            "endpoints": {
                "agents": "POST /agent/{agent_type}/{model}",
                "websocket": "WS /ws/usage/{session_id}",
                "sessions": "GET /sessions",
                "cleanup": "POST /sessions/{session_id}/cleanup"
            },
            "usage_streaming": "Connect via WebSocket to receive real-time usage updates"
        }

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
        """List all active sessions and their WebSocket connections.
        
        Returns:
            Dictionary with session information
        """
        sessions = {}
        for session_id, states in session_states.items():
            ws_connections = len(manager.active_connections.get(session_id, set()))
            sessions[session_id] = {
                "agents": list(states.keys()),
                "agent_count": len(states),
                "websocket_connections": ws_connections
            }
        return {
            "sessions": sessions, 
            "total_sessions": len(session_states),
            "total_websocket_connections": sum(
                len(conns) for conns in manager.active_connections.values()
            )
        }

