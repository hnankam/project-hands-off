# Pydantic AI Agent Server - Refactored Architecture

## Overview

This document describes the refactored architecture of the Pydantic AI Agent Server. The codebase has been reorganized into a modular structure with clear separation of concerns, improved maintainability, and better testability.

## Directory Structure

```
copilotkit-pydantic/
├── config/                    # Configuration modules
│   ├── __init__.py
│   ├── environment.py        # Environment variables and logging
│   ├── models.py             # AI model configurations
│   └── prompts.py            # Agent prompt templates
│
├── core/                      # Core business logic
│   ├── __init__.py
│   ├── models.py             # Pydantic models (Step, Plan, AgentState)
│   └── agent_factory.py      # Agent creation and caching
│
├── services/                  # Business services
│   ├── __init__.py
│   ├── session_manager.py    # Session-based state management
│   ├── websocket_manager.py  # WebSocket connection management
│   └── usage_tracker.py      # Usage tracking and reporting
│
├── middleware/                # Request middleware
│   ├── __init__.py
│   └── request_middleware.py # Request ID and agent/model tracking
│
├── utils/                     # Utility functions
│   ├── __init__.py
│   ├── anthropic_cache.py    # Anthropic cache control wrapper
│   └── message_processor.py  # Message history processing
│
├── tools/                     # Agent tools
│   ├── __init__.py
│   └── agent_tools.py        # Tool definitions and registration
│
├── api/                       # API endpoints
│   ├── __init__.py
│   ├── routes.py             # REST API route handlers
│   └── websocket.py          # WebSocket endpoints
│
├── history_processor/         # History compaction (existing)
│   ├── compactor.py
│   ├── utils.py
│   └── ...
│
├── main.py                    # Application entry point
├── agent.py                   # Backward compatibility layer
├── requirements.txt           # Python dependencies
│
└── *_old_backup.py           # Backed up original files
```

## Module Descriptions

### 1. Config Module (`config/`)

Centralized configuration management.

#### `environment.py`
- Environment variable loading
- Debug mode configuration
- Logging setup
- Server configuration (HOST, PORT)

#### `models.py`
- AI model provider configurations (Google, Anthropic, Bedrock)
- Model settings for each provider
- Available models dictionary (`MODELS`)
- Model names list for route generation

#### `prompts.py`
- Agent prompt templates for different agent types
- Base instructions (general, planning)
- Agent-specific prompts (wiki, sharepoint, excel, word, databricks, powerpoint)
- Available agent types list

### 2. Core Module (`core/`)

Core business logic and data models.

#### `models.py`
- `Step`: Represents a step in a plan
- `Plan`: Represents a plan with multiple steps
- `JSONPatchOp`: JSON Patch operation (RFC 6902)
- `AgentState`: Shared agent state
- `StepStatus`: Type definition for step statuses

#### `agent_factory.py`
- `create_agent()`: Creates a new agent instance
- `get_agent()`: Gets or creates an agent with caching
- Agent configuration and initialization
- Tool registration

### 3. Services Module (`services/`)

Business services for the application.

#### `session_manager.py`
- Session-based state management
- `get_or_create_session_state()`: Get or create session state
- `cleanup_session()`: Clean up a session
- `session_states`: Global session state storage

#### `websocket_manager.py`
- `ConnectionManager`: WebSocket connection management class
- Connection lifecycle management (connect, disconnect)
- Broadcasting messages to sessions
- Global manager instance

#### `usage_tracker.py`
- `create_usage_tracking_callback()`: Factory for usage tracking callbacks
- Token usage tracking for Google (Gemini) and Anthropic (Claude) models
- WebSocket broadcasting of usage data

### 4. Middleware Module (`middleware/`)

Request processing middleware.

#### `request_middleware.py`
- `agent_model_middleware()`: Request middleware for agent/model selection
- Request ID generation and tracking
- Agent type and model extraction from headers
- Request logging

### 5. Utils Module (`utils/`)

Utility functions and helper classes.

#### `anthropic_cache.py`
- `AnthropicModelWithCache`: Extended Anthropic model with cache control
- System prompt caching
- Tool caching
- Workaround for https://github.com/pydantic/pydantic-ai/issues/1041

#### `message_processor.py`
- `keep_recent_messages()`: Message history processing and compaction
- Tool call/return deduplication
- Message truncation for large tool results
- Safe message history cutting

### 6. Tools Module (`tools/`)

Agent tool definitions.

#### `agent_tools.py`
- `register_agent_tools()`: Register all tools for an agent
- `tool_plain()`: Create a plan with multiple steps
- `update_plan_step()`: Update a step in the plan
- `get_weather()`: Example weather tool

### 7. API Module (`api/`)

REST API and WebSocket endpoints.

#### `routes.py`
- `register_agent_routes()`: Register agent endpoints for all agent/model combinations
- `register_info_routes()`: Register information and session management endpoints
- Session management endpoints (/sessions, /sessions/{id}/cleanup)
- Root endpoint with server info

#### `websocket.py`
- `register_websocket_routes()`: Register WebSocket endpoints
- WebSocket usage endpoint (/ws/usage/{session_id})
- Connection lifecycle management

### 8. Main Module (`main.py`)

Application entry point.

- FastAPI application initialization
- Middleware registration
- Route registration
- Server startup

## API Endpoints

### Agent Endpoints

