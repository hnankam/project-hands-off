import os

USER_DEFINED_LOG_LEVEL = os.getenv("PYDANTIC_AI_HISTORY_PROCESSOR_LOG_LEVEL", "INFO")

os.environ["LOGURU_LEVEL"] = USER_DEFINED_LOG_LEVEL

from logging import getLogger  # noqa: E402

logger = getLogger(__name__)

__all__ = ["logger"]