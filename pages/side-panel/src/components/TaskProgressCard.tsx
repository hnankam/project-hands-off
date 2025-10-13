import type { FC } from 'react';
import React, { useState } from 'react';
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

  if (!state.steps || state.steps.length === 0) {
    return null;
  }

  // Filter out deleted steps from counts
  const activeSteps = state.steps.filter((step) => step.status !== "deleted");
  const completedCount = activeSteps.filter((step) => step.status === "completed").length;
  const progressPercentage = activeSteps.length > 0 ? (completedCount / activeSteps.length) * 100 : 0;
  const isLight = theme === 'light';

  // Collapsed view - compact single line
  if (!isExpanded) {
    const hasRunning = !isHistorical && state.steps.some(s => s.status === 'running');
    const hasFailed = state.steps.some(s => s.status === 'failed');
    const failedCount = state.steps.filter(s => s.status === 'failed').length;
    
    return (
      <div
        ref={cardRef as any}
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

          return (
            <div
              key={index}
              className={`group flex items-center gap-1.5 px-1.5 py-1 rounded transition-all ${
                isDeleted
                  ? isLight
                    ? "bg-gray-100 border border-gray-300 opacity-60"
                    : "bg-gray-800/50 border border-gray-600 opacity-60"
                  : isCompleted
                    ? isLight
                      ? "bg-green-50 border border-green-200"
                      : "bg-green-500/10 border border-green-500/30"
                    : isRunning
                      ? isLight
                        ? "bg-blue-50 border border-blue-200"
                        : "bg-blue-500/10 border border-blue-500/30"
                    : isFailed
                      ? isLight
                        ? "bg-red-50 border border-red-200"
                        : "bg-red-500/10 border border-red-500/30"
                      : isLight
                        ? "bg-gray-50/50 border border-gray-200/50"
                        : "bg-gray-600/10 border border-gray-600/30"
              }`}
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
                    isDeleted
                      ? isLight
                        ? 'text-gray-500'
                        : 'text-gray-500'
                      : isCompleted
                        ? 'text-green-600 font-medium'
                        : isRunning
                          ? isLight
                            ? 'text-gray-700 font-medium'
                            : 'text-gray-200 font-medium'
                          : isFailed
                            ? 'text-red-600 font-medium'
                            : isLight
                              ? 'text-gray-500'
                              : 'text-gray-400'
                  }`}
                >
                  {step.description}
                </div>
              )}

              {/* Action Buttons - only show for non-historical cards on hover and not for deleted steps */}
              {showControls && !isHistorical && !isDeleted && editingStepIndex !== index && setState && (
                <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                  
                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log('[Delete] Button clicked for step index:', index);
                      console.log('[Delete] Current step:', state.steps[index]);
                      console.log('[Delete] setState available:', !!setState);
                      const newSteps = [...state.steps];
                      newSteps[index] = {
                        ...newSteps[index],
                        status: 'deleted' as const
                      };
                      console.log('[Delete] New steps array:', newSteps);
                      console.log('[Delete] Updated step:', newSteps[index]);
                      setState({ ...state, steps: newSteps });
                      console.log('[Delete] setState called with new state');
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
                </div>
              )}
            </div>
          );
        })}
      </div>
   </div>
  );
};

