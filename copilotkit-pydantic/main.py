from agent import StateDeps, AgentState, get_agent, create_usage_tracking_callback
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from datetime import datetime
from pydantic_ai.ag_ui import handle_ag_ui_request
from collections import defaultdict
from typing import Dict, Set
import json
import asyncio
import random
from anthropic import APIError, RateLimitError, APIConnectionError, APITimeoutError
try:
    from pydantic_ai.exceptions import ModelHTTPError
except Exception:  # fallback if version differs
    ModelHTTPError = Exception
import AnthropicWithCache

# Create a single FastAPI app
app = FastAPI()

# WebSocket Connection Manager
class ConnectionManager:
    """Manages WebSocket connections for usage updates."""
    
    def __init__(self):
        # Store connections per session_id
        self.active_connections: Dict[str, Set[WebSocket]] = defaultdict(set)
    
    async def connect(self, websocket: WebSocket, session_id: str):
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        self.active_connections[session_id].add(websocket)
        print(f"🔌 WebSocket connected for session: {session_id} (total: {len(self.active_connections[session_id])})")
    
    def disconnect(self, websocket: WebSocket, session_id: str):
        """Remove a WebSocket connection."""
        self.active_connections[session_id].discard(websocket)
        if not self.active_connections[session_id]:
            del self.active_connections[session_id]
        print(f"🔌 WebSocket disconnected for session: {session_id}")
    
    async def broadcast_to_session(self, session_id: str, message: dict):
        """Broadcast a message to all connections for a specific session."""
        if session_id not in self.active_connections:
            print(f"⚠️  No WebSocket connections for session: {session_id}")
            return
        
        # Add timestamp
        message["timestamp"] = datetime.now().isoformat()
        
        # Broadcast to all connected clients for this session
        disconnected = set()
        for connection in self.active_connections[session_id]:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"❌ Error sending to WebSocket: {e}")
                disconnected.add(connection)
        
        # Clean up disconnected clients
        for conn in disconnected:
            self.disconnect(conn, session_id)

# Global connection manager
manager = ConnectionManager()

# Session-based state management
# Structure: session_states[session_id][agent_type:model] = StateDeps
session_states: Dict[str, Dict[str, StateDeps[AgentState]]] = defaultdict(dict)

def get_or_create_session_state(session_id: str, agent_type: str, model: str) -> StateDeps[AgentState]:
    """Get or create state for a specific session and agent/model combo.
    
    Args:
        session_id: The session/thread ID from the request
        agent_type: The type of agent (general, wiki, etc.)
        model: The model name (gemini-2.5-flash-lite, etc.)
    
    Returns:
        StateDeps instance for this session
    """
    key = f"{agent_type}:{model}"
    if key not in session_states[session_id]:
        print(f"🆕 Creating new state for session={session_id}, agent={agent_type}, model={model}")
        session_states[session_id][key] = StateDeps(AgentState())
    else:
        print(f"♻️  Reusing existing state for session={session_id}, agent={agent_type}, model={model}")
    return session_states[session_id][key]

def cleanup_session(session_id: str):
    """Remove a session and all its states."""
    if session_id in session_states:
        print(f"🧹 Cleaning up session: {session_id}")
        del session_states[session_id]

# Middleware to log agent and model from custom headers
@app.middleware("http")
async def agent_model_middleware(request: Request, call_next):
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
    
    print("=" * 50)
    print("=== Pydantic Agent Request ===")
    print(f"Timestamp: {datetime.now().isoformat()}")
    print(f"Agent Type: {agent_type}")
    print(f"Model: {model_name}")
    print(f"Method: {request.method}")
    print(f"Path: {request.url.path}")
    
    # Get the appropriate agent for this agent_type + model combination
    selected_agent = get_agent(agent_type, model_name)
    print(f"✅ Using agent: {agent_type} with model {model_name}")
    
    print("=" * 50)
    
    response = await call_next(request)
    return response

# Mount agents for all agent_type + model combinations
# Path format: /agent/{agent_type}/{model}

