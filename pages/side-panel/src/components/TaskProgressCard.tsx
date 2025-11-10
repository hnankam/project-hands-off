import type { FC } from 'react';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useCopilotChatHeadless_c } from '@copilotkit/react-core';
import { useStorage } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';

// Icon Components - matching the agent/model switch overlay
const SpinningLoader = () => (
  <svg className="animate-spin h-3.5 w-3.5 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

const GreenCheckmark = () => (
  <svg className="h-3.5 w-3.5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
  </svg>
);

const RedFailIcon = () => (
  <svg className="h-3.5 w-3.5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
  </svg>
);

export interface AgentStepState {
  /**
   * Session identifier that owns this task progress. Used to scope progress
   * cards and prevent cross-session bleed when multiple chats share the same
   * Copilot agent name.
   */
  sessionId?: string;
  steps: {
    description: string;
    status: "pending" | "running" | "completed" | "failed" | "deleted";
  }[];
}

interface TaskProgressCardProps {
  state: AgentStepState;
  setState?: (state: AgentStepState) => void;
  theme?: string; // Optional now since we'll read it directly
  isCollapsed?: boolean;
  isHistorical?: boolean;
  showControls?: boolean; // Whether to show edit/delete/rerun buttons
}

/**
 * TaskProgressCard Component
 * 
 * Displays a visual progress tracker for agent tasks with animated steps.
 * Shows completed, in-progress, and pending steps with appropriate styling.
 * Historical cards (older versions) show collapsed without spinners.
 */
export const TaskProgressCard: FC<TaskProgressCardProps> = ({ 
  state, 
  setState,
  theme: themeProp, 
  isCollapsed = false, 
  isHistorical: initialHistorical = false,
  showControls = true
}) => {
  // Always read theme directly from storage for reactivity to theme changes
  const { isLight: isLightFromStorage } = useStorage(exampleThemeStorage);
  const theme = isLightFromStorage ? 'light' : 'dark';
  
  const [isExpanded, setIsExpanded] = useState(!isCollapsed);
  const [isHistorical, setIsHistorical] = useState(initialHistorical);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const cardRef = React.useRef<HTMLElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const addInputRef = React.useRef<HTMLInputElement>(null);

  // Add-step state
  const [isAdding, setIsAdding] = useState(false);
  const [addValue, setAddValue] = useState('');

  // Delete plan modal state
  const [deletePlanOpen, setDeletePlanOpen] = useState(false);

  // Drag & drop reordering state
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Chat hook for triggering runs
  const { sendMessage, isLoading: isChatLoading } = useCopilotChatHeadless_c();

  // Debug logging
  React.useEffect(() => {
    // console.log('[TaskProgressCard] Component rendered');
    // console.log('[TaskProgressCard] State:', state);
    // console.log('[TaskProgressCard] setState available:', !!setState);
    // console.log('[TaskProgressCard] Steps:', state.steps);
    if (state.steps) {
      state.steps.forEach((step, idx) => {
        //console.log(`[TaskProgressCard] Step ${idx}:`, step.description, 'status:', step.status);
      });
    }
  }, [state, setState]);
  
  // Check if this card is marked as historical via data attribute
  React.useEffect(() => {
    const checkHistorical = () => {
      if (cardRef.current) {
        const container = cardRef.current.closest('[data-task-progress="true"]');
        if (container) {
          const historical = container.getAttribute('data-historical') === 'true';
          setIsHistorical(historical);
        }
      }
    };
    
    checkHistorical();
    const interval = setInterval(checkHistorical, 100);
    return () => clearInterval(interval);
  }, []);

  // Focus input when editing starts
  React.useEffect(() => {
    if (editingStepIndex !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingStepIndex]);

  // Focus add input when add mode starts
  React.useEffect(() => {
    if (isAdding && addInputRef.current) {
      addInputRef.current.focus();
      addInputRef.current.select?.();
    }
  }, [isAdding]);

  // Handlers for inline editing
  const handleStartEdit = (stepIndex: number, currentDescription: string) => {
    if (!isHistorical) {
      setEditingStepIndex(stepIndex);
      setEditValue(currentDescription);
    }
  };

  const handleEditSubmit = () => {
    if (editingStepIndex !== null && editValue.trim() && setState) {
      console.log('[TaskProgressCard] Submitting edit for step', editingStepIndex, 'with value:', editValue.trim());
      const newSteps = [...state.steps];
      newSteps[editingStepIndex] = {
        ...newSteps[editingStepIndex],
        description: editValue.trim()
      };
      setState({ ...state, steps: newSteps });
    }
    setEditingStepIndex(null);
    setEditValue('');
  };

  const handleEditCancel = () => {
    setEditingStepIndex(null);
    setEditValue('');
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEditSubmit();
    } else if (e.key === 'Escape') {
      handleEditCancel();
    }
  };

  // Handlers for adding a new step
  const handleStartAdd = () => {
    if (!isHistorical) {
      setIsExpanded(true);
      setIsAdding(true);
      setAddValue('');
    }
  };

  const handleAddSubmit = () => {
    if (setState && addValue.trim()) {
      const newSteps = [...state.steps, { description: addValue.trim(), status: 'pending' as const }];
      setState({ ...state, steps: newSteps });
    }
    setIsAdding(false);
    setAddValue('');
  };

  const handleAddCancel = () => {
    setIsAdding(false);
    setAddValue('');
  };

  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddSubmit();
    } else if (e.key === 'Escape') {
      handleAddCancel();
    }
  };

  // Handlers for reordering steps
  const handleMoveStepUp = (index: number) => {
    if (!setState) return;
    if (index <= 0 || index >= state.steps.length) return;
    const newSteps = [...state.steps];
    const temp = newSteps[index - 1];
    newSteps[index - 1] = newSteps[index];
    newSteps[index] = temp;
    setState({ ...state, steps: newSteps });
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
    const newSteps = [...state.steps];
    const [moved] = newSteps.splice(sourceIndex, 1);
    let targetIndex = index;
    if (sourceIndex < index) targetIndex = index - 1;
    newSteps.splice(targetIndex, 0, moved);
    setState({ ...state, steps: newSteps });
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  // Run button handler - submit a user message to continue plan
  const handleRunPlan = async () => {
    try {
      await sendMessage({ role: 'user', content: 'Continue to the next step in the plan' } as any);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[TaskProgressCard] Failed to send run/continue message:', e);
    }
  };

  // Delete plan - open modal
  const handleOpenDeletePlan = () => {
    setDeletePlanOpen(true);
  };

  // Confirm delete plan - clears all steps and hides plan UI
  const handleConfirmDeletePlan = () => {
    if (!setState) return;
    setIsAdding(false);
    setEditingStepIndex(null);
    setEditValue('');
    setDeletePlanOpen(false);
    setState({ ...state, steps: [] });
  };

  // Cancel delete plan
  const handleCancelDeletePlan = () => {
    setDeletePlanOpen(false);
  };

  // Close modal on Escape
  React.useEffect(() => {
    if (!deletePlanOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDeletePlanOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [deletePlanOpen]);

  const handleMoveStepDown = (index: number) => {
    if (!setState) return;
    if (index < 0 || index >= state.steps.length - 1) return;
    const newSteps = [...state.steps];
    const temp = newSteps[index + 1];
    newSteps[index + 1] = newSteps[index];
    newSteps[index] = temp;
    setState({ ...state, steps: newSteps });
  };

  if (!state.steps || state.steps.length === 0) {
    return null;
  }

  // Filter out deleted steps from counts
  const activeSteps = state.steps.filter((step) => step.status !== "deleted");
  const completedCount = activeSteps.filter((step) => step.status === "completed").length;
  const progressPercentage = activeSteps.length > 0 ? (completedCount / activeSteps.length) * 100 : 0;
  const isLight = theme === 'light';
  const hasPendingActive = activeSteps.some((step) => step.status === 'pending');
  const canRunPlan = hasPendingActive && !isChatLoading;

  // Collapsed view - compact single line
  if (!isExpanded) {
    const hasRunning = !isHistorical && state.steps.some(s => s.status === 'running');
    const hasFailed = state.steps.some(s => s.status === 'failed');
    const failedCount = state.steps.filter(s => s.status === 'failed').length;
    
    return (
      <div
        ref={cardRef as any}
        data-session-id={state.sessionId ?? ''}
        className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-[11px] ${
          isLight
            ? 'bg-gray-50 text-gray-700 border border-gray-200'
            : 'bg-gray-800 text-gray-200 border border-gray-700'
        } ${isHistorical ? 'opacity-60' : ''}`}
      >
        {hasRunning ? (
          <svg className="animate-spin h-2.5 w-2.5 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : hasFailed ? (
          <svg className="h-2.5 w-2.5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="w-3 h-3 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        )}
        <span className="font-medium text-[10px]">Task:</span>
        <span className={`${isLight ? 'text-gray-600' : 'text-gray-400'} text-[10px]`}>
          {completedCount}/{activeSteps.length}
          {failedCount > 0 && <span className="text-red-500 ml-1">({failedCount} failed)</span>}
        </span>
        <div className={`flex-1 h-1 rounded-full overflow-hidden min-w-[40px] ${isLight ? 'bg-gray-200' : 'bg-gray-700'}`}>
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <button
          onClick={() => setIsExpanded(true)}
          className={`p-1 rounded transition-colors flex-shrink-0 ${
            isLight 
              ? 'text-gray-500 hover:bg-gray-100' 
              : 'text-gray-400 hover:bg-gray-700'
          }`}
          aria-label="Expand"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    );
  }

  // Expanded view - full width card
  return (
    <div
      ref={cardRef as any}
      data-testid="task-progress"
      data-session-id={state.sessionId ?? ''}
      className={`w-full rounded-lg p-2 text-[11px] ${
        isLight
          ? "bg-white text-gray-800 border border-gray-200"
          : "bg-[#151C24] text-white border border-gray-700"
      }`}
    >
      {/* Header */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <svg className="w-3 h-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <h3 className="font-semibold text-[11px]">Plan</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>
              {completedCount}/{activeSteps.length}
            </span>
            {showControls && !isHistorical && setState && (
              <button
                onClick={handleStartAdd}
                className={`p-1 rounded transition-colors ${
                  isLight 
                    ? 'text-gray-500 hover:bg-gray-100' 
                    : 'text-gray-400 hover:bg-gray-700'
                }`}
                aria-label="Add step"
                title="Add step"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
            {showControls && !isHistorical && canRunPlan && (
              <button
                onClick={handleRunPlan}
                className={`p-1 rounded transition-colors ${
                  isLight 
                    ? 'text-gray-500 hover:bg-blue-100 hover:text-blue-600' 
                    : 'text-gray-400 hover:bg-blue-900/30 hover:text-blue-400'
                }`}
                aria-label="Run/continue plan"
                title="Run/continue plan"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" />
                </svg>
              </button>
            )}
            {showControls && !isHistorical && setState && (
              <button
                onClick={handleOpenDeletePlan}
                className={`p-1 rounded transition-colors ${
                  isLight 
                    ? 'text-gray-500 hover:bg-red-100 hover:text-red-600' 
                    : 'text-gray-400 hover:bg-red-900/30 hover:text-red-400'
                }`}
                aria-label="Delete plan"
                title="Delete plan"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
            <button
              onClick={() => setIsExpanded(false)}
              className={`p-1 rounded transition-colors ${
                isLight 
                  ? 'text-gray-500 hover:bg-gray-100' 
                  : 'text-gray-400 hover:bg-gray-700'
              }`}
              aria-label="Collapse"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className={`h-1 rounded-full overflow-hidden ${isLight ? "bg-gray-200" : "bg-gray-700"}`}>
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

       {/* Steps */}
       <div className="space-y-1">
         {state.steps.map((step, index) => {
           const isCompleted = step.status === "completed";
           // Historical cards should never show running state - treat as pending
           const isRunning = !isHistorical && step.status === "running";
           const isFailed = step.status === "failed";
           const isDeleted = step.status === "deleted";
           const isPending = step.status === "pending" || (isHistorical && step.status === "running");
           const draggableEnabled = showControls && !isHistorical && !!setState && editingStepIndex !== index;
           const isDragSource = draggingIndex === index;
           const isDragOver = dragOverIndex === index && draggingIndex !== index;

          const containerClasses = (() => {
            if (isDeleted) {
              return isLight
                ? 'bg-gray-100 border border-gray-300 opacity-60'
                : 'bg-gray-800/50 border border-gray-600 opacity-60';
            }
            if (isHistorical) {
              return isLight
                ? 'bg-gray-50 border border-gray-200 opacity-80'
                : 'bg-gray-800/40 border border-gray-600 opacity-80';
            }
            return isLight
              ? 'bg-white border border-gray-200'
              : 'bg-gray-800/40 border border-gray-700';
          })();

          return (
            <div
              key={index}
              draggable={draggableEnabled}
              onDragStart={(e) => draggableEnabled && handleDragStart(e, index)}
              onDragOver={(e) => draggableEnabled && handleDragOver(e, index)}
              onDrop={(e) => draggableEnabled && handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={`group flex items-center gap-1.5 px-1.5 py-1 rounded transition-all ${
                containerClasses
              } ${draggableEnabled ? 'cursor-grab active:cursor-grabbing' : ''} ${
                isDragSource ? 'opacity-70' : ''
              } ${isDragOver ? (isLight ? 'ring-1 ring-blue-300' : 'ring-1 ring-blue-500/50') : ''}`}
            >
               {/* Status Icon - matching model switch overlay */}
               {isDeleted ? (
                 <div className={`h-3.5 w-3.5 rounded-full flex-shrink-0 ${
                   isLight ? 'bg-gray-400' : 'bg-gray-600'
                 }`} />
               ) : isCompleted ? (
                 <GreenCheckmark />
               ) : isRunning ? (
                 <SpinningLoader />
               ) : isFailed ? (
                 <RedFailIcon />
               ) : (
                 <div className={`h-3.5 w-3.5 rounded-full border-2 flex-shrink-0 ${
                   isLight ? 'border-gray-300' : 'border-gray-600'
                 }`} />
               )}

              {/* Step Content */}
              {editingStepIndex === index ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleEditSubmit}
                  onKeyDown={handleEditKeyDown}
                  className={`flex-1 min-w-0 text-[10px] bg-transparent border-none outline-none px-1 ${
                    isLight ? 'text-gray-900' : 'text-gray-100'
                  }`}
                  style={{ width: '100%' }}
                />
              ) : (
                <div
                  data-testid="task-step-text"
                  className={`flex-1 min-w-0 text-[10px] ${isDeleted ? 'line-through' : ''} ${
                    isLight ? 'text-gray-700' : 'text-gray-200'
                  } ${isRunning || isCompleted || isFailed ? 'font-medium' : ''}`}
                >
                  {step.description}
                </div>
              )}

              {/* Action Buttons - non-deleted steps */}
              {showControls && !isHistorical && !isDeleted && editingStepIndex !== index && setState && (
                <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                    disabled={index === state.steps.length - 1}
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
                  {/* Rerun button - only for completed or failed steps */}
                  {(isCompleted || isFailed) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const newSteps = [...state.steps];
                        newSteps[index] = {
                          ...newSteps[index],
                          status: 'pending' as const
                        };
                        setState({ ...state, steps: newSteps });
                      }}
                      className={`p-0.5 rounded transition-colors ${
                        isLight 
                          ? 'text-gray-500 hover:bg-gray-200 hover:text-blue-600' 
                          : 'text-gray-400 hover:bg-gray-700 hover:text-blue-400'
                      }`}
                      aria-label="Rerun step"
                      title="Rerun step"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  )}
                  
                  {/* Edit button */}
                  {!isCompleted && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEdit(index, step.description);
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
                      const newSteps = [...state.steps];
                      newSteps[index] = {
                        ...newSteps[index],
                        status: 'deleted' as const
                      };
                      setState({ ...state, steps: newSteps });
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
                </div>
              )}

              {/* Restore button - for deleted steps */}
              {showControls && !isHistorical && isDeleted && setState && (
                <div className="flex items-center gap-0.5 ml-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const newSteps = [...state.steps];
                      newSteps[index] = {
                        ...newSteps[index],
                        status: 'pending' as const
                      };
                      setState({ ...state, steps: newSteps });
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
        })}
        {showControls && !isHistorical && isAdding && (
          <div
            className={`group flex items-center gap-1.5 px-1.5 py-1 rounded transition-all ${
              isLight
                ? 'bg-gray-50/50 border border-gray-200/50'
                : 'bg-gray-600/10 border border-gray-600/30'
            }`}
          >
            <div className={`h-3.5 w-3.5 rounded-full border-2 flex-shrink-0 ${
              isLight ? 'border-gray-300' : 'border-gray-600'
            }`} />
            <input
              ref={addInputRef}
              type="text"
              value={addValue}
              placeholder="New step..."
              onChange={(e) => setAddValue(e.target.value)}
              onBlur={handleAddSubmit}
              onKeyDown={handleAddKeyDown}
              className={`flex-1 min-w-0 text-[10px] bg-transparent border-none outline-none px-1 ${
                isLight ? 'text-gray-900' : 'text-gray-100'
              }`}
              style={{ width: '100%' }}
            />
          </div>
        )}
      </div>
      {/* Delete Plan Modal (reuse style from SessionList) */}
      {deletePlanOpen && createPortal((
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[10000] backdrop-blur-sm"
            onClick={handleCancelDeletePlan}
          />
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            <div
              className={`${
                isLight ? 'bg-gray-50 border border-gray-200' : 'bg-[#151C24] border border-gray-700'
              } w-full max-w-sm rounded-lg shadow-xl`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`flex items-center justify-between px-3 py-2 border-b ${isLight ? 'border-gray-200' : 'border-gray-700'}`}>
                <h2 className={`text-sm font-semibold ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>Delete Plan</h2>
                <button
                  onClick={handleCancelDeletePlan}
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
                      Permanently delete plan?
                    </p>
                    <p className={`${isLight ? 'text-gray-600' : 'text-gray-400'} text-xs mt-1`}>
                      This will remove the plan and its steps from the chat UI and cannot be recovered.
                    </p>
                    {state.steps.some((s) => s.status !== 'completed' && s.status !== 'deleted') && (
                      <p className={`${isLight ? 'text-red-600' : 'text-red-400'} text-xs mt-2`}>
                        Some steps are not completed or deleted. This action cannot be undone.
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className={`flex items-center justify-end gap-2 px-3 py-2 border-t ${isLight ? 'border-gray-200' : 'border-gray-700'}`}>
                <button
                  onClick={handleCancelDeletePlan}
                  className={`${isLight ? 'bg-gray-200 text-gray-900 hover:bg-gray-300' : 'bg-gray-700 text-gray-100 hover:bg-gray-600'} px-3 py-1.5 text-xs font-medium rounded-md transition-colors`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDeletePlan}
                  className={`bg-red-600 text-white hover:bg-red-700 px-3 py-1.5 text-xs font-medium rounded-md transition-colors`}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </>
      ), document.body)}
   </div>
  );
};

