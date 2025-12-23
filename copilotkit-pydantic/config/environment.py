"""Environment configuration and logging setup."""

import os
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Debug mode configuration (default: true in development, false in production)
DEBUG = True #os.getenv("DEBUG", "false").lower() in {"1", "true", "yes"}

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
