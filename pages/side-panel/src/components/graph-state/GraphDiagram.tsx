/**
 * GraphDiagram Component
 * 
 * Displays the execution plan for a multi-agent graph with status indicators.
 * Shows planned steps, their execution order, and current status.
 * Optionally toggles to show Mermaid diagram of the graph structure.
 */

import type { FC } from 'react';
import React, { useState, useMemo, memo } from 'react';
import { MermaidBlock } from '../MermaidBlock';
import { 
  SpinningLoader, 
  CheckIcon, 
  ErrorIcon,
  normalizeNodeName, 
  getFlowNodeIcon, 
  getNodeLabel 
} from './icons';
import type { GraphStep } from './types';

interface GraphDiagramProps {
  isLight: boolean;
  steps: GraphStep[];
  plannedSteps?: string[];
  mermaidDiagram?: string;
  isComplete: boolean;
}

export const GraphDiagram: FC<GraphDiagramProps> = memo(({ 
  isLight, 
  steps, 
  plannedSteps, 
  mermaidDiagram, 
  isComplete 
}) => {
  const [viewMode, setViewMode] = useState<'plan' | 'graph'>('plan');
  const grayColor = isLight ? '#6b7280' : '#9ca3af';
  const grayBg = isLight ? '#ffffff' : '#374151';
  
  // Build a map of step statuses for quick lookup
  const stepStatusMap = useMemo(() => {
    const map: Record<string, string> = {};
    steps.forEach(step => {
      const normalized = normalizeNodeName(step.node);
      map[normalized] = step.status;
    });
    return map;
  }, [steps]);
  
  // Build display steps from ACTUAL execution order + remaining planned steps
  const displaySteps = useMemo(() => {
    // Get actually executed steps (excluding Orchestrator)
    const executedSteps = steps
      .map(s => normalizeNodeName(s.node))
      .filter(n => n !== 'Orchestrator');
    
    // Count how many times each step has been executed
    const executedCounts: Record<string, number> = {};
    executedSteps.forEach(step => {
      executedCounts[step] = (executedCounts[step] || 0) + 1;
    });
    
    // Build the combined list: executed steps first, then remaining planned steps
    let combinedSteps: string[] = [...executedSteps];
    
    if (plannedSteps && plannedSteps.length > 0) {
      const normalizedPlanned = plannedSteps.map(normalizeNodeName);
      
      // Count planned occurrences
      const plannedCounts: Record<string, number> = {};
      normalizedPlanned.forEach(step => {
        plannedCounts[step] = (plannedCounts[step] || 0) + 1;
      });
      
      // Add remaining planned steps (ones not yet executed)
      for (const step of Object.keys(plannedCounts)) {
        const planned = plannedCounts[step] || 0;
        const executed = executedCounts[step] || 0;
        const remaining = planned - executed;
        
        for (let i = 0; i < remaining; i++) {
          combinedSteps.push(step);
        }
      }
    }
    
    if (combinedSteps.length === 0) {
      return [];
    }
    
    // Build final display with run numbers
    const counts: Record<string, number> = {};
    const totalCounts: Record<string, number> = {};
    
    // Pre-count totals
    combinedSteps.forEach(step => {
      totalCounts[step] = (totalCounts[step] || 0) + 1;
    });
    
    return combinedSteps.map(step => {
      counts[step] = (counts[step] || 0) + 1;
      const totalOccurrences = totalCounts[step];
      if (totalOccurrences > 1) {
        return { node: step, runNumber: counts[step], totalRuns: totalOccurrences };
      }
      return { node: step, runNumber: 1, totalRuns: 1 };
    });
  }, [plannedSteps, steps]);
  
  // Build a map of step execution statuses by run number
  const stepRunStatusMap = useMemo(() => {
    const map: Record<string, GraphStep['status']> = {};
    const runCounts: Record<string, number> = {};
    steps.forEach(step => {
      const normalized = normalizeNodeName(step.node);
      if (normalized === 'Orchestrator') return;
      runCounts[normalized] = (runCounts[normalized] || 0) + 1;
      const key = `${normalized}-${runCounts[normalized]}`;
      map[key] = step.status;
    });
    return map;
  }, [steps]);
  
  // Get status icon for a step with run number
  const getStepStatusIcon = (node: string, runNumber: number) => {
    const key = `${node}-${runNumber}`;
    const status = stepRunStatusMap[key];
    if (status === 'completed') {
      return <CheckIcon className="h-3 w-3" color={grayColor} />;
    } else if (status === 'in_progress') {
      return <SpinningLoader size="h-3 w-3" color={grayColor} />;
    } else if (status === 'error') {
      return <ErrorIcon className="h-3 w-3" color={grayColor} />;
    } else if (status === 'cancelled') {
      return (
        <svg className="h-3 w-3" viewBox="0 0 20 20" fill="none" stroke={grayColor} strokeWidth="2" strokeLinecap="round">
          <circle cx="10" cy="10" r="7" opacity="0.5" />
          <line x1="7" y1="7" x2="13" y2="13" />
          <line x1="13" y1="7" x2="7" y2="13" />
        </svg>
      );
    }
    // Pending - show empty circle
    return (
      <svg className="h-3 w-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="10" cy="10" r="7" />
      </svg>
    );
  };

  // Toggle button styles
  const toggleButtonBase = `px-2 py-1 text-xs font-medium transition-colors`;
  const toggleButtonActive = isLight 
    ? 'bg-gray-200 text-gray-700' 
    : 'bg-gray-600 text-gray-100';
  const toggleButtonInactive = isLight 
    ? 'text-gray-500 hover:bg-gray-100' 
    : 'text-gray-400 hover:bg-gray-700';

  return (
    <div className={`p-3 rounded-lg mb-3 ${isLight ? 'bg-gray-50' : 'bg-[#1a2332]'}`}>
      {/* Header with toggle */}
      <div className="flex items-center justify-between mb-2">
        <p className={`text-xs font-medium ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
          {viewMode === 'plan' ? 'Execution Plan' : 'Graph Structure'}
        </p>
        
        {/* Toggle buttons - only show if mermaid diagram is available */}
        {mermaidDiagram && (
          <div className={`flex rounded overflow-hidden border ${isLight ? 'border-gray-200' : 'border-gray-600'}`}>
            <button
              onClick={() => setViewMode('plan')}
              className={`${toggleButtonBase} ${viewMode === 'plan' ? toggleButtonActive : toggleButtonInactive}`}
              title="View execution plan"
            >
              <svg className="h-3 w-3 inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                <path d="M9 12h6M9 16h6" />
              </svg>
              Plan
            </button>
            <button
              onClick={() => setViewMode('graph')}
              className={`${toggleButtonBase} ${viewMode === 'graph' ? toggleButtonActive : toggleButtonInactive}`}
              title="View graph structure"
            >
              <svg className="h-3 w-3 inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="5" cy="12" r="3" />
                <circle cx="19" cy="6" r="3" />
                <circle cx="19" cy="18" r="3" />
                <path d="M8 12h5M13 12l3-3M13 12l3 3" />
              </svg>
              Graph
            </button>
          </div>
        )}
      </div>
      
      {/* Content based on view mode */}
      {viewMode === 'graph' && mermaidDiagram ? (
        <div className="max-h-80 overflow-auto">
          <MermaidBlock>{mermaidDiagram}</MermaidBlock>
        </div>
      ) : (
        <>
          {/* Execution plan view */}
          {displaySteps.length === 0 ? (
            <p className={`text-xs ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
              Waiting for orchestrator to plan execution...
            </p>
          ) : (
            <div className="flex items-center justify-start gap-2 flex-wrap text-xs">
              {/* Start */}
              <div 
                className="px-2 py-1 rounded-full flex items-center gap-1"
                style={{ backgroundColor: grayBg, color: grayColor }}
              >
                <CheckIcon className="h-3 w-3" color={grayColor} />
                Start
              </div>
              
              {/* Arrow */}
              <svg className={`h-4 w-4 ${isLight ? 'text-gray-400' : 'text-gray-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              
              {/* Planned/Executed steps with status */}
              {displaySteps.map((stepInfo, index) => (
                <React.Fragment key={`${stepInfo.node}-${stepInfo.runNumber}-${index}`}>
                  <div 
                    className="px-2 py-1 rounded flex items-center gap-1"
                    style={{ backgroundColor: grayBg, color: grayColor }}
                  >
                    {getStepStatusIcon(stepInfo.node, stepInfo.runNumber)}
                    {getFlowNodeIcon(stepInfo.node, 'h-3 w-3', grayColor)}
                    <span>
                      {getNodeLabel(stepInfo.node)}
                      {stepInfo.totalRuns > 1 && (
                        <span className="opacity-60 ml-0.5">({stepInfo.runNumber})</span>
                      )}
                    </span>
                  </div>
                  {index < displaySteps.length - 1 && (
                    <svg className={`h-4 w-4 ${isLight ? 'text-gray-400' : 'text-gray-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  )}
                </React.Fragment>
              ))}
              
              {/* Arrow to End */}
              <svg className={`h-4 w-4 ${isLight ? 'text-gray-400' : 'text-gray-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              
              {/* End */}
              <div 
                className="px-2 py-1 rounded-full flex items-center gap-1"
                style={{ backgroundColor: grayBg, color: grayColor }}
              >
                {isComplete ? <CheckIcon className="h-3 w-3" color={grayColor} /> : (
                  <svg className="h-3 w-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="10" cy="10" r="7" />
                  </svg>
                )}
                End
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
});

GraphDiagram.displayName = 'GraphDiagram';

