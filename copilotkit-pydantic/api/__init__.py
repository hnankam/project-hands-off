"""API routes and endpoints."""

from .routes import register_agent_routes, register_info_routes
from .websocket import register_websocket_routes
from .admin import register_admin_routes

__all__ = [
    'register_agent_routes',
    'register_info_routes',
    'register_websocket_routes',
    'register_admin_routes',
]

