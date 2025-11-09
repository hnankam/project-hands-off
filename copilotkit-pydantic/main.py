"""Main entry point for the Pydantic AI Agent Server.

This server provides REST API endpoints for various AI agent types with 
multiple model options, along with WebSocket support for real-time usage tracking.
"""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import DEBUG, HOST, PORT, logger
from database.connection import init_connection_pool
from middleware import agent_error_middleware, agent_model_middleware
from api import register_agent_routes, register_info_routes, register_websocket_routes, register_admin_routes
from services import initialize_deployments
from pydantic_ai.exceptions import AgentRunError, ModelHTTPError

# Optional: Logfire integration
# import logfire
# logfire.configure()
# logfire.instrument_pydantic_ai()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown."""
    # Startup: init DB pool and warm configuration caches
    await init_connection_pool()
    
    # Give the pool a moment to be fully ready before loading deployments
    import asyncio
    await asyncio.sleep(0.2)
    
    await initialize_deployments(prewarm_global=True)
    
    logger.info("🚀 Pydantic AI Agent Server initialized")
    logger.info(f"   Debug mode: {DEBUG}")
    logger.info(f"   Available endpoints:")
    logger.info(f"   - POST /agent/{{agent_type}}/{{model}}")
    logger.info(f"   - WS /ws/usage/{{session_id}}")
    logger.info(f"   - GET /sessions")
    logger.info(f"   - POST /sessions/{{session_id}}/cleanup")
    
    yield
    
    # Shutdown: cleanup resources if needed
    logger.info("Shutting down Pydantic AI Agent Server")


# Create FastAPI application with lifespan
app = FastAPI(
    title="Pydantic AI Agent Server",
    description="AI Agent Server with multi-agent support and WebSocket usage streaming",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS configuration
allowed_origins_env = os.getenv("ALLOWED_ORIGINS")
if allowed_origins_env:
    allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
else:
    # Default: Allow all origins in debug mode, otherwise allow common origins
    allowed_origins = ["*"] if DEBUG else [
        "http://localhost:3000",
        "http://localhost:5173",
        "chrome-extension://*",
    ]

# Always add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Register middleware (outermost first)
app.middleware("http")(agent_error_middleware)
app.middleware("http")(agent_model_middleware)


@app.exception_handler(ModelHTTPError)
async def handle_model_http_error(request: Request, exc: ModelHTTPError) -> JSONResponse:
    """Return a structured response for model-related HTTP errors."""
    logger.error(
        "[%s] ModelHTTPError handled via exception handler: model=%s status=%s",
        getattr(request.state, "req_id", "unknown"),
        exc.model_name,
        exc.status_code,
        exc_info=exc,
    )
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


@app.exception_handler(AgentRunError)
async def handle_agent_run_error(request: Request, exc: AgentRunError) -> JSONResponse:
    """Return a structured response for unexpected agent errors."""
    logger.error(
        "[%s] AgentRunError handled via exception handler",
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

# Register routes (routes will warm cache on first access if needed)
register_agent_routes(app)
register_info_routes(app)
register_websocket_routes(app)
register_admin_routes(app)

# Run server if executed directly
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=HOST,
        port=PORT,
        reload=DEBUG
    )
