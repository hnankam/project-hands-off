# DBOS Graph Implementation - Part 2

## Continuation of Implementation Guide

This document continues from DBOS_GRAPH_IMPLEMENTATION.md

---

## API Endpoints

### FastAPI Routes Implementation

```python
# File: copilotkit-pydantic/api/graph_endpoints.py

"""FastAPI endpoints for graph management."""

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Literal
from datetime import datetime
import uuid

from config import logger
from middleware.auth import get_current_user
from services.graph_manager import (
    create_graph_draft,
    start_graph_execution,
    pause_graph_execution,
    resume_graph_execution,
    update_graph_plan,
    schedule_graph_execution,
    get_graph_status,
    get_session_graphs,
    cancel_graph_execution
)
from tools.multi_agent_graph.durable_graph import (
    send_confirmation_event,
    send_plan_update_event
)

router = APIRouter(prefix="/api/graphs", tags=["graphs"])

# ============================================================================
# Request/Response Models
# ============================================================================

class GraphStepModel(BaseModel):
    """Step definition model."""
    step_id: str
    step_type: Literal["web_search", "image_generation", "code_execution", "result_aggregator", "confirmation"]
    step_name: str
    description: str
    prompt: str
    enabled: bool = True
    order: int
    estimated_duration: int = 30
    depends_on: List[str] = []
    parameters: Dict = {}
    status: str = "pending"


class CreateGraphRequest(BaseModel):
    """Request to create a new graph."""
    query: str
    graph_name: str
    session_id: str
    steps: List[GraphStepModel]
    agent_reasoning: Optional[str] = None
    auto_start: bool = False


class UpdatePlanRequest(BaseModel):
    """Request to update graph plan."""
    steps: List[GraphStepModel]
    reasoning: str = "User edit"


class ScheduleGraphRequest(BaseModel):
    """Request to schedule graph execution."""
    scheduled_for: str  # ISO datetime
    schedule_type: Literal["once", "recurring"] = "once"
    cron_expression: Optional[str] = None
    timezone: str = "UTC"


class GraphResponse(BaseModel):
    """Graph status response."""
    graph_id: str
    graph_name: str
    status: str
    current_node: Optional[str] = None
    planned_steps: List[Dict]
    result: Optional[str] = None
    error: Optional[str] = None
    created_at: str
    updated_at: str


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/create")
async def create_graph(
    request: CreateGraphRequest,
    user_id: str = Depends(get_current_user)
):
    """
    Create a new graph execution plan.
    
    Creates a graph in 'draft' status that can be reviewed/edited
    before execution starts.
    """
    try:
        graph_id = f"graph_{uuid.uuid4().hex[:12]}"
        
        result = await create_graph_draft(
            graph_id=graph_id,
            session_id=request.session_id,
            user_id=user_id,
            query=request.query,
            graph_name=request.graph_name,
            steps=[step.model_dump() for step in request.steps],
            agent_reasoning=request.agent_reasoning,
            auto_start=request.auto_start
        )
        
        return result
        
    except Exception as e:
        logger.exception("Failed to create graph")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{graph_id}/start")
async def start_graph(
    graph_id: str,
    priority: int = Query(default=0, ge=0, le=10),
    user_id: str = Depends(get_current_user)
):
    """
    Start execution of a draft or paused graph.
    
    Args:
        graph_id: The graph to start
        priority: Execution priority (0-10, higher = sooner)
    """
    try:
        result = await start_graph_execution(
            graph_id=graph_id,
            user_id=user_id,
            priority=priority
        )
        
        return result
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Failed to start graph {graph_id}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{graph_id}/pause")
async def pause_graph(
    graph_id: str,
    user_id: str = Depends(get_current_user)
):
    """
    Pause a running graph.
    
    The graph will pause after the current step completes.
    User can then edit the plan and resume.
    """
    try:
        result = await pause_graph_execution(
            graph_id=graph_id,
            user_id=user_id,
            reason="user_request"
        )
        
        return result
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Failed to pause graph {graph_id}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{graph_id}/resume")
async def resume_graph(
    graph_id: str,
    user_id: str = Depends(get_current_user)
):
    """
    Resume a paused graph.
    
    If the plan was edited during pause, the graph will continue
    with the updated plan.
    """
    try:
        result = await resume_graph_execution(
            graph_id=graph_id,
            user_id=user_id
        )
        
        return result
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Failed to resume graph {graph_id}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{graph_id}/plan")
async def update_plan(
    graph_id: str,
    request: UpdatePlanRequest,
    user_id: str = Depends(get_current_user)
):
    """
    Update the execution plan of a graph.
    
    Can be done on draft or paused graphs. If the graph is running,
    it will be paused first.
    """
    try:
        result = await update_graph_plan(
            graph_id=graph_id,
            user_id=user_id,
            new_steps=[step.model_dump() for step in request.steps],
            reasoning=request.reasoning
        )
        
        # Notify DBOS workflow
        await send_plan_update_event(graph_id)
        
        return result
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Failed to update plan for graph {graph_id}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{graph_id}/confirm")
async def confirm_action(
    graph_id: str,
    user_id: str = Depends(get_current_user)
):
    """
    Confirm a pending action in the graph.
    
    The graph will resume execution after confirmation.
    """
    try:
        # Verify ownership
        status = await get_graph_status(graph_id, user_id)
        
        if not status:
            raise HTTPException(status_code=404, detail="Graph not found")
        
        if status['status'] != 'waiting_confirmation':
            raise HTTPException(
                status_code=400,
                detail=f"Graph is not waiting for confirmation (status: {status['status']})"
            )
        
        # Send confirmation event to DBOS
        await send_confirmation_event(graph_id, confirmed=True)
        
        return {
            "status": "confirmed",
            "message": "Graph will continue execution"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to confirm action for graph {graph_id}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{graph_id}/deny")
async def deny_action(
    graph_id: str,
    user_id: str = Depends(get_current_user)
):
    """
    Deny a pending action in the graph.
    
    The graph will be cancelled after denial.
    """
    try:
        # Verify ownership
        status = await get_graph_status(graph_id, user_id)
        
        if not status:
            raise HTTPException(status_code=404, detail="Graph not found")
        
        if status['status'] != 'waiting_confirmation':
            raise HTTPException(
                status_code=400,
                detail=f"Graph is not waiting for confirmation (status: {status['status']})"
            )
        
        # Send denial event to DBOS
        await send_confirmation_event(graph_id, confirmed=False)
        
        return {
            "status": "denied",
            "message": "Graph will be cancelled"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to deny action for graph {graph_id}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{graph_id}/schedule")
async def schedule_graph(
    graph_id: str,
    request: ScheduleGraphRequest,
    user_id: str = Depends(get_current_user)
):
    """
    Schedule a graph for future execution.
    
    Supports one-time and recurring schedules.
    """
    try:
        scheduled_for = datetime.fromisoformat(request.scheduled_for.replace('Z', '+00:00'))
        
        result = await schedule_graph_execution(
            graph_id=graph_id,
            user_id=user_id,
            scheduled_for=scheduled_for,
            schedule_type=request.schedule_type,
            cron_expression=request.cron_expression,
            timezone=request.timezone
        )
        
        return result
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Failed to schedule graph {graph_id}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{graph_id}")
async def cancel_graph(
    graph_id: str,
    user_id: str = Depends(get_current_user)
):
    """
    Cancel a running or scheduled graph.
    
    The graph will be stopped and marked as cancelled.
    """
    try:
        result = await cancel_graph_execution(
            graph_id=graph_id,
            user_id=user_id
        )
        
        return result
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Failed to cancel graph {graph_id}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{graph_id}/status")
async def get_status(
    graph_id: str,
    user_id: str = Depends(get_current_user)
):
    """
    Get detailed status of a graph.
    
    Returns current state, progress, results, and metadata.
    """
    try:
        status = await get_graph_status(graph_id, user_id)
        
        if not status:
            raise HTTPException(status_code=404, detail="Graph not found")
        
        return status
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to get status for graph {graph_id}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/session/{session_id}")
async def get_graphs_for_session(
    session_id: str,
    user_id: str = Depends(get_current_user),
    status_filter: Optional[str] = Query(None),
    limit: int = Query(default=50, le=100)
):
    """
    Get all graphs for a session.
    
    Args:
        session_id: Session ID
        status_filter: Optional status filter
        limit: Maximum number of results
    """
    try:
        graphs = await get_session_graphs(
            session_id=session_id,
            user_id=user_id,
            status_filter=status_filter,
            limit=limit
        )
        
        return {"graphs": graphs}
        
    except Exception as e:
        logger.exception(f"Failed to get graphs for session {session_id}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{graph_id}/history")
async def get_plan_history(
    graph_id: str,
    user_id: str = Depends(get_current_user)
):
    """
    Get plan modification history for a graph.
    
    Returns audit trail of all changes made to the plan.
    """
    try:
        from database.postgres_pool import get_pool
        
        # Verify ownership
        status = await get_graph_status(graph_id, user_id)
        if not status:
            raise HTTPException(status_code=404, detail="Graph not found")
        
        pool = await get_pool()
        async with pool.connection() as conn:
            result = await conn.execute(
                """
                SELECT history_id, modified_by, modified_by_type, modification_type,
                       changes, reasoning, created_at
                FROM graph_plan_history
                WHERE graph_id = $1
                ORDER BY created_at DESC
                """,
                graph_id
            )
            rows = await result.fetchall()
            
            history = []
            for row in rows:
                history.append({
                    "history_id": str(row[0]),
                    "modified_by": row[1],
                    "modified_by_type": row[2],
                    "modification_type": row[3],
                    "changes": row[4],
                    "reasoning": row[5],
                    "created_at": row[6].isoformat()
                })
            
            return {"history": history}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to get history for graph {graph_id}")
        raise HTTPException(status_code=500, detail=str(e))
```

