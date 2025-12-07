import type { FC } from 'react';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { MarkdownRenderer } from './tiptap/MarkdownRenderer';

// Persist expanded state across remounts (for Virtua virtualization)
const expandedStateCache: Map<string, boolean> = new Map();
// Track if user has manually closed a card (persists across remounts)
const userClosedCache: Map<string, boolean> = new Map();
// Persist step result expanded state across remounts
const stepResultExpandedCache: Map<string, boolean> = new Map();
// Persist step process expanded state across remounts
const stepProcessExpandedCache: Map<string, boolean> = new Map();

// ========== Thinking Block Utilities ==========

interface ThinkingContent {
  thinking: string;
  rest: string;
}

/**
 * Represents a section of content - either thinking or content
 * Used to preserve interleaved structure (thinking1, output1, thinking2, output2, etc.)
 */
interface ContentSection {
  type: 'thinking' | 'content';
  content: string;
}

/**
 * Check if a <think> tag at a given position is a structural tag (block opener)
 * vs a mentioned-as-text tag (being discussed in content)
 * 
 * Structural tags are:
 * - At the start of the string, or
 * - Preceded by a newline (possibly with whitespace), or
 * - Preceded by } (end of JSON object)
 * 
 * Mentioned-as-text tags are:
 * - Inside backticks: `<think>`
 * - Inside quotes: "<think>"
 * - In the middle of a sentence
 */
