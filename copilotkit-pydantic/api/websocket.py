"""WebSocket endpoints for real-time communication."""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from config import logger
from services import manager


def register_websocket_routes(app: FastAPI) -> None:
    """Register WebSocket routes.
    
    Args:
        app: The FastAPI application instance
    """
    
    @app.websocket("/ws/usage/{session_id}")
    async def websocket_usage(websocket: WebSocket, session_id: str):
        """WebSocket endpoint for receiving real-time usage updates for a session.
        
        Args:
            websocket: The WebSocket connection
            session_id: The session ID for this connection
        """
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
            logger.warning(f"WS error session={session_id}: {e}")
        finally:
            manager.disconnect(websocket, session_id)

