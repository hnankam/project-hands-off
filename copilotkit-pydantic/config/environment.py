"""Environment configuration and logging setup."""

import os
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Debug mode configuration (default: false in production)
DEBUG = os.getenv("DEBUG", "false").lower() in {"1", "true", "yes"}

def setup_logging() -> logging.Logger:
    """Configure and return the application logger."""
    logger = logging.getLogger("copilotkit-agent")
    
    if not logger.handlers:
        log_level = logging.DEBUG if DEBUG else logging.INFO
        log_format = os.getenv("LOG_FORMAT", "plain").lower()
        handler = logging.StreamHandler()
        
        if log_format == "json":
            try:
                import json as _json
                
                class JsonFormatter(logging.Formatter):
                    def format(self, record: logging.LogRecord) -> str:
                        payload = {
                            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
                            "level": record.levelname,
                            "logger": record.name,
                            "message": record.getMessage(),
                        }
                        # Attach optional request/session identifiers if present on the record
                        for attr in ("request_id", "session_id", "agent_type", "model"):
                            if hasattr(record, attr):
                                payload[attr] = getattr(record, attr)
                        return _json.dumps(payload, ensure_ascii=False)
                        
                handler.setFormatter(JsonFormatter())
            except Exception:
                # Fallback to plain text if JSON formatting fails
                handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(name)s - %(message)s'))
        else:
            handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(name)s - %(message)s'))
            
        logger.setLevel(log_level)
        logger.addHandler(handler)
        
    return logger

# Logger configuration
logger = setup_logging()

# Server configuration
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", 8001))

# Ably Pub/Sub configuration
# API key for real-time messaging (same key used by backend to publish, frontend to subscribe)
ABLY_API_KEY = os.getenv("ABLY_API_KEY", "")

# Google API configuration
# API key for Google AI models (Gemini) used by multi-agent graph
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

# Logfire configuration
# Enable/disable Logfire observability (default: true if token is provided)
LOGFIRE_TOKEN = os.getenv("LOGFIRE_TOKEN", "")
LOGFIRE_ENABLED = os.getenv("LOGFIRE_ENABLED", "true" if LOGFIRE_TOKEN else "false").lower() in {"1", "true", "yes"}
LOGFIRE_SERVICE_NAME = os.getenv("LOGFIRE_SERVICE_NAME", "copilotkit-pydantic")
LOGFIRE_ENVIRONMENT = os.getenv("LOGFIRE_ENVIRONMENT", "development" if DEBUG else "production")
LOGFIRE_CAPTURE_HEADERS = os.getenv("LOGFIRE_CAPTURE_HEADERS", "true").lower() in {"1", "true", "yes"}

# Redis configuration
# Enable/disable Redis for distributed caching and state (default: true)
# Falls back to in-memory if Redis unavailable (NOT suitable for multi-instance deployment)
REDIS_ENABLED = os.getenv("REDIS_ENABLED", "true").lower() in {"1", "true", "yes"}
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "0"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")
REDIS_SSL = os.getenv("REDIS_SSL", "false").lower() in {"1", "true", "yes"}
REDIS_MAX_CONNECTIONS = int(os.getenv("REDIS_MAX_CONNECTIONS", "50"))
REDIS_SOCKET_TIMEOUT = int(os.getenv("REDIS_SOCKET_TIMEOUT", "5"))
REDIS_SOCKET_CONNECT_TIMEOUT = int(os.getenv("REDIS_SOCKET_CONNECT_TIMEOUT", "5"))

# Encryption configuration
# Master secret for credential encryption (REQUIRED in production)
ENCRYPTION_MASTER_SECRET = os.getenv("ENCRYPTION_MASTER_SECRET", "")

# Environment detection
IS_PRODUCTION = os.getenv("PYTHON_ENV", "").lower() == "production" or os.getenv("NODE_ENV", "").lower() == "production"

# Validate critical configuration in production
def validate_production_config():
    """Validate that critical configuration is set in production."""
    if IS_PRODUCTION:
        if not ENCRYPTION_MASTER_SECRET or ENCRYPTION_MASTER_SECRET == "default-secret-change-in-production":
            raise ValueError(
                "ENCRYPTION_MASTER_SECRET must be set to a secure value in production. "
                "Generate a strong secret with: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
            )
        
        if DEBUG:
            logger.warning("⚠️  DEBUG mode is enabled in production! This exposes sensitive information.")
        
        if not REDIS_ENABLED:
            logger.warning("⚠️  Redis is disabled in production! Multi-instance deployment is not supported.")

# Run validation on module import
try:
    validate_production_config()
except ValueError as e:
    logger.error(f"❌ Production configuration validation failed: {e}")
    if IS_PRODUCTION:
        raise
