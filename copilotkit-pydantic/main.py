"""Main entry point for the Pydantic AI Agent Server.

This server provides REST API endpoints for various AI agent types with 
multiple model options, along with WebSocket support for real-time usage tracking.
"""

import os
from fastapi import FastAPI

from config import DEBUG, HOST, PORT, logger
from middleware import agent_model_middleware
from api import register_agent_routes, register_info_routes, register_websocket_routes

# Optional: Logfire integration
# import logfire
# logfire.configure()
# logfire.instrument_pydantic_ai()

# Create FastAPI application
app = FastAPI(
    title="Pydantic AI Agent Server",
    description="AI Agent Server with multi-agent support and WebSocket usage streaming",
    version="2.0.0",
)

# Register middleware
app.middleware("http")(agent_model_middleware)

# Register routes
register_agent_routes(app)
register_info_routes(app)
register_websocket_routes(app)

logger.info("🚀 Pydantic AI Agent Server initialized")
logger.info(f"   Debug mode: {DEBUG}")
logger.info(f"   Available endpoints:")
logger.info(f"   - POST /agent/{{agent_type}}/{{model}}")
logger.info(f"   - WS /ws/usage/{{session_id}}")
logger.info(f"   - GET /sessions")
logger.info(f"   - POST /sessions/{{session_id}}/cleanup")

# Run server if executed directly
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=HOST,
        port=PORT,
        reload=DEBUG
    )