function isStructuralThinkTag(text: string, tagStart: number): boolean {
  // At the very start of text
  if (tagStart === 0) return true;
  
  const beforeTag = text.slice(Math.max(0, tagStart - 50), tagStart);
  
  // Check if inside backticks (inline code) - look for odd number of backticks before
  const backtickCount = (beforeTag.match(/`/g) || []).length;
  if (backtickCount % 2 === 1) return false;
  
  // Check the immediate preceding character(s)
  const trimmedBefore = beforeTag.trimEnd();
  if (trimmedBefore.length === 0) return true;
  
  const lastChar = trimmedBefore[trimmedBefore.length - 1];
  
  // Structural if preceded by:
  // - newline (\n)
  // - closing brace (}) - end of JSON
  // - quote (") - might be end of string
  // - closing angle bracket (>) - end of previous </think> tag (for consecutive think blocks)
  if (lastChar === '\n' || lastChar === '}' || lastChar === '"' || lastChar === '>') {
    return true;
  }
  
  // Check if preceded by whitespace that follows a newline
  const lines = beforeTag.split('\n');
  if (lines.length > 1) {
    const lastLine = lines[lines.length - 1];
    if (lastLine.trim() === '') return true;
  }
  
  return false;
}

/**
 * Parse content into ordered sections (thinking and content blocks interleaved)
 * This preserves the structure: thinking1 -> output1 -> thinking2 -> output2
 * 
 * Only matches <think> tags that are structural separators, ignoring tags
 * that are mentioned as text within content (e.g., inside backticks or quotes)
 */
function parseContentIntoSections(text: string): ContentSection[] {
  if (!text) return [];
  
  const sections: ContentSection[] = [];
  const thinkRegex = /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi;
  let lastIndex = 0;
  let match;
  
  while ((match = thinkRegex.exec(text)) !== null) {
    // Check if this is a structural tag or mentioned-as-text
    if (!isStructuralThinkTag(text, match.index)) {
      // This tag is mentioned as text, skip it as a section boundary
      continue;
    }
    
    // Add any content before this thinking block
    const beforeContent = text.slice(lastIndex, match.index).trim();
    if (beforeContent) {
      sections.push({ type: 'content', content: beforeContent });
    }
    
    // Add the thinking block
    const thinkContent = match[1].trim();
    if (thinkContent) {
      sections.push({ type: 'thinking', content: thinkContent });
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add any remaining content after the last thinking block
  const afterContent = text.slice(lastIndex).trim();
  if (afterContent) {
    sections.push({ type: 'content', content: afterContent });
  }
  
  // Clean up any orphaned/trailing think tags from all content sections
  // This handles cases where tags are malformed or partially matched
  return sections.map(section => {
    if (section.type === 'content') {
      let cleaned = section.content
        // Remove orphaned opening tags
        .replace(/<think(?:ing)?>\s*/gi, '')
        // Remove orphaned closing tags
        .replace(/\s*<\/think(?:ing)?>/gi, '')
        .trim();
      return { ...section, content: cleaned };
    }
    return section;
  }).filter(section => section.content.length > 0);
}

/**
 * Extract thinking content from text that contains <think>...</think> or <thinking>...</thinking> tags
 * This is the legacy function that combines all thinking into one block.
 * For preserving interleaved structure, use parseContentIntoSections instead.
 * 
 * Only matches structural think tags, ignoring tags mentioned as text.
 */
function extractThinkingContent(text: string): ThinkingContent {
  if (!text) return { thinking: '', rest: text || '' };
  
  const sections = parseContentIntoSections(text);
  
  const thinkingSections = sections
    .filter(s => s.type === 'thinking')
    .map(s => s.content);
  
  const contentSections = sections
    .filter(s => s.type === 'content')
    .map(s => s.content);
  
  return {
    thinking: thinkingSections.join('\n\n'),
    rest: contentSections.join('\n\n'),
  };
}

/**
 * Inline ThinkingBlock component for GraphStateCard
 * Matches the design of the main ThinkingBlock component
 */
const InlineThinkingBlock: FC<{ 
  content: string; 
  isLight: boolean;
  defaultOpen?: boolean;
  isComplete?: boolean;
}> = ({ content, isLight, defaultOpen = false, isComplete = true }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isHovered, setIsHovered] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  
  if (!content) return null;
  
  return (
    <div className={`thinking-block ${isLight ? 'text-gray-600' : 'text-gray-500'}`} style={{ fontSize: 12 }}>
      {/* Accordion Header - matches ThinkingBlock design */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          padding: 4,
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
        }}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        aria-expanded={isOpen}
      >
        {/* Lightbulb icon - matches ThinkingBlock */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            flexShrink: 0,
            marginRight: 6,
            color: isLight ? '#4b5563' : '#6b7280',
          }}
        >
          <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>

        {/* Title */}
        <span style={{ flex: 1 }}>{isComplete ? 'Thought' : 'Thinking...'}</span>

        {/* Chevron icon - only visible on hover */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            marginLeft: 6,
            transition: 'transform 0.2s ease-in-out, opacity 0.2s ease-in-out',
            transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
            opacity: isHovered ? 1 : 0,
          }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
      
      {/* Accordion Content */}
      <div
        style={{
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-in-out, opacity 0.2s ease-in-out',
          maxHeight: isOpen ? (isComplete ? '500px' : '75vh') : '0',
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div
          style={{
            paddingLeft: 8,
            paddingRight: 6,
            paddingBottom: 0,
            paddingTop: 0,
            marginLeft: 13,
          }}
        >
          <div
            ref={contentRef}
            className={`mb-4 text-xs opacity-80 ${
              isComplete
                ? 'graph-scrollbar max-h-40 overflow-y-auto overscroll-contain'
                : 'graph-scrollbar max-h-[75vh] overflow-y-auto overscroll-contain'
            }`}
          >
            <div className="thinking-block-content">
              <MarkdownRenderer content={content} isLight={isLight} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ========== Types ==========

export interface GraphToolCall {
  tool_name: string;
  args: string;
  result: string;
  status: 'in_progress' | 'completed' | 'error';
}

export interface GraphStep {
  node: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error' | 'cancelled';
  result: string;
  prompt?: string;  // Prompt sent to the sub-agent
  streaming_text?: string;  // Live streaming text during execution
  tool_calls?: GraphToolCall[];  // Tool calls made during this step
  timestamp: string;
}

// GraphAgentState format - sent during graph execution
export interface GraphAgentState {
  query: string;
  original_query: string;
  current_node: string;
  iteration: number;
  max_iterations: number;
  steps: GraphStep[];
  planned_steps?: string[];  // Planned execution sequence from orchestrator
  mermaid_diagram?: string;  // Mermaid diagram of the graph structure
  final_result: string;
  status: 'pending' | 'running' | 'completed' | 'error';
}

// Backend GraphState format (nested inside full AgentState)
export interface BackendGraphState {
  query: string;
  original_query: string;
  result: string;
  query_type: string;
  execution_history: string[];
  intermediate_results: Record<string, string>;
  errors: Array<{ node?: string; error?: string; timestamp?: string }>;
  last_error_node: string;
  retry_count: number;
  max_retries: number;
  iteration_count: number;
  max_iterations: number;
  should_continue: boolean;
  next_action: string;
  planned_steps?: string[];  // Planned execution sequence from orchestrator
  mermaid_diagram?: string;  // Mermaid diagram of the graph structure
}

// Plan step format (from create_plan/update_plan_step)
export interface PlanStep {
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'deleted';
}

// Unified state that matches backend AgentState
// Can receive either flat GraphAgentState or nested { steps, graph } format
export interface UnifiedAgentState {
  // Plan steps (from create_plan)
  steps?: PlanStep[] | GraphStep[];
  // Graph state (nested format from full AgentState)
  graph?: BackendGraphState;
  // GraphAgentState flat fields (when receiving graph execution updates)
  query?: string;
  original_query?: string;
  current_node?: string;
  iteration?: number;
  max_iterations?: number;
  planned_steps?: string[];  // Planned execution sequence from orchestrator
  final_result?: string;
  status?: 'pending' | 'running' | 'completed' | 'error';
  // Session tracking
  sessionId?: string;
}

// Helper to detect if steps are GraphStep[] or PlanStep[]
export function isGraphSteps(steps: unknown[]): steps is GraphStep[] {
  if (!steps || steps.length === 0) return false;
  const first = steps[0] as Record<string, unknown>;
  return 'node' in first;
}

// Helper to detect if steps are PlanStep[]
export function isPlanSteps(steps: unknown[]): steps is PlanStep[] {
  if (!steps || steps.length === 0) return false;
  const first = steps[0] as Record<string, unknown>;
  return 'description' in first;
}

// Convert BackendGraphState to GraphAgentState format for rendering
export function convertToGraphAgentState(state: UnifiedAgentState): GraphAgentState | null {
  // Case 1: Already in GraphAgentState format (flat structure with graph steps)
  if (state.steps && isGraphSteps(state.steps)) {
    return {
      query: state.query || '',
      original_query: state.original_query || state.query || '',
      current_node: state.current_node || '',
      iteration: state.iteration || 0,
      max_iterations: state.max_iterations || 5,
      steps: state.steps as GraphStep[],
      planned_steps: state.planned_steps,
      mermaid_diagram: (state as GraphAgentState).mermaid_diagram,
      final_result: state.final_result || '',
      status: state.status || 'pending',
    };
  }
  
  // Case 2: Nested graph format from full AgentState
  if (state.graph && state.graph.execution_history && state.graph.execution_history.length > 0) {
    const g = state.graph;
    
    // Build steps from execution_history
    const steps: GraphStep[] = g.execution_history.map((node) => {
      const result = g.intermediate_results?.[node] || '';
      const nodeErrors = g.errors?.filter(e => e.node === node) || [];
      
      let status: GraphStep['status'] = 'completed';
      let stepResult = result;
      
      if (nodeErrors.length > 0) {
        status = 'error';
        stepResult = nodeErrors[nodeErrors.length - 1]?.error || 'Unknown error';
      }
      
      return {
        node,
        status,
        result: stepResult,  // Full result - component handles markdown rendering
        timestamp: new Date().toISOString(),
      };
    });
    
    // NOTE: Don't add next_action as a step - the backend sends proper steps
    // with correct CamelCase names (ResultAggregator vs result_aggregator).
    // The backend's _build_graph_agent_state handles step creation.
    
    // Determine overall status
    let status: GraphAgentState['status'] = 'pending';
    if (g.errors && g.errors.length > 0) {
      status = 'error';
    } else if (g.result) {
      status = 'completed';
    } else if (g.execution_history.length > 0 || g.next_action) {
      status = 'running';
    }
    
    return {
      query: g.query || '',
      original_query: g.original_query || g.query || '',
      current_node: g.next_action || '',
      iteration: g.iteration_count || 0,
      max_iterations: g.max_iterations || 5,
      steps,
      planned_steps: g.planned_steps,
      mermaid_diagram: g.mermaid_diagram,
      final_result: g.result || '',
      status,
    };
  }
  
  return null;
}

interface GraphStateCardProps {
  state: GraphAgentState;
  isCollapsed?: boolean;
  sessionId?: string;
  instanceId?: string; // unique ID to persist expanded state across remounts
}

// ========== Icons ==========

const SpinningLoader: FC<{ color?: string; size?: string }> = ({ color, size = 'h-4 w-4' }) => (
  <svg className={`animate-spin ${size} flex-shrink-0`} style={{ color }} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

const CheckIcon: FC<{ className?: string; color?: string }> = ({ className = 'h-4 w-4', color }) => (
  <svg className={`${className} flex-shrink-0`} style={{ color: color || '#22c55e' }} fill="currentColor" viewBox="0 0 20 20">
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
      clipRule="evenodd"
    />
  </svg>
);

const ErrorIcon: FC<{ className?: string; color?: string }> = ({ className = 'h-4 w-4', color }) => (
  <svg className={`${className} flex-shrink-0`} style={{ color: color || '#ef4444' }} fill="currentColor" viewBox="0 0 20 20">
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
      clipRule="evenodd"
    />
  </svg>
);

const PendingIcon: FC<{ className?: string; color?: string }> = ({ className = 'h-4 w-4', color }) => (
  <svg className={`${className} flex-shrink-0`} style={{ color: color || '#9ca3af' }} fill="none" stroke="currentColor" viewBox="0 0 20 20">
    <circle cx="10" cy="10" r="7" strokeWidth="2" />
  </svg>
);

const CancelledIcon: FC<{ className?: string; color?: string }> = ({ className = 'h-4 w-4', color }) => (
  <svg className={`${className} flex-shrink-0`} style={{ color: color || '#9ca3af' }} fill="none" stroke="currentColor" viewBox="0 0 20 20" strokeLinecap="round">
    <circle cx="10" cy="10" r="7" strokeWidth="2" opacity="0.5" />
    <line x1="7" y1="7" x2="13" y2="13" strokeWidth="2" />
    <line x1="13" y1="7" x2="7" y2="13" strokeWidth="2" />
  </svg>
);

// Professional SVG icons for each node type
const OrchestratorIcon: FC<{ className?: string; color?: string }> = ({ className = 'h-4 w-4', color }) => (
  <svg className={className} style={{ color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24" />
  </svg>
);

const WebSearchIcon: FC<{ className?: string; color?: string }> = ({ className = 'h-4 w-4', color }) => (
  <svg className={className} style={{ color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
    <path d="M11 8a3 3 0 0 0-3 3" />
  </svg>
);

const ImageGenerationIcon: FC<{ className?: string; color?: string }> = ({ className = 'h-4 w-4', color }) => (
  <svg className={className} style={{ color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const CodeExecutionIcon: FC<{ className?: string; color?: string }> = ({ className = 'h-4 w-4', color }) => (
  <svg className={className} style={{ color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
    <line x1="12" y1="2" x2="12" y2="22" opacity="0.3" />
  </svg>
);

const ResultAggregatorIcon: FC<{ className?: string; color?: string }> = ({ className = 'h-4 w-4', color }) => (
  <svg className={className} style={{ color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);

const DefaultNodeIcon: FC<{ className?: string; color?: string }> = ({ className = 'h-4 w-4', color }) => (
  <svg className={className} style={{ color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const GraphIcon: FC<{ className?: string; color?: string }> = ({ className = 'h-5 w-5', color }) => (
  <svg className={className} style={{ color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

// Get the appropriate icon component for a node
const getNodeIcon = (node: string, className?: string, color?: string): React.ReactNode => {
  const props = { className: className || 'h-4 w-4', color };
  // Normalize node name to handle both snake_case and CamelCase
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

// Chevron icon for expand/collapse (matches ActionStatus style)
const ChevronIcon: FC<{ isExpanded: boolean; isLight: boolean }> = ({ isExpanded, isLight }) => (
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

// Normalize node name to canonical form (handles both snake_case and CamelCase)
const normalizeNodeName = (node: string): string => {
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

// Helper to get icon for a node in the flow diagram
const getFlowNodeIcon = (node: string, className: string, color: string): React.ReactNode => {
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

// Helper to get short label for a node
const getNodeLabel = (node: string): string => {
  const normalized = normalizeNodeName(node);
  switch (normalized) {
    case 'WebSearch': return 'Search';
    case 'ImageGeneration': return 'Image';
    case 'CodeExecution': return 'Code';
    case 'ResultAggregator': return 'Aggregate';
    default: return node;
  }
};

// Import MermaidBlock for rendering graph structure
import { MermaidBlock } from './MermaidBlock';

// Graph flow diagram - shows planned steps with status indicators, with toggle for mermaid view
const GraphDiagram: FC<{ 
  isLight: boolean; 
  steps: GraphStep[];
  plannedSteps?: string[];
  mermaidDiagram?: string;
  isComplete: boolean;
}> = ({ isLight, steps, plannedSteps, mermaidDiagram, isComplete }) => {
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
  // This ensures the plan always reflects reality (what happened + what's still pending)
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
        
        // Add remaining occurrences as pending
        for (let i = 0; i < remaining; i++) {
          combinedSteps.push(step);
        }
      }
    }
    
    // If no steps at all, return empty
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
    // Group steps by node name and track by order
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
      // Cancelled - show X icon
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

  // Toggle button styles - no rounded corners on buttons since container handles it
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
                style={{ 
                  backgroundColor: grayBg,
                  color: grayColor
                }}
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
                    style={{ 
                      backgroundColor: grayBg,
                      color: grayColor
                    }}
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
                style={{ 
                  backgroundColor: grayBg,
                  color: grayColor
                }}
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
};

// ========== Markdown Rendering ==========
// Uses shared MarkdownRenderer component for consistent rendering with syntax highlighting

// Helper to extract image URLs from markdown content
const extractImageUrls = (content: string): string[] => {
  const imgRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
  const urls: string[] = [];
  let match;
  while ((match = imgRegex.exec(content)) !== null) {
    urls.push(match[1]);
  }
  return urls;
};

// Helper to remove image markdown from content (for separate rendering)
const removeImageMarkdown = (content: string): string => {
  return content.replace(/!\[.*?\]\(https?:\/\/[^\s)]+\)/g, '').trim();
};

// Helper to format tool call arguments for markdown rendering
// Parses JSON and formats code execution tools specially with code blocks
const formatToolArgsAsMarkdown = (toolName: string, args: string): string => {
  // Normalize tool name for comparison
  const normalizedToolName = toolName.toLowerCase();
  const isCodeTool = normalizedToolName.includes('code') || 
                     normalizedToolName.includes('execute') ||
                     normalizedToolName.includes('python');
  
  // Extract language from first line if it's a language identifier (pydantic-ai CodeExecutionTool format)
  const extractLanguageFromFirstLine = (code: string): { language: string; cleanCode: string } => {
    // Normalize line endings
    const normalizedCode = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalizedCode.split('\n');
    
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      const firstLineLower = firstLine.toLowerCase();
      
      // Case 1: First line is ONLY a language identifier (e.g., "python\n")
      if (/^[a-z][a-z0-9+#_\-\.]*$/i.test(firstLine) && firstLine.length >= 1 && firstLine.length <= 20) {
        return {
          language: firstLineLower,
          cleanCode: lines.slice(1).join('\n')
        };
      }
      
      // Case 2: First word is a known language followed by code (e.g., "python def foo():")
      const knownLanguages = ['python', 'javascript', 'typescript', 'java', 'go', 'rust', 'ruby', 'bash', 'sh', 'sql', 'cpp', 'c', 'csharp', 'php', 'swift', 'kotlin', 'scala', 'r', 'perl', 'lua', 'json', 'xml', 'yaml', 'html', 'css'];
      const firstWord = firstLine.split(/[\s\n]/)[0].toLowerCase();
      
      if (knownLanguages.includes(firstWord)) {
        const restOfFirstLine = firstLine.substring(firstWord.length).trim();
        const cleanCode = restOfFirstLine ? [restOfFirstLine, ...lines.slice(1)].join('\n') : lines.slice(1).join('\n');
        return {
          language: firstWord,
          cleanCode: cleanCode
        };
      }
    }
    return { language: '', cleanCode: code };
  };
  
  try {
    const parsed = JSON.parse(args);
    
    // Get code from various possible field names
    const rawCode = parsed.python_code || parsed.code || parsed.source || parsed.script || parsed.content;
    
    if (rawCode) {
      // First check for explicit language field
      let language = parsed.language?.toLowerCase() || parsed.lang?.toLowerCase() || '';
      let code = rawCode;
      
      // If no explicit language, check if first line is a language identifier
      if (!language) {
        const extracted = extractLanguageFromFirstLine(rawCode);
        if (extracted.language) {
          language = extracted.language;
          code = extracted.cleanCode;
        } else if (parsed.python_code) {
          language = 'python';
        } else if (isCodeTool) {
          language = 'python';
        }
      }
      
      return '```' + (language || 'text') + '\n' + code + '\n```';
    }
    
    // For other tools with JSON args, pretty-print as JSON code block
    return '```json\n' + JSON.stringify(parsed, null, 2) + '\n```';
  } catch {
    // If not valid JSON, check for language on first line
    const extracted = extractLanguageFromFirstLine(args);
    if (extracted.language) {
      return '```' + extracted.language + '\n' + extracted.cleanCode + '\n```';
    }
    // Default to python for code tools
    const language = isCodeTool ? 'python' : 'text';
    return '```' + language + '\n' + args + '\n```';
  }
};

// Helper to format tool call results for markdown rendering
// Handles JSON output with language prefix (e.g., "json\n{...}")
const formatToolResultAsMarkdown = (_toolName: string, result: string): string => {
  if (!result) return '';
  
  // Check if result already contains markdown code blocks
  if (result.includes('```')) {
    return result;
  }
  
  // Try to parse as JSON first
  try {
    const parsed = JSON.parse(result);
    // If it's valid JSON, format it nicely
    return '```json\n' + JSON.stringify(parsed, null, 2) + '\n```';
  } catch {
    // Not JSON, check for language prefix using shared function
    const extracted = extractLanguageFromFirstLine(result);
    if (extracted.language) {
      return '```' + extracted.language + '\n' + extracted.cleanCode + '\n```';
    }
    
    // Check if content looks like JSON (starts with { or [)
    const trimmed = result.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return '```json\n' + result + '\n```';
    }
    
    // Return as-is (might be plain text or already formatted)
    return result;
  }
};

