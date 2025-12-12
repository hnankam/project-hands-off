/**
 * Custom Slot Components for CopilotKit V2
 * 
 * These components are designed to be passed to CopilotChat's slot system
 * for customizing various UI elements.
 * 
 * Available slots in CopilotChat:
 * - scrollToBottomButton: Button to scroll to latest messages
 * - feather: Gradient fade at bottom of scroll area
 * - disclaimer: Disclaimer text below input
 * - suggestionView: Suggestion pills container
 * - (more slots can be added as needed)
 */

export { CustomScrollToBottomButton } from './CustomScrollToBottomButton';
export type { CustomScrollToBottomButtonProps } from './CustomScrollToBottomButton';

export { CodeBlock, CustomCodeBlockWrapper } from './CustomCodeBlock';
export type { CodeBlockProps } from './CustomCodeBlock';

export { Table, CustomTableWrapper } from './CustomTable';
export type { TableProps } from './CustomTable';

export { CustomFeather } from './CustomFeather';
export type { CustomFeatherProps } from './CustomFeather';

export { CustomCursor } from './CustomCursor';
export type { CustomCursorProps } from './CustomCursor';

export { CustomDisclaimer } from './CustomDisclaimer';
export type { CustomDisclaimerProps } from './CustomDisclaimer';

export { 
  CustomSuggestionView, 
  CustomSuggestionPill,
} from './CustomSuggestionView';
export type { 
  CustomSuggestionViewProps, 
  CustomSuggestionPillProps,
  Suggestion 
} from './CustomSuggestionView';

export { CustomUserMessageRenderer } from './CustomUserMessageRenderer';
export type { CustomUserMessageRendererProps } from './CustomUserMessageRenderer';

// User message buttons
export { 
  CustomCopyButton, 
  CustomEditButton,
  CustomRerunButton,
  CustomUndoButton,
  CustomDeleteButton,
} from './CustomUserMessageButtons';
export type { 
  CustomCopyButtonProps, 
  CustomEditButtonProps,
  CustomRerunButtonProps,
  CustomUndoButtonProps,
  CustomDeleteButtonProps,
} from './CustomUserMessageButtons';

// Assistant message buttons
export {
  CustomCopyButton as CustomAssistantCopyButton,
  CustomRegenerateButton,
  CustomThumbsUpButton,
  CustomThumbsDownButton,
  CustomReadAloudButton,
} from './CustomAssistantMessageButtons';
export type {
  CustomCopyButtonProps as CustomAssistantCopyButtonProps,
  CustomRegenerateButtonProps,
  CustomThumbsUpButtonProps,
  CustomThumbsDownButtonProps,
  CustomReadAloudButtonProps,
} from './CustomAssistantMessageButtons';