agent_types = ["general", "wiki", "sharepoint", "excel", "word", "databricks", "powerpoint"]
models = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro", 
          "claude-3.5-sonnet", "claude-3.7-sonnet", "claude-4.1-opus", "claude-4.5-sonnet"]

# Create routes for all combinations with session-based state
for agent_type in agent_types:
    for model in models:
        path = f"/agent/{agent_type}/{model}"
        agent = get_agent(agent_type, model)
        
        # Create a route handler for this specific agent/model
        # We need to use a function factory to capture the agent_type and model correctly
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
                        
                        print(f"📨 Request for session_id={session_id}, agent={agent_type_str}, model={model_str}")
                    
                    # We need to allow the request body to be read again by handle_ag_ui_request
                    # Store the body in the request state for potential re-reading
                    request._body = body_bytes
                    
                except Exception as e:
                    print(f"⚠️  Error extracting session ID: {e}, using 'default'")
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
                # handle_ag_ui_request returns a Response object directly
                
                # Retry around model/transient errors with exponential backoff
                max_retries = 3
                base_delay = 0.5
                cap_delay = 5.0
                response = None
                for attempt in range(max_retries + 1):
                    try:
                        response = await handle_ag_ui_request(
                            agent=agent_ref,
                            request=request,
                            deps=state_deps,
                            on_complete=usage_callback,
                        )
                        break
                    except (RateLimitError, APIConnectionError, APITimeoutError) as e:
                        if attempt == max_retries:
                            raise
                        jitter = 1 + 0.2 * random.random()
                        sleep_s = min(cap_delay, base_delay * (2 ** attempt)) * jitter
                        print(f"⏳ Transient Anthropic error: {e}. Retrying in {sleep_s:.2f}s (attempt {attempt+1}/{max_retries})")
                        await asyncio.sleep(sleep_s)
                    except ModelHTTPError as e:
                        status = getattr(e, "status_code", getattr(e, "status", None))
                        if status in (429,) or (status is not None and 500 <= status < 600):
                            if attempt == max_retries:
                                raise
                            jitter = 1 + 0.2 * random.random()
                            sleep_s = min(cap_delay, base_delay * (2 ** attempt)) * jitter
                            print(f"⏳ ModelHTTPError {status}: retrying in {sleep_s:.2f}s (attempt {attempt+1}/{max_retries})")
                            await asyncio.sleep(sleep_s)
                        else:
                            raise
                    except APIError as e:
                        # Non-retryable Anthropic API error (e.g., most 4xx)
                        raise
                print(f"🔧 Request: {request}")
                print(f"🔧 Response: {response}")
                return response
            return handler
        
        # Register the route with agent type and model captured
        app.post(path)(create_handler(agent, agent_type, model))
        print(f"📍 Registered: POST {path}")

# WebSocket endpoint for usage updates
@app.websocket("/ws/usage/{session_id}")
async def websocket_usage(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for receiving real-time usage updates for a session."""
    await manager.connect(websocket, session_id)
    try:
        # Keep the connection alive and listen for client messages (e.g., ping)
        while True:
            try:
                # Wait for any message from client (or just keep alive)
                data = await websocket.receive_text()
                # Echo back or handle client messages if needed
                if data == "ping":
                    await websocket.send_json({"type": "pong"})
            except WebSocketDisconnect:
                break
    except Exception as e:
        print(f"❌ WebSocket error: {e}")
    finally:
        manager.disconnect(websocket, session_id)

# Health and info endpoints
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

# Session management endpoints
@app.post("/sessions/{session_id}/cleanup")
async def cleanup_session_endpoint(session_id: str):
    """Clean up a specific session's state."""
    cleanup_session(session_id)
    return {"status": "success", "message": f"Session {session_id} cleaned up"}

@app.get("/sessions")
async def list_sessions():
    """List all active sessions and their WebSocket connections."""
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
        "total_websocket_connections": sum(len(conns) for conns in manager.active_connections.values())
    }

# If you want the server to run on invocation, you can do the following:
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="localhost", port=8001, reload=True)