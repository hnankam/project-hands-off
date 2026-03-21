import * as React from 'react';
import { useState, useRef, useCallback } from 'react';
import { cn } from '@extension/ui';
import { debug } from '@extension/shared';
import { PlanStateCard } from '../cards/PlanStateCard';
import { ModalCloseButton } from '../modals/ModalCloseButton';
import type { UnifiedAgentState } from '../graph-state/types';

interface PlansPanelProps {
  isLight: boolean;
  isOpen: boolean;
  onClose: () => void;
  plans?: Record<string, any>;
  sessionId?: string;
  onPlansUpdate?: (plans: Record<string, any>) => void;
  onWidthChange?: (width: number) => void;
  initialWidth?: number;
  isSmallView?: boolean;
  chatFontSize?: 'small' | 'medium' | 'large';
}

const MIN_PANEL_WIDTH = 300;
const MAX_PANEL_WIDTH = 800;
const DEFAULT_PANEL_WIDTH = 384;

export const PlansPanel: React.FC<PlansPanelProps> = ({
  isLight,
  isOpen,
  onClose,
  plans,
  sessionId,
  onPlansUpdate,
  onWidthChange,
  initialWidth = DEFAULT_PANEL_WIDTH,
  isSmallView = false,
  chatFontSize = 'medium',
}) => {
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(initialWidth);

  // Update width when initialWidth changes (e.g., when reopening panel)
  React.useEffect(() => {
    if (isOpen && initialWidth !== width) {
      setWidth(initialWidth);
      resizeStartWidth.current = initialWidth;
    }
  }, [isOpen, initialWidth, width]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = width;
    },
    [width],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;

      const deltaX = resizeStartX.current - e.clientX; // Reversed: dragging left increases width
      const newWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, resizeStartWidth.current + deltaX));

      setWidth(newWidth);
      onWidthChange?.(newWidth);
    },
    [isResizing, onWidthChange],
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  React.useEffect(() => {
    if (!isResizing) return;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // DEBUG: Log plans received by PlansPanel (must be before early return - hooks rules)
  React.useEffect(() => {
    const planIds = Object.keys(plans ?? {});
    debug.log('[SessionPlans] PlansPanel plans prop updated:', {
      sessionId: sessionId?.slice(0, 8),
      planCount: planIds.length,
      planIds,
    });
  }, [plans, sessionId]);

  if (!isOpen) {
    return null;
  }

  const planEntries = plans ? Object.entries(plans) : [];

  return (
    <>
      {/* Backdrop for small view overlay */}
      {isSmallView && (
        <div className="absolute inset-0 z-30 bg-black/50" onClick={onClose} style={{ pointerEvents: 'auto' }} />
      )}

      <div
        className={cn(
          'font-size- absolute top-0 right-0 bottom-0 z-40 flex flex-col border-l' + chatFontSize,
          isLight ? 'border-gray-200 bg-white' : 'border-gray-700',
        )}
        style={{
          backgroundColor: isLight ? '#ffffff' : '#0D1117',
          width: isSmallView ? '85vw' : `${width}px`,
          maxWidth: isSmallView ? '400px' : undefined,
          transition: isResizing ? 'none' : 'width 0.2s ease-in-out',
          pointerEvents: 'auto',
        }}>
        {/* Resize handle - only show in large view */}
        {!isSmallView && (
          <div
            className={cn(
              'absolute top-0 bottom-0 left-0 w-1 cursor-ew-resize transition-colors hover:bg-blue-500/50',
              isResizing && 'bg-blue-500',
            )}
            onMouseDown={handleMouseDown}
          />
        )}
        {/* Header */}
        <div
          className={cn(
            'flex h-[37px] min-h-[37px] items-center justify-between border-b px-2 py-1',
            isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
          )}>
          <div className="flex items-center gap-2">
            <svg
              className={cn('h-3.5 w-3.5', isLight ? 'text-gray-600' : 'text-gray-400')}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <h2 className={cn('text-xs', isLight ? 'text-gray-900' : 'text-[#bcc1c7]')}>Chat Plans</h2>
          </div>
          <ModalCloseButton onClick={onClose} isLight={isLight} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {planEntries.length === 0 ? (
            <div className={cn('py-8 text-center text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>
              <svg
                className={cn('mx-auto mb-3 h-12 w-12', isLight ? 'text-gray-300' : 'text-gray-600')}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              <p>No plans in this session yet.</p>
              <p className="mt-1 text-xs opacity-75">
                Plans will appear here as they're created during your conversation.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {planEntries.map(([planId, plan]) => {
                const planState: UnifiedAgentState = {
                  sessionId: sessionId || '',
                  plans: { [planId]: plan },
                  graphs: {},
                };

                // Create setState handler if onPlansUpdate is provided
                // IMPORTANT: Merge with existing plans - each PlanStateCard receives scoped state
                // with only its plan, so newState.plans contains only that plan's update.
                // We must merge into the full plans object to avoid wiping out other plans.
                const handleSetState = onPlansUpdate
                  ? (newState: UnifiedAgentState) => {
                      if (newState.plans) {
                        const merged = { ...plans, ...newState.plans };
                        debug.log('[SessionPlans] PlansPanel handleSetState called:', {
                          planId,
                          incomingPlanIds: Object.keys(newState.plans),
                          existingPlanIds: Object.keys(plans ?? {}),
                          mergedPlanIds: Object.keys(merged),
                        });
                        onPlansUpdate(merged);
                      }
                    }
                  : undefined;

                return <PlanStateCard key={planId} state={planState} setState={handleSetState} isCollapsed={false} />;
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
