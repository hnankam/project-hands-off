"""Ably Pub/Sub publisher for real-time updates.

This module replaces the WebSocket ConnectionManager with Ably's managed
pub/sub infrastructure for better reliability and scalability.
"""

import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from config import logger

# Ably SDK import with fallback for development
try:
    from ably import AblyRest
    ABLY_AVAILABLE = True
except ImportError:
    ABLY_AVAILABLE = False
    logger.warning("Ably SDK not installed. Run: pip install ably")


class AblyPublisher:
    """Publishes messages to Ably channels for real-time updates.
    
    Replaces the WebSocket ConnectionManager with Ably's managed infrastructure.
    Messages are published to session-specific channels that clients subscribe to.
    """
    
    def __init__(self, api_key: Optional[str] = None):
        """Initialize the Ably publisher.
        
        Args:
            api_key: Ably API key. If not provided, reads from ABLY_API_KEY env var.
        """
        self.api_key = api_key or os.getenv("ABLY_API_KEY", "")
        self._client: Optional[AblyRest] = None
        self._initialized = False
        
    def _ensure_client(self) -> bool:
        """Lazily initialize the Ably client.
        
        Returns:
            True if client is ready, False otherwise.
        """
        if self._initialized:
            return self._client is not None
            
        self._initialized = True
        
        if not ABLY_AVAILABLE:
            logger.error("Ably SDK not available. Install with: pip install ably")
            return False
            
        if not self.api_key:
            logger.warning("ABLY_API_KEY not configured. Real-time updates disabled.")
            return False
            
        try:
            self._client = AblyRest(self.api_key)
            logger.info("Ably publisher initialized successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize Ably client: {e}")
            return False
    
    async def broadcast_to_session(self, session_id: str, message: Dict[str, Any]) -> None:
        """Broadcast a message to all clients subscribed to a session channel.
        
        Args:
            session_id: The session ID (used as channel name suffix)
            message: The message dict to publish
        """
        if not self._ensure_client():
            logger.debug(f"Ably not available, skipping broadcast for session={session_id}")
            return
            
        # Add UTC timestamp for consistent client-side handling
        message["timestamp"] = datetime.now(timezone.utc).isoformat()
        
        channel_name = f"usage:{session_id}"
        
        try:
            channel = self._client.channels.get(channel_name)
            await channel.publish("update", message)
            logger.debug(f"Published to Ably channel={channel_name}")
        except Exception as e:
            logger.warning(f"Failed to publish to Ably channel={channel_name}: {e}")
    
    async def publish_event(
        self,
        channel_name: str,
        event_name: str,
        data: Dict[str, Any],
        add_timestamp: bool = True,
    ) -> None:
        """Publish an event to a specific Ably channel.
        
        Args:
            channel_name: The full channel name
            event_name: The event type/name
            data: The event data to publish
            add_timestamp: Whether to add a UTC timestamp
        """
        if not self._ensure_client():
            return
            
        if add_timestamp:
            data["timestamp"] = datetime.now(timezone.utc).isoformat()
            
        try:
            channel = self._client.channels.get(channel_name)
            await channel.publish(event_name, data)
        except Exception as e:
            logger.warning(f"Failed to publish event={event_name} to channel={channel_name}: {e}")
    
    def is_configured(self) -> bool:
        """Check if Ably is properly configured.
        
        Returns:
            True if API key is set and SDK is available.
        """
        return ABLY_AVAILABLE and bool(self.api_key)


# Global publisher instance
ably_publisher = AblyPublisher()

