# DBOS Graph Execution System - Implementation Guide

**Version:** 1.0  
**Date:** December 21, 2024  
**Status:** Planning Phase

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Database Schema](#database-schema)
4. [Backend Implementation](#backend-implementation)
5. [API Endpoints](#api-endpoints)
6. [Frontend Components](#frontend-components)
7. [Agent Tools](#agent-tools)
8. [Event Streaming Optimization](#event-streaming-optimization)
9. [Migration Plan](#migration-plan)
10. [Testing Strategy](#testing-strategy)
11. [Deployment Guide](#deployment-guide)
12. [Monitoring & Observability](#monitoring--observability)
13. [Performance Considerations](#performance-considerations)
14. [Security Considerations](#security-considerations)
15. [Future Enhancements](#future-enhancements)

---

## Executive Summary

### What We're Building

A durable, user-editable, multi-agent graph execution system that:

1. **Agent-Initiated**: Agents create graph execution plans during conversation
2. **User-Editable**: Users can review, edit, reorder steps before/during execution
3. **Durable Execution**: Powered by DBOS for automatic recovery and checkpointing
4. **Long-Running**: Graphs run in background, survive server restarts
5. **Schedulable**: Support one-time and recurring schedules
6. **Confirmation Support**: Human-in-the-loop for sensitive operations
7. **Real-time Updates**: Optimized streaming with custom delta events

### Key Technologies

- **DBOS**: Durable execution framework with automatic checkpointing
- **PostgreSQL**: System database for workflow state and graph metadata
- **Pydantic AI**: Agent framework with AG-UI protocol
- **FastAPI**: REST API for graph management
- **React/TypeScript**: Frontend UI for graph visualization and editing
- **Ably**: Real-time event streaming (existing infrastructure)

### Success Metrics

- ✅ Graphs survive server restarts without data loss
- ✅ Users can edit plans at any time (draft or paused state)
- ✅ Confirmation flow works even after panel closure
- ✅ Network traffic reduced by 90% during streaming
- ✅ Support for 100+ concurrent graph executions
- ✅ Full audit trail of all plan modifications

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interface Layer                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Chat Interface              GraphsPanel                  │  │
│  │  - Agent conversation        - View all graphs            │  │
│  │  - Tool invocations          - Edit execution plans       │  │
│  │  - Status updates            - Start/Pause/Resume         │  │
│  │                              - Schedule graphs            │  │
│  │                              - Confirm/Deny actions       │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API Gateway Layer (FastAPI)                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Graph Management API:                                    │  │
│  │  • POST /api/graphs/start                                │  │
│  │  • GET  /api/graphs/{id}/status                          │  │
│  │  • PUT  /api/graphs/{id}/plan                            │  │
│  │  • POST /api/graphs/{id}/confirm                         │  │
│  │  • POST /api/graphs/{id}/deny                            │  │
│  │  • POST /api/graphs/{id}/pause                           │  │
│  │  • POST /api/graphs/{id}/resume                          │  │
│  │  • POST /api/graphs/{id}/schedule                        │  │
│  │  • GET  /api/graphs/session/{sessionId}                  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DBOS Workflow Engine Layer                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Core Workflows:                                          │  │
│  │  • run_durable_graph_workflow()                          │  │
│  │  • execute_graph_with_plan_updates()                     │  │
│  │  • execute_step_from_plan()                              │  │
│  │  • wait_for_confirmation_event()                         │  │
│  │  • wait_for_edit_completion()                            │  │
│  │                                                           │  │
│  │  DBOS Features Used:                                      │  │
│  │  • @DBOS.workflow() - Automatic checkpointing            │  │
│  │  • @DBOS.step() - Retry logic                            │  │
│  │  • DBOS.recv() - Wait for external events                │  │
│  │  • DBOS.send() - Publish events                          │  │
│  │  • @DBOS.queue_consumer() - Background processing        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Multi-Agent Graph Layer                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Orchestrator Agent:                                      │  │
│  │  • Analyzes query and context                            │  │
│  │  • Creates routing decisions                             │  │
│  │  • Manages execution flow                                │  │
│  │                                                           │  │
│  │  Worker Agents:                                           │  │
│  │  • WebSearch - Google search integration                 │  │
│  │  • ImageGeneration - Imagen model                        │  │
│  │  • CodeExecution - Python interpreter                    │  │
│  │  • ResultAggregator - Synthesis                          │  │
│  │  • Confirmation - Human-in-the-loop                      │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Data Persistence Layer                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  PostgreSQL Database:                                     │  │
│  │  • graph_jobs - Graph metadata and state                 │  │
│  │  • graph_plan_history - Audit trail                      │  │
│  │  • dbos.* - DBOS system tables (auto-managed)            │  │
│  │                                                           │  │
│  │  Firebase Storage:                                        │  │
│  │  • Generated images                                       │  │
│  │  • Large result artifacts                                │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

#### 1. Graph Creation Flow
```
Agent (in chat) 
  → create_graph() tool
  → Create draft in DB (status='draft')
  → Return graph_id to agent
  → Agent tells user "Graph created, review in Graphs panel"
  → GraphsPanel displays draft with edit options
```

#### 2. Graph Execution Flow
```
User clicks "Start" in GraphsPanel
  → POST /api/graphs/{id}/start
  → Update status to 'queued'
  → DBOS.send() to graph_execution_queue
  → @DBOS.queue_consumer processes
  → run_durable_graph_workflow() starts
  → DBOS checkpoints state at each step
  → Custom delta events stream to frontend
  → Periodic full snapshots for sync
```

#### 3. Confirmation Flow
```
Graph needs confirmation
  → Create DeferredToolRequests
  → Update DB status to 'waiting_confirmation'
  → Emit custom event to frontend
  → GraphsPanel shows confirmation dialog
  → User clicks Confirm/Deny
  → POST /api/graphs/{id}/confirm (or /deny)
  → DBOS.send() to graph_confirmation_{id} topic
  → Workflow resumes from DBOS.recv()
  → Continue execution
```

#### 4. Edit Flow
```
User clicks "Edit" in GraphsPanel
  → Display step editor UI
  → User modifies steps (add/remove/reorder/edit)
  → User clicks "Save"
  → PUT /api/graphs/{id}/plan
  → Update DB with new plan + history record
  → If graph is running: pause and wait for edit
  → DBOS.send() to graph_edit_complete_{id}
  → Workflow reloads plan and continues
```

---

## Database Schema

### Schema Files Location
```
copilotkit-pydantic/database/migrations/
├── 001_add_graph_jobs.sql
├── 002_add_graph_plan_history.sql
└── 003_add_dbos_integration.sql
```

### 1. Graph Jobs Table

```sql
-- File: copilotkit-pydantic/database/migrations/001_add_graph_jobs.sql

CREATE TABLE IF NOT EXISTS graph_jobs (
    -- Identity
    graph_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    graph_name TEXT NOT NULL,
    query TEXT NOT NULL,
    
    -- Execution state
    status TEXT NOT NULL DEFAULT 'draft',
    /* Status values:
       - draft: Created by agent, waiting for user approval
       - queued: Queued for execution
       - running: Currently executing
       - paused: Paused by user
       - waiting_confirmation: Waiting for user confirmation
       - waiting_edit: Waiting for user to finish editing
       - scheduled: Scheduled for future execution
       - completed: Successfully completed
       - failed: Failed with error
       - cancelled: Cancelled by user
    */
    
    current_node TEXT,
    current_step_index INTEGER DEFAULT 0,
    
    -- Execution plan (editable)
    planned_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    /* Structure:
       [
         {
           "step_id": "step_1",
           "step_type": "web_search",
           "step_name": "WebSearch",
           "description": "Search for latest SpaceX launch",
           "prompt": "Find the latest SpaceX Starship launch date",
           "enabled": true,
           "order": 1,
           "estimated_duration": 30,
           "depends_on": [],
           "parameters": {},
           "status": "pending",
           "result": null,
           "error": null,
           "started_at": null,
           "completed_at": null
         }
       ]
    */
    
    original_steps JSONB,  -- Original plan from agent (immutable)
    user_modified BOOLEAN DEFAULT FALSE,
    
    -- Full execution state (for DBOS)
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    /* Contains QueryState fields:
       - execution_history
       - intermediate_results
       - streaming_text
       - prompts
       - tool_calls
       - errors
       - iteration_count
       - etc.
    */
    
    -- Scheduling
    scheduled_for TIMESTAMP WITH TIME ZONE,
    schedule_type TEXT,  -- 'once', 'recurring'
    cron_expression TEXT,
    timezone TEXT DEFAULT 'UTC',
    last_scheduled_run TIMESTAMP WITH TIME ZONE,
    next_scheduled_run TIMESTAMP WITH TIME ZONE,
    
    -- Waiting states
    pending_confirmation JSONB,
    /* Structure:
       {
         "action_description": "Execute Python code to calculate...",
         "step_name": "CodeExecution",
         "tool_call_id": "confirm_abc123"
       }
    */
    
    pending_edit JSONB,
    /* Structure:
       {
         "reason": "user_request",
         "paused_at": "2024-01-15T10:30:00Z",
         "paused_step": "ImageGeneration"
       }
    */
    
    -- Results
    result TEXT,
    error TEXT,
    
    -- Agent context
    created_by_agent BOOLEAN DEFAULT TRUE,
    agent_reasoning TEXT,  -- Why the agent created this plan
    
    -- DBOS integration
    dbos_workflow_id TEXT,  -- DBOS workflow UUID
    dbos_queue_position INTEGER,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    last_executed_at TIMESTAMP WITH TIME ZONE,
    execution_count INTEGER DEFAULT 0,
    
    -- Constraints
    CONSTRAINT fk_session FOREIGN KEY (session_id) 
        REFERENCES sessions(session_id) ON DELETE CASCADE,
    CONSTRAINT valid_status CHECK (status IN (
        'draft', 'queued', 'running', 'paused', 
        'waiting_confirmation', 'waiting_edit', 'scheduled',
        'completed', 'failed', 'cancelled'
    ))
);

-- Indexes for performance
CREATE INDEX idx_graph_jobs_session ON graph_jobs(session_id);
CREATE INDEX idx_graph_jobs_user ON graph_jobs(user_id);
CREATE INDEX idx_graph_jobs_status ON graph_jobs(status) WHERE status IN ('running', 'queued');
CREATE INDEX idx_graph_jobs_scheduled ON graph_jobs(next_scheduled_run) 
    WHERE status = 'scheduled' AND next_scheduled_run IS NOT NULL;
CREATE INDEX idx_graph_jobs_waiting ON graph_jobs(session_id, status) 
    WHERE status IN ('waiting_confirmation', 'waiting_edit');
CREATE INDEX idx_graph_jobs_created ON graph_jobs(created_at DESC);
CREATE INDEX idx_graph_jobs_updated ON graph_jobs(updated_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_graph_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_graph_jobs_updated_at
    BEFORE UPDATE ON graph_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_graph_jobs_updated_at();
```

### 2. Graph Plan History Table

```sql
-- File: copilotkit-pydantic/database/migrations/002_add_graph_plan_history.sql

CREATE TABLE IF NOT EXISTS graph_plan_history (
    -- Identity
    history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    graph_id TEXT NOT NULL,
    
    -- Who made the change
    modified_by TEXT NOT NULL,  -- 'agent' or user_id
    modified_by_type TEXT NOT NULL DEFAULT 'user',  -- 'agent' or 'user'
    
    -- What changed
    modification_type TEXT NOT NULL,
    /* Values:
       - created: Initial plan creation
       - edited: Bulk edit of multiple fields
       - step_added: New step added
       - step_removed: Step removed
       - step_reordered: Steps reordered
       - step_modified: Individual step edited
       - step_enabled: Step enabled
       - step_disabled: Step disabled
    */
    
    changes JSONB NOT NULL,
    /* Structure depends on modification_type:
       For step_added:
       {
         "step_id": "step_3",
         "step": {...full step object...},
         "position": 2
       }
       
       For step_removed:
       {
         "step_id": "step_2",
         "step": {...removed step...}
       }
       
       For step_reordered:
       {
         "from_order": [1, 2, 3],
         "to_order": [2, 1, 3]
       }
       
       For step_modified:
       {
         "step_id": "step_1",
         "field": "prompt",
         "old_value": "...",
         "new_value": "..."
       }
    */
    
    -- State snapshots
    previous_plan JSONB,
    new_plan JSONB,
    
    -- Context
    reasoning TEXT,
    session_id TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT fk_graph FOREIGN KEY (graph_id) 
        REFERENCES graph_jobs(graph_id) ON DELETE CASCADE,
    CONSTRAINT valid_modification_type CHECK (modification_type IN (
        'created', 'edited', 'step_added', 'step_removed',
        'step_reordered', 'step_modified', 'step_enabled', 'step_disabled'
    ))
);

-- Indexes
CREATE INDEX idx_graph_plan_history_graph ON graph_plan_history(graph_id, created_at DESC);
CREATE INDEX idx_graph_plan_history_user ON graph_plan_history(modified_by, created_at DESC);
CREATE INDEX idx_graph_plan_history_type ON graph_plan_history(modification_type);
```

### 3. DBOS Integration

```sql
-- File: copilotkit-pydantic/database/migrations/003_add_dbos_integration.sql

-- DBOS will automatically create these tables when initialized:
-- - dbos.workflow_status
-- - dbos.workflow_inputs
-- - dbos.workflow_outputs
-- - dbos.operation_outputs
-- - dbos.notifications
-- - dbos.scheduled_workflows

-- We just need to ensure our schema is in a separate namespace
-- and DBOS has permissions

-- Grant DBOS schema permissions
GRANT USAGE ON SCHEMA public TO dbos_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dbos_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dbos_user;

-- Create view for easier querying of graph + DBOS workflow status
CREATE OR REPLACE VIEW graph_execution_status AS
SELECT 
    gj.graph_id,
    gj.graph_name,
    gj.status as graph_status,
    gj.current_node,
    gj.dbos_workflow_id,
    ws.status as dbos_status,
    ws.created_at as dbos_started_at,
    ws.updated_at as dbos_updated_at,
    gj.created_at as graph_created_at,
    gj.updated_at as graph_updated_at,
    gj.user_id,
    gj.session_id
FROM graph_jobs gj
LEFT JOIN dbos.workflow_status ws ON gj.dbos_workflow_id = ws.workflow_uuid::text
ORDER BY gj.created_at DESC;
```

---

## Backend Implementation

### Directory Structure

```
copilotkit-pydantic/
├── config/
│   ├── dbos_config.py              # DBOS configuration
│   └── environment.py              # Environment variables
├── database/
│   └── migrations/
│       ├── 001_add_graph_jobs.sql
│       ├── 002_add_graph_plan_history.sql
│       └── 003_add_dbos_integration.sql
├── services/
│   ├── graph_executor.py           # Graph execution service
│   └── graph_manager.py            # Graph CRUD operations
├── tools/
│   ├── graph_tools.py              # Agent tools for graphs
│   └── multi_agent_graph/
│       ├── __init__.py
│       ├── durable_graph.py        # DBOS workflows
│       ├── custom_events.py        # Delta events
│       ├── graph.py                # Graph builder
│       ├── steps.py                # Step implementations
│       ├── state.py                # State management
│       ├── agents.py               # Agent definitions
│       ├── events.py               # Event processing
│       ├── types.py                # Type definitions
│       └── constants.py
├── api/
│   └── graph_endpoints.py          # FastAPI routes
├── middleware/
│   └── auth.py                     # Authentication
└── main.py                         # FastAPI application
```

### Core Files Implementation

#### 1. DBOS Configuration

```python
# File: copilotkit-pydantic/config/dbos_config.py

from dbos import DBOSConfig
from .environment import (
    POSTGRES_HOST,
    POSTGRES_PORT,
    POSTGRES_DB,
    POSTGRES_USER,
    POSTGRES_PASSWORD
)

# DBOS configuration
DBOS_CONFIG: DBOSConfig = {
    'name': 'copilotkit_graph_executor',
    'system_database_url': (
        f'postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}'
        f'@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}'
    ),
    'log_level': 'INFO',
    'max_recovery_attempts': 3,
    'telemetry_enabled': True,
}

# DBOS workflow configuration
WORKFLOW_CONFIG = {
    'max_iterations': 10,
    'confirmation_timeout': 86400,  # 24 hours
    'edit_timeout': 3600,  # 1 hour
    'step_retry_attempts': 3,
    'step_retry_backoff': 2.0,  # Exponential backoff multiplier
}

# Queue configuration
QUEUE_CONFIG = {
    'graph_execution_queue': {
        'concurrency': 5,  # Max 5 parallel graphs
        'rate_limit': 20,  # Max 20 graphs per minute
        'batch_size': 1,
    }
}
```

#### 2. Custom Events

```python
# File: copilotkit-pydantic/tools/multi_agent_graph/custom_events.py

"""Custom AG-UI events for optimized streaming."""

from ag_ui.core import BaseEvent
from pydantic import Field
from typing import Literal, Optional, List, Dict

# ============================================================================
# Delta Events (Lightweight)
# ============================================================================

class GraphTextDeltaEvent(BaseEvent):
    """Streaming text delta for a specific graph node."""
    type: str = Field(default="GRAPH_TEXT_DELTA")
    graph_id: str
    node_name: str
    delta: str
    run_index: int = 0
    timestamp: float = Field(default_factory=lambda: __import__('time').time())


class GraphToolCallProgressEvent(BaseEvent):
    """Tool call progress update."""
    type: str = Field(default="GRAPH_TOOL_CALL_PROGRESS")
    graph_id: str
    node_name: str
    tool_name: str
    tool_call_id: str
    status: Literal["started", "args_complete", "completed", "error"]
    args: str = ""
    result: str = ""
    error: Optional[str] = None


class GraphStepTransitionEvent(BaseEvent):
    """Step transition notification."""
    type: str = Field(default="GRAPH_STEP_TRANSITION")
    graph_id: str
    from_node: Optional[str] = None
    to_node: str
    status: Literal["pending", "in_progress", "completed", "error", "skipped"]
    step_index: int
    total_steps: int


class GraphStatusUpdateEvent(BaseEvent):
    """High-level status update."""
    type: str = Field(default="GRAPH_STATUS_UPDATE")
    graph_id: str
    status: str
    message: Optional[str] = None
    progress: Optional[Dict] = None  # {"completed": 2, "total": 5}


class GraphPlanModifiedEvent(BaseEvent):
    """Plan modification notification."""
    type: str = Field(default="GRAPH_PLAN_MODIFIED")
    graph_id: str
    modification_type: str
    modified_by: str
    changes: Dict
    new_plan: List[Dict]


class GraphConfirmationRequestEvent(BaseEvent):
    """Confirmation request notification."""
    type: str = Field(default="GRAPH_CONFIRMATION_REQUEST")
    graph_id: str
    action_description: str
    step_name: str
    tool_call_id: str
    timeout_seconds: int = 86400


# ============================================================================
# Event Emission Helpers
# ============================================================================

async def emit_text_delta(
    send_stream,
    graph_id: str,
    node_name: str,
    delta: str,
    run_index: int = 0
):
    """Emit a text delta event."""
    if not send_stream:
        return
    
    from ag_ui.encoder import EventEncoder
    from pydantic_ai.ag_ui import SSE_CONTENT_TYPE
    
    encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
    await send_stream.send(
        encoder.encode(
            GraphTextDeltaEvent(
                graph_id=graph_id,
                node_name=node_name,
                delta=delta,
                run_index=run_index
            )
        )
    )


async def emit_tool_progress(
    send_stream,
    graph_id: str,
    node_name: str,
    tool_name: str,
    tool_call_id: str,
    status: str,
    **kwargs
):
    """Emit a tool call progress event."""
    if not send_stream:
        return
    
    from ag_ui.encoder import EventEncoder
    from pydantic_ai.ag_ui import SSE_CONTENT_TYPE
    
    encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
    await send_stream.send(
        encoder.encode(
            GraphToolCallProgressEvent(
                graph_id=graph_id,
                node_name=node_name,
                tool_name=tool_name,
                tool_call_id=tool_call_id,
                status=status,
                **kwargs
            )
        )
    )


async def emit_step_transition(
    send_stream,
    graph_id: str,
    to_node: str,
    status: str,
    step_index: int,
    total_steps: int,
    from_node: Optional[str] = None
):
    """Emit a step transition event."""
    if not send_stream:
        return
    
    from ag_ui.encoder import EventEncoder
    from pydantic_ai.ag_ui import SSE_CONTENT_TYPE
    
    encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
    await send_stream.send(
        encoder.encode(
            GraphStepTransitionEvent(
                graph_id=graph_id,
                from_node=from_node,
                to_node=to_node,
                status=status,
                step_index=step_index,
                total_steps=total_steps
            )
        )
    )


async def emit_status_update(
    send_stream,
    graph_id: str,
    status: str,
    message: Optional[str] = None,
    progress: Optional[Dict] = None
):
    """Emit a status update event."""
    if not send_stream:
        return
    
    from ag_ui.encoder import EventEncoder
    from pydantic_ai.ag_ui import SSE_CONTENT_TYPE
    
    encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
    await send_stream.send(
        encoder.encode(
            GraphStatusUpdateEvent(
                graph_id=graph_id,
                status=status,
                message=message,
                progress=progress
            )
        )
    )
```

#### 3. DBOS Workflows

```python
# File: copilotkit-pydantic/tools/multi_agent_graph/durable_graph.py

"""DBOS-powered durable graph execution workflows."""

from dbos import DBOS, StepConfig
from typing import Optional, Dict, List
from datetime import datetime
import json
import uuid

from config import logger
from config.dbos_config import DBOS_CONFIG, WORKFLOW_CONFIG, QUEUE_CONFIG
from database.postgres_pool import get_pool
from .types import QueryState, GraphStep
from .custom_events import (
    emit_text_delta,
    emit_tool_progress,
    emit_step_transition,
    emit_status_update
)

# Initialize DBOS
DBOS(config=DBOS_CONFIG)

# ============================================================================
# Main Workflow
# ============================================================================

@DBOS.workflow()
async def run_durable_graph_workflow(
    graph_id: str,
    session_id: str,
    user_id: str,
    query: str,
    graph_name: str,
    orchestrator_model_name: str = "gemini-2.0-flash-exp",
    max_iterations: int = None,
) -> str:
    """
    Main durable workflow for graph execution.
    
    This workflow is automatically checkpointed by DBOS at each step boundary.
    If the server crashes, DBOS will automatically resume from the last
    completed step.
    
    Args:
        graph_id: Unique identifier for this graph
        session_id: CopilotKit session ID
        user_id: User ID
        query: Original user query
        graph_name: Human-readable graph name
        orchestrator_model_name: Model for orchestrator
        max_iterations: Max orchestrator iterations (from config if None)
    
    Returns:
        Final result string
    """
    logger.info(f"🚀 [DBOS] Starting durable graph workflow: {graph_id}")
    logger.info(f"   Query: {query}")
    logger.info(f"   User: {user_id}, Session: {session_id}")
    
    max_iterations = max_iterations or WORKFLOW_CONFIG['max_iterations']
    
    # Update status to running (DBOS step - durable)
    await update_graph_status_step(
        graph_id=graph_id,
        status='running',
        started_at=datetime.now(),
        dbos_workflow_id=str(DBOS.workflow_id())
    )
    
    try:
        # Execute the graph with plan support
        result = await execute_graph_with_plan_updates(
            graph_id=graph_id,
            session_id=session_id,
            user_id=user_id,
            query=query,
            max_iterations=max_iterations
        )
        
        # Update to completed
        await update_graph_status_step(
            graph_id=graph_id,
            status='completed',
            result=result,
            completed_at=datetime.now()
        )
        
        logger.info(f"✅ [DBOS] Graph {graph_id} completed successfully")
        return result
        
    except Exception as e:
        logger.exception(f"❌ [DBOS] Graph {graph_id} failed: {e}")
        
        await update_graph_status_step(
            graph_id=graph_id,
            status='failed',
            error=str(e),
            completed_at=datetime.now()
        )
        
        raise


@DBOS.workflow()
async def execute_graph_with_plan_updates(
    graph_id: str,
    session_id: str,
    user_id: str,
    query: str,
    max_iterations: int
) -> str:
    """
    Execute graph with support for plan updates during execution.
    
    This workflow can pause when user edits the plan, then resume
    with the updated plan. DBOS checkpoints the state at each pause.
    """
    logger.info(f"📊 [DBOS] Executing graph with plan update support: {graph_id}")
    
    # Load current plan (DBOS step - cached)
    plan_data = await load_graph_plan_step(graph_id)
    
    if not plan_data or not plan_data.get('steps'):
        raise ValueError(f"Graph {graph_id} has no execution plan")
    
    steps = plan_data['steps']
    logger.info(f"   Loaded plan with {len(steps)} steps")
    
    # Initialize execution state
    state = QueryState(
        query=query,
        original_query=query,
        max_iterations=max_iterations,
        user_id=user_id
    )
    
    step_index = 0
    while step_index < len(steps):
        # Check for plan modifications
        modification_event = await check_for_plan_modification_step(graph_id)
        
        if modification_event:
            logger.info(f"✏️  [DBOS] Plan modified, reloading...")
            
            # Reload plan
            plan_data = await load_graph_plan_step(graph_id)
            steps = plan_data['steps']
            
            # Reset index if needed
            if step_index >= len(steps):
                step_index = len(steps) - 1
            
            logger.info(f"   Plan reloaded: {len(steps)} steps")
        
        step_def = steps[step_index]
        
        # Skip disabled steps
        if not step_def.get('enabled', True):
            logger.info(f"⏭️  Skipping disabled step: {step_def['step_name']}")
            step_index += 1
            continue
        
        # Check if this step requires confirmation
        if step_def['step_type'] == 'confirmation':
            confirmed = await handle_confirmation_step(
                graph_id=graph_id,
                step_def=step_def
            )
            
            if not confirmed:
                logger.info(f"🚫 User denied confirmation, stopping execution")
                return "User cancelled the action"
        else:
            # Execute the step
            logger.info(f"▶️  Executing step {step_index + 1}/{len(steps)}: {step_def['step_name']}")
            
            result = await execute_step_from_plan_step(
                graph_id=graph_id,
                step_def=step_def,
                step_index=step_index,
                total_steps=len(steps),
                state=state,
                session_id=session_id,
                user_id=user_id
            )
            
            if result == "error":
                logger.error(f"❌ Step failed: {step_def['step_name']}")
                
                # Check if we should continue on error
                if not step_def.get('continue_on_error', False):
                    return state.result or f"Graph failed at step: {step_def['step_name']}"
        
        step_index += 1
    
    logger.info(f"✅ [DBOS] Graph {graph_id} completed all {len(steps)} steps")
    return state.result or "Graph execution completed"


# ============================================================================
# DBOS Steps (Durable Operations)
# ============================================================================

@DBOS.step()
async def update_graph_status_step(
    graph_id: str,
    status: str,
    **kwargs
) -> None:
    """Update graph status in database (DBOS step for durability)."""
    pool = await get_pool()
    
    updates = ["status = $2", "updated_at = NOW()"]
    params = [graph_id, status]
    param_idx = 3
    
    for key, value in kwargs.items():
        if value is not None:
            updates.append(f"{key} = ${param_idx}")
            if isinstance(value, (dict, list)):
                params.append(json.dumps(value))
            else:
                params.append(value)
            param_idx += 1
    
    query = f"UPDATE graph_jobs SET {', '.join(updates)} WHERE graph_id = $1"
    
    async with pool.connection() as conn:
        await conn.execute(query, *params)
    
    logger.debug(f"   Updated graph {graph_id} status to {status}")


@DBOS.step()
async def load_graph_plan_step(graph_id: str) -> Dict:
    """Load current graph plan (cached by DBOS)."""
    pool = await get_pool()
    
    async with pool.connection() as conn:
        result = await conn.execute(
            "SELECT planned_steps, user_modified FROM graph_jobs WHERE graph_id = $1",
            graph_id
        )
        row = await result.fetchone()
        
        if not row:
            raise ValueError(f"Graph {graph_id} not found")
        
        return {
            'steps': row[0],
            'user_modified': row[1]
        }


@DBOS.step()
async def check_for_plan_modification_step(graph_id: str) -> Optional[Dict]:
    """Check if plan was modified since last check."""
    pool = await get_pool()
    
    async with pool.connection() as conn:
        result = await conn.execute(
            """
            SELECT modification_type, changes, created_at
            FROM graph_plan_history
            WHERE graph_id = $1
            ORDER BY created_at DESC
            LIMIT 1
            """,
            graph_id
        )
        row = await result.fetchone()
        
        if row:
            return {
                'modification_type': row[0],
                'changes': row[1],
                'modified_at': row[2]
            }
        
        return None


@DBOS.step(retries=3, retry_policy=StepConfig(backoff_rate=2.0))
async def execute_step_from_plan_step(
    graph_id: str,
    step_def: Dict,
    step_index: int,
    total_steps: int,
    state: QueryState,
    session_id: str,
    user_id: str
) -> str:
    """
    Execute a single step from the plan.
    
    This is a DBOS step with retry logic. If it fails, DBOS will
    automatically retry with exponential backoff.
    """
    from .steps import run_worker_step
    from .graph import create_multi_agent_graph
    from .agents import create_agents
    from pydantic_ai.models.google import GoogleModel
    from pydantic_ai.providers.google import GoogleProvider
    from config.environment import GOOGLE_API_KEY
    
    logger.info(f"   [DBOS Step] Executing: {step_def['step_name']}")
    
    # Mark step as running
    await update_step_status_in_db(
        graph_id,
        step_def['step_id'],
        'running',
        started_at=datetime.now()
    )
    
    try:
        # Create agents for this step
        provider = GoogleProvider(api_key=GOOGLE_API_KEY)
        model = GoogleModel(model_name="gemini-2.0-flash-exp", provider=provider)
        agents = create_agents(orchestrator_model=model)
        
        # Get the appropriate agent for this step type
        step_type = step_def['step_type']
        agent_map = {
            'web_search': agents['web_search'],
            'image_generation': agents['image_generation'],
            'code_execution': agents['code_execution'],
            'result_aggregator': agents['result_aggregator']
        }
        
        agent = agent_map.get(step_type)
        if not agent:
            raise ValueError(f"Unknown step type: {step_type}")
        
        # Set task prompt from step definition
        state.current_task_prompt = step_def['prompt']
        
        # Execute the step
        # Note: We'll need to adapt run_worker_step to work without UnifiedDeps
        # For now, this is a simplified version
        result = await agent.run(step_def['prompt'])
        
        # Store result
        step_result = str(result.output) if hasattr(result, 'output') else str(result)
        state.intermediate_results[step_def['step_name']] = step_result
        state.result = step_result
        
        # Mark step as completed
        await update_step_status_in_db(
            graph_id,
            step_def['step_id'],
            'completed',
            result=step_result,
            completed_at=datetime.now()
        )
        
        logger.info(f"   ✓ Step completed: {step_def['step_name']}")
        return "success"
        
    except Exception as e:
        logger.exception(f"   ✗ Step failed: {step_def['step_name']}: {e}")
        
        # Mark step as error
        await update_step_status_in_db(
            graph_id,
            step_def['step_id'],
            'error',
            error=str(e),
            completed_at=datetime.now()
        )
        
        return "error"


@DBOS.step()
async def update_step_status_in_db(
    graph_id: str,
    step_id: str,
    status: str,
    **kwargs
) -> None:
    """Update individual step status within the plan."""
    pool = await get_pool()
    
    async with pool.connection() as conn:
        # Load current plan
        result = await conn.execute(
            "SELECT planned_steps FROM graph_jobs WHERE graph_id = $1",
            graph_id
        )
        row = await result.fetchone()
        
        if not row:
            return
        
        steps = row[0]
        
        # Find and update the step
        for step in steps:
            if step['step_id'] == step_id:
                step['status'] = status
                for key, value in kwargs.items():
                    if key == 'started_at' or key == 'completed_at':
                        step[key] = value.isoformat() if value else None
                    else:
                        step[key] = value
                break
        
        # Save updated plan
        await conn.execute(
            "UPDATE graph_jobs SET planned_steps = $2 WHERE graph_id = $1",
            graph_id, json.dumps(steps)
        )


@DBOS.workflow()
async def handle_confirmation_step(
    graph_id: str,
    step_def: Dict
) -> bool:
    """
    Handle confirmation step - wait for user response.
    
    This uses DBOS.recv() which durably waits for an external event.
    The workflow can be paused here for hours/days and will automatically
    resume when the user confirms/denies.
    """
    logger.info(f"⏸️  [DBOS] Waiting for user confirmation: {graph_id}")
    
    # Update status
    await update_graph_status_step(
        graph_id=graph_id,
        status='waiting_confirmation',
        pending_confirmation={
            'action_description': step_def['description'],
            'step_name': step_def['step_name'],
            'tool_call_id': step_def.get('tool_call_id', f"confirm_{uuid.uuid4().hex[:8]}")
        }
    )
    
    # Wait for confirmation event (DURABLE WAIT)
    timeout = WORKFLOW_CONFIG['confirmation_timeout']
    event = await DBOS.recv(
        topic=f"graph_confirmation_{graph_id}",
        timeout_seconds=timeout
    )
    
    if event is None:
        logger.warning(f"⏱️  Confirmation timeout for graph {graph_id}")
        return False
    
    confirmed = event.get('confirmed', False)
    logger.info(f"📬 Received confirmation: {confirmed}")
    
    # Update status
    await update_graph_status_step(
        graph_id=graph_id,
        status='running',
        pending_confirmation=None
    )
    
    return confirmed


# ============================================================================
# Queue Consumer (Background Processing)
# ============================================================================

@DBOS.queue_consumer(
    queue_name="graph_execution_queue",
    concurrency=QUEUE_CONFIG['graph_execution_queue']['concurrency'],
    rate_limit=QUEUE_CONFIG['graph_execution_queue']['rate_limit']
)
async def process_graph_from_queue(graph_request: Dict) -> str:
    """
    DBOS queue consumer for background graph execution.
    
    Processes queued graph execution requests with:
    - Concurrency control (max N parallel executions)
    - Rate limiting (max M executions per minute)
    - Automatic retry on failure
    - Durable execution (survives server restarts)
    """
    logger.info(f"📥 [Queue] Processing graph: {graph_request['graph_id']}")
    
    result = await run_durable_graph_workflow(
        graph_id=graph_request['graph_id'],
        session_id=graph_request['session_id'],
        user_id=graph_request['user_id'],
        query=graph_request['query'],
        graph_name=graph_request.get('graph_name', ''),
        orchestrator_model_name=graph_request.get('orchestrator_model', 'gemini-2.0-flash-exp'),
        max_iterations=graph_request.get('max_iterations', 5)
    )
    
    logger.info(f"✅ [Queue] Graph completed: {graph_request['graph_id']}")
    return result


# ============================================================================
# Public API Functions
# ============================================================================

async def enqueue_graph_execution(
    graph_id: str,
    session_id: str,
    user_id: str,
    query: str,
    graph_name: str = None,
    orchestrator_model: str = "gemini-2.0-flash-exp",
    max_iterations: int = 5,
    priority: int = 0
) -> Dict:
    """
    Enqueue a graph for background execution.
    
    Args:
        graph_id: Unique graph identifier
        session_id: CopilotKit session
        user_id: User ID
        query: Original query
        graph_name: Human-readable name
        orchestrator_model: Model name
        max_iterations: Max iterations
        priority: Queue priority (0-10, higher = sooner)
    
    Returns:
        Status dict
    """
    logger.info(f"📬 Enqueuing graph: {graph_id} (priority: {priority})")
    
    # Send to DBOS queue
    await DBOS.send(
        destination_queue="graph_execution_queue",
        message={
            'graph_id': graph_id,
            'session_id': session_id,
            'user_id': user_id,
            'query': query,
            'graph_name': graph_name,
            'orchestrator_model': orchestrator_model,
            'max_iterations': max_iterations
        },
        priority=priority
    )
    
    return {
        'graph_id': graph_id,
        'status': 'queued',
        'message': 'Graph queued for execution'
    }


async def send_confirmation_event(graph_id: str, confirmed: bool) -> None:
    """
    Send confirmation response to resume a waiting workflow.
    
    Args:
        graph_id: Graph waiting for confirmation
        confirmed: True if confirmed, False if denied
    """
    logger.info(f"📤 Sending confirmation: {graph_id} = {confirmed}")
    
    await DBOS.send(
        topic=f"graph_confirmation_{graph_id}",
        message={'confirmed': confirmed}
    )


async def send_plan_update_event(graph_id: str) -> None:
    """
    Notify workflow that plan was updated.
    
    Args:
        graph_id: Graph that was updated
    """
    logger.info(f"📤 Sending plan update notification: {graph_id}")
    
    await DBOS.send(
        topic=f"graph_plan_updated_{graph_id}",
        message={'updated': True}
    )


# ============================================================================
# Initialization
# ============================================================================

def init_dbos():
    """Initialize DBOS - call on application startup."""
    logger.info("🔧 Initializing DBOS for durable graph execution...")
    DBOS.launch()
    logger.info("✅ DBOS initialized successfully")
    logger.info(f"   Workflow concurrency: {QUEUE_CONFIG['graph_execution_queue']['concurrency']}")
    logger.info(f"   Rate limit: {QUEUE_CONFIG['graph_execution_queue']['rate_limit']}/min")
```

This implementation document continues with sections on:
- Graph Manager Service
- Agent Tools
- API Endpoints  
- Frontend Components
- Testing Strategy
- Deployment Guide

Would you like me to continue with the remaining sections, or would you like me to create this as a separate document part 2?

