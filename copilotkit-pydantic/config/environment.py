"""Environment configuration and logging setup."""

import os
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Debug mode configuration
DEBUG = (
    os.getenv("NODE_ENV", "development") != "production" 
    and os.getenv("DEBUG", "false").lower() != "false"
) or os.getenv("DEBUG", "false").lower() == "false"
# Debug mode configuration - ENABLED
DEBUG = False  # Explicitly enabled for debugging

# Logger configuration
logger = logging.getLogger("copilotkit-agent")
if not logger.handlers:
    logging.basicConfig(
        level=logging.DEBUG if DEBUG else logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s - %(message)s'
    )

# Server configuration
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", 8001))

# API Keys
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
AZURE_OPENAI_API_KEY = os.getenv('AZURE_OPENAI_API_KEY')
AZURE_OPENAI_BASE_URL = os.getenv('AZURE_OPENAI_BASE_URL')

