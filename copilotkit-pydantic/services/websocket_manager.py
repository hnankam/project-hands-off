"""WebSocket connection management for real-time updates."""

from collections import defaultdict
from typing import Dict, Set
from datetime import datetime
from fastapi import WebSocket

from config import logger
import os


class ConnectionManager:
    """Manages WebSocket connections for usage updates."""
    
    def __init__(self):
        """Initialize the connection manager."""
        # Store connections per session_id
        self.active_connections: Dict[str, Set[WebSocket]] = defaultdict(set)
        self.max_per_session = int(os.getenv("MAX_WS_PER_SESSION", "10"))
    
    async def connect(self, websocket: WebSocket, session_id: str) -> None:
        """Accept and register a new WebSocket connection.
        
        Args:
            websocket: The WebSocket connection to register
            session_id: The session ID this connection belongs to
        """
        await websocket.accept()
        # Enforce per-session connection limit
        conns = self.active_connections[session_id]
        if len(conns) >= self.max_per_session:
            try:
                await websocket.send_json({"type": "error", "message": "Too many WebSocket connections for this session"})
            except Exception:
                pass
            await websocket.close(code=4000)
            logger.warning(f"WS rejected for session={session_id}: limit reached ({self.max_per_session})")
            return
        conns.add(websocket)
        # logger.debug(f"WS connected for session={session_id} total={len(conns)}")
    
    def disconnect(self, websocket: WebSocket, session_id: str) -> None:
        """Remove a WebSocket connection.
        
        Args:
            websocket: The WebSocket connection to remove
            session_id: The session ID this connection belongs to
        """
        self.active_connections[session_id].discard(websocket)
        if not self.active_connections[session_id]:
            del self.active_connections[session_id]
        # logger.debug(f"WS disconnected for session={session_id}")
    
    async def broadcast_to_session(self, session_id: str, message: dict) -> None:
        """Broadcast a message to all connections for a specific session.
        
        Args:
            session_id: The session ID to broadcast to
            message: The message dict to send
        """
        if session_id not in self.active_connections:
            # logger.debug(f"No WebSocket connections for session={session_id}")
            return
        
        # Add timestamp
        message["timestamp"] = datetime.now().isoformat()
        
        # Broadcast to all connected clients for this session
        disconnected = set()
        for connection in self.active_connections[session_id]:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"WS send error session={session_id}: {e}")
                disconnected.add(connection)
        
        # Clean up disconnected clients
        for conn in disconnected:
            self.disconnect(conn, session_id)


# Global connection manager instance
manager = ConnectionManager()

