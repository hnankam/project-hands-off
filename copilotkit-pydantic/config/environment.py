"""Environment configuration and logging setup."""

import os
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Debug mode configuration
# Explicit and predictable: enable only when DEBUG env is truthy
DEBUG = False #os.getenv("DEBUG", "false").lower() in {"1", "true", "yes"}

# Logger configuration (supports plain or JSON based on LOG_FORMAT)
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
            handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(name)s - %(message)s'))
    else:
        handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(name)s - %(message)s'))
    logger.setLevel(log_level)
    logger.addHandler(handler)

# Server configuration
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", 8001))

# Note: API keys and provider credentials are now stored in the database
# and loaded via config/models.py from the 'providers' table
