"""Multi-agent graph orchestration for complex queries.

This module implements a multi-agent graph that routes queries to specialized agents
(image generation, web search, code execution) based on the query type.

The graph uses an orchestrator agent to analyze queries and route them to appropriate
worker agents, with support for multi-step workflows.

## Usage

```python
from .multi_agent_graph import run_multi_agent_graph, create_multi_agent_graph

# Run the graph
result = await run_multi_agent_graph(
    query="Search for SpaceX launch and create an image",
    orchestrator_model=ctx.model,
    send_stream=send_stream,
)
```

## Public API

### Functions
- `run_multi_agent_graph`: Main entry point for running the graph
- `create_multi_agent_graph`: Create a graph instance for custom execution

### Types
- `UnifiedDeps` (from `core.models`): Dependencies passed to all graph nodes and regular agents
- `QueryState`: State maintained throughout graph execution
- `GraphStep`: A step in the graph execution (for frontend)
- `GraphToolCall`: A tool call made by a sub-agent (for frontend)
- `GraphAgentState`: State sent to frontend for rendering
- `RoutingDecision`: Structured output from orchestrator
- `ToolCallInfo`: Information about a tool call

### Constants
- `GRAPH_COAGENT_NAME`: Name used by frontend to render graph state
"""

# Main entry points
from .runner import run_multi_agent_graph
from .graph import create_multi_agent_graph

# Types
from .types import (
    # Action types
    ActionType,
    WorkerResult,
    # Orchestrator output
    RoutingDecision,
    ErrorRecoveryDecision,
    CodeExecutionOutput,
    # Graph state
    QueryState,
    ToolCallInfo,
    # Frontend rendering types
    GraphToolCall,
    GraphStep,
    GraphAgentState,
    # Node mappings
    ACTION_TO_NODE,
    NODE_TO_ACTION,
)

# Constants
from .constants import (
    GRAPH_COAGENT_NAME,
    THINKING_INSTRUCTION,
    DEFAULT_GENERAL_MODEL,
    DEFAULT_IMAGE_MODEL,
)

# Agent factory (for advanced usage)
from .agents import create_agents

# State management (for advanced usage)
from .state import (
    build_graph_agent_state,
    sync_to_shared_state,
    send_graph_state_snapshot,
    build_context_with_previous_results,
)

# Step utilities (for extending)
from .steps import (
    run_worker_step,
    create_sub_agent_run_input,
    create_orchestrator_run_input,
    create_sub_agent_usage_callback,
)

__all__ = [
    # Main entry points
    'run_multi_agent_graph',
    'create_multi_agent_graph',
    # Types
    'ActionType',
    'WorkerResult',
    'RoutingDecision',
    'ErrorRecoveryDecision',
    'CodeExecutionOutput',
    'QueryState',
    'ToolCallInfo',
    'GraphToolCall',
    'GraphStep',
    'GraphAgentState',
    'ACTION_TO_NODE',
    'NODE_TO_ACTION',
    # Constants
    'GRAPH_COAGENT_NAME',
    'THINKING_INSTRUCTION',
    'DEFAULT_GENERAL_MODEL',
    'DEFAULT_IMAGE_MODEL',
    # Agent factory
    'create_agents',
    # State management
    'build_graph_agent_state',
    'sync_to_shared_state',
    'send_graph_state_snapshot',
    'build_context_with_previous_results',
    # Step utilities
    'run_worker_step',
    'create_sub_agent_run_input',
    'create_orchestrator_run_input',
    'create_sub_agent_usage_callback',
]

