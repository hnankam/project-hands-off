/**
 * GraphStateCard Component
 *
 * Displays the execution state of a multi-agent graph with visual progress tracking.
 * Shows each step (WebSearch, ImageGeneration, etc.) with its status.
 * 
 * This is the main orchestrating component that composes:
 * - GraphDiagram: Shows the execution plan
 * - GraphStepItem: Renders individual steps with their details
 */

import type { FC } from 'react';
import React, { useState, useMemo, useEffect, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { useCopilotChat } from '../../hooks/copilotkit';
import { useCopilotAgent } from '../../hooks/copilotkit/useCopilotAgent';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { CustomMarkdownRenderer } from '../chat/CustomMarkdownRenderer';
import { 
  SpinningLoader, 
  CheckIcon, 
  ErrorIcon, 
  GraphIcon,
  WaitingIcon 
} from './icons';
import { GraphDiagram } from './GraphDiagram';
import { GraphStepItem } from './GraphStepItem';
import { InlineThinkingBlock } from './InlineThinkingBlock';
import { parseContentIntoSections } from './utils/thinking-parser';
import { formatCodeResultAsMarkdown, formatStepResultAsMarkdown } from './utils/format-helpers';
import { expandedStateCache, userClosedCache } from './utils/cache';
import type { GraphStateCardProps, GraphAgentState, UnifiedAgentState, GraphStep } from './types';

// Supported backend node types
const SUPPORTED_NODE_TYPES = [
  'WebSearch',
  'ImageGeneration',
  'CodeExecution',
  'ResultAggregator',
  'Confirmation',
] as const;

// Map CamelCase node names to backend action types (lowercase with underscores)
const NODE_TO_ACTION: Record<string, string> = {
  'WebSearch': 'web_search',
  'ImageGeneration': 'image_generation',
  'CodeExecution': 'code_execution',
  'ResultAggregator': 'result_aggregator',
  'Confirmation': 'confirmation',
};

export const GraphStateCard: FC<GraphStateCardProps> = ({ 
  state, 
  setState,
  isCollapsed = false, 
  sessionId, 
  instanceId 
}) => {
  const { isLight } = useStorage(themeStorage);
  const { sendMessage, isLoading: isChatLoading } = useCopilotChat();
  
  // Get current UnifiedAgentState if setState is provided
  const { state: currentAgentState } = useCopilotAgent<UnifiedAgentState>({
    agentId: 'dynamic_agent',
    initialState: { sessionId, plans: {}, graphs: {} },
  });
  
  // Generate a stable cache key from instanceId or fallback to sessionId + query
  const cacheKey = instanceId ?? `graph-${sessionId ?? 'default'}-${state.query?.slice(0, 50) ?? ''}`;
  
  // Initialize from cache if available
  const [isExpanded, setIsExpanded] = useState(() => {
    return expandedStateCache.get(cacheKey) ?? !isCollapsed;
  });
  
  // Initialize userClosed from cache
  const userClosedRef = useRef(userClosedCache.get(cacheKey) ?? false);
  
  // Delete graph modal state
  const [deleteGraphOpen, setDeleteGraphOpen] = useState(false);
  
  // Editing state
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [editNodeValue, setEditNodeValue] = useState('');
  const [editPromptValue, setEditPromptValue] = useState('');
  const editNodeRef = useRef<HTMLInputElement>(null);
  const editPromptRef = useRef<HTMLTextAreaElement>(null);
  
  // Adding state
  const [isAdding, setIsAdding] = useState(false);
  const [addNodeValue, setAddNodeValue] = useState('');
  const [addPromptValue, setAddPromptValue] = useState('');
  const addNodeRef = useRef<HTMLInputElement>(null);
  const addPromptRef = useRef<HTMLTextAreaElement>(null);
  
  // Drag & drop state
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  
  // Sync expanded state to cache whenever it changes
  useEffect(() => {
    expandedStateCache.set(cacheKey, isExpanded);
  }, [cacheKey, isExpanded]);
  
  // Keep newly created cards open unless user manually closes them
  useEffect(() => {
    const isRunning = state.status === 'running' || state.status === 'waiting' || 
      state.steps.some(s => s.status === 'in_progress' || s.status === 'waiting');
    if (isRunning && !userClosedRef.current) {
      setIsExpanded(true);
    }
  }, [state.status, state.steps]);

  // Render even with empty steps (graph created but not yet executed)
  const hasSteps = state?.steps && state.steps.length > 0;

  const toggleExpanded = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    // Track if user is closing a running or waiting card
    if (!newState && (state.status === 'running' || state.status === 'waiting' || 
        state.steps.some(s => s.status === 'in_progress' || s.status === 'waiting'))) {
      userClosedRef.current = true;
      userClosedCache.set(cacheKey, true);
    }
  };

  // Calculate progress - count steps by status
  const completedSteps = hasSteps ? state.steps.filter(s => s.status === 'completed').length : 0;
  const errorSteps = hasSteps ? state.steps.filter(s => s.status === 'error').length : 0;
  const inProgressSteps = hasSteps ? state.steps.filter(s => s.status === 'in_progress').length : 0;
  const pendingSteps = hasSteps ? state.steps.filter(s => s.status === 'pending').length : 0;
  const waitingSteps = hasSteps ? state.steps.filter(s => s.status === 'waiting').length : 0;
  const totalSteps = hasSteps ? state.steps.length : 0;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // Compute actual status - prefer backend state.status when available
  const computedStatus = useMemo(() => {
    // Prefer backend-provided status for 'waiting' and 'error' states
    if (state.status === 'waiting' || waitingSteps > 0) {
      return 'waiting';
    }
    if (state.status === 'error' || errorSteps > 0) {
      return 'error';
    }
    if (inProgressSteps > 0) {
      return 'running';
    }
    // Graph is done when no steps are pending, in_progress, or waiting
    if (pendingSteps === 0 && waitingSteps === 0 && totalSteps > 0) {
      return 'completed';
    }
    // Only show 'running' if execution has actually started (some steps completed or in progress)
    if (completedSteps > 0) {
      return 'running';
    }
    // If only pending steps exist and nothing has started, keep as pending
    if (pendingSteps > 0 && completedSteps === 0 && inProgressSteps === 0) {
      return 'pending';
    }
    // Fall back to backend status if available
    if (state.status && state.status !== 'pending') {
      return state.status;
    }
    return 'pending';
  }, [state.status, errorSteps, inProgressSteps, completedSteps, pendingSteps, waitingSteps, totalSteps]);

  // Status badge based on computed status
  const statusBadge = useMemo(() => {
    switch (computedStatus) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckIcon className="h-3 w-3" />
            Complete
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400">
            <SpinningLoader size="h-3 w-3" color="currentColor" />
            Running
          </span>
        );
      case 'waiting':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700/30 dark:text-gray-300">
            <WaitingIcon className="h-3 w-3" />
            Waiting
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            <ErrorIcon className="h-3 w-3" />
            Error
          </span>
        );
      default:
        return null;
    }
  }, [computedStatus]);

  // Get graph ID from state
  const graphId = state.graphId || instanceId;
  const graphName = state.name || 'Multi-Agent Graph';
  const steps = state.steps || [];
  
  // Helper function to update graph steps and call setState
  const updateGraphSteps = (newSteps: GraphStep[]) => {
    if (!setState || !graphId) {
      return;
    }
    
    // Get current UnifiedAgentState
    const agentState = currentAgentState || { sessionId, plans: {}, graphs: {} };
    const currentGraph = agentState.graphs?.[graphId];
    
    if (!currentGraph) {
      return;
    }
    
    // Update planned_steps based on the new step order
    // Convert CamelCase node names to backend action types (lowercase with underscores)
    const newPlannedSteps = newSteps
      .filter(step => step.status !== 'cancelled') // Exclude deleted steps
      .map(step => {
        // Convert node name (e.g., "WebSearch") to action type (e.g., "web_search")
        const actionType = NODE_TO_ACTION[step.node] || step.node.toLowerCase().replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
        return actionType;
      });
    
    // Update the graph with new steps and planned_steps
    const updatedGraph = {
      ...currentGraph,
      steps: newSteps,
      planned_steps: newPlannedSteps,
      updated_at: new Date().toISOString(),
    };
    
    const newState: UnifiedAgentState = {
      ...agentState,
      graphs: {
        ...(agentState.graphs || {}),
        [graphId]: updatedGraph,
      },
    };
    
    setState(newState);
  };
  
  // Focus handlers for editing
  useEffect(() => {
    if (editingStepIndex !== null) {
      // Focus dropdown when editing starts
      if (editNodeRef.current) {
        editNodeRef.current.focus();
      }
    }
  }, [editingStepIndex]);
  
  useEffect(() => {
    if (isAdding && addNodeRef.current) {
      addNodeRef.current.focus();
    }
  }, [isAdding]);
  
  // Handlers for inline editing
  const handleStartEdit = (stepIndex: number, currentNode: string, currentPrompt: string) => {
    setEditingStepIndex(stepIndex);
    setEditNodeValue(currentNode);
    setEditPromptValue(currentPrompt || '');
  };
  
  const handleEditSubmit = () => {
    if (editingStepIndex !== null && editNodeValue.trim() && setState && graphId) {
      const newSteps = [...steps];
      newSteps[editingStepIndex] = {
        ...newSteps[editingStepIndex],
        node: editNodeValue.trim(),
        prompt: editPromptValue.trim() || undefined,
      };
      updateGraphSteps(newSteps);
    }
    setEditingStepIndex(null);
    setEditNodeValue('');
    setEditPromptValue('');
  };
  
  const handleEditCancel = () => {
    setEditingStepIndex(null);
    setEditNodeValue('');
    setEditPromptValue('');
  };
  
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleEditCancel();
    }
    // Removed Ctrl/Cmd+Enter shortcut - use Save button instead
  };
  
  // Handlers for adding a new step
  const handleStartAdd = () => {
    setIsExpanded(true);
    setIsAdding(true);
    setAddNodeValue('');
    setAddPromptValue('');
  };
  
  const handleAddSubmit = () => {
    if (setState && addNodeValue.trim() && graphId) {
      const newStep: GraphStep = {
        node: addNodeValue.trim(),
        status: 'pending',
        result: '',
        prompt: addPromptValue.trim() || undefined,
        timestamp: new Date().toISOString(),
      };
      const newSteps = [...steps, newStep];
      updateGraphSteps(newSteps);
      setIsAdding(false);
      setAddNodeValue('');
      setAddPromptValue('');
    } else if (!addNodeValue.trim()) {
      // Cancel if no node type selected
      setIsAdding(false);
      setAddNodeValue('');
      setAddPromptValue('');
    }
  };
  
  const handleAddCancel = () => {
    setIsAdding(false);
    setAddNodeValue('');
    setAddPromptValue('');
  };
  
  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleAddCancel();
    }
    // Removed Ctrl/Cmd+Enter shortcut - use Add button instead
  };
  
  // Handlers for reordering steps
  const handleMoveStepUp = (index: number) => {
    if (!setState) return;
    if (index <= 0 || index >= steps.length) return;
    const newSteps = [...steps];
    const temp = newSteps[index - 1];
    newSteps[index - 1] = newSteps[index];
    newSteps[index] = temp;
    updateGraphSteps(newSteps);
  };
  
  const handleMoveStepDown = (index: number) => {
    if (!setState) return;
    if (index < 0 || index >= steps.length - 1) return;
    const newSteps = [...steps];
    const temp = newSteps[index + 1];
    newSteps[index + 1] = newSteps[index];
    newSteps[index] = temp;
    updateGraphSteps(newSteps);
  };
  
  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggingIndex(index);
    setDragOverIndex(null);
    try {
      e.dataTransfer.setData('text/plain', String(index));
    } catch {}
    e.dataTransfer.effectAllowed = 'move';
  };
  
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragOverIndex !== index) setDragOverIndex(index);
    e.dataTransfer.dropEffect = 'move';
  };
  
  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (!setState) return;
    let sourceIndex = draggingIndex;
    if (sourceIndex === null) {
      const payload = e.dataTransfer.getData('text/plain');
      const parsed = Number.parseInt(payload, 10);
      if (!Number.isNaN(parsed)) sourceIndex = parsed;
    }
    if (sourceIndex === null || sourceIndex === index) {
      setDraggingIndex(null);
      setDragOverIndex(null);
      return;
    }
    const newSteps = [...steps];
    const [moved] = newSteps.splice(sourceIndex, 1);
    let targetIndex = index;
    if (sourceIndex < index) targetIndex = index - 1;
    newSteps.splice(targetIndex, 0, moved);
    updateGraphSteps(newSteps);
    setDraggingIndex(null);
    setDragOverIndex(null);
  };
  
  const handleDragEnd = () => {
    setDraggingIndex(null);
    setDragOverIndex(null);
  };
  
  // Handlers for graph actions
  const handleAddStep = () => {
    if (setState) {
      handleStartAdd();
    } else if (instanceId) {
      setIsExpanded(true);
      // Fallback: use sendMessage
      sendMessage({ 
        role: 'user', 
        content: `Add an execution step to graph ${instanceId}. Please use the appropriate tool to update the graph's planned sequence.` 
      } as any).catch(() => {
        // Silently fail
      });
    }
  };

  const handleRunGraph = async () => {
    if (!instanceId) {
      return;
    }
    const graphName = state.name || 'Multi-Agent Graph';
    try {
      await sendMessage({ 
        id: crypto.randomUUID(),
        role: 'user' as const,
        content: `Run graph \`@[Graph]${graphName}\``
      } as any);
    } catch (e) {
      // Silently handle errors
    }
  };

  const handleConfirmAction = async (confirmed: boolean) => {
    if (!instanceId) {
      return;
    }
    const graphName = state.name || 'Multi-Agent Graph';
    try {
      // Send message with confirmation result
      const confirmationResult = JSON.stringify({ confirmed });
      await sendMessage({ 
        id: crypto.randomUUID(),
        role: 'user' as const,
        content: `Run graph \`@[Graph]${graphName}\` with confirmation result: ${confirmationResult}`
      } as any);
    } catch (e) {
      // Silently handle errors
    }
  };

  const handleOpenDeleteGraph = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDeleteGraphOpen(true);
  };

  const handleConfirmDeleteGraph = () => {
    if (!instanceId) return;
    setDeleteGraphOpen(false);
    sendMessage({ 
      role: 'user', 
      content: `Delete graph ${instanceId}` 
    } as any).catch(() => {
      // Silently fail
    });
  };

  const handleCancelDeleteGraph = () => {
    setDeleteGraphOpen(false);
  };

  // Close modal on Escape
  useEffect(() => {
    if (!deleteGraphOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDeleteGraphOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [deleteGraphOpen]);

  // Check if graph can be run (has pending steps and not currently running)
  const canRunGraph = (pendingSteps > 0 || computedStatus === 'pending' || computedStatus === 'error') && !isChatLoading && computedStatus !== 'running';

  // Pre-render delete modal so it can be shown from both collapsed and expanded views
  const deleteModal = deleteGraphOpen
    ? createPortal(
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[10000] backdrop-blur-sm"
            onClick={handleCancelDeleteGraph}
          />
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            <div
              className={`${
                isLight ? 'bg-gray-50 border border-gray-200' : 'bg-[#151C24] border border-gray-700'
              } w-full max-w-sm rounded-lg shadow-xl`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`flex items-center justify-between px-3 py-2 border-b ${isLight ? 'border-gray-200' : 'border-gray-700'}`}>
                <h2 className={`text-sm font-semibold ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>Delete Graph</h2>
                <button
                  type="button"
                  onClick={handleCancelDeleteGraph}
                  className={`${isLight ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'} p-0.5 rounded-md transition-colors`}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="px-3 py-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className={`${isLight ? 'bg-red-100' : 'bg-red-900/30'} flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center`}>
                    <svg className={`${isLight ? 'text-red-600' : 'text-red-400'} w-3.5 h-3.5`} fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className={`${isLight ? 'text-gray-900' : 'text-gray-100'} text-sm font-medium`}>
                      Permanently delete graph?
                    </p>
                    <p className={`${isLight ? 'text-gray-600' : 'text-gray-400'} text-xs mt-1`}>
                      This will remove the graph and its execution history from the chat UI and cannot be recovered.
                    </p>
                    {computedStatus !== 'completed' && (
                      <p className={`${isLight ? 'text-red-600' : 'text-red-400'} text-xs mt-2`}>
                        This graph is not completed. This action cannot be undone.
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className={`flex items-center justify-end gap-2 px-3 py-2 border-t ${isLight ? 'border-gray-200' : 'border-gray-700'}`}>
                <button
                  type="button"
                  onClick={handleCancelDeleteGraph}
                  className={`${isLight ? 'bg-gray-200 text-gray-900 hover:bg-gray-300' : 'bg-gray-700 text-gray-100 hover:bg-gray-600'} px-3 py-1.5 text-xs font-medium rounded-md transition-colors`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteGraph}
                  className={`bg-red-600 text-white hover:bg-red-700 px-3 py-1.5 text-xs font-medium rounded-md transition-colors`}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )
    : null;

  return (
    <>
    <div
      className={`rounded-lg border ${
        isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-[#151C24]'
      } overflow-hidden mb-1.5`}
      data-graph-state="true"
      data-session-id={sessionId}
    >
      {/* Header */}
      <div className={`w-full flex items-center justify-between px-3 py-2 ${
        isLight ? 'hover:bg-gray-50' : 'hover:bg-gray-700/50'
      } transition-colors`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Chevron on the left */}
          <button
            type="button"
            onClick={toggleExpanded}
            className={`p-1 rounded transition-colors flex-shrink-0 inline-flex items-center justify-center ${
              isLight 
                ? 'text-gray-500 hover:bg-gray-100' 
                : 'text-gray-400 hover:bg-gray-700'
            }`}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={isExpanded ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"}
              />
            </svg>
          </button>
          <GraphIcon className="h-5 w-5 flex-shrink-0" color={isLight ? '#6b7280' : '#9ca3af'} />
          <div className="text-left flex-1 min-w-0">
            <h3 style={{ color: isLight ? '#374151' : '#d1d5db' }} className="font-medium truncate">{state.name || 'Multi-Agent Graph'}</h3>
            <p style={{ color: isLight ? '#374151' : '#d1d5db' }} className="text-xs opacity-75">
              Iteration {state.iteration}/{state.max_iterations} • {completedSteps}/{totalSteps} steps
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {statusBadge}
          {/* Controls */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleAddStep();
              }}
              className={`p-1 rounded transition-colors inline-flex items-center justify-center ${
                isLight 
                  ? 'text-gray-500 hover:bg-gray-100' 
                  : 'text-gray-400 hover:bg-gray-700'
              }`}
              aria-label="Add execution step"
              title="Add execution step"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            {canRunGraph && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRunGraph();
                }}
                className={`p-1 rounded transition-colors inline-flex items-center justify-center ${
                  isLight 
                    ? 'text-gray-500 hover:bg-gray-100' 
                    : 'text-gray-400 hover:bg-gray-700'
                }`}
                aria-label="Run graph"
                title="Run graph"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={handleOpenDeleteGraph}
              className={`p-1 rounded transition-colors inline-flex items-center justify-center ${
                isLight 
                  ? 'text-gray-500 hover:bg-gray-100' 
                  : 'text-gray-400 hover:bg-gray-700'
              }`}
              aria-label="Delete graph"
              title="Delete graph"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {isExpanded && (
        <div className={`h-1 ${isLight ? 'bg-gray-200/60' : 'bg-gray-700/40'}`}>
          <div
            className={`h-full transition-all duration-500 ${isLight ? 'bg-gray-300/80' : 'bg-gray-600/60'}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Expanded content with animation */}
      <div
        style={{
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-in-out, opacity 0.2s ease-in-out',
          maxHeight: isExpanded ? '5000px' : '0',
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div className={`px-4 py-3 ${isLight ? 'border-t border-gray-100' : 'border-t border-gray-700'}`}>
          {/* Graph Flow Diagram */}
          <GraphDiagram 
            isLight={isLight} 
            steps={state.steps}
            plannedSteps={state.planned_steps}
            mermaidDiagram={state.mermaid_diagram}
            isComplete={computedStatus === 'completed'} 
          />

          {/* Query */}
          {state.original_query && (
            <div className={`mb-3 p-3 rounded ${isLight ? 'bg-gray-50' : 'bg-[#1a2332]'}`}>
              <p style={{ color: isLight ? '#374151' : '#d1d5db' }} className="text-xs font-medium mb-1 opacity-75">Query</p>
              <div style={{ color: isLight ? '#374151' : '#d1d5db' }}>
                <CustomMarkdownRenderer content={state.original_query} isLight={isLight} />
              </div>
            </div>
          )}

          {/* Steps */}
          <div className="space-y-1">
            {hasSteps ? (
              steps.map((step, index) => {
                const isCompleted = step.status === 'completed';
                const isDeleted = step.status === 'cancelled';
                const draggableEnabled = !!setState && editingStepIndex !== index;
                const isDragSource = draggingIndex === index;
                const isDragOver = dragOverIndex === index && draggingIndex !== index;
                const controlFadeGradient = isLight
                  ? 'linear-gradient(to right, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.8) 20%, rgba(255, 255, 255, 0.95) 40%, rgb(255, 255, 255) 60%)'
                  : 'linear-gradient(to right, rgba(21, 28, 36, 0) 0%, rgba(21, 28, 36, 0.8) 20%, rgba(21, 28, 36, 0.95) 40%, rgb(21, 28, 36) 60%)';
                
                // Build controls for this step
                const stepControls = !isDeleted && editingStepIndex !== index && setState ? (
                  <>
                    {/* Move up */}
                    <button
                      disabled={index === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveStepUp(index);
                      }}
                      className={`p-0.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        isLight 
                          ? 'text-gray-500 hover:bg-gray-200 hover:text-gray-700' 
                          : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                      }`}
                      aria-label="Move step up"
                      title="Move up"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    
                    {/* Move down */}
                    <button
                      disabled={index === steps.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveStepDown(index);
                      }}
                      className={`p-0.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        isLight 
                          ? 'text-gray-500 hover:bg-gray-200 hover:text-gray-700' 
                          : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                      }`}
                      aria-label="Move step down"
                      title="Move down"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    
                    {/* Edit button */}
                    {!isCompleted && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(index, step.node, step.prompt || '');
                        }}
                        className={`p-0.5 rounded transition-colors ${
                          isLight 
                            ? 'text-gray-500 hover:bg-gray-200 hover:text-blue-600' 
                            : 'text-gray-400 hover:bg-gray-700 hover:text-blue-400'
                        }`}
                        aria-label="Edit step"
                        title="Edit step"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}
                    
                    {/* Delete button */}
                    {!isCompleted && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const newSteps = [...steps];
                          newSteps[index] = {
                            ...newSteps[index],
                            status: 'cancelled' as const
                          };
                          updateGraphSteps(newSteps);
                        }}
                        className={`p-0.5 rounded transition-colors ${
                          isLight 
                            ? 'text-gray-500 hover:bg-red-100 hover:text-red-600' 
                            : 'text-gray-400 hover:bg-red-900/30 hover:text-red-400'
                        }`}
                        aria-label="Delete step"
                        title="Delete step"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </>
                ) : null;
                
                return (
                  <div
                    key={`${step.node}-${index}`}
                    draggable={draggableEnabled}
                    onDragStart={(e) => draggableEnabled && handleDragStart(e, index)}
                    onDragOver={(e) => draggableEnabled && handleDragOver(e, index)}
                    onDrop={(e) => draggableEnabled && handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`relative ${draggableEnabled ? 'cursor-grab active:cursor-grabbing' : ''} ${
                      isDragSource ? 'opacity-70' : ''
                    } ${isDragOver ? (isLight ? 'ring-1 ring-blue-300' : 'ring-1 ring-blue-500/50') : ''}`}
                  >
                    {/* Original GraphStepItem */}
                    {editingStepIndex !== index ? (
                      <GraphStepItem 
                        step={step} 
                        isLight={isLight} 
                        isLast={index === steps.length - 1}
                        controls={stepControls}
                        graphId={graphId}
                        graphName={graphName}
                        onConfirm={handleConfirmAction}
                        errors={state.errors}
                      />
                    ) : (
                      /* Editing overlay - replaces GraphStepItem when editing */
                      <div className={`relative flex items-start gap-3 py-2 px-3 rounded-lg transition-colors duration-200 ${
                        isLight ? 'bg-gray-50' : 'bg-gray-800/30'
                      }`}>
                        {/* Status icon placeholder */}
                        <div className="relative z-10 flex-shrink-0">
                          <div className={`h-4 w-4 rounded-full border-2 ${isLight ? 'border-gray-300' : 'border-gray-600'}`} />
                        </div>
                        
                        {/* Editing form */}
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Node Type Dropdown */}
                          <select
                            ref={editNodeRef as any}
                            value={editNodeValue}
                            onChange={(e) => setEditNodeValue(e.target.value)}
                            onKeyDown={handleEditKeyDown}
                            className={`w-full text-sm bg-transparent border border-dashed rounded px-2 py-1.5 ${
                              isLight 
                                ? 'border-gray-300 text-gray-900 bg-white' 
                                : 'border-gray-600 text-gray-100 bg-gray-800/50'
                            }`}
                          >
                            {SUPPORTED_NODE_TYPES.map((nodeType) => (
                              <option key={nodeType} value={nodeType}>
                                {nodeType}
                              </option>
                            ))}
                          </select>
                          
                          {/* Prompt Textarea */}
                          <textarea
                            ref={editPromptRef}
                            value={editPromptValue}
                            onChange={(e) => setEditPromptValue(e.target.value)}
                            onKeyDown={handleEditKeyDown}
                            placeholder="Prompt (optional)"
                            rows={3}
                            className={`w-full text-sm bg-transparent border border-dashed rounded px-2 py-1.5 resize-y ${
                              isLight 
                                ? 'border-gray-300 text-gray-900 bg-white' 
                                : 'border-gray-600 text-gray-100 bg-gray-800/50'
                            }`}
                          />
                          
                          {/* Save/Cancel buttons */}
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditSubmit();
                              }}
                              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                                isLight
                                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                                  : 'bg-blue-600 text-white hover:bg-blue-700'
                              }`}
                            >
                              Save
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditCancel();
                              }}
                              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                                isLight
                                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                  : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                              }`}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Restore button - for deleted steps */}
                    {isDeleted && setState && (
                      <div className="absolute top-2 right-2 flex items-center gap-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const newSteps = [...steps];
                            newSteps[index] = {
                              ...newSteps[index],
                              status: 'pending' as const
                            };
                            updateGraphSteps(newSteps);
                          }}
                          className={`p-0.5 rounded transition-colors ${
                            isLight 
                              ? 'text-gray-500 hover:bg-green-100 hover:text-green-600' 
                              : 'text-gray-400 hover:bg-green-900/30 hover:text-green-400'
                          }`}
                          aria-label="Restore step"
                          title="Restore step"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 13l-4-4m0 0l4-4m-4 4h11a4 4 0 110 8h-1" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className={`p-3 rounded ${isLight ? 'bg-gray-50' : 'bg-[#1a2332]'}`}>
                <p style={{ color: isLight ? '#6b7280' : '#9ca3af' }} className="text-sm text-center">
                  Graph initialized. The orchestrator will determine the execution plan when run_graph() is called.
                </p>
              </div>
            )}
            
            {/* Add step input */}
            {isAdding && (
              <div
                className={`relative flex items-start gap-3 py-2 px-3 rounded-lg transition-colors ${
                  isLight
                    ? 'bg-gray-50 border border-gray-200'
                    : 'bg-gray-800/30 border border-gray-700'
                }`}
              >
                {/* Status icon placeholder */}
                <div className="relative z-10 flex-shrink-0">
                  <div className={`h-4 w-4 rounded-full border-2 ${isLight ? 'border-gray-300' : 'border-gray-600'}`} />
                </div>
                
                {/* Add step form */}
                <div className="flex-1 min-w-0 space-y-2">
                  {/* Node Type Dropdown */}
                  <select
                    ref={addNodeRef as any}
                    value={addNodeValue}
                    onChange={(e) => setAddNodeValue(e.target.value)}
                    onKeyDown={handleAddKeyDown}
                    className={`w-full text-sm bg-transparent border border-dashed rounded px-2 py-1.5 ${
                      isLight 
                        ? 'border-gray-300 text-gray-900 bg-white' 
                        : 'border-gray-600 text-gray-100 bg-gray-800/50'
                    }`}
                  >
                    <option value="">Node type...</option>
                    {SUPPORTED_NODE_TYPES.map((nodeType) => (
                      <option key={nodeType} value={nodeType}>
                        {nodeType}
                      </option>
                    ))}
                  </select>
                  
                  {/* Prompt Textarea */}
                  <textarea
                    ref={addPromptRef}
                    value={addPromptValue}
                    onChange={(e) => setAddPromptValue(e.target.value)}
                    onKeyDown={handleAddKeyDown}
                    placeholder="Prompt (optional)..."
                    rows={3}
                    className={`w-full text-sm bg-transparent border border-dashed rounded px-2 py-1.5 resize-y ${
                      isLight 
                        ? 'border-gray-300 text-gray-900 bg-white' 
                        : 'border-gray-600 text-gray-100 bg-gray-800/50'
                    }`}
                  />
                  
                  {/* Save/Cancel buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddSubmit();
                      }}
                      disabled={!addNodeValue.trim()}
                      className={`px-2 py-1 text-xs font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        isLight
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      Add
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddCancel();
                      }}
                      className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                        isLight
                          ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                      }`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error messages section */}
          {state.errors && state.errors.length > 0 && (
            <div className={`mt-4 p-4 rounded-lg border-2 ${
              isLight 
                ? 'bg-red-50 border-red-200' 
                : 'bg-red-900/20 border-red-800/40'
            }`}>
              <div className="flex items-start gap-2 mb-3">
                <ErrorIcon className="h-5 w-5 flex-shrink-0 mt-0.5" color={isLight ? '#dc2626' : '#f87171'} />
                <div>
                  <h4 className={`text-sm font-semibold ${isLight ? 'text-red-900' : 'text-red-400'}`}>
                    {state.errors.length === 1 ? 'Error Occurred' : `${state.errors.length} Errors Occurred`}
                  </h4>
                  <p className={`text-xs mt-0.5 ${isLight ? 'text-red-700' : 'text-red-300'}`}>
                    The following errors were encountered during graph execution:
                  </p>
                </div>
              </div>
              
              <div className="space-y-2">
                {state.errors.map((error, index) => (
                  <div 
                    key={`${error.node}-${error.timestamp}-${index}`}
                    className={`p-3 rounded-lg ${
                      isLight 
                        ? 'bg-white border border-red-200' 
                        : 'bg-gray-900/50 border border-red-800/30'
                    }`}
                  >
                    {/* Error header with node and timestamp */}
                    <div className="flex items-center justify-between mb-2">
                      {error.node && (
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                            isLight 
                              ? 'bg-red-100 text-red-800' 
                              : 'bg-red-900/40 text-red-300'
                          }`}>
                            {error.node}
                          </span>
                        </div>
                      )}
                      {error.timestamp && (
                        <span className={`text-xs ${isLight ? 'text-red-600' : 'text-red-400'}`}>
                          {new Date(error.timestamp).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                    
                    {/* Error message */}
                    {error.error && (
                      <div className={`text-sm font-mono whitespace-pre-wrap break-words ${
                        isLight ? 'text-red-900' : 'text-red-200'
                      }`}>
                        {error.error}
                      </div>
                    )}
                    
                    {/* Error details if present */}
                    {(error as any).details && (
                      <div className={`mt-2 pt-2 border-t text-xs font-mono whitespace-pre-wrap break-words ${
                        isLight 
                          ? 'border-red-200 text-red-700' 
                          : 'border-red-800/30 text-red-300'
                      }`}>
                        <span className="font-semibold">Details: </span>
                        {(error as any).details}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Final result */}
          {computedStatus === 'completed' && state.final_result && (
            <FinalResult 
              result={state.final_result} 
              isLight={isLight} 
            />
          )}
        </div>
      </div>
    </div>
    {deleteModal}
    </>
  );
};

// Separate component for final result to keep main component clean
const FinalResult: FC<{ result: string; isLight: boolean }> = memo(({ result, isLight }) => {
  const sections = parseContentIntoSections(result);
  
  // Helper to format final result content
  const formatFinalContent = (content: string): string => {
    const trimmed = content.trim();
    if (trimmed.startsWith('{')) {
      let braceCount = 0;
      let jsonEndIndex = -1;
      for (let i = 0; i < trimmed.length; i++) {
        if (trimmed[i] === '{') braceCount++;
        else if (trimmed[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            jsonEndIndex = i;
            break;
          }
        }
      }
      
      if (jsonEndIndex > 0) {
        const jsonPart = trimmed.substring(0, jsonEndIndex + 1);
        const remainingText = trimmed.substring(jsonEndIndex + 1).trim();
        
        try {
          const parsed = JSON.parse(jsonPart);
          if (parsed.code !== undefined) {
            const formatted = formatCodeResultAsMarkdown(jsonPart);
            return remainingText ? `${formatted}\n\n${remainingText}` : formatted;
          }
        } catch {
          // Not valid JSON, fall through
        }
      }
    }
    return formatStepResultAsMarkdown(content);
  };
  
  return (
    <div className={`mt-3 p-3 rounded ${isLight ? 'bg-gray-50' : 'bg-[#1a2332]'}`}>
      <p className={`text-xs font-medium mb-2 ${isLight ? 'text-green-600' : 'text-green-400'}`}>Result</p>
      
      {sections.map((section, idx) => {
        if (section.type === 'thinking') {
          return (
            <div key={`final-thinking-${idx}`} className="mb-2">
              <InlineThinkingBlock 
                content={section.content} 
                isLight={isLight} 
                defaultOpen={false}
              />
            </div>
          );
        } else {
          const formattedContent = formatFinalContent(section.content);
          if (!formattedContent) return null;
          return (
            <div 
              key={`final-content-${idx}`}
              style={{ color: isLight ? '#374151' : '#d1d5db' }}
              className={`max-h-96 overflow-y-auto ${idx > 0 ? 'mt-2' : ''}`}
            >
              <CustomMarkdownRenderer content={formattedContent} isLight={isLight} />
            </div>
          );
        }
      })}
    </div>
  );
});

FinalResult.displayName = 'FinalResult';

export default GraphStateCard;