---

## Frontend Components

### Enhanced GraphsPanel with Full Editing

```typescript
// File: pages/side-panel/src/components/panels/GraphsPanel.tsx

import React, { useState, useCallback, useEffect } from 'react';
import { cn } from '@extension/ui';
import { GraphStateCard } from '../graph-state';
import { GraphStepEditor } from '../graph-state/GraphStepEditor';
import { ScheduleDialog } from '../graph-state/ScheduleDialog';
import { ConfirmationDialog } from '../graph-state/ConfirmationDialog';

interface GraphsPanelProps {
  isLight: boolean;
  isOpen: boolean;
  onClose: () => void;
  graphs?: Record<string, any>;
  sessionId?: string;
  onWidthChange?: (width: number) => void;
}

const MIN_PANEL_WIDTH = 300;
const MAX_PANEL_WIDTH = 1000;
const DEFAULT_PANEL_WIDTH = 450;

export const GraphsPanel: React.FC<GraphsPanelProps> = ({
  isLight,
  isOpen,
  onClose,
  graphs: initialGraphs,
  sessionId,
  onWidthChange
}) => {
  const [width, setWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [graphs, setGraphs] = useState(initialGraphs || {});
  const [editingGraphId, setEditingGraphId] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [schedulingGraphId, setSchedulingGraphId] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<Record<string, boolean>>({});
  
  // Update graphs when prop changes
  useEffect(() => {
    if (initialGraphs) {
      setGraphs(initialGraphs);
    }
  }, [initialGraphs]);
  
  // Polling for status updates
  useEffect(() => {
    if (!sessionId || !isOpen) return;
    
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/graphs/session/${sessionId}`);
        if (response.ok) {
          const data = await response.json();
          setGraphs(data.graphs || {});
        }
      } catch (error) {
        console.error('Failed to poll graph status:', error);
      }
    }, 2000); // Poll every 2 seconds
    
    return () => clearInterval(pollInterval);
  }, [sessionId, isOpen]);
  
  // ========================================================================
  // Graph Actions
  // ========================================================================
  
  const handleStart = useCallback(async (graphId: string) => {
    setActionInProgress(prev => ({ ...prev, [graphId]: true }));
    
    try {
      const response = await fetch(`/api/graphs/${graphId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to start graph');
      }
      
      // Refresh immediately
      const statusResponse = await fetch(`/api/graphs/${graphId}/status`);
      if (statusResponse.ok) {
        const status = await statusResponse.json();
        setGraphs(prev => ({ ...prev, [graphId]: status }));
      }
      
    } catch (error: any) {
      console.error('Failed to start graph:', error);
      alert(error.message || 'Failed to start graph');
    } finally {
      setActionInProgress(prev => ({ ...prev, [graphId]: false }));
    }
  }, []);
  
  const handlePause = useCallback(async (graphId: string) => {
    setActionInProgress(prev => ({ ...prev, [graphId]: true }));
    
    try {
      const response = await fetch(`/api/graphs/${graphId}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error('Failed to pause graph');
      }
      
    } catch (error) {
      console.error('Failed to pause graph:', error);
      alert('Failed to pause graph');
    } finally {
      setActionInProgress(prev => ({ ...prev, [graphId]: false }));
    }
  }, []);
  
  const handleResume = useCallback(async (graphId: string) => {
    setActionInProgress(prev => ({ ...prev, [graphId]: true }));
    
    try {
      const response = await fetch(`/api/graphs/${graphId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error('Failed to resume graph');
      }
      
    } catch (error) {
      console.error('Failed to resume graph:', error);
      alert('Failed to resume graph');
    } finally {
      setActionInProgress(prev => ({ ...prev, [graphId]: false }));
    }
  }, []);
  
  const handleCancel = useCallback(async (graphId: string) => {
    if (!confirm('Are you sure you want to cancel this graph?')) {
      return;
    }
    
    setActionInProgress(prev => ({ ...prev, [graphId]: true }));
    
    try {
      const response = await fetch(`/api/graphs/${graphId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to cancel graph');
      }
      
      // Remove from list
      setGraphs(prev => {
        const updated = { ...prev };
        delete updated[graphId];
        return updated;
      });
      
    } catch (error) {
      console.error('Failed to cancel graph:', error);
      alert('Failed to cancel graph');
    } finally {
      setActionInProgress(prev => ({ ...prev, [graphId]: false }));
    }
  }, []);
  
  // ========================================================================
  // Plan Editing
  // ========================================================================
  
  const handleEditPlan = useCallback((graphId: string, currentPlan: any) => {
    setEditingGraphId(graphId);
    setEditingPlan(JSON.parse(JSON.stringify(currentPlan))); // Deep copy
  }, []);
  
  const handleSavePlan = useCallback(async (graphId: string, newPlan: any) => {
    setActionInProgress(prev => ({ ...prev, [graphId]: true }));
    
    try {
      const response = await fetch(`/api/graphs/${graphId}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steps: newPlan.steps,
          reasoning: 'User edited plan'
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update plan');
      }
      
      // Update local state
      setGraphs(prev => ({
        ...prev,
        [graphId]: {
          ...prev[graphId],
          planned_steps: newPlan.steps,
          user_modified: true
        }
      }));
      
      // Close editor
      setEditingGraphId(null);
      setEditingPlan(null);
      
    } catch (error) {
      console.error('Failed to save plan:', error);
      alert('Failed to save plan changes');
    } finally {
      setActionInProgress(prev => ({ ...prev, [graphId]: false }));
    }
  }, []);
  
  const handleCancelEdit = useCallback(() => {
    setEditingGraphId(null);
    setEditingPlan(null);
  }, []);
  
  // ========================================================================
  // Confirmation
  // ========================================================================
  
  const handleConfirm = useCallback(async (graphId: string) => {
    setActionInProgress(prev => ({ ...prev, [graphId]: true }));
    
    try {
      const response = await fetch(`/api/graphs/${graphId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error('Failed to confirm action');
      }
      
      console.log('Action confirmed, graph will continue');
      
    } catch (error) {
      console.error('Failed to confirm:', error);
      alert('Failed to confirm action');
    } finally {
      setActionInProgress(prev => ({ ...prev, [graphId]: false }));
    }
  }, []);
  
  const handleDeny = useCallback(async (graphId: string) => {
    setActionInProgress(prev => ({ ...prev, [graphId]: true }));
    
    try {
      const response = await fetch(`/api/graphs/${graphId}/deny`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error('Failed to deny action');
      }
      
      console.log('Action denied, graph will be cancelled');
      
    } catch (error) {
      console.error('Failed to deny:', error);
      alert('Failed to deny action');
    } finally {
      setActionInProgress(prev => ({ ...prev, [graphId]: false }));
    }
  }, []);
  
  // ========================================================================
  // Scheduling
  // ========================================================================
  
  const handleSchedule = useCallback(async (
    graphId: string,
    scheduledFor: Date,
    scheduleType: 'once' | 'recurring',
    cronExpression?: string
  ) => {
    setActionInProgress(prev => ({ ...prev, [graphId]: true }));
    
    try {
      const response = await fetch(`/api/graphs/${graphId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_for: scheduledFor.toISOString(),
          schedule_type: scheduleType,
          cron_expression: cronExpression
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to schedule graph');
      }
      
      setSchedulingGraphId(null);
      
    } catch (error) {
      console.error('Failed to schedule graph:', error);
      alert('Failed to schedule graph');
    } finally {
      setActionInProgress(prev => ({ ...prev, [graphId]: false }));
    }
  }, []);
  
  // ========================================================================
  // Rendering
  // ========================================================================
  
  const graphEntries = Object.entries(graphs);
  const sortedEntries = graphEntries.sort((a, b) => {
    const aTime = new Date(a[1].updated_at || a[1].created_at).getTime();
    const bTime = new Date(b[1].updated_at || b[1].created_at).getTime();
    return bTime - aTime; // Most recent first
  });
  
  if (!isOpen) return null;
  
  return (
    <div
      className={cn(
        'absolute right-0 top-0 bottom-0 z-40 border-l flex flex-col',
        isLight ? 'bg-white border-gray-200' : 'bg-[#0D1117] border-gray-700'
      )}
      style={{
        width: `${width}px`,
        transition: isResizing ? 'none' : 'width 0.2s ease-in-out'
      }}
    >
      {/* Header - same as before */}
      <div className={cn(
        'flex items-center justify-between px-3 py-2 border-b',
        isLight ? 'bg-gray-50 border-gray-200' : 'bg-[#151C24] border-gray-700'
      )}>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          <h2 className="text-sm font-medium">Session Graphs</h2>
          {graphEntries.length > 0 && (
            <span className="text-xs text-gray-500">({graphEntries.length})</span>
          )}
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {sortedEntries.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <p className="text-sm text-gray-500">No graphs in this session yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Graphs will appear here as they're created during your conversation.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedEntries.map(([graphId, graph]) => {
              const isDraft = graph.status === 'draft';
              const isPaused = graph.status === 'paused';
              const isRunning = graph.status === 'running';
              const isScheduled = graph.status === 'scheduled';
              const isWaitingConfirmation = graph.status === 'waiting_confirmation';
              const isEditing = editingGraphId === graphId;
              const inProgress = actionInProgress[graphId] || false;
              
              return (
                <div
                  key={graphId}
                  className={cn(
                    'rounded-lg border p-3',
                    isLight ? 'bg-white border-gray-200' : 'bg-[#161B22] border-gray-700'
                  )}
                >
                  {/* Graph Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm truncate">{graph.graph_name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <StatusBadge status={graph.status} isLight={isLight} />
                        {graph.user_modified && (
                          <span className="text-xs text-blue-600 dark:text-blue-400">
                            ✏️ Modified
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex gap-1 ml-2">
                      {(isDraft || isPaused) && !isEditing && (
                        <>
                          <button
                            onClick={() => handleEditPlan(graphId, graph.planned_steps)}
                            disabled={inProgress}
                            className="btn-icon-sm"
                            title="Edit plan"
                          >
                            ✏️
                          </button>
                          
                          {isDraft && (
                            <button
                              onClick={() => setSchedulingGraphId(graphId)}
                              disabled={inProgress}
                              className="btn-icon-sm"
                              title="Schedule"
                            >
                              ⏰
                            </button>
                          )}
                          
                          <button
                            onClick={() => isPaused ? handleResume(graphId) : handleStart(graphId)}
                            disabled={inProgress}
                            className="btn-primary-sm"
                          >
                            {isPaused ? '▶️ Resume' : '▶️ Start'}
                          </button>
                        </>
                      )}
                      
                      {isRunning && (
                        <button
                          onClick={() => handlePause(graphId)}
                          disabled={inProgress}
                          className="btn-secondary-sm"
                        >
                          ⏸️ Pause
                        </button>
                      )}
                      
                      {(isDraft || isPaused || isScheduled) && (
                        <button
                          onClick={() => handleCancel(graphId)}
                          disabled={inProgress}
                          className="btn-icon-sm text-red-600"
                          title="Cancel"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Agent Reasoning */}
                  {graph.agent_reasoning && !isEditing && (
                    <div className="text-xs text-gray-600 dark:text-gray-400 mb-2 p-2 bg-gray-50 dark:bg-gray-800 rounded">
                      <strong>Agent's plan:</strong> {graph.agent_reasoning}
                    </div>
                  )}
                  
                  {/* Editing Mode */}
                  {isEditing ? (
                    <GraphStepEditor
                      steps={editingPlan}
                      onSave={(newPlan) => handleSavePlan(graphId, newPlan)}
                      onCancel={handleCancelEdit}
                      isLight={isLight}
                    />
                  ) : (
                    <>
                      {/* Steps List */}
                      <StepsList
                        steps={graph.planned_steps || []}
                        currentNode={graph.current_node}
                        isLight={isLight}
                      />
                      
                      {/* Schedule Info */}
                      {isScheduled && graph.scheduled_for && (
                        <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded">
                          <div className="flex items-center gap-2 text-sm">
                            <span>⏰</span>
                            <span>
                              Scheduled: {new Date(graph.scheduled_for).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {/* Confirmation Dialog */}
                      {isWaitingConfirmation && graph.pending_confirmation && (
                        <ConfirmationDialog
                          graphId={graphId}
                          actionDescription={graph.pending_confirmation.action_description}
                          onConfirm={handleConfirm}
                          onDeny={handleDeny}
                          isLight={isLight}
                          disabled={inProgress}
                        />
                      )}
                      
                      {/* Result/Error */}
                      {graph.result && (
                        <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded text-sm">
                          <strong>Result:</strong>
                          <div className="mt-1 text-gray-700 dark:text-gray-300">
                            {graph.result.substring(0, 200)}
                            {graph.result.length > 200 && '...'}
                          </div>
                        </div>
                      )}
                      
                      {graph.error && (
                        <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm">
                          <strong className="text-red-600">Error:</strong>
                          <div className="mt-1 text-gray-700 dark:text-gray-300">
                            {graph.error}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Schedule Dialog */}
      {schedulingGraphId && (
        <ScheduleDialog
          graphId={schedulingGraphId}
          onSchedule={handleSchedule}
          onClose={() => setSchedulingGraphId(null)}
          isLight={isLight}
        />
      )}
    </div>
  );
};

// Helper Components
const StatusBadge: React.FC<{ status: string; isLight: boolean }> = ({ status, isLight }) => {
  const colors = {
    draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    queued: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
    running: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
    paused: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400',
    waiting_confirmation: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400',
    scheduled: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
    cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  };
  
  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', colors[status] || colors.draft)}>
      {status.replace('_', ' ')}
    </span>
  );
};

const StepsList: React.FC<{ steps: any[]; currentNode?: string; isLight: boolean }> = ({
  steps,
  currentNode,
  isLight
}) => {
  if (!steps || steps.length === 0) return null;
  
  return (
    <div className="space-y-1">
      {steps.map((step, idx) => {
        const isCurrent = step.step_name === currentNode;
        const isCompleted = step.status === 'completed';
        const isError = step.status === 'error';
        const isDisabled = !step.enabled;
        
        return (
          <div
            key={step.step_id || idx}
            className={cn(
              'flex items-center gap-2 p-2 rounded text-sm',
              isCurrent && 'bg-blue-50 dark:bg-blue-900/20',
              isCompleted && !isCurrent && 'opacity-60',
              isDisabled && 'opacity-40',
              isError && 'bg-red-50 dark:bg-red-900/20'
            )}
          >
            <span className="font-mono text-xs text-gray-500">{step.order}</span>
            <span className="text-xs">{getStepIcon(step.status)}</span>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{step.step_name}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                {step.description}
              </div>
            </div>
            {isDisabled && <span className="text-xs text-gray-400">skipped</span>}
          </div>
        );
      })}
    </div>
  );
};

function getStepIcon(status: string): string {
  const icons = {
    pending: '⏳',
    running: '▶️',
    completed: '✅',
    error: '❌',
    skipped: '⏭️',
  };
  return icons[status] || '⏳';
}
```

This document continues with Testing Strategy, Deployment Guide, and more sections. Would you like me to create a Part 3 with the remaining sections (Testing, Deployment, Monitoring, Security)?
