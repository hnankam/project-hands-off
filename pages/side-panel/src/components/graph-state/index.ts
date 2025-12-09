/**
 * GraphStateCard Module
 * 
 * Public API for the multi-agent graph state visualization components.
 * 
 * Usage:
 * ```tsx
 * import { 
 *   GraphStateCard, 
 *   GraphAgentState,
 *   UnifiedAgentState,
 *   isGraphSteps,
 *   isPlanSteps,
 *   convertToGraphAgentState,
 * } from './graph-state';
 * ```
 */

// Main component
export { GraphStateCard, default } from './GraphStateCard';

// Types
export type {
  GraphToolCall,
  GraphStep,
  GraphAgentState,
  BackendGraphState,
  PlanStep,
  UnifiedAgentState,
  GraphStateCardProps,
} from './types';

// Type guards and converters
export {
  isGraphSteps,
  isPlanSteps,
  convertToGraphAgentState,
} from './types';

// Sub-components (for advanced usage)
export { GraphDiagram } from './GraphDiagram';
export { GraphStepItem } from './GraphStepItem';
export { InlineThinkingBlock } from './InlineThinkingBlock';
export { ImageGallery } from './ImageGallery';

// Icons (for reuse in other components)
export {
  SpinningLoader,
  CheckIcon,
  ErrorIcon,
  PendingIcon,
  CancelledIcon,
  WaitingIcon,
  GraphIcon,
  getNodeIcon,
  getFlowNodeIcon,
  getNodeLabel,
  normalizeNodeName,
} from './icons';

