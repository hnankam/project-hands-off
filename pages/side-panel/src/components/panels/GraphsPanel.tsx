import * as React from 'react';
import { useState, useRef, useCallback } from 'react';
import { cn } from '@extension/ui';
import { GraphStateCard, convertToGraphAgentState, type UnifiedAgentState } from '../graph-state';
import { useCopilotAgent } from '../../hooks/copilotkit/useCopilotAgent';
import { ModalCloseButton } from '../modals/ModalCloseButton';

interface GraphsPanelProps {
  isLight: boolean;
  isOpen: boolean;
  onClose: () => void;
  graphs?: Record<string, any>;
  sessionId?: string;
  onGraphsUpdate?: (graphs: Record<string, any>) => void;
  onWidthChange?: (width: number) => void;
  initialWidth?: number;
  isSmallView?: boolean;
  chatFontSize?: 'small' | 'medium' | 'large';
}

const MIN_PANEL_WIDTH = 300;
const MAX_PANEL_WIDTH = 800;
const DEFAULT_PANEL_WIDTH = 384;

export const GraphsPanel: React.FC<GraphsPanelProps> = ({
  isLight,
  isOpen,
  onClose,
  graphs,
  sessionId,
  onGraphsUpdate,
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

  // Early return for closed state - all hooks must run before this (React hooks rules)
  if (!isOpen) {
    return null;
  }

  const graphEntries = graphs ? Object.entries(graphs) : [];

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
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <h2 className={cn('text-xs', isLight ? 'text-gray-900' : 'text-[#bcc1c7]')}>Chat Graphs</h2>
          </div>
          <ModalCloseButton onClick={onClose} isLight={isLight} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {graphEntries.length === 0 ? (
            <div className={cn('py-8 text-center text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>
              <svg
                className={cn('mx-auto mb-3 h-12 w-12', isLight ? 'text-gray-300' : 'text-gray-600')}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              <p>No graphs in this session yet.</p>
              <p className="mt-1 text-xs opacity-75">
                Graphs will appear here as they're created during your conversation.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {graphEntries.map(([graphId, graph]) => {
                // Convert to GraphAgentState for rendering
                const graphState = convertToGraphAgentState({ graphs: { [graphId]: graph } });

                if (!graphState) {
                  return null;
                }

                // Create setState handler if onGraphsUpdate is provided
                const handleSetState = onGraphsUpdate
                  ? (newState: UnifiedAgentState) => {
                      if (newState.graphs) {
                        onGraphsUpdate(newState.graphs);
                      }
                    }
                  : undefined;

                return (
                  <GraphStateCard
                    key={graphId}
                    state={graphState}
                    setState={handleSetState as any}
                    isCollapsed={false}
                    sessionId={sessionId}
                    instanceId={graphId}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
