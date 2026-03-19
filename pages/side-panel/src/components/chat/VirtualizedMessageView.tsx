/**
 * VirtualizedMessageView
 *
 * Wrapper that uses CopilotChatMessageView's children render-prop to render
 * the message list through VirtualizedMessageViewContentVirtua for virtualization.
 *
 * Uses the same custom slots as the non-virtualized message view:
 * - CustomAssistantMessageV2, CustomUserMessageV2, ReasoningMessageBlock, CustomCursor
 *
 * Toggle via VIRTUALIZATION_MODE in ChatInner.
 */

import * as React from 'react';
import { debug } from '@extension/shared';
import { CopilotChatMessageView, CopilotChatReasoningMessage } from '@copilotkit/react-core/v2';
import { VirtualizedMessageViewContentVirtua } from './VirtualizedMessageViewContentVirtua';
import { CustomAssistantMessageV2 } from './CustomAssistantMessageV2';
import { CustomUserMessageV2 } from './CustomUserMessageV2';
import { ReasoningMessageBlock } from './ReasoningMessageBlock';
import { CustomCursor } from './slots';

export type VirtualizedMessageViewProps = React.ComponentProps<typeof CopilotChatMessageView>;

/**
 * Message view component that virtualizes the message list using Virtua.
 * Replaces the default message list layout with VirtualizedMessageViewContentVirtua
 * while preserving custom assistant, user, reasoning, and cursor slots.
 */
export function VirtualizedMessageView(props: VirtualizedMessageViewProps): React.JSX.Element {
  // [FREEZE-DEBUG] Track message element count changes to time the render cascade
  const prevElemsRef = React.useRef(0);
  const renderCascadeStartRef = React.useRef<number>(0);

  return (
    <CopilotChatMessageView
      {...props}
      assistantMessage={CustomAssistantMessageV2}
      userMessage={CustomUserMessageV2}
      reasoningMessage={ReasoningMessageBlock as typeof CopilotChatReasoningMessage}
      cursor={CustomCursor}
    >
      {({ messageElements, messages, isRunning, interruptElement }) => {
        // [FREEZE-DEBUG] Detect the start of a large render cascade
        const prevCount = prevElemsRef.current;
        if (messageElements.length !== prevCount) {
          const now = performance.now();
          if (messageElements.length > prevCount + 50) {
            // Big jump in message elements — this is the post-SSE render cascade
            renderCascadeStartRef.current = now;
            debug.log(
              `[FREEZE-DEBUG] 📦 RENDER CASCADE START`,
              `| elems: ${prevCount} → ${messageElements.length}`,
              `| Δ: +${messageElements.length - prevCount}`,
              `| t: ${now.toFixed(0)}ms`,
            );
          } else if (renderCascadeStartRef.current > 0) {
            const elapsed = now - renderCascadeStartRef.current;
            debug.log(
              `[FREEZE-DEBUG] 📦 render cascade tick`,
              `| elems: ${messageElements.length}`,
              `| elapsed since cascade start: ${elapsed.toFixed(0)}ms`,
            );
          }
          prevElemsRef.current = messageElements.length;
        }

        return (
          <VirtualizedMessageViewContentVirtua
            messageElements={messageElements}
            messages={messages}
            isRunning={isRunning}
            interruptElement={interruptElement ?? null}
          />
        );
      }}
    </CopilotChatMessageView>
  );
}