```
POST /agent/{agent_type}/{model}
```

Execute an agent with a specific type and model.

**Agent Types:**
- `general`: General-purpose assistant
- `wiki`: Wikipedia-style knowledge assistant
- `sharepoint`: SharePoint and Microsoft 365 expert
- `excel`: Excel and spreadsheet expert
- `word`: Microsoft Word and document formatting expert
- `databricks`: Databricks and big data analytics expert
- `powerpoint`: PowerPoint and presentation design expert

**Models:**
- Google: `gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-pro`
- Anthropic: `claude-3.5-sonnet`, `claude-3.7-sonnet`, `claude-4.1-opus`, `claude-4.5-sonnet`, `claude-4.5-haiku`

### Information Endpoints

```
GET /
```
Root endpoint with server information.

```
GET /sessions
```
List all active sessions and their WebSocket connections.

```
POST /sessions/{session_id}/cleanup
```
Clean up a specific session's state.

### WebSocket Endpoints

```
WS /ws/usage/{session_id}
```
WebSocket endpoint for receiving real-time usage updates for a session.

## Environment Variables

Create a `.env` file with the following variables:

```bash
# Environment
NODE_ENV=development          # production or development
DEBUG=true                    # Enable debug logging

# Server Configuration
HOST=0.0.0.0                 # Server host
PORT=8001                     # Server port

# API Keys
GOOGLE_API_KEY=your_key_here # Google AI API key
```

## Running the Server

### Development Mode

```bash
cd copilotkit-pydantic
python main.py
```

### Production Mode

```bash
cd copilotkit-pydantic
uvicorn main:app --host 0.0.0.0 --port 8001
```

## Usage Examples

### Using the Agent API

```python
import requests

# Create a session
response = requests.post(
    "http://localhost:8001/agent/general/gemini-2.5-flash-lite",
    headers={
        "X-Copilot-Agent-Type": "general",
        "X-Copilot-Model-Type": "gemini-2.5-flash-lite",
    },
    json={
        "thread_id": "my-session-123",
        "messages": [
            {"role": "user", "content": "Create a plan to build a todo app"}
        ]
    }
)
```

### WebSocket Usage Tracking

```javascript
const ws = new WebSocket('ws://localhost:8001/ws/usage/my-session-123');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Usage update:', data);
  // {
  //   session_id: "my-session-123",
  //   agent_type: "general",
  //   model: "gemini-2.5-flash-lite",
  //   request_tokens: 1234,
  //   response_tokens: 567,
  //   total_tokens: 1801,
  //   timestamp: "2025-10-21T12:34:56.789Z"
  // }
};
```

## Migration Guide

### From Old Structure to New Structure

The old `agent.py` file has been split into multiple modules. Here's how to migrate:

#### Old Import
```python
from agent import get_agent, AgentState, keep_recent_messages
```

#### New Import (Recommended)
```python
from core import get_agent, AgentState
from utils import keep_recent_messages
```

#### Backward Compatibility
The `agent.py` file still exists as a compatibility layer that re-exports from the new modules. However, it's recommended to import from the new structure directly.

## Benefits of Refactoring

1. **Modularity**: Clear separation of concerns with dedicated modules
2. **Maintainability**: Easier to find and modify specific functionality
3. **Testability**: Each module can be tested independently
4. **Scalability**: Easy to add new features without affecting existing code
5. **Documentation**: Clear structure makes the codebase easier to understand
6. **Reusability**: Modules can be imported and used independently

## Development Guidelines

### Adding a New Agent Type

1. Add the prompt to `config/prompts.py`:
```python
AGENT_PROMPTS["new_type"] = "Your prompt here..."
```

2. The agent will be automatically registered via `register_agent_routes()`

### Adding a New Model

1. Add the model configuration to `config/models.py`:
```python
MODELS['new-model'] = {
    'model': YourModel('model-id'),
    'model_settings': your_settings
}
```

2. The model will be automatically available for all agent types

### Adding a New Tool

1. Add the tool function to `tools/agent_tools.py`:
```python
@agent.tool(sequential=True, retries=0)
def your_tool(ctx: RunContext[StateDeps[AgentState]], param: str) -> str:
    """Tool description."""
    return "result"
```

2. Register it in `register_agent_tools()`

## Testing

### Running Tests

```bash
# Install test dependencies
pip install pytest pytest-asyncio httpx

# Run tests
pytest tests/
```

### Test Structure

```
tests/
├── test_config.py          # Test configuration loading
├── test_core.py            # Test core models and agent factory
├── test_services.py        # Test services
├── test_utils.py           # Test utilities
├── test_api.py             # Test API endpoints
└── test_integration.py     # Integration tests
```

## Troubleshooting

### Import Errors

If you encounter import errors, ensure you're in the correct directory:
```bash
cd /path/to/copilotkit-pydantic
python main.py
```

### Module Not Found

Make sure all `__init__.py` files are present in each module directory.

### WebSocket Connection Issues

Check that the session ID in the WebSocket URL matches the session ID in your API requests.

## Contributing

When contributing to this project:

1. Follow the modular structure
2. Add docstrings to all functions and classes
3. Update this README if you add new modules or features
4. Add tests for new functionality
5. Keep backward compatibility in mind

## License

See LICENSE file in the project root.

## Support

For issues or questions, please refer to the main project documentation or create an issue in the project repository.

