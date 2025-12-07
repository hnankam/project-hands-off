/**
 * Icon components for GraphStateCard
 * 
 * Status icons and node-specific icons for the multi-agent graph visualization.
 */

import type { FC } from 'react';
import React from 'react';

// ========== Status Icons ==========

export const SpinningLoader: FC<{ color?: string; size?: string }> = ({ color, size = 'h-4 w-4' }) => (
  <svg className={`animate-spin ${size} flex-shrink-0`} style={{ color }} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

export const CheckIcon: FC<{ className?: string; color?: string }> = ({ className = 'h-4 w-4', color }) => (
  <svg className={`${className} flex-shrink-0`} style={{ color: color || '#22c55e' }} fill="currentColor" viewBox="0 0 20 20">
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
      clipRule="evenodd"
    />
  </svg>
);

export const ErrorIcon: FC<{ className?: string; color?: string }> = ({ className = 'h-4 w-4', color }) => (
  <svg className={`${className} flex-shrink-0`} style={{ color: color || '#ef4444' }} fill="currentColor" viewBox="0 0 20 20">
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
      clipRule="evenodd"
    />
  </svg>
);

export const PendingIcon: FC<{ className?: string; color?: string }> = ({ className = 'h-4 w-4', color }) => (
  <svg className={`${className} flex-shrink-0`} style={{ color: color || '#9ca3af' }} fill="none" stroke="currentColor" viewBox="0 0 20 20">
    <circle cx="10" cy="10" r="7" strokeWidth="2" />
  </svg>
);

export const CancelledIcon: FC<{ className?: string; color?: string }> = ({ className = 'h-4 w-4', color }) => (
  <svg className={`${className} flex-shrink-0`} style={{ color: color || '#9ca3af' }} fill="none" stroke="currentColor" viewBox="0 0 20 20" strokeLinecap="round">
    <circle cx="10" cy="10" r="7" strokeWidth="2" opacity="0.5" />
    <line x1="7" y1="7" x2="13" y2="13" strokeWidth="2" />
    <line x1="13" y1="7" x2="7" y2="13" strokeWidth="2" />
  </svg>
);

// ========== Node Type Icons ==========

export const OrchestratorIcon: FC<{ className?: string; color?: string }> = ({ className = 'h-4 w-4', color }) => (
  <svg className={className} style={{ color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24" />
  </svg>
);

export const WebSearchIcon: FC<{ className?: string; color?: string }> = ({ className = 'h-4 w-4', color }) => (
  <svg className={className} style={{ color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {/* Globe icon - matches web_search copilot action */}
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    <path d="M2 12h20" />
  </svg>
);

export const ImageGenerationIcon: FC<{ className?: string; color?: string }> = ({ className = 'h-4 w-4', color }) => (
  <svg className={className} style={{ color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

export const CodeExecutionIcon: FC<{ className?: string; color?: string }> = ({ className = 'h-4 w-4', color }) => (
  <svg className={className} style={{ color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
    <line x1="12" y1="2" x2="12" y2="22" opacity="0.3" />
  </svg>
);

export const ResultAggregatorIcon: FC<{ className?: string; color?: string }> = ({ className = 'h-4 w-4', color }) => (
  <svg className={className} style={{ color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);

export const DefaultNodeIcon: FC<{ className?: string; color?: string }> = ({ className = 'h-4 w-4', color }) => (
  <svg className={className} style={{ color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const GraphIcon: FC<{ className?: string; color?: string }> = ({ className = 'h-5 w-5', color }) => (
  <svg className={className} style={{ color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

// ========== Node Name Helpers ==========

/** Normalize node name to canonical form (handles both snake_case and CamelCase) */
export const normalizeNodeName = (node: string): string => {
  const normalized = node.toLowerCase().replace(/_/g, '');
  switch (normalized) {
    case 'websearch': return 'WebSearch';
    case 'imagegeneration': return 'ImageGeneration';
    case 'codeexecution': return 'CodeExecution';
    case 'resultaggregator': return 'ResultAggregator';
    case 'orchestrator': return 'Orchestrator';
    default: return node;
  }
};

/** Get the appropriate icon component for a node */
export const getNodeIcon = (node: string, className?: string, color?: string): React.ReactNode => {
  const props = { className: className || 'h-4 w-4', color };
  const normalized = node.toLowerCase().replace(/_/g, '');
  switch (normalized) {
    case 'orchestrator':
      return <OrchestratorIcon {...props} />;
    case 'websearch':
      return <WebSearchIcon {...props} />;
    case 'imagegeneration':
      return <ImageGenerationIcon {...props} />;
    case 'codeexecution':
      return <CodeExecutionIcon {...props} />;
    case 'resultaggregator':
      return <ResultAggregatorIcon {...props} />;
    default:
      return <DefaultNodeIcon {...props} />;
  }
};

/** Get icon for a node in the flow diagram */
export const getFlowNodeIcon = (node: string, className: string, color: string): React.ReactNode => {
  const normalized = normalizeNodeName(node);
  switch (normalized) {
    case 'WebSearch':
      return <WebSearchIcon className={className} color={color} />;
    case 'ImageGeneration':
      return <ImageGenerationIcon className={className} color={color} />;
    case 'CodeExecution':
      return <CodeExecutionIcon className={className} color={color} />;
    case 'ResultAggregator':
      return <ResultAggregatorIcon className={className} color={color} />;
    default:
      return <DefaultNodeIcon className={className} color={color} />;
  }
};

/** Get short label for a node */
export const getNodeLabel = (node: string): string => {
  const normalized = normalizeNodeName(node);
  switch (normalized) {
    case 'WebSearch': return 'Search';
    case 'ImageGeneration': return 'Image';
    case 'CodeExecution': return 'Code';
    case 'ResultAggregator': return 'Aggregate';
    default: return node;
  }
};

/** Chevron icon for expand/collapse */
export const ChevronIcon: FC<{ isExpanded: boolean; isLight: boolean }> = ({ isExpanded, isLight }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      transition: 'transform 0.2s ease-in-out',
      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
      color: isLight ? '#6b7280' : '#9ca3af',
    }}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

