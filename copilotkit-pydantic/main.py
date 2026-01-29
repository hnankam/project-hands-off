"""Main entry point for the Pydantic AI Agent Server.

This server provides REST API endpoints for various AI agent types with 
multiple model options, with Ably Pub/Sub for real-time usage tracking.
"""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import (
    DEBUG, 
    HOST, 
    PORT, 
    logger,
    LOGFIRE_ENABLED,
    LOGFIRE_TOKEN,
    LOGFIRE_SERVICE_NAME,
    LOGFIRE_ENVIRONMENT,
    LOGFIRE_CAPTURE_HEADERS,
)
from database.connection import init_connection_pool
from database.redis_connection import init_redis_connection
from middleware import agent_error_middleware, agent_model_middleware
from api import (
    register_agent_routes,
    register_info_routes,
    register_admin_routes,
)
from services import initialize_deployments
from pydantic_ai.exceptions import AgentRunError, ModelHTTPError

# Logfire integration
if LOGFIRE_ENABLED:
    try:
        import logfire
        
        # Configure Logfire with service details
        logfire.configure(
            token=LOGFIRE_TOKEN if LOGFIRE_TOKEN else None,
            service_name=LOGFIRE_SERVICE_NAME,
            environment=LOGFIRE_ENVIRONMENT,
            send_to_logfire='if-token-present',  # Only send if token is provided
        )
        
        # Instrument Pydantic AI for agent tracing
        try:
            logfire.instrument_pydantic_ai()
            # logfire.instrument_psycopg()
            logfire.instrument_httpx(capture_headers=LOGFIRE_CAPTURE_HEADERS)
            # logfire.instrument_openai()
            # logfire.instrument_anthropic()
        except Exception as e:
            logger.debug(f"Could not instrument Anthropic: {e}")
        
        logger.info(f"✅ Logfire instrumentation enabled (service: {LOGFIRE_SERVICE_NAME}, env: {LOGFIRE_ENVIRONMENT})")
    except ImportError:
        logger.warning("⚠️  Logfire package not installed. Install with: pip install logfire[fastapi]")
    except Exception as e:
        logger.warning(f"⚠️  Failed to initialize Logfire: {e}")
else:
    logger.info("ℹ️  Logfire instrumentation disabled (set LOGFIRE_ENABLED=true to enable)")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown."""
    # Startup: init DB pool, Redis, and warm configuration caches
    await init_connection_pool()
    
    # Initialize Redis (falls back to in-memory if unavailable)
    redis_available = await init_redis_connection()
    
    # Give the connections a moment to be fully ready
    import asyncio
    await asyncio.sleep(0.2)
    
    await initialize_deployments(prewarm_global=True)
    
    logger.info("🚀 Pydantic AI Agent Server initialized")
    logger.info(f"   Debug mode: {DEBUG}")
    logger.info(f"   Redis: {'✅ Connected' if redis_available else '⚠️  Unavailable (using in-memory fallback)'}")
    logger.info(f"   Available endpoints:")
    logger.info(f"   - POST /agent/{{agent_type}}/{{model}}")
    logger.info(f"   - GET /sessions")
    logger.info(f"   - POST /sessions/{{session_id}}/cleanup")
    logger.info(f"   Real-time: Ably Pub/Sub (usage:{{session_id}} channel)")
    
    if not redis_available:
        logger.warning("⚠️  WARNING: In-memory state management is NOT suitable for multi-instance deployment!")
        logger.warning("⚠️  Sessions will be lost if load balancer routes requests to different instances.")
    
    yield
    
    # Shutdown: cleanup resources if needed
    logger.info("Shutting down Pydantic AI Agent Server")

    # Close connection pool
    from database.connection import close_connection_pool
    await close_connection_pool()
    
    # Close Redis connection
    from database.redis_connection import close_redis_connection
    await close_redis_connection()


# Create FastAPI application with lifespan and request size limits
app = FastAPI(
    title="Pydantic AI Agent Server",
    description="AI Agent Server with multi-agent support and Ably Pub/Sub usage streaming",
    version="2.0.0",
    lifespan=lifespan,
    # Set maximum request body size (30MB default)
    max_request_size=int(os.getenv("MAX_REQUEST_SIZE_MB", "30")) * 1024 * 1024,
)

# Instrument FastAPI with Logfire
if LOGFIRE_ENABLED:
    try:
        import logfire
        logfire.instrument_fastapi(
            app,
            capture_headers=LOGFIRE_CAPTURE_HEADERS,  # Capture request and response headers
        )
        headers_status = "headers enabled" if LOGFIRE_CAPTURE_HEADERS else "headers disabled"
        logger.info(f"✅ FastAPI instrumented with Logfire ({headers_status})")
    except Exception as e:
        logger.warning(f"⚠️  Failed to instrument FastAPI with Logfire: {e}")

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
    from middleware.request_middleware import _model_http_error_response
    return _model_http_error_response(request, exc)


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
