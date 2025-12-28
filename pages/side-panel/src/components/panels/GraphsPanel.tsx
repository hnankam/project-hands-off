import React, { useState, useRef, useCallback } from 'react';
import { cn } from '@extension/ui';
import { debug } from '@extension/shared';
import { GraphStateCard, convertToGraphAgentState, type UnifiedAgentState } from '../graph-state';
import { useCopilotAgent } from '../../hooks/copilotkit/useCopilotAgent';

interface GraphsPanelProps {
  isLight: boolean;
  isOpen: boolean;
  onClose: () => void;
  graphs?: Record<string, any>;
  sessionId?: string;
  onWidthChange?: (width: number) => void;
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
  onWidthChange 
}) => {
  const [width, setWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(DEFAULT_PANEL_WIDTH);
  
  // Get setState from CopilotKit agent for editing graph steps
  const { setState: setAgentState } = useCopilotAgent<UnifiedAgentState>({
    agentId: 'dynamic_agent',
    initialState: { sessionId, plans: {}, graphs: {} },
  });

  // Debug logging
  React.useEffect(() => {
    debug.log('[GraphsPanel] Render:', {
      isOpen,
      sessionId: sessionId?.slice(0, 8),
      graphsCount: graphs ? Object.keys(graphs).length : 0,
      graphs: graphs,
      width,
      hasOnClose: !!onClose,
      hasOnWidthChange: !!onWidthChange,
    });
  }, [isOpen, sessionId, graphs, width, onClose, onWidthChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = width;
  }, [width]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    
    const deltaX = resizeStartX.current - e.clientX; // Reversed: dragging left increases width
    const newWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, resizeStartWidth.current + deltaX));
    
    setWidth(newWidth);
    onWidthChange?.(newWidth);
  }, [isResizing, onWidthChange]);

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

  // Debug: Log render decision
  React.useEffect(() => {
    debug.log('[GraphsPanel] Render check:', {
      isOpen,
      willRender: isOpen,
      sessionId: sessionId?.slice(0, 8),
    });
  }, [isOpen, sessionId]);

  if (!isOpen) {
    debug.log('[GraphsPanel] Returning null because isOpen is false');
    return null;
  }

  const graphEntries = graphs ? Object.entries(graphs) : [];

  debug.log('[GraphsPanel] Rendering panel:', {
    width,
    graphEntries: graphEntries.length,
    sessionId: sessionId?.slice(0, 8),
  });

  return (
    <div
      className={cn(
        'absolute right-0 top-0 bottom-0 z-40 border-l flex flex-col',
        isLight ? 'bg-white border-gray-200' : 'border-gray-700'
      )}
      style={{ 
        backgroundColor: isLight ? '#ffffff' : '#0D1117',
        width: `${width}px`,
        transition: isResizing ? 'none' : 'width 0.2s ease-in-out'
      }}
    >
      {/* Resize handle */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500/50 transition-colors',
          isResizing && 'bg-blue-500'
        )}
        onMouseDown={handleMouseDown}
      />
      {/* Header */}
      <div className={cn(
        'flex items-center justify-between px-2 py-1 border-b h-[34px]',
        isLight ? 'bg-gray-50 border-gray-200' : 'bg-[#151C24] border-gray-700'
      )}>
        <div className="flex items-center gap-2">
          <svg 
            className={cn('w-3.5 h-3.5', isLight ? 'text-gray-600' : 'text-gray-400')}
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          <h2 className={cn('text-xs', isLight ? 'text-gray-900' : 'text-[#bcc1c7]')}>
            Session Graphs
          </h2>
        </div>
        <button
          onClick={onClose}
          className={cn(
            'p-0.5 rounded-md transition-colors',
            isLight ? 'text-gray-500 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-700'
          )}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {graphEntries.length === 0 ? (
          <div className={cn(
            'text-center py-8 text-sm',
            isLight ? 'text-gray-500' : 'text-gray-400'
          )}>
            <svg 
              className={cn('w-12 h-12 mx-auto mb-3', isLight ? 'text-gray-300' : 'text-gray-600')}
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="1.5"
            >
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <p>No graphs in this session yet.</p>
            <p className="mt-1 text-xs opacity-75">Graphs will appear here as they're created during your conversation.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {graphEntries.map(([graphId, graph]) => {
              // Convert to GraphAgentState for rendering
              const graphState = convertToGraphAgentState({ graphs: { [graphId]: graph } });
              
              if (!graphState) {
                return null;
              }

              return (
                <GraphStateCard
                  key={graphId}
                  state={graphState}
                  setState={setAgentState}
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
  );
};