// Known languages for detection
const KNOWN_LANGUAGES = new Set([
  'python', 'javascript', 'typescript', 'java', 'c', 'cpp', 'c++', 'csharp', 'c#',
  'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'scala', 'r', 'perl', 'lua',
  'bash', 'shell', 'sh', 'zsh', 'powershell', 'ps1', 'cmd', 'bat',
  'sql', 'mysql', 'postgresql', 'sqlite',
  'html', 'css', 'scss', 'sass', 'less',
  'json', 'yaml', 'yml', 'xml', 'toml', 'ini', 'csv',
  'markdown', 'md', 'mermaid', 'graphql', 'regex',
  'dockerfile', 'makefile', 'cmake',
  'text', 'plaintext', 'txt'
]);

// Extract language from first line if it's a language identifier
const extractLanguageFromFirstLine = (code: string): { language: string; cleanCode: string } => {
  const normalizedCode = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedCode.split('\n');
  
  // console.log('[GraphState Debug] extractLanguageFromFirstLine:', {
  //   totalLines: lines.length,
  //   firstLine: lines[0]?.slice(0, 50),
  //   firstLineLength: lines[0]?.length,
  // });
  
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    const firstLineLower = firstLine.toLowerCase();
    
    const isKnownLanguage = KNOWN_LANGUAGES.has(firstLineLower);
    const matchesPattern = /^[a-z][a-z0-9+#_\-\.]*$/i.test(firstLine);
    
    // console.log('[GraphState Debug] Language check:', {
    //   firstLine,
    //   firstLineLower,
    //   isKnownLanguage,
    //   matchesPattern,
    // });
    
    // First line is ONLY a language identifier (must be a known language)
    if (isKnownLanguage && matchesPattern) {
      // console.log('[GraphState Debug] ✓ Detected language:', firstLineLower);
      return {
        language: firstLineLower,
        cleanCode: lines.slice(1).join('\n')
      };
    }
  }
  // console.log('[GraphState Debug] ✗ No language detected');
  return { language: '', cleanCode: code };
};

