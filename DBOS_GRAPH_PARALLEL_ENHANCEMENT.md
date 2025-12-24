# DBOS Graph System - Parallel Execution Enhancement

**Enhancement to support parallel step execution based on Pydantic Graph patterns**

Reference: [Pydantic Graph Parallel Execution](https://ai.pydantic.dev/graph/beta/parallel/)

---

## Table of Contents

1. [Overview](#overview)
2. [Parallel Execution Patterns](#parallel-execution-patterns)
3. [Database Schema Changes](#database-schema-changes)
4. [Enhanced Step Definition](#enhanced-step-definition)
5. [DBOS Workflow Implementation](#dbos-workflow-implementation)
6. [API Enhancements](#api-enhancements)
7. [Frontend Visualization](#frontend-visualization)
8. [Usage Examples](#usage-examples)
9. [Performance Considerations](#performance-considerations)
10. [Migration Guide](#migration-guide)

---

## Overview

### Current Limitations

```
Step 1 → Step 2 → Step 3 → Step 4
  ↓        ↓        ↓        ↓
 30s      45s      60s      20s
Total: 155 seconds (sequential)
```

### With Parallel Execution

```
Step 1 → ┌─ Step 2A (parallel) ─┐
         ├─ Step 2B (parallel) ─┤ → Step 4
         └─ Step 2C (parallel) ─┘
  ↓       ↓ (all run at once)     ↓
 30s      60s (max of 45/60/20)  20s
Total: 110 seconds (29% faster!)
```

### Parallel Patterns to Support

Based on [Pydantic Graph documentation](https://ai.pydantic.dev/graph/beta/parallel/):

1. **Broadcasting** - Same data to multiple steps
2. **Spreading/Mapping** - Fan out data from iterable
3. **Join/Reduce** - Aggregate parallel results
4. **Nested Parallelism** - Parallel groups within parallel groups

---

## Parallel Execution Patterns

### 1. Broadcasting Pattern

**Use Case**: Run multiple independent operations on the same input

```python
# Example: Search multiple sources simultaneously
Input: "AI news"
  ├─ WebSearch (Google) ──┐
  ├─ WebSearch (Bing) ────┤ → Aggregate Results
  └─ WebSearch (Twitter) ─┘

All run in parallel with same query
```

### 2. Spreading/Mapping Pattern

**Use Case**: Process each item from a list independently

```python
# Example: Process multiple articles
Input: ["article1.pdf", "article2.pdf", "article3.pdf"]
  ├─ Summarize article1 ──┐
  ├─ Summarize article2 ──┤ → Collect Summaries
  └─ Summarize article3 ──┘

Each article processed in parallel
```

### 3. Nested Parallelism

**Use Case**: Complex workflows with multiple parallel stages

```python
# Example: Multi-source analysis
Query ──┐
        ├─ Search Group A ─┬─ Source 1 ──┐
        │                  └─ Source 2 ──┤ → Aggregate A
        │                                │
        └─ Search Group B ─┬─ Source 3 ──┤ → Aggregate B
                           └─ Source 4 ──┘
                                         ↓
                                    Final Summary
```

---

## Database Schema Changes

### 1. Enhanced Step Definition

```sql
-- File: database/migrations/004_add_parallel_execution.sql

-- Add parallel execution fields to existing planned_steps JSONB
ALTER TABLE graph_jobs ADD COLUMN IF NOT EXISTS execution_graph JSONB;

/* 
Enhanced step structure in planned_steps JSONB:
{
  "step_id": "step_1",
  "step_type": "web_search",
  "step_name": "WebSearch",
  "description": "Search for information",
  "prompt": "Find latest AI news",
  "enabled": true,
  "order": 1,
  "status": "pending",
  
  -- NEW: Parallel execution fields
  "parallel_group": "search_parallel_1",  -- Steps with same group run in parallel
  "execution_mode": "broadcast",  -- "sequential", "broadcast", "map"
  "depends_on": ["step_0"],  -- IDs of steps that must complete first
  "join_strategy": null,  -- For aggregation: "list", "dict", "reduce", "first", "last"
  "reduce_function": null,  -- Custom reduce: "concatenate", "sum", "merge"
  "is_join_node": false,  -- True if this step aggregates parallel results
  "max_concurrency": null,  -- Limit parallel executions (for map mode)
  
  -- Data flow control
  "input_mapping": null,  -- How to map inputs: "broadcast" or "spread"
  "output_collection": null  -- How to collect outputs: "list", "dict", "merged"
}
*/

-- Add execution graph metadata
COMMENT ON COLUMN graph_jobs.execution_graph IS 
'Complete execution graph structure with parallel groups, dependencies, and join nodes';

-- Example execution_graph structure:
/*
{
  "nodes": [
    {"step_id": "step_1", "type": "step", "parallel_group": null},
    {"step_id": "parallel_1", "type": "parallel_group", "members": ["step_2a", "step_2b", "step_2c"]},
    {"step_id": "step_2a", "type": "step", "parallel_group": "parallel_1"},
    {"step_id": "step_2b", "type": "step", "parallel_group": "parallel_1"},
    {"step_id": "step_2c", "type": "step", "parallel_group": "parallel_1"},
    {"step_id": "join_1", "type": "join", "joins": ["step_2a", "step_2b", "step_2c"]},
    {"step_id": "step_3", "type": "step", "parallel_group": null}
  ],
  "edges": [
    {"from": "step_1", "to": "parallel_1", "type": "broadcast"},
    {"from": "parallel_1", "to": ["step_2a", "step_2b", "step_2c"], "type": "fanout"},
    {"from": ["step_2a", "step_2b", "step_2c"], "to": "join_1", "type": "collect"},
    {"from": "join_1", "to": "step_3", "type": "sequential"}
  ]
}
*/

-- Index for parallel group queries
CREATE INDEX idx_graph_jobs_execution_graph 
    ON graph_jobs USING GIN (execution_graph);
```

### 2. Parallel Execution Tracking

```sql
-- Track individual parallel task executions
CREATE TABLE IF NOT EXISTS parallel_executions (
    execution_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    graph_id TEXT NOT NULL REFERENCES graph_jobs(graph_id) ON DELETE CASCADE,
    parallel_group TEXT NOT NULL,  -- e.g., "search_parallel_1"
    step_id TEXT NOT NULL,
    task_index INTEGER,  -- For map operations (which item in the list)
    
    -- Execution details
    status TEXT NOT NULL,  -- pending, running, completed, failed
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    
    -- Input/Output
    input_data JSONB,
    output_data JSONB,
    error TEXT,
    
    -- Metadata
    worker_id TEXT,  -- Which DBOS worker processed this
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_status CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);

CREATE INDEX idx_parallel_executions_graph ON parallel_executions(graph_id, parallel_group);
CREATE INDEX idx_parallel_executions_status ON parallel_executions(status) WHERE status IN ('running', 'pending');
CREATE INDEX idx_parallel_executions_group ON parallel_executions(parallel_group, status);
```

---

## Enhanced Step Definition

### Type Definitions

```python
# File: copilotkit-pydantic/tools/multi_agent_graph/types.py (additions)

from typing import Literal, Optional, List, Dict, Any
from pydantic import BaseModel, Field

class ExecutionMode(str, Enum):
    """Execution mode for a step."""
    SEQUENTIAL = "sequential"
    BROADCAST = "broadcast"  # Same input to multiple steps
    MAP = "map"  # Fan out iterable items to parallel steps
    JOIN = "join"  # Aggregate parallel results

class JoinStrategy(str, Enum):
    """Strategy for joining parallel results."""
    LIST = "list"  # Collect as list
    DICT = "dict"  # Collect as dict with step_id keys
    REDUCE = "reduce"  # Apply reduce function
    FIRST = "first"  # Take first completed
    LAST = "last"  # Take last completed
    MERGE = "merge"  # Deep merge dictionaries

class ReduceFunction(str, Enum):
    """Built-in reduce functions."""
    CONCATENATE = "concatenate"  # Join strings/lists
    SUM = "sum"  # Sum numbers
    MERGE = "merge"  # Merge dictionaries
    APPEND = "append"  # Append to list
    CUSTOM = "custom"  # Use custom function

class ParallelGraphStep(BaseModel):
    """Enhanced step definition with parallel execution support."""
    step_id: str
    step_type: Literal["web_search", "image_generation", "code_execution", "result_aggregator", "confirmation"]
    step_name: str
    description: str
    prompt: str
    enabled: bool = True
    order: int
    status: str = "pending"
    
    # Parallel execution fields
    parallel_group: Optional[str] = None  # Steps with same group run in parallel
    execution_mode: ExecutionMode = ExecutionMode.SEQUENTIAL
    depends_on: List[str] = Field(default_factory=list)  # Step IDs that must complete first
    
    # Join/Aggregation
    is_join_node: bool = False
    joins: List[str] = Field(default_factory=list)  # Step IDs to aggregate from
    join_strategy: Optional[JoinStrategy] = None
    reduce_function: Optional[ReduceFunction] = None
    
    # Data flow
    input_mapping: Optional[str] = None  # "broadcast", "spread", or transform function
    output_collection: Optional[str] = None  # "list", "dict", "merged"
    max_concurrency: Optional[int] = None  # Limit parallel tasks (for map mode)
    
    # Execution tracking
    parallel_task_index: Optional[int] = None  # For map operations
    result: Optional[str] = None
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None

class ExecutionGraph(BaseModel):
    """Complete execution graph with parallel groups."""
    nodes: List[ParallelGraphStep]
    parallel_groups: Dict[str, List[str]]  # group_id -> [step_ids]
    dependencies: Dict[str, List[str]]  # step_id -> [dependency_step_ids]
    join_nodes: Dict[str, str]  # join_step_id -> parallel_group_id
```

---

## DBOS Workflow Implementation

### 1. Enhanced Workflow with Parallel Execution

```python
# File: copilotkit-pydantic/tools/multi_agent_graph/durable_graph_parallel.py

"""DBOS workflows with parallel execution support."""

import asyncio
from typing import List, Dict, Any, Optional
from dbos import DBOS
from datetime import datetime

from config import logger
from .types import ParallelGraphStep, ExecutionMode, JoinStrategy
from .parallel_executor import (
    execute_parallel_group,
    aggregate_parallel_results,
    execute_mapped_steps
)

@DBOS.workflow()
async def execute_graph_with_parallel_support(
    graph_id: str,
    session_id: str,
    user_id: str,
    query: str,
    max_iterations: int
) -> str:
    """
    Execute graph with support for parallel execution.
    
    Supports:
    - Sequential execution (default)
    - Broadcasting (same input to multiple steps)
    - Mapping (fan out items to parallel steps)
    - Join/reduce (aggregate parallel results)
    """
    logger.info(f"📊 [DBOS Parallel] Executing graph: {graph_id}")
    
    # Load execution plan with parallel groups
    plan_data = await load_execution_graph_step(graph_id)
    
    if not plan_data or not plan_data.get('nodes'):
        raise ValueError(f"Graph {graph_id} has no execution plan")
    
    # Build execution graph
    execution_graph = build_execution_graph(plan_data)
    
    # Initialize state
    state = QueryState(
        query=query,
        original_query=query,
        max_iterations=max_iterations,
        user_id=user_id
    )
    
    # Execute graph with parallel support
    result = await execute_execution_graph(
        graph_id=graph_id,
        execution_graph=execution_graph,
        state=state,
        session_id=session_id,
        user_id=user_id
    )
    
    return result


@DBOS.workflow()
async def execute_execution_graph(
    graph_id: str,
    execution_graph: Dict,
    state: QueryState,
    session_id: str,
    user_id: str
) -> str:
    """
    Execute the execution graph respecting parallel groups and dependencies.
    
    Algorithm:
    1. Find all steps with no dependencies (ready to execute)
    2. Group steps by parallel_group
    3. Execute each group:
       - Sequential steps: one at a time
       - Parallel groups: all steps concurrently
    4. Wait for group completion
    5. Execute join nodes to aggregate results
    6. Repeat until all steps complete
    """
    nodes = execution_graph['nodes']
    parallel_groups = execution_graph['parallel_groups']
    dependencies = execution_graph['dependencies']
    
    completed_steps = set()
    step_results = {}
    
    while len(completed_steps) < len(nodes):
        # Find ready steps (all dependencies met)
        ready_steps = find_ready_steps(nodes, dependencies, completed_steps)
        
        if not ready_steps:
            logger.warning(f"No ready steps found, possible circular dependency")
            break
        
        logger.info(f"Ready to execute: {[s['step_id'] for s in ready_steps]}")
        
        # Group by parallel group
        execution_batches = group_by_parallel_group(ready_steps, parallel_groups)
        
        for batch_type, steps in execution_batches.items():
            if batch_type == 'sequential':
                # Execute one at a time
                for step in steps:
                    result = await execute_single_step(
                        graph_id, step, state, step_results, session_id, user_id
                    )
                    step_results[step['step_id']] = result
                    completed_steps.add(step['step_id'])
            
            elif batch_type.startswith('parallel_'):
                # Execute all in parallel
                parallel_group_id = batch_type
                
                logger.info(f"🔀 Executing parallel group: {parallel_group_id}")
                
                results = await execute_parallel_group_workflow(
                    graph_id=graph_id,
                    parallel_group_id=parallel_group_id,
                    steps=steps,
                    state=state,
                    previous_results=step_results,
                    session_id=session_id,
                    user_id=user_id
                )
                
                # Store results
                for step_id, result in results.items():
                    step_results[step_id] = result
                    completed_steps.add(step_id)
                
                # Execute join node if exists
                join_node = find_join_node(nodes, parallel_group_id)
                if join_node:
                    aggregated = await execute_join_node(
                        graph_id, join_node, results, state
                    )
                    step_results[join_node['step_id']] = aggregated
                    completed_steps.add(join_node['step_id'])
    
    # Final result
    return state.result or "Graph execution completed"


@DBOS.workflow()
async def execute_parallel_group_workflow(
    graph_id: str,
    parallel_group_id: str,
    steps: List[Dict],
    state: QueryState,
    previous_results: Dict[str, Any],
    session_id: str,
    user_id: str
) -> Dict[str, Any]:
    """
    Execute a group of steps in parallel.
    
    Supports:
    - Broadcasting: Same input to all steps
    - Mapping: Fan out items from iterable
    """
    logger.info(f"   ⚡ Parallel group {parallel_group_id}: {len(steps)} steps")
    
    # Determine execution mode
    execution_mode = steps[0].get('execution_mode', 'broadcast')
    
    if execution_mode == 'broadcast':
        # All steps get same input
        results = await execute_broadcast_steps(
            graph_id, parallel_group_id, steps, state, previous_results,
            session_id, user_id
        )
    
    elif execution_mode == 'map':
        # Fan out items to parallel steps
        results = await execute_mapped_steps_workflow(
            graph_id, parallel_group_id, steps, state, previous_results,
            session_id, user_id
        )
    
    else:
        raise ValueError(f"Unknown execution mode: {execution_mode}")
    
    return results


@DBOS.step()
async def execute_broadcast_steps(
    graph_id: str,
    parallel_group_id: str,
    steps: List[Dict],
    state: QueryState,
    previous_results: Dict[str, Any],
    session_id: str,
    user_id: str
) -> Dict[str, Any]:
    """
    Execute steps in parallel with broadcast pattern (same input to all).
    
    Example:
    Input: "AI news"
    ├─ WebSearch (Google)  │ All get "AI news"
    ├─ WebSearch (Bing)    │ Execute concurrently
    └─ WebSearch (Twitter) │
    """
    from .parallel_executor import execute_parallel_group
    
    # Prepare input (same for all steps)
    shared_input = build_shared_input(state, previous_results, steps[0])
    
    # Create tasks for parallel execution
    tasks = []
    for step in steps:
        task = execute_step_with_tracking(
            graph_id=graph_id,
            parallel_group=parallel_group_id,
            step=step,
            input_data=shared_input,
            state=state,
            session_id=session_id,
            user_id=user_id
        )
        tasks.append(task)
    
    # Execute all in parallel
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Build result dictionary
    result_dict = {}
    for step, result in zip(steps, results):
        if isinstance(result, Exception):
            logger.error(f"Step {step['step_id']} failed: {result}")
            result_dict[step['step_id']] = {"error": str(result)}
        else:
            result_dict[step['step_id']] = result
    
    return result_dict


@DBOS.step()
async def execute_mapped_steps_workflow(
    graph_id: str,
    parallel_group_id: str,
    steps: List[Dict],
    state: QueryState,
    previous_results: Dict[str, Any],
    session_id: str,
    user_id: str
) -> Dict[str, Any]:
    """
    Execute steps with mapping pattern (fan out items from iterable).
    
    Example:
    Input: ["article1", "article2", "article3"]
    ├─ Summarize article1  │ Each article processed
    ├─ Summarize article2  │ in parallel
    └─ Summarize article3  │
    """
    # Get iterable input
    input_items = get_iterable_input(state, previous_results, steps[0])
    
    if not isinstance(input_items, (list, tuple)):
        raise ValueError(f"Map execution requires iterable input, got {type(input_items)}")
    
    logger.info(f"   📤 Mapping {len(input_items)} items to {len(steps)} step(s)")
    
    # If one step, fan out items to multiple executions of that step
    if len(steps) == 1:
        step = steps[0]
        max_concurrency = step.get('max_concurrency') or len(input_items)
        
        # Create semaphore for concurrency control
        semaphore = asyncio.Semaphore(max_concurrency)
        
        async def execute_with_semaphore(item, index):
            async with semaphore:
                return await execute_step_with_tracking(
                    graph_id=graph_id,
                    parallel_group=parallel_group_id,
                    step=step,
                    input_data=item,
                    task_index=index,
                    state=state,
                    session_id=session_id,
                    user_id=user_id
                )
        
        # Execute all items in parallel (with concurrency limit)
        tasks = [
            execute_with_semaphore(item, idx)
            for idx, item in enumerate(input_items)
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Return as dict with indexed keys
        return {
            f"{step['step_id']}_{idx}": result
            for idx, result in enumerate(results)
        }
    
    # If multiple steps, distribute items across steps
    else:
        # Round-robin distribution or custom mapping
        result_dict = {}
        for idx, item in enumerate(input_items):
            step = steps[idx % len(steps)]
            result = await execute_step_with_tracking(
                graph_id=graph_id,
                parallel_group=parallel_group_id,
                step=step,
                input_data=item,
                task_index=idx,
                state=state,
                session_id=session_id,
                user_id=user_id
            )
            result_dict[f"{step['step_id']}_{idx}"] = result
        
        return result_dict


@DBOS.step(retries=3)
async def execute_step_with_tracking(
    graph_id: str,
    parallel_group: str,
    step: Dict,
    input_data: Any,
    state: QueryState,
    session_id: str,
    user_id: str,
    task_index: Optional[int] = None
) -> Any:
    """
    Execute a single step with parallel execution tracking.
    
    Records execution in parallel_executions table for monitoring.
    """
    from database.postgres_pool import get_pool
    import uuid
    
    execution_id = str(uuid.uuid4())
    
    # Record execution start
    pool = await get_pool()
    async with pool.connection() as conn:
        await conn.execute(
            """
            INSERT INTO parallel_executions (
                execution_id, graph_id, parallel_group, step_id,
                task_index, status, started_at, input_data
            )
            VALUES ($1, $2, $3, $4, $5, 'running', NOW(), $6)
            """,
            execution_id, graph_id, parallel_group, step['step_id'],
            task_index, json.dumps(input_data) if input_data else None
        )
    
    try:
        # Execute the actual step
        start_time = datetime.now()
        
        result = await execute_single_step_logic(
            graph_id=graph_id,
            step=step,
            input_data=input_data,
            state=state,
            session_id=session_id,
            user_id=user_id
        )
        
        duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        
        # Record success
        async with pool.connection() as conn:
            await conn.execute(
                """
                UPDATE parallel_executions
                SET status = 'completed',
                    completed_at = NOW(),
                    duration_ms = $2,
                    output_data = $3
                WHERE execution_id = $1
                """,
                execution_id, duration_ms, json.dumps(result)
            )
        
        return result
        
    except Exception as e:
        # Record failure
        async with pool.connection() as conn:
            await conn.execute(
                """
                UPDATE parallel_executions
                SET status = 'failed',
                    completed_at = NOW(),
                    error = $2
                WHERE execution_id = $1
                """,
                execution_id, str(e)
            )
        
        raise


@DBOS.step()
async def execute_join_node(
    graph_id: str,
    join_node: Dict,
    parallel_results: Dict[str, Any],
    state: QueryState
) -> Any:
    """
    Aggregate results from parallel steps.
    
    Supports multiple join strategies:
    - list: Collect as list
    - dict: Keep as dict with step IDs
    - reduce: Apply reduce function
    - first/last: Take first/last completed
    - merge: Deep merge dictionaries
    """
    join_strategy = join_node.get('join_strategy', 'list')
    
    logger.info(f"   🔗 Join node {join_node['step_id']}: {join_strategy}")
    
    if join_strategy == 'list':
        return list(parallel_results.values())
    
    elif join_strategy == 'dict':
        return parallel_results
    
    elif join_strategy == 'reduce':
        reduce_func = join_node.get('reduce_function', 'concatenate')
        return apply_reduce_function(parallel_results, reduce_func)
    
    elif join_strategy == 'first':
        # Return first non-error result
        for result in parallel_results.values():
            if not isinstance(result, dict) or 'error' not in result:
                return result
        return list(parallel_results.values())[0]  # Fallback
    
    elif join_strategy == 'last':
        return list(parallel_results.values())[-1]
    
    elif join_strategy == 'merge':
        # Deep merge all dictionaries
        merged = {}
        for result in parallel_results.values():
            if isinstance(result, dict):
                merged = deep_merge(merged, result)
        return merged
    
    else:
        raise ValueError(f"Unknown join strategy: {join_strategy}")


# ============================================================================
# Helper Functions
# ============================================================================

def build_execution_graph(plan_data: Dict) -> Dict:
    """Build execution graph with parallel groups and dependencies."""
    steps = plan_data['steps']
    
    # Find parallel groups
    parallel_groups = {}
    for step in steps:
        group = step.get('parallel_group')
        if group:
            if group not in parallel_groups:
                parallel_groups[group] = []
            parallel_groups[group].append(step['step_id'])
    
    # Build dependencies
    dependencies = {}
    for step in steps:
        depends_on = step.get('depends_on', [])
        if depends_on:
            dependencies[step['step_id']] = depends_on
    
    return {
        'nodes': steps,
        'parallel_groups': parallel_groups,
        'dependencies': dependencies
    }


def find_ready_steps(
    nodes: List[Dict],
    dependencies: Dict[str, List[str]],
    completed: set
) -> List[Dict]:
    """Find steps where all dependencies are met."""
    ready = []
    for node in nodes:
        step_id = node['step_id']
        
        # Skip if already completed
        if step_id in completed:
            continue
        
        # Check dependencies
        deps = dependencies.get(step_id, [])
        if all(dep in completed for dep in deps):
            ready.append(node)
    
    return ready


def group_by_parallel_group(steps: List[Dict], parallel_groups: Dict) -> Dict[str, List[Dict]]:
    """Group steps by their parallel group or sequential execution."""
    batches = {'sequential': []}
    
    for step in steps:
        group = step.get('parallel_group')
        if group:
            if group not in batches:
                batches[group] = []
            batches[group].append(step)
        else:
            batches['sequential'].append(step)
    
    return batches


def find_join_node(nodes: List[Dict], parallel_group_id: str) -> Optional[Dict]:
    """Find join node for a parallel group."""
    for node in nodes:
        if node.get('is_join_node') and parallel_group_id in node.get('joins', []):
            return node
    return None


def apply_reduce_function(results: Dict[str, Any], func_name: str) -> Any:
    """Apply reduce function to parallel results."""
    values = list(results.values())
    
    if func_name == 'concatenate':
        if all(isinstance(v, str) for v in values):
            return ''.join(values)
        elif all(isinstance(v, list) for v in values):
            return [item for sublist in values for item in sublist]
        else:
            return values
    
    elif func_name == 'sum':
        return sum(v for v in values if isinstance(v, (int, float)))
    
    elif func_name == 'merge':
        merged = {}
        for v in values:
            if isinstance(v, dict):
                merged.update(v)
        return merged
    
    elif func_name == 'append':
        return values
    
    else:
        return values


def deep_merge(dict1: Dict, dict2: Dict) -> Dict:
    """Deep merge two dictionaries."""
    result = dict1.copy()
    for key, value in dict2.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result
```

---

## API Enhancements

### Enhanced Graph Creation Endpoint

```python
# File: copilotkit-pydantic/api/graph_endpoints.py (additions)

from tools.multi_agent_graph.types import ParallelGraphStep, ExecutionMode, JoinStrategy

class CreateParallelGraphRequest(BaseModel):
    """Request to create graph with parallel execution."""
    query: str
    graph_name: str
    session_id: str
    steps: List[ParallelGraphStep]
    agent_reasoning: Optional[str] = None
    auto_start: bool = False
    
    # Execution graph
    parallel_groups: Dict[str, List[str]] = {}  # group_id -> [step_ids]

@router.post("/create-parallel")
async def create_parallel_graph(
    request: CreateParallelGraphRequest,
    user_id: str = Depends(get_current_user)
):
    """
    Create a graph with parallel execution support.
    
    Example request:
    {
      "query": "Research AI and create visualizations",
      "graph_name": "AI Research Dashboard",
      "steps": [
        {
          "step_id": "search_group",
          "parallel_group": "parallel_search_1",
          "execution_mode": "broadcast",
          ...
        },
        {
          "step_id": "search_google",
          "parallel_group": "parallel_search_1",
          "depends_on": ["search_group"],
          ...
        },
        {
          "step_id": "search_bing",
          "parallel_group": "parallel_search_1",
          "depends_on": ["search_group"],
          ...
        },
        {
          "step_id": "aggregate",
          "is_join_node": true,
          "joins": ["parallel_search_1"],
          "join_strategy": "list",
          ...
        }
      ],
      "parallel_groups": {
        "parallel_search_1": ["search_google", "search_bing"]
      }
    }
    """
    try:
        graph_id = f"graph_{uuid.uuid4().hex[:12]}"
        
        # Validate parallel groups
        validate_parallel_structure(request.steps, request.parallel_groups)
        
        result = await create_graph_draft(
            graph_id=graph_id,
            session_id=request.session_id,
            user_id=user_id,
            query=request.query,
            graph_name=request.graph_name,
            steps=[step.model_dump() for step in request.steps],
            parallel_groups=request.parallel_groups,
            agent_reasoning=request.agent_reasoning,
            auto_start=request.auto_start
        )
        
        return result
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Failed to create parallel graph")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{graph_id}/execution-timeline")
async def get_execution_timeline(
    graph_id: str,
    user_id: str = Depends(get_current_user)
):
    """
    Get execution timeline for parallel visualization.
    
    Returns timing data for Gantt chart rendering.
    """
    try:
        from database.postgres_pool import get_pool
        
        pool = await get_pool()
        async with pool.connection() as conn:
            result = await conn.execute(
                """
                SELECT 
                    parallel_group,
                    step_id,
                    task_index,
                    status,
                    started_at,
                    completed_at,
                    duration_ms
                FROM parallel_executions
                WHERE graph_id = $1
                ORDER BY started_at
                """,
                graph_id
            )
            rows = await result.fetchall()
            
            timeline = []
            for row in rows:
                timeline.append({
                    "parallel_group": row[0],
                    "step_id": row[1],
                    "task_index": row[2],
                    "status": row[3],
                    "started_at": row[4].isoformat() if row[4] else None,
                    "completed_at": row[5].isoformat() if row[5] else None,
                    "duration_ms": row[6]
                })
            
            return {"timeline": timeline}
        
    except Exception as e:
        logger.exception(f"Failed to get timeline for graph {graph_id}")
        raise HTTPException(status_code=500, detail=str(e))
```

---

## Frontend Visualization

### Gantt Chart View

```typescript
// File: pages/side-panel/src/components/graph-state/ParallelExecutionTimeline.tsx

import React, { useEffect, useState } from 'react';
import { cn } from '@extension/ui';

interface TimelineEntry {
  parallel_group: string;
  step_id: string;
  task_index: number | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

interface ParallelExecutionTimelineProps {
  graphId: string;
  isLight: boolean;
}

export const ParallelExecutionTimeline: React.FC<ParallelExecutionTimelineProps> = ({
  graphId,
  isLight
}) => {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [timeRange, setTimeRange] = useState({ start: 0, end: 0, total: 0 });
  
  useEffect(() => {
    const fetchTimeline = async () => {
      const response = await fetch(`/api/graphs/${graphId}/execution-timeline`);
      const data = await response.json();
      
      if (data.timeline && data.timeline.length > 0) {
        setTimeline(data.timeline);
        
        // Calculate time range
        const times = data.timeline
          .filter(e => e.started_at)
          .map(e => new Date(e.started_at).getTime());
        
        const start = Math.min(...times);
        const end = Math.max(...times.map((t, i) => {
          const entry = data.timeline[i];
          return entry.completed_at 
            ? new Date(entry.completed_at).getTime()
            : Date.now();
        }));
        
        setTimeRange({ start, end, total: end - start });
      }
    };
    
    fetchTimeline();
    const interval = setInterval(fetchTimeline, 2000);
    
    return () => clearInterval(interval);
  }, [graphId]);
  
  // Group by parallel group
  const groupedTimeline = timeline.reduce((acc, entry) => {
    const key = entry.parallel_group || 'sequential';
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {} as Record<string, TimelineEntry[]>);
  
  const getBarPosition = (entry: TimelineEntry) => {
    if (!entry.started_at) return { left: 0, width: 0 };
    
    const start = new Date(entry.started_at).getTime();
    const end = entry.completed_at 
      ? new Date(entry.completed_at).getTime()
      : Date.now();
    
    const leftPercent = ((start - timeRange.start) / timeRange.total) * 100;
    const widthPercent = ((end - start) / timeRange.total) * 100;
    
    return { left: leftPercent, width: Math.max(widthPercent, 2) };
  };
  
  return (
    <div className="parallel-timeline">
      <h3 className="text-sm font-medium mb-2">Execution Timeline</h3>
      
      <div className="space-y-2">
        {Object.entries(groupedTimeline).map(([group, entries]) => (
          <div key={group} className="timeline-group">
            <div className="text-xs text-gray-500 mb-1">
              {group === 'sequential' ? 'Sequential' : `Parallel: ${group}`}
            </div>
            
            <div className="space-y-1">
              {entries.map((entry, idx) => {
                const { left, width } = getBarPosition(entry);
                const isRunning = entry.status === 'running';
                const isCompleted = entry.status === 'completed';
                const isFailed = entry.status === 'failed';
                
                return (
                  <div
                    key={`${entry.step_id}_${entry.task_index || idx}`}
                    className="relative h-8"
                  >
                    {/* Step label */}
                    <div className="absolute left-0 top-0 bottom-0 w-32 flex items-center">
                      <span className="text-xs truncate">
                        {entry.step_id}
                        {entry.task_index !== null && ` [${entry.task_index}]`}
                      </span>
                    </div>
                    
                    {/* Timeline bar container */}
                    <div className="absolute left-32 right-0 top-0 bottom-0 flex items-center">
                      <div className="w-full h-6 bg-gray-100 dark:bg-gray-800 rounded relative">
                        {/* Execution bar */}
                        <div
                          className={cn(
                            'absolute top-0 bottom-0 rounded transition-all',
                            isCompleted && 'bg-green-500',
                            isRunning && 'bg-blue-500 animate-pulse',
                            isFailed && 'bg-red-500'
                          )}
                          style={{
                            left: `${left}%`,
                            width: `${width}%`
                          }}
                          title={`${entry.step_id}: ${entry.duration_ms || 0}ms`}
                        >
                          {/* Duration label */}
                          {entry.duration_ms && (
                            <span className="absolute inset-0 flex items-center justify-center text-xs text-white font-medium">
                              {entry.duration_ms}ms
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      
      {/* Time axis */}
      <div className="mt-2 pl-32 text-xs text-gray-500">
        <div className="flex justify-between">
          <span>0s</span>
          <span>{(timeRange.total / 1000).toFixed(1)}s</span>
        </div>
      </div>
    </div>
  );
};
```

---

## Usage Examples

### Example 1: Parallel Web Search

```python
# Agent creates graph with parallel searches

await create_graph(
    query="Find information about quantum computing from multiple sources",
    graph_name="Multi-Source Research",
    steps=[
        # Single input generator
        {
            "step_id": "prepare_query",
            "step_type": "result_aggregator",
            "step_name": "PrepareQuery",
            "description": "Prepare search query",
            "prompt": "Extract key search terms from: quantum computing",
            "order": 1
        },
        # Parallel search group (broadcast pattern)
        {
            "step_id": "search_google",
            "step_type": "web_search",
            "step_name": "SearchGoogle",
            "description": "Search Google",
            "prompt": "Search Google for quantum computing",
            "parallel_group": "parallel_search_1",
            "execution_mode": "broadcast",
            "depends_on": ["prepare_query"],
            "order": 2
        },
        {
            "step_id": "search_bing",
            "step_type": "web_search",
            "step_name": "SearchBing",
            "description": "Search Bing",
            "prompt": "Search Bing for quantum computing",
            "parallel_group": "parallel_search_1",
            "execution_mode": "broadcast",
            "depends_on": ["prepare_query"],
            "order": 2
        },
        {
            "step_id": "search_scholar",
            "step_type": "web_search",
            "step_name": "SearchScholar",
            "description": "Search Google Scholar",
            "prompt": "Search academic papers on quantum computing",
            "parallel_group": "parallel_search_1",
            "execution_mode": "broadcast",
            "depends_on": ["prepare_query"],
            "order": 2
        },
        # Join node to aggregate
        {
            "step_id": "aggregate_results",
            "step_type": "result_aggregator",
            "step_name": "AggregateResults",
            "description": "Combine all search results",
            "prompt": "Combine and summarize results from Google, Bing, and Scholar",
            "is_join_node": True,
            "joins": ["parallel_search_1"],
            "join_strategy": "list",
            "depends_on": ["search_google", "search_bing", "search_scholar"],
            "order": 3
        }
    ],
    reasoning="Search multiple sources in parallel for comprehensive results",
    auto_start=True
)
```

### Example 2: Parallel Data Processing (Map Pattern)

```python
# Process multiple documents in parallel

await create_graph(
    query="Summarize these 5 research papers",
    graph_name="Batch Document Summarization",
    steps=[
        # Generate list of documents
        {
            "step_id": "list_documents",
            "step_type": "code_execution",
            "step_name": "ListDocuments",
            "description": "List all documents",
            "prompt": "Return list: ['paper1.pdf', 'paper2.pdf', 'paper3.pdf', 'paper4.pdf', 'paper5.pdf']",
            "order": 1
        },
        # Map over documents (each processed in parallel)
        {
            "step_id": "summarize_docs",
            "step_type": "result_aggregator",
            "step_name": "SummarizeDocument",
            "description": "Summarize one document",
            "prompt": "Summarize this document: {document}",
            "execution_mode": "map",
            "depends_on": ["list_documents"],
            "max_concurrency": 3,  # Process 3 at a time
            "order": 2
        },
        # Collect summaries
        {
            "step_id": "collect_summaries",
            "step_type": "result_aggregator",
            "step_name": "CollectSummaries",
            "description": "Combine all summaries",
            "prompt": "Create a comprehensive report from these summaries",
            "is_join_node": True,
            "joins": ["summarize_docs"],
            "join_strategy": "list",
            "depends_on": ["summarize_docs"],
            "order": 3
        }
    ],
    reasoning="Process documents in parallel with concurrency limit",
    auto_start=True
)
```

### Example 3: Nested Parallelism

```python
# Complex workflow with multiple parallel stages

await create_graph(
    query="Comprehensive AI market analysis",
    graph_name="Multi-Stage Market Analysis",
    steps=[
        # Stage 1: Parallel data collection
        {
            "step_id": "collect_news",
            "step_type": "web_search",
            "parallel_group": "data_collection",
            "order": 1
        },
        {
            "step_id": "collect_papers",
            "step_type": "web_search",
            "parallel_group": "data_collection",
            "order": 1
        },
        {
            "step_id": "collect_trends",
            "step_type": "web_search",
            "parallel_group": "data_collection",
            "order": 1
        },
        # Join stage 1
        {
            "step_id": "join_data",
            "is_join_node": True,
            "joins": ["data_collection"],
            "depends_on": ["collect_news", "collect_papers", "collect_trends"],
            "order": 2
        },
        # Stage 2: Parallel analysis
        {
            "step_id": "analyze_sentiment",
            "step_type": "code_execution",
            "parallel_group": "analysis",
            "depends_on": ["join_data"],
            "order": 3
        },
        {
            "step_id": "analyze_trends",
            "step_type": "code_execution",
            "parallel_group": "analysis",
            "depends_on": ["join_data"],
            "order": 3
        },
        {
            "step_id": "generate_charts",
            "step_type": "image_generation",
            "parallel_group": "analysis",
            "depends_on": ["join_data"],
            "order": 3
        },
        # Final aggregation
        {
            "step_id": "final_report",
            "step_type": "result_aggregator",
            "is_join_node": True,
            "joins": ["analysis"],
            "depends_on": ["analyze_sentiment", "analyze_trends", "generate_charts"],
            "order": 4
        }
    ],
    reasoning="Multi-stage parallel processing for comprehensive analysis",
    auto_start=True
)
```

---

## Performance Considerations

### 1. Concurrency Limits

```python
# Set reasonable concurrency limits to avoid overwhelming the system

{
    "step_id": "process_items",
    "execution_mode": "map",
    "max_concurrency": 5,  # Process 5 items at a time, not all 100
}
```

### 2. Resource Management

```python
# DBOS configuration for parallel execution

QUEUE_CONFIG = {
    'graph_execution_queue': {
        'concurrency': 10,  # Max 10 graphs running
        'parallel_step_concurrency': 50,  # Max 50 parallel steps across all graphs
        'rate_limit': 100,  # Max 100 step executions per minute
    }
}
```

### 3. Monitoring

```python
# Track parallel execution metrics

PARALLEL_STEPS_ACTIVE = Gauge('parallel_steps_active', 'Active parallel step executions')
PARALLEL_GROUP_DURATION = Histogram('parallel_group_duration_seconds', 'Parallel group execution time')
PARALLEL_SPEEDUP = Gauge('parallel_speedup_ratio', 'Speedup from parallelization')
```

---

## Migration Guide

### Phase 1: Add Database Schema (Week 1)

```bash
# Run migration
psql -d copilotkit_db -f database/migrations/004_add_parallel_execution.sql

# Verify
psql -d copilotkit_db -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'parallel_executions';"
```

### Phase 2: Implement Parallel Executor (Week 2-3)

- [ ] Implement `execute_parallel_group_workflow`
- [ ] Implement `execute_broadcast_steps`
- [ ] Implement `execute_mapped_steps_workflow`
- [ ] Implement join/reduce logic
- [ ] Add parallel execution tracking

### Phase 3: Frontend Visualization (Week 4)

- [ ] Build Gantt chart timeline component
- [ ] Show parallel execution in real-time
- [ ] Visual indicators for parallel groups
- [ ] Performance metrics display

### Phase 4: Agent Tools Enhancement (Week 5)

- [ ] Extend `create_graph` tool with parallel options
- [ ] Add validation for parallel structures
- [ ] Add examples and documentation

### Phase 5: Testing & Optimization (Week 6)

- [ ] Test broadcast pattern
- [ ] Test map pattern
- [ ] Test nested parallelism
- [ ] Load test with high concurrency
- [ ] Optimize resource usage

---

## Summary

This enhancement adds powerful parallel execution capabilities to the DBOS graph system:

✅ **Broadcasting** - Same input to multiple steps  
✅ **Mapping** - Fan out items to parallel executions  
✅ **Join/Reduce** - Aggregate parallel results  
✅ **Nested Parallelism** - Complex multi-stage workflows  
✅ **Concurrency Control** - Limit parallel executions  
✅ **Visual Timeline** - Gantt chart visualization  
✅ **Performance Tracking** - Monitor speedup and efficiency  

**Expected Performance Improvements:**
- **20-50% faster** for workflows with independent steps
- **Up to 80% faster** for data processing with map patterns
- **Better resource utilization** with controlled concurrency

**Next Steps:**
1. Review this enhancement document
2. Prioritize features (start with broadcasting)
3. Implement in phases (database → backend → frontend)
4. Test with real workflows
5. Monitor and optimize

---

**Document Version**: 1.0  
**Last Updated**: December 21, 2024  
**Status**: Ready for Implementation
