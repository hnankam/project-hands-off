import type { FC } from 'react';
import * as React from 'react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useCopilotChat } from '../../hooks/copilotkit';
import { useStorage, sessionStorageDBWrapper } from '@extension/shared';
import { themeStorage } from '@extension/storage';

// Persist expanded state across remounts per session
const expandedStateBySession: Map<string, boolean> = new Map();

// Icon Components - matching the agent/model switch overlay
const SpinningLoader: FC<{ color?: string }> = ({ color }) => (
  <svg className="animate-spin h-3.5 w-3.5 flex-shrink-0 block" style={{ color }} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

// Filled checkmark for completed steps
const GreenCheckmark = () => (
  <svg className="h-3.5 w-3.5 text-green-500 flex-shrink-0 block" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
  </svg>
);

// Outlined checkmark for pending steps - same structure as GreenCheckmark but outlined
const OutlinedCheckmark = () => (
  <svg className="h-3.5 w-3.5 text-gray-400 flex-shrink-0 block" fill="none" stroke="currentColor" viewBox="0 0 20 20" strokeWidth="1.8">
    <circle cx="10" cy="10" r="8" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.293 8.293L9 12.586l-2.293-2.293" />
  </svg>
);

const RedFailIcon: FC<{ color?: string }> = ({ color = '#ef4444' }) => (
  <svg className="h-3.5 w-3.5 flex-shrink-0 block" style={{ color }} fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
  </svg>
);

// Import unified types from centralized location
import type { UnifiedAgentState, PlanStep } from '../graph-state/types';

interface PlanStateCardProps {
  state: UnifiedAgentState;
  setState?: (state: UnifiedAgentState) => void;
  theme?: string; // Optional now since we'll read it directly
  isCollapsed?: boolean;
}

/**
 * PlanStateCard Component
 * 
 * Displays a visual progress tracker for agent plan tasks with animated steps.
 * Shows completed, in-progress, and pending steps with appropriate styling.
 */
export const PlanStateCard: FC<PlanStateCardProps> = ({ 
  state, 
  setState,
  theme: themeProp, 
  isCollapsed = false
}) => {
  // Always read theme directly from storage for reactivity to theme changes
  const { isLight: isLightFromStorage } = useStorage(themeStorage);
  const theme = isLightFromStorage ? 'light' : 'dark';
  
  // Use a per-session sticky expanded state to avoid accidental collapses on remount
  const sessionKey = state.sessionId ?? 'default';
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    if (expandedStateBySession.has(sessionKey)) {
      return expandedStateBySession.get(sessionKey) as boolean;
    }
    return !isCollapsed;
  });
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const cardRef = React.useRef<HTMLElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const addInputRef = React.useRef<HTMLInputElement>(null);
  const editAreaRef = React.useRef<HTMLTextAreaElement>(null);
  const [isEditWrapped, setIsEditWrapped] = useState(false);
  const [hoveredStepIndex, setHoveredStepIndex] = useState<number | null>(null);
  const [isHoverEditing, setIsHoverEditing] = useState(false);
  const [hoverText, setHoverText] = useState<string>('');
  const [hoverRect, setHoverRect] = useState<{ left: number; top: number } | null>(null);

  // Add-step state
  const [isAdding, setIsAdding] = useState(false);
  const [addValue, setAddValue] = useState('');

  // Delete plan modal state
  const [deletePlanOpen, setDeletePlanOpen] = useState(false);

  // Drag & drop reordering state
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Chat hook for triggering runs
  const { sendMessage, isLoading: isChatLoading } = useCopilotChat();

  // Extract the first/active plan from state.plans
  const activePlan = React.useMemo(() => {
    if (!state.plans) return null;
    const plans = Object.values(state.plans);
    // Prefer active plans, otherwise take the first one
    const activePlans = plans.filter(p => p.status === 'active');
    return activePlans.length > 0 ? activePlans[0] : plans[0];
  }, [state.plans]);

  // Extract steps from the active plan (for backward compatibility)
  const steps = activePlan?.steps || [];
  const planId = activePlan?.plan_id;
  const planName = activePlan?.name;

  // Helper function to update plan steps and call setState
  // MOVED BEFORE HANDLERS SO IT'S IN SCOPE
  // NOT using useCallback - recreate on every render to always use latest state
  const updatePlanSteps = (newSteps: PlanStep[]) => {
    if (!setState || !planId || !activePlan) {
      return;
    }
    
    const updatedPlan = {
      ...activePlan,
      steps: newSteps,
      updated_at: new Date().toISOString(),
    };
    
    const newState = {
      ...state,
      plans: {
        ...state.plans,
        [planId]: updatedPlan,
      },
    };
    
    setState(newState);
  };


  // Detect wrapping in edit mode and optionally auto-grow textarea height
  React.useEffect(() => {
    if (editingStepIndex === null) return;
    const el = editAreaRef.current;
    if (!el) return;
    // Auto-size to content height (up to a reasonable limit, still allows manual resize)
    try {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    } catch {}
    // Consider wrapped if more than one line or explicit newlines exist
    const wrapped = el.scrollHeight > el.clientHeight + 1 || el.value.includes('\n');
    setIsEditWrapped(wrapped);
  }, [editValue, editingStepIndex]);

  // Load expanded state from database on mount
  React.useEffect(() => {
    // Check in-memory cache first to avoid DB query
    const cachedExpanded = expandedStateBySession.get(sessionKey);
    if (cachedExpanded !== undefined) {
      setIsExpanded(cachedExpanded);
      return;
    }
    
    const loadExpandedState = async () => {
      try {
        const session = await sessionStorageDBWrapper.getSession(sessionKey);
        if (session && session.planExpanded !== undefined) {
          const savedExpanded = session.planExpanded;
          expandedStateBySession.set(sessionKey, savedExpanded);
          setIsExpanded(savedExpanded);
        }
      } catch (e) {
        // Silently fail - not critical
      }
    };
    
    loadExpandedState();
  }, [sessionKey]);

  // Persist expanded state per session (in memory and database)
  React.useEffect(() => {
    expandedStateBySession.set(sessionKey, isExpanded);
    
    // Debounce database save
    const timeoutId = setTimeout(() => {
      sessionStorageDBWrapper.updateSessionPlanExpanded(sessionKey, isExpanded);
    }, 300);
    
    return () => clearTimeout(timeoutId);
  }, [sessionKey, isExpanded]);

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
      setEditingStepIndex(stepIndex);
      setEditValue(currentDescription);
  };

  const handleEditSubmit = () => {
    if (editingStepIndex !== null && editValue.trim() && setState) {
      const newSteps = [...steps];
      newSteps[editingStepIndex] = {
        ...newSteps[editingStepIndex],
        description: editValue.trim()
      };
      updatePlanSteps(newSteps);
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
      setIsExpanded(true);
      setIsAdding(true);
      setAddValue('');
  };

  const handleAddSubmit = () => {
    if (setState && addValue.trim()) {
      const newSteps = [...steps, { description: addValue.trim(), status: 'pending' as const }];
      updatePlanSteps(newSteps);
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
    if (index <= 0 || index >= steps.length) return;
    const newSteps = [...steps];
    const temp = newSteps[index - 1];
    newSteps[index - 1] = newSteps[index];
    newSteps[index] = temp;
    updatePlanSteps(newSteps);
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
    updatePlanSteps(newSteps);
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
      if (!sendMessage) {
        return;
      }
      
      // Create message with proper format: id, role, content (per CopilotKit v1.50 docs)
      const message = { 
        id: crypto.randomUUID(),
        role: 'user' as const,
        content: `Continue plan \`@[Plan]${planName}\``
      };
      
      await sendMessage(message);
    } catch (e) {
      // Silently handle errors
    }
  };

  // Delete plan - open modal
  const handleOpenDeletePlan = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDeletePlanOpen(true);
  };

  // Confirm delete plan - clears all steps and hides plan UI
  const handleConfirmDeletePlan = () => {
    if (!setState) return;
    setIsAdding(false);
    setEditingStepIndex(null);
    setEditValue('');
    setDeletePlanOpen(false);
    updatePlanSteps([]);
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
    if (index < 0 || index >= steps.length - 1) return;
    const newSteps = [...steps];
    const temp = newSteps[index + 1];
    newSteps[index + 1] = newSteps[index];
    newSteps[index] = temp;
    updatePlanSteps(newSteps);
  };

  if (!steps || steps.length === 0 || !activePlan) {
    return null;
  }

  // Filter out deleted steps from counts
  const activeSteps = steps.filter((step) => step.status !== "deleted");
  const completedCount = activeSteps.filter((step) => step.status === "completed").length;
  const progressPercentage = activeSteps.length > 0 ? (completedCount / activeSteps.length) * 100 : 0;
  const isLight = theme === 'light';
  const cardBackground = isLight ? '#ffffff' : '#151C24';
  const cardBorderColor = isLight ? '#e5e7eb' : '#374151';
  const cardBackgroundVar = `var(--copilot-kit-input-background-color, ${cardBackground})`;
  const cardBorderVar = `var(--copilot-kit-separator-color, ${cardBorderColor})`;
  const effectiveBorderColor = cardBorderVar;
  const mutedBackgroundVar = `var(--copilot-kit-muted-color, ${isLight ? '#f3f4f6' : '#1f2937'})`;
  const secondaryBackgroundVar = `var(--copilot-kit-secondary-color, ${isLight ? '#f9fafb' : '#111827'})`;
  const hasPendingActive = activeSteps.some((step) => step.status === 'pending');
  const canRunPlan = hasPendingActive && !isChatLoading;
  const progressFillColor = isLight ? '#9ca3af' : '#6b7280';
  const progressTrackColor = isLight ? 'rgba(75, 85, 99, 0.18)' : 'rgba(148, 163, 184, 0.25)';
  // Match CustomUserMessage gradient for controls fade
  const controlFadeGradient = isLight
    ? 'linear-gradient(to right, rgba(249, 250, 251, 0) 0%, rgba(249, 250, 251, 0.8) 20%, rgba(249, 250, 251, 0.95) 40%, rgb(249, 250, 251) 60%)'
    : 'linear-gradient(to right, rgba(21, 28, 36, 0) 0%, rgba(21, 28, 36, 0.8) 20%, rgba(21, 28, 36, 0.95) 40%, rgb(21, 28, 36) 60%)';

  // Auto-expand handler for add button
  const handleAddAndExpand = () => {
    setIsExpanded(true);
    handleStartAdd();
  };

  // Pre-render delete modal so it can be shown from both collapsed and expanded views
  const deleteModal = deletePlanOpen
    ? createPortal(
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
                  type="button"
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
                    {steps.some((s) => s.status !== 'completed' && s.status !== 'deleted') && (
                      <p className={`${isLight ? 'text-red-600' : 'text-red-400'} text-xs mt-2`}>
                        Some steps are not completed or deleted. This action cannot be undone.
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className={`flex items-center justify-end gap-2 px-3 py-2 border-t ${isLight ? 'border-gray-200' : 'border-gray-700'}`}>
                <button
                  type="button"
                  onClick={handleCancelDeletePlan}
                  className={`${isLight ? 'bg-gray-200 text-gray-900 hover:bg-gray-300' : 'bg-gray-700 text-gray-100 hover:bg-gray-600'} px-3 py-1.5 text-xs font-medium rounded-md transition-colors`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeletePlan}
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

  // Collapsed view - compact single line
  if (!isExpanded) {
    const hasRunning = steps.some(s => s.status === 'running');
    const hasFailed = steps.some(s => s.status === 'failed');
    const failedCount = steps.filter(s => s.status === 'failed').length;
    
    return (
      <>
      <div
        ref={cardRef as any}
        data-session-id={state.sessionId ?? ''}
        className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] transition-all duration-500 ease-in-out ${
          isLight ? 'text-gray-700' : 'text-gray-200'
        }`}
        style={{
          backgroundColor: cardBackgroundVar,
          borderColor: effectiveBorderColor,
          boxSizing: 'border-box',
          marginBottom: '6px',
        }}
      >
        <button type="button"
          onClick={() => setIsExpanded(true)}
          className={`p-1 rounded transition-colors flex-shrink-0 inline-flex items-center justify-center ${
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
        {hasRunning ? (
          <svg className="animate-spin h-2.5 w-2.5 flex-shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : hasFailed ? (
          <svg className="h-2.5 w-2.5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className={`w-3 h-3 flex-shrink-0 ${isLight ? 'text-gray-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        )}
        <span className={`text-[10px] truncate ${isLight ? 'text-gray-700' : 'text-gray-200'}`} title={planName || 'Plan'}>
          {planName || 'Plan'}
        </span>
        <span className={`${isLight ? 'text-gray-600' : 'text-gray-400'} text-[10px] flex-shrink-0`}>
          {completedCount}/{activeSteps.length}
          {failedCount > 0 && <span className="text-red-500 ml-1">({failedCount} failed)</span>}
        </span>
        <div
          className="flex-1 h-1 rounded-full overflow-hidden min-w-[40px]"
          style={{ backgroundColor: progressTrackColor }}
        >
          <div
            className="h-full transition-all duration-500 ease-in-out rounded-r-full"
            style={{ width: `${progressPercentage}%`, backgroundColor: progressFillColor }}
          />
        </div>
        {/* Task controls in collapsed view */}
          <div className="flex items-center gap-1">
            {setState && (
              <button type="button"
                onClick={handleAddAndExpand}
                className={`p-1 rounded transition-colors inline-flex items-center justify-center ${
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
            {canRunPlan && (
        <button
                onClick={handleRunPlan}
                className={`p-1 rounded transition-colors inline-flex items-center justify-center ${
            isLight 
              ? 'text-gray-500 hover:bg-gray-100' 
              : 'text-gray-400 hover:bg-gray-700'
          }`}
                aria-label="Run/continue plan"
                title="Run/continue plan"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" />
          </svg>
        </button>
            )}
            {setState && (
        <button type="button"
                onClick={handleOpenDeletePlan}
                className={`p-1 rounded transition-colors inline-flex items-center justify-center ${
            isLight 
              ? 'text-gray-500 hover:bg-gray-100' 
              : 'text-gray-400 hover:bg-gray-700'
          }`}
                aria-label="Delete plan"
                title="Delete plan"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
            )}
      </div>
      </div>
      {deleteModal}
      </>
    );
  }

  // Expanded view - full width card
  return (
    <div
      ref={cardRef as any}
      data-testid="task-progress"
      data-session-id={state.sessionId ?? ''}
      className={`w-full rounded-lg border p-2 text-[11px] transition-all duration-500 ease-in-out ${isLight ? 'text-gray-800' : 'text-white'}`}
      style={{
        backgroundColor: cardBackgroundVar,
        borderColor: effectiveBorderColor,
        boxSizing: 'border-box',
        marginBottom: '6px',
      }}
    >
      {/* Header */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsExpanded(false)}
              className={`p-1 rounded transition-colors inline-flex items-center justify-center ${
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
            <span className={`text-[10px] ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>{planName || 'Plan'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>
              {completedCount}/{activeSteps.length}
            </span>
            {setState && (
              <button
                onClick={handleStartAdd}
                className={`p-1 rounded transition-colors inline-flex items-center justify-center ${
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
            {canRunPlan && (
              <button
                onClick={handleRunPlan}
                className={`p-1 rounded transition-colors inline-flex items-center justify-center ${
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
            {setState && (
              <button
                type="button"
                onClick={handleOpenDeletePlan}
                className={`p-1 rounded transition-colors inline-flex items-center justify-center ${
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
          </div>
        </div>

        {/* Progress Bar */}
        <div
          className="h-1 rounded-full overflow-hidden"
          style={{ backgroundColor: progressTrackColor }}
        >
          <div
            className="h-full transition-all duration-500 ease-in-out rounded-r-full"
            style={{ width: `${progressPercentage}%`, backgroundColor: progressFillColor }}
          />
        </div>
      </div>

       {/* Steps */}
       <div className="space-y-1">
         {steps.map((step, index) => {
           const isCompleted = step.status === "completed";
           const isRunning = step.status === "running";
           const isFailed = step.status === "failed";
           const isDeleted = step.status === "deleted";
           const isPending = step.status === "pending";
           const draggableEnabled = !!setState && editingStepIndex !== index;
           const isDragSource = draggingIndex === index;
           const isDragOver = dragOverIndex === index && draggingIndex !== index;

          const stateOpacityClass = isDeleted ? 'opacity-60' : '';
          const containerStyle: React.CSSProperties = {
            backgroundColor: cardBackgroundVar,
            borderColor: effectiveBorderColor,
          };
            if (isDeleted) {
            containerStyle.backgroundColor = mutedBackgroundVar;
          }

          return (
            <div
              key={index}
              draggable={draggableEnabled}
              onDragStart={(e) => draggableEnabled && handleDragStart(e, index)}
              onDragOver={(e) => draggableEnabled && handleDragOver(e, index)}
              onDrop={(e) => draggableEnabled && handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={`group relative flex items-center gap-1.5 px-1.5 py-1 rounded transition-all border ${
                draggableEnabled ? 'cursor-grab active:cursor-grabbing' : ''
              } ${stateOpacityClass} ${isDragSource ? 'opacity-70' : ''} ${
                isDragOver ? (isLight ? 'ring-1 ring-blue-300' : 'ring-1 ring-blue-500/50') : ''
              }`}
              style={containerStyle}
            >
               {/* Status Icon - matching model switch overlay */}
               {isDeleted ? (
                 <div className={`h-3.5 w-3.5 rounded-full flex-shrink-0`} style={{ backgroundColor: cardBorderColor, opacity: 0.5 }} />
               ) : isCompleted ? (
                 <GreenCheckmark />
               ) : isRunning ? (
                 <SpinningLoader color={isLight ? '#3b82f6' : '#60a5fa'} />
               ) : isFailed ? (
                 <RedFailIcon />
               ) : (
                 <OutlinedCheckmark />
               )}

              {/* Step Content */}
              {editingStepIndex === index ? (
                <textarea
                  ref={editAreaRef}
                  value={editValue}
                  onChange={(e) => {
                    setEditValue(e.target.value);
                  }}
                  onBlur={handleEditSubmit}
                  onKeyDown={handleEditKeyDown}
                  onMouseEnter={(e) => {
                    setHoveredStepIndex(index);
                    setHoverText(editValue);
                    setIsHoverEditing(true);
                    try {
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setHoverRect({ left: r.left + r.width / 2, top: r.bottom });
                    } catch {}
                  }}
                  onMouseLeave={() => {
                    setHoveredStepIndex(null);
                    setHoverRect(null);
                  }}
                  rows={2}
                  className={`flex-1 min-w-0 text-[10px] bg-transparent border-none outline-none px-1 whitespace-pre-wrap leading-snug ${
                    isLight ? 'text-gray-900' : 'text-gray-100'
                  }`}
                  style={{ width: '100%', resize: 'vertical', overflow: 'auto' }}
                />
              ) : (
                <div
                  data-testid="task-step-text"
                  className={`flex-1 min-w-0 text-[10px] truncate ${isDeleted ? 'line-through' : ''} ${isLight ? 'text-gray-700' : 'text-gray-200'}`}
                  aria-label={step.description}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    // Only show tooltip if actually truncated
                    try {
                      const isTruncated = (el.scrollWidth - el.clientWidth) > 1;
                      if (!isTruncated) return;
                      setHoveredStepIndex(index);
                      setHoverText(step.description);
                      setIsHoverEditing(false);
                      const r = el.getBoundingClientRect();
                      setHoverRect({ left: r.left + r.width / 2, top: r.bottom });
                    } catch {
                      // noop
                    }
                  }}
                  onMouseLeave={() => {
                    setHoveredStepIndex(null);
                    setHoverRect(null);
                  }}
                >
                  {step.description}
                </div>
              )}

              {/* Per-step hover region handled above; tooltip rendered via portal below */}

              {/* Action Buttons - non-deleted steps (overlay with fade) */}
              {!isDeleted && editingStepIndex !== index && setState && (
                <div
                  className="absolute inset-y-0 right-1 flex items-center pl-16 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{ background: controlFadeGradient }}
                >
                  <div className="flex items-center gap-0.5 ml-auto pointer-events-auto">
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
                  {/* Rerun button - only for completed or failed steps */}
                  {(isCompleted || isFailed) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const newSteps = [...steps];
                        newSteps[index] = {
                          ...newSteps[index],
                          status: 'pending' as const
                        };
                        updatePlanSteps(newSteps);
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
                      const newSteps = [...steps];
                      newSteps[index] = {
                        ...newSteps[index],
                        status: 'deleted' as const
                      };
                      updatePlanSteps(newSteps);
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
                </div>
              )}

              {/* Restore button - for deleted steps */}
              {isDeleted && setState && (
                <div className="flex items-center gap-0.5 ml-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const newSteps = [...steps];
                      newSteps[index] = {
                        ...newSteps[index],
                        status: 'pending' as const
                      };
                      updatePlanSteps(newSteps);
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
        {/* Global tooltip via portal to avoid clipping and native title */}
        {hoveredStepIndex !== null && hoverRect && (!isHoverEditing || (isHoverEditing && isEditWrapped)) &&
          createPortal(
            <div
              style={{
                position: 'fixed',
                left: hoverRect.left,
                top: hoverRect.top + 6,
                transform: 'translateX(-50%)',
                zIndex: 100000,
                pointerEvents: 'none',
              }}
            >
              <div
                className={`px-2 py-1.5 text-[11px] rounded-md border shadow-lg ${
                  isLight ? 'bg-white border-gray-200 text-gray-800' : 'bg-[#151C24] border-gray-700 text-gray-100'
                }`}
                style={{ maxWidth: 520, whiteSpace: 'pre-wrap' }}
              >
                {hoverText}
              </div>
            </div>,
            document.body
          )
        }
        {isAdding && (
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
      {/* Delete Plan Modal (available in all views) */}
      {deleteModal}
   </div>
  );
};