// Preprocess content to wrap code blocks with detected language
// Handles content that starts with a language identifier on its own line
const preprocessContentWithLanguageDetection = (content: string): string => {
  if (!content) return content;
  
  // Check if content already has markdown code blocks
  if (content.includes('```')) {
    // console.log('[GraphState Debug] Content already has code blocks, skipping preprocessing');
    return content;
  }
  
  // Try to extract language from first line
  const { language, cleanCode } = extractLanguageFromFirstLine(content);
  
  // console.log('[GraphState Debug] preprocessContentWithLanguageDetection:', {
  //   inputLength: content.length,
  //   firstLine: content.split('\n')[0]?.slice(0, 50),
  //   detectedLanguage: language,
  //   hasCleanCode: cleanCode.trim().length > 0,
  // });
  
  if (language && cleanCode.trim()) {
    // Wrap in proper code block with detected language
    const result = `\`\`\`${language}\n${cleanCode}\n\`\`\``;
    // console.log('[GraphState Debug] Wrapped content in code block:', result.slice(0, 100));
    return result;
  }
  
  // console.log('[GraphState Debug] No language detected, returning as-is');
  return content;
};

// Helper to format code execution result for markdown rendering
// Handles structured CodeExecutionOutput from the backend
const formatCodeResultAsMarkdown = (result: string): string => {
  try {
    const parsed = JSON.parse(result);
    
    // Check if it's a CodeExecutionOutput structure
    if (parsed.code !== undefined) {
      const parts: string[] = [];
      
      // Get language from explicit field
      let language = parsed.language?.toLowerCase() || '';
      let code = parsed.code || '';
      
      // ALWAYS check if code has language on first line (pydantic-ai CodeExecutionTool format)
      // This is because the backend embeds the language as the first line of code content
      const extracted = extractLanguageFromFirstLine(code);
      if (extracted.language) {
        // Use extracted language if no explicit language, or if they match
        if (!language || language === 'text' || language === extracted.language) {
          language = extracted.language;
        }
        // Always use the clean code (with language stripped from first line)
        code = extracted.cleanCode;
      }
      
      // Default to python for code execution if still no language
      if (!language) {
        language = 'python';
      }
      
      // Add the code block with proper language
      if (code) {
        const codeBlock = `**Code:**\n\n\`\`\`${language}\n${code}\n\`\`\``;
        parts.push(codeBlock);
      }
      
      // Add the output
      if (parsed.output) {
        parts.push(`**Output:**\n${parsed.output}`);
      }
      
      // Add error if present
      if (!parsed.success && parsed.error_message) {
        parts.push(`**Error:**\n${parsed.error_message}`);
      }
      
      return parts.join('\n\n');
    }
    
    // For other JSON results, just return as formatted JSON
    return `\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
  } catch {
    // Not JSON - check if it starts with a language identifier
    return preprocessContentWithLanguageDetection(result);
  }
};

// General purpose content formatter for graph step results
// Handles code blocks, JSON, and content that starts with language identifiers
const formatStepResultAsMarkdown = (content: string): string => {
  // console.log('[GraphState Debug] formatStepResultAsMarkdown called with:', {
  //   contentLength: content?.length,
  //   firstChars: content?.slice(0, 100),
  //   hasCodeBlocks: content?.includes('```'),
  // });
  
  if (!content) return content;
  
  // Check if already has markdown code blocks
  if (content.includes('```')) {
    // console.log('[GraphState Debug] Already has code blocks, returning as-is');
    return content;
  }
  
  // Try to parse as JSON
  try {
    const parsed = JSON.parse(content);
    // console.log('[GraphState Debug] Parsed as JSON, type:', typeof parsed);
    
    // If it's a JSON string, check if it starts with a language identifier
    if (typeof parsed === 'string') {
      // console.log('[GraphState Debug] JSON string, checking for language prefix');
      return preprocessContentWithLanguageDetection(parsed);
    }
    // If it's a number or boolean, return as-is
    if (typeof parsed === 'number' || typeof parsed === 'boolean') {
      return content;
    }
    // Wrap objects/arrays in JSON code block
    // console.log('[GraphState Debug] Wrapping object/array in JSON code block');
    return `\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
  } catch {
    // Not JSON - check if starts with language identifier
    // console.log('[GraphState Debug] Not JSON, checking for language prefix');
    return preprocessContentWithLanguageDetection(content);
  }
};

// Image Gallery component for displaying generated images - matches ImageGalleryCard design
const ImageGallery: FC<{ urls: string[]; isLight: boolean }> = ({ urls, isLight }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showNavButtons, setShowNavButtons] = useState(false);
  
  if (urls.length === 0) return null;
  
  const prevImage = () => setCurrentIndex((i) => (i > 0 ? i - 1 : urls.length - 1));
  const nextImage = () => setCurrentIndex((i) => (i < urls.length - 1 ? i + 1 : 0));
  
  const chevronColor = isLight ? '#9ca3af' : '#4b5563';
  const chevronHoverColor = isLight ? '#6b7280' : '#6b7280';
  
  return (
    <div 
      className="my-3"
      onMouseEnter={() => setShowNavButtons(true)}
      onMouseLeave={() => setShowNavButtons(false)}
    >
      {/* Main carousel area */}
      <div className="flex items-center gap-2">
        {/* Left Arrow - Large chevron like ImageGalleryCard */}
        {urls.length > 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); prevImage(); }}
            className="flex items-center justify-center flex-shrink-0 rounded transition-all"
            style={{
              width: '32px',
              height: '60px',
              backgroundColor: 'transparent',
              color: chevronColor,
              opacity: showNavButtons ? 1 : 0,
              transition: 'opacity 0.3s ease-in-out, background-color 0.2s ease, color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.color = chevronHoverColor;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = chevronColor;
            }}
            title="Previous image"
          >
            <svg width="20" height="48" viewBox="0 0 24 60" fill="none" stroke="currentColor" strokeWidth={6}>
              <path d="M18 12l-9 18 9 18" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {/* Main image display */}
        <div 
          className={`relative flex-1 rounded-lg overflow-hidden ${isLight ? 'bg-gray-100' : 'bg-slate-800/50'}`}
          style={{ aspectRatio: '16/9' }}
        >
          <img
            src={urls[currentIndex]}
            alt={`Generated image ${currentIndex + 1}`}
            className="w-full h-full object-contain cursor-pointer"
            onClick={() => window.open(urls[currentIndex], '_blank')}
            referrerPolicy="no-referrer"
          />
          
          {/* Image counter overlay */}
          {urls.length > 1 && (
            <div 
              className={`absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-sm font-medium ${
                isLight ? 'bg-white/90 text-gray-700' : 'bg-gray-900/80 text-gray-200'
              }`}
            >
              {currentIndex + 1} / {urls.length}
            </div>
          )}
        </div>

        {/* Right Arrow - Large chevron like ImageGalleryCard */}
        {urls.length > 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); nextImage(); }}
            className="flex items-center justify-center flex-shrink-0 rounded transition-all"
            style={{
              width: '32px',
              height: '60px',
              backgroundColor: 'transparent',
              color: chevronColor,
              opacity: showNavButtons ? 1 : 0,
              transition: 'opacity 0.3s ease-in-out, background-color 0.2s ease, color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.color = chevronHoverColor;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = chevronColor;
            }}
            title="Next image"
          >
            <svg width="20" height="48" viewBox="0 0 24 60" fill="none" stroke="currentColor" strokeWidth={6}>
              <path d="M6 12l9 18-9 18" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
      
      {/* Thumbnail strip (only if multiple images) */}
      {urls.length > 1 && (
        <div className="flex justify-center gap-2 mt-3">
          {urls.map((url, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={`w-14 h-14 rounded-md overflow-hidden border-2 transition-all ${
                i === currentIndex 
                  ? (isLight ? 'border-blue-500 shadow-md' : 'border-blue-400 shadow-md') 
                  : (isLight ? 'border-gray-200 hover:border-gray-400' : 'border-gray-700 hover:border-gray-500')
              }`}
            >
              <img 
                src={url} 
                alt={`Thumbnail ${i + 1}`} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ========== Step Component ==========

const GraphStepItem: FC<{ step: GraphStep; isLight: boolean; isLast: boolean }> = ({ step, isLight, isLast }) => {
  // Create stable cache key based on step node and timestamp
  const stepCacheKey = `${step.node}-${step.timestamp || ''}`;
  
  // Initialize from cache or defaults
  const [isResultExpanded, setIsResultExpanded] = useState(() => {
    return stepResultExpandedCache.get(stepCacheKey) ?? true; // Default open
  });
  const [isProcessExpanded, setIsProcessExpanded] = useState(() => {
    return stepProcessExpandedCache.get(stepCacheKey) ?? false; // Default collapsed
  });
  const [isHovered, setIsHovered] = useState(false);
  const [isProcessHovered, setIsProcessHovered] = useState(false);
  
  // Sync state changes to cache
  useEffect(() => {
    stepResultExpandedCache.set(stepCacheKey, isResultExpanded);
  }, [stepCacheKey, isResultExpanded]);
  
  useEffect(() => {
    stepProcessExpandedCache.set(stepCacheKey, isProcessExpanded);
  }, [stepCacheKey, isProcessExpanded]);
  
  // Check if we have meaningful process content to show
  // Show process block only if:
  // 1. There are tool calls (these are always valuable to show)
  // 2. OR streaming_text exists AND is different from the final result (avoid duplicates)
  const hasToolCalls = step.tool_calls && step.tool_calls.length > 0;
  // Don't show prompt for ResultAggregator (it just contains all intermediate results, not useful to display)
  const isResultAggregator = step.node === 'ResultAggregator';
  const hasPrompt = !isResultAggregator && step.prompt && step.prompt.trim().length > 0;
  // Process block only shows tool calls - all other content (including thinking) is shown in hasResult section
  // Since hasResult now uses streaming_text as primary source, we don't need Process for streaming content
  const hasProcessContent = hasToolCalls;
  
  // Debug: Log step data to help diagnose missing prompts/tool calls
  // console.log(`[GraphStep ${step.node}]`, {
  //   hasPrompt, prompt: step.prompt?.slice(0, 100),
  //   hasToolCalls, toolCallsCount: step.tool_calls?.length,
  //   hasProcessContent, hasUniqueStreamingText,
  //   streamingText: step.streaming_text?.slice(0, 100),
  //   result: step.result?.slice(0, 100),
  // });
  
  // Show process content when: in_progress (always show), or user has expanded it, or streaming still happening
  const showProcessBlock = step.status === 'in_progress' || isProcessExpanded;
  
  // Step icons are colored based on status
  const statusIcon = useMemo(() => {
    switch (step.status) {
      case 'completed':
        return <CheckIcon color={isLight ? '#22c55e' : '#4ade80'} />;
      case 'in_progress':
        return <SpinningLoader color={isLight ? '#6366f1' : '#818cf8'} />;
      case 'error':
        return <ErrorIcon color={isLight ? '#ef4444' : '#f87171'} />;
      case 'cancelled':
        return <CancelledIcon color={isLight ? '#9ca3af' : '#6b7280'} />;
      default:
        return <PendingIcon color={isLight ? '#9ca3af' : '#6b7280'} />;
    }
  }, [step.status, isLight]);

  // Node text is always gray - only the check icon shows status color
  const textColor = isLight ? 'text-gray-700' : 'text-gray-300';

  const bgColor = useMemo(() => {
    if (step.status === 'in_progress') {
      return isLight ? 'bg-indigo-50' : 'bg-indigo-900/20';
    }
    return '';
  }, [step.status, isLight]);

  // Show content section if we have result OR streaming_text (to show all think blocks)
  // Allow during in_progress to show interleaved content as it streams
  const hasResult = Boolean(step.result?.trim() || step.streaming_text?.trim());

  return (
    <div className={`relative flex items-start gap-3 py-2 px-3 rounded-lg transition-colors duration-200 ${bgColor}`}>
      {/* Vertical connector line - aligned with icon center */}
      {!isLast && (
        <div
          className={`absolute w-0.5 ${
            isLight ? 'bg-gray-200' : 'bg-gray-700'
          }`}
          style={{ 
            left: 'calc(0.75rem + 8px)', // px-3 (12px) + half of icon width (8px)
            top: '2rem', // start below the icon
            height: 'calc(100% - 1.5rem)' 
          }}
        />
      )}

      {/* Status icon */}
      <div className="relative z-10 flex-shrink-0">{statusIcon}</div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div 
          className={`flex items-center gap-2 ${(hasResult || hasPrompt || hasProcessContent) ? 'cursor-pointer' : ''}`}
          onClick={() => (hasResult || hasPrompt || hasProcessContent) && setIsResultExpanded(!isResultExpanded)}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <span className="flex-shrink-0" style={{ color: isLight ? '#6b7280' : '#9ca3af' }}>
            {getNodeIcon(step.node, 'h-4 w-4')}
          </span>
          <span className={`font-medium ${textColor}`}>{step.node}</span>
          {step.status === 'in_progress' && (
            <span className={`text-xs ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>Processing...</span>
          )}
          {/* Expand/collapse chevron for results/prompt/process - matches ActionStatus style */}
          {(hasResult || hasPrompt || hasProcessContent) && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="ml-auto"
              style={{
                transition: 'transform 0.2s ease-in-out, opacity 0.2s ease-in-out',
                transform: isResultExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                opacity: isHovered ? 1 : 0.5,
                color: isLight ? '#6b7280' : '#9ca3af',
              }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          )}
        </div>
        
        {/* Result accordion - contains prompt, process block, and result content */}
        <div
          style={{
            overflow: 'hidden',
            transition: 'max-height 0.3s ease-in-out, opacity 0.2s ease-in-out',
            maxHeight: (hasResult || hasPrompt || hasProcessContent) && isResultExpanded ? '2000px' : '0',
            opacity: (hasResult || hasPrompt || hasProcessContent) && isResultExpanded ? 1 : 0,
          }}
        >
          {/* Prompt sent to sub-agent - inside accordion with title */}
          {hasPrompt && (
            <div 
              className={`mt-2 p-2.5 rounded-md ${isLight ? 'bg-slate-50' : 'bg-slate-800/50'}`}
            >
              <p className={`text-xs font-medium mb-1.5 ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>Prompt</p>
              <div 
                className={`graph-scrollbar max-h-32 overflow-y-auto text-sm ${isLight ? 'text-gray-700' : 'text-gray-200'}`}
              >
                <MarkdownRenderer content={step.prompt || ''} isLight={isLight} />
              </div>
            </div>
          )}
          
          {/* First thought block - render before Process block if both exist */}
          {hasProcessContent && (() => {
            const primarySource = step.streaming_text?.trim() || step.result?.trim() || '';
            const rawTextContent = removeImageMarkdown(primarySource);
            const sections = parseContentIntoSections(rawTextContent);
            const firstThinking = sections.find(s => s.type === 'thinking');
            
            if (firstThinking) {
              return (
                <InlineThinkingBlock 
                  content={firstThinking.content} 
                  isLight={isLight} 
                  defaultOpen={step.status !== 'completed'}
                  isComplete={step.status === 'completed'}
                />
              );
            }
            return null;
          })()}
          
          {/* Process Block - shows tool calls */}
          {hasProcessContent && (
            <div className={`mt-2 rounded-md ${
              isLight ? 'bg-slate-50/80' : 'bg-slate-800/30'
            }`}>
              {/* Process block header - collapsible toggle (matches InlineThinkingBlock style) */}
              <div 
                className={`flex items-center gap-1.5 cursor-pointer py-1.5 px-2 text-xs ${
                  isLight ? 'text-slate-600' : 'text-slate-400'
                } rounded-md`}
                onClick={() => setIsProcessExpanded(!isProcessExpanded)}
                onMouseEnter={() => setIsProcessHovered(true)}
                onMouseLeave={() => setIsProcessHovered(false)}
              >
                {/* Clock icon */}
                <svg className="h-3 w-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                {/* Title with flex: 1 to push chevron to right */}
                <span style={{ flex: 1 }}>Process {step.tool_calls?.length ? `(${step.tool_calls.length} tool${step.tool_calls.length > 1 ? 's' : ''})` : ''}</span>
                {/* Chevron icon - on the right, only visible on hover */}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    marginLeft: 6,
                    transition: 'transform 0.2s ease-in-out, opacity 0.2s ease-in-out',
                    transform: showProcessBlock ? 'rotate(90deg)' : 'rotate(0deg)',
                    opacity: isProcessHovered ? 1 : 0,
                  }}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
              
              {/* Process content - animated expand/collapse (matches InlineThinkingBlock) */}
              <div
                style={{
                  overflow: 'hidden',
                  transition: 'max-height 0.3s ease-in-out, opacity 0.2s ease-in-out',
                  maxHeight: showProcessBlock ? '2000px' : '0',
                  opacity: showProcessBlock ? 1 : 0,
                }}
              >
                <div className="px-2 pb-2">
                  {/* Tool calls made during this step */}
                  {step.tool_calls && step.tool_calls.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {step.tool_calls.map((tc, idx) => (
                        <div 
                          key={idx} 
                          className={`rounded-md p-2.5 text-xs ${
                            isLight ? 'bg-white border border-slate-200 shadow-sm' : 'bg-slate-900/50 border border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {/* Tool icon */}
                            <svg className={`h-3.5 w-3.5 flex-shrink-0 ${isLight ? 'text-indigo-500' : 'text-indigo-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                            </svg>
                            <span className={`font-medium ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                              {tc.tool_name}
                            </span>
                            {/* Status indicator */}
                            {tc.status === 'in_progress' && (
                              <SpinningLoader size="h-3 w-3" color={isLight ? '#6366f1' : '#818cf8'} />
                            )}
                            {tc.status === 'completed' && (
                              <CheckIcon className="h-3 w-3" color="#22c55e" />
                            )}
                            {tc.status === 'error' && (
                              <ErrorIcon className="h-3 w-3" color="#ef4444" />
                            )}
                          </div>
                          {/* Tool Input (arguments) - rendered as code block directly */}
                          {tc.args && (
                            <div 
                              className={`mt-2 text-xs graph-scrollbar ${isLight ? 'text-slate-600' : 'text-slate-300'} max-h-48 overflow-y-auto`}
                            >
                              <MarkdownRenderer 
                                content={formatToolArgsAsMarkdown(tc.tool_name, tc.args)} 
                                isLight={isLight} 
                              />
                            </div>
                          )}
                          {/* Tool Output (result) - rendered with status-colored background */}
                          {tc.result && (
                            <div className={`mt-2 rounded ${
                              tc.status === 'error' 
                                ? (isLight ? 'bg-red-50' : 'bg-red-900/20') 
                                : (isLight ? 'bg-green-50' : 'bg-green-900/20')
                            } p-2`}>
                              <div className={`text-[10px] uppercase tracking-wider font-medium mb-1 ${
                                tc.status === 'error'
                                  ? (isLight ? 'text-red-600' : 'text-red-400')
                                  : (isLight ? 'text-green-600' : 'text-green-400')
                              }`}>
                                {tc.status === 'error' ? 'Error' : 'Output'}
                              </div>
                              <div 
                                className={`text-xs graph-scrollbar ${isLight ? 'text-slate-600' : 'text-slate-300'} max-h-60 overflow-y-auto`}
                              >
                                <MarkdownRenderer content={formatToolResultAsMarkdown(tc.tool_name, tc.result)} isLight={isLight} />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Content is shown in hasResult section to avoid duplication */}
                  {/* Only show streaming cursor when in progress and no result yet */}
                  {step.status === 'in_progress' && !step.result && step.streaming_text && (
                          <div className="mt-2">
                      <span className={`inline-block w-2 h-4 bg-current animate-pulse ${isLight ? 'text-gray-400' : 'text-gray-500'}`} />
                    </div>
                              )}
                            </div>
                          </div>
            </div>
          )}
          
          {hasResult && (() => {
            // Combine streaming_text and result to ensure nothing is missed:
            // - streaming_text has ALL thinking blocks from the agent run
            // - result may have additional content (e.g., image URLs, status messages)
            const streamingText = step.streaming_text?.trim() || '';
            const resultText = step.result?.trim() || '';
            
            // Extract images from BOTH sources - result has uploaded URLs, streaming might have inline
            const streamingImages = extractImageUrls(streamingText);
            const resultImages = extractImageUrls(resultText);
            // Prefer result images (they have the uploaded Firebase URLs), fall back to streaming
            const imageUrls = resultImages.length > 0 ? resultImages : streamingImages;
            
            // Build combined text content:
            // 1. Start with streaming text (has all thinking blocks)
            // 2. Append result content if it's not already included in streaming
            const streamingContent = removeImageMarkdown(streamingText);
            const resultContent = removeImageMarkdown(resultText);
            
            let rawTextContent = streamingContent;
            
            // Check if result has unique content not in streaming
            // Use a reasonable prefix check to avoid false positives from minor differences
            const resultIsUnique = resultContent && (
              !streamingContent || 
              !streamingContent.includes(resultContent.slice(0, Math.min(100, resultContent.length)))
            );
            
            if (resultIsUnique) {
              // Append result content to ensure it's displayed
              rawTextContent = streamingContent 
                ? `${streamingContent}\n\n${resultContent}` 
                : resultContent;
            }
            
            // Parse content into ordered sections (thinking and content interleaved)
            // Shows everything in correct order for both in_progress and completed steps
            const allSections = parseContentIntoSections(rawTextContent);
            
            // If there's a Process block (tool calls), skip the first thinking section
            // since it was already rendered before the Process block
            const sections = hasProcessContent 
              ? (() => {
                  let skippedFirst = false;
                  return allSections.filter(s => {
                    if (!skippedFirst && s.type === 'thinking') {
                      skippedFirst = true;
                      return false; // Skip first thinking
                    }
                    return true;
                  });
                })()
              : allSections;
            
            // Helper to format a content section (JSON or plain text)
            const formatContentSection = (content: string): string => {
              if (step.node === 'CodeExecution') {
                // Try to parse as CodeExecution JSON output
                const trimmed = content.trim();
                if (trimmed.startsWith('{')) {
                  // Find the matching closing brace to extract JSON and any trailing text
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
                        // If tool calls are present, they already show the code/output
                        // Only show the remaining summary text to avoid duplication
                        if (step.tool_calls && step.tool_calls.length > 0) {
                          return remainingText || '';  // Skip JSON, only show summary
                        }
                        // No tool calls - format the JSON as code block, append any remaining text
                        const formatted = formatCodeResultAsMarkdown(jsonPart);
                        return remainingText ? `${formatted}\n\n${remainingText}` : formatted;
                      }
                    } catch {
                      // Not valid JSON, fall through
                    }
                  }
                }
              }
              // Use general formatter for all other content
              return formatStepResultAsMarkdown(content);
            };
            
            const isComplete = step.status === 'completed';
            
            // Find first thinking section (to render before images)
            const firstThinkingIdx = sections.findIndex(s => s.type === 'thinking');
            const firstThinking = firstThinkingIdx >= 0 ? sections[firstThinkingIdx] : null;
            const hasImages = imageUrls.length > 0;
            
            // Sections to render after first thinking and images
            const remainingSections = firstThinking && hasImages
              ? sections.filter((_, idx) => idx !== firstThinkingIdx)
              : sections;
            
            return (
              <div className="mt-2">
                {/* First thinking block - render before images if both exist */}
                {firstThinking && hasImages && (
                  <InlineThinkingBlock 
                    content={firstThinking.content} 
                    isLight={isLight} 
                    defaultOpen={!isComplete}
                    isComplete={isComplete}
                  />
                )}
                
                {/* Image Gallery (after first thought if available) */}
                {hasImages && (
                  <ImageGallery urls={imageUrls} isLight={isLight} />
                )}
                
                {/* Render remaining sections in order - preserving interleaved thinking/content structure */}
                {remainingSections.map((section, idx) => {
                  if (section.type === 'thinking') {
                    // Render thinking blocks in their correct position
                    return (
                      <InlineThinkingBlock 
                        key={`thinking-${idx}`}
                        content={section.content} 
                        isLight={isLight} 
                        defaultOpen={!isComplete}
                        isComplete={isComplete}
                      />
                    );
                  } else {
                    // Content section - format and render
                    const formattedContent = formatContentSection(section.content);
                    if (!formattedContent) return null;
                    return (
                      <div 
                        key={`content-${idx}`}
                        className={`graph-scrollbar max-h-64 overflow-y-auto text-sm ${isLight ? 'text-gray-600' : 'text-gray-300'} ${idx > 0 ? 'mt-2' : ''}`}
                      >
                        <MarkdownRenderer content={formattedContent} isLight={isLight} />
                      </div>
                    );
                  }
                })}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

// ========== Main Component ==========

/**
 * GraphStateCard Component
 *
 * Displays the execution state of a multi-agent graph with visual progress tracking.
 * Shows each step (WebSearch, ImageGeneration, etc.) with its status.
 */
export const GraphStateCard: FC<GraphStateCardProps> = ({ state, isCollapsed = false, sessionId, instanceId }) => {
  const { isLight } = useStorage(themeStorage);
  
  // Generate a stable cache key from instanceId or fallback to sessionId + query
  const cacheKey = instanceId ?? `graph-${sessionId ?? 'default'}-${state.query?.slice(0, 50) ?? ''}`;
  
  // Initialize from cache if available
  const [isExpanded, setIsExpanded] = useState(() => {
    return expandedStateCache.get(cacheKey) ?? !isCollapsed;
  });
  
  // Initialize userClosed from cache
  const userClosedRef = useRef(userClosedCache.get(cacheKey) ?? false);
  
  // Sync expanded state to cache whenever it changes
  useEffect(() => {
    expandedStateCache.set(cacheKey, isExpanded);
  }, [cacheKey, isExpanded]);
  
  // Keep newly created cards open unless user manually closes them
  useEffect(() => {
    const isRunning = state.status === 'running' || state.steps.some(s => s.status === 'in_progress');
    if (isRunning && !userClosedRef.current) {
      setIsExpanded(true);
    }
  }, [state.status, state.steps]);

  // Don't render if no steps
  if (!state?.steps || state.steps.length === 0) {
    return null;
  }

  const toggleExpanded = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    // Track if user is closing a running card
    if (!newState && (state.status === 'running' || state.steps.some(s => s.status === 'in_progress'))) {
      userClosedRef.current = true;
      userClosedCache.set(cacheKey, true);
    }
  };

  // Calculate progress - count steps by status
  const completedSteps = state.steps.filter(s => s.status === 'completed').length;
  const errorSteps = state.steps.filter(s => s.status === 'error').length;
  const inProgressSteps = state.steps.filter(s => s.status === 'in_progress').length;
  const cancelledSteps = state.steps.filter(s => s.status === 'cancelled').length;
  const pendingSteps = state.steps.filter(s => s.status === 'pending').length;
  const totalSteps = state.steps.length;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // Compute actual status from steps
  // The card is "completed" when all steps are completed or cancelled (no in_progress/pending steps)
  // We trust the step statuses since the backend explicitly marks them
  const computedStatus = useMemo(() => {
    if (errorSteps > 0) {
      return 'error';
    }
    if (inProgressSteps > 0) {
      return 'running';
    }
    // Graph is done when no steps are pending or in_progress
    // This handles both: all completed, OR some completed + some cancelled (early termination)
    if (pendingSteps === 0 && totalSteps > 0) {
      return 'completed';
    }
    if (completedSteps > 0 || pendingSteps > 0) {
      return 'running';
    }
    return 'pending';
  }, [errorSteps, inProgressSteps, completedSteps, pendingSteps, totalSteps]);

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

  return (
      <div
        className={`rounded-lg border ${
          isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-[#151C24]'
        } overflow-hidden shadow-sm`}
        data-graph-state="true"
        data-session-id={sessionId}>
      {/* Header */}
      <button
        onClick={toggleExpanded}
        className={`w-full flex items-center justify-between px-3 py-2 ${
          isLight ? 'hover:bg-gray-50' : 'hover:bg-gray-700/50'
        } transition-colors`}>
        <div className="flex items-center gap-3">
          <GraphIcon className="h-5 w-5" color={isLight ? '#6b7280' : '#9ca3af'} />
          <div className="text-left">
            <h3 className={`font-medium ${isLight ? 'text-gray-900' : 'text-white'}`}>Multi-Agent Graph</h3>
            <p className={`text-xs ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
              Iteration {state.iteration}/{state.max_iterations} • {completedSteps}/{totalSteps} steps
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {statusBadge}
          {/* Chevron - matches ActionStatus style */}
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
        </div>
      </button>

      {/* Progress bar - matches PagesSelector styling, hidden when collapsed */}
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
          {/* Graph Flow Diagram - shows planned steps with status, with toggle for mermaid view */}
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
              <p className={`text-xs font-medium mb-1 ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>Query</p>
              <div className={`${isLight ? 'text-gray-700' : 'text-gray-200'}`}>
                <MarkdownRenderer content={state.original_query} isLight={isLight} />
              </div>
            </div>
          )}

          {/* Steps - render exactly as received from backend */}
          <div className="space-y-1">
            {state.steps.map((step, index) => (
              <GraphStepItem 
                key={`${step.node}-${index}`} 
                step={step} 
                isLight={isLight} 
                isLast={index === state.steps.length - 1} 
              />
            ))}
          </div>

          {/* Final result - gray card with only "Result" text colored, scrollable */}
          {computedStatus === 'completed' && state.final_result && (() => {
            // Parse into sections to preserve interleaved thinking and content
            const sections = parseContentIntoSections(state.final_result);
            
            // Helper to format final result content - handles CodeExecution JSON + trailing text
            const formatFinalContent = (content: string): string => {
              const trimmed = content.trim();
              if (trimmed.startsWith('{')) {
                // Find the matching closing brace to extract JSON and any trailing text
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
                      // It's CodeExecution JSON - format nicely with code block
                      const formatted = formatCodeResultAsMarkdown(jsonPart);
                      return remainingText ? `${formatted}\n\n${remainingText}` : formatted;
                    }
                  } catch {
                    // Not valid JSON, fall through
                  }
                }
              }
              // Use general formatter for all other content
              return formatStepResultAsMarkdown(content);
            };
            
            return (
              <div className={`mt-3 p-3 rounded ${isLight ? 'bg-gray-50' : 'bg-[#1a2332]'}`}>
                <p className={`text-xs font-medium mb-2 ${isLight ? 'text-green-600' : 'text-green-400'}`}>Result</p>
                
                {/* Render sections in order - preserving interleaved structure */}
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
                        className={`graph-scrollbar max-h-96 overflow-y-auto ${isLight ? 'text-gray-700' : 'text-gray-200'} ${idx > 0 ? 'mt-2' : ''}`}
                >
                        <MarkdownRenderer content={formattedContent} isLight={isLight} />
                </div>
                    );
                  }
                })}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

export default GraphStateCard;

