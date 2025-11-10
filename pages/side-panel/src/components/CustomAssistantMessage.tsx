import { useMemo, useState } from "react";
import type { AssistantMessageProps } from '@copilotkit/react-ui';
import { useChatContext, Markdown } from '@copilotkit/react-ui';
import { useCopilotChatHeadless_c } from '@copilotkit/react-core';
import { useStorage } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';

const extractTextFromMessage = (msg: any): string => {
  if (!msg) return '';
  const rawContent = msg?.content;
  if (!rawContent) return '';

  if (typeof rawContent === 'string') {
    return rawContent;
  }

  if (Array.isArray(rawContent)) {
    return rawContent
      .map((part: any) => {
        if (!part) return '';
        if (typeof part === 'string') return part;
        if (typeof part.text === 'string') return part.text;
        if (typeof part.content === 'string') return part.content;
        if (typeof part.value === 'string') return part.value;
        return '';
      })
      .filter(Boolean)
      .join('');
  }

  if (typeof rawContent === 'object') {
    if (typeof rawContent.text === 'string') {
      return rawContent.text;
    }
    if (Array.isArray(rawContent.parts)) {
      return rawContent.parts
        .map((part: any) => {
          if (!part) return '';
          if (typeof part === 'string') return part;
          if (typeof part.text === 'string') return part.text;
          if (typeof part.content === 'string') return part.content;
          return '';
        })
        .filter(Boolean)
        .join('');
    }
    if (typeof rawContent.content === 'string') {
      return rawContent.content;
    }
    try {
      return JSON.stringify(rawContent);
    } catch {
      return '';
    }
  }

  try {
    return String(rawContent);
  } catch {
    return '';
  }
};

/**
 * CustomAssistantMessage Component
 * 
 * Custom implementation of the AssistantMessage component based on CopilotKit's default.
 * Source: https://github.com/CopilotKit/CopilotKit/blob/main/CopilotKit/packages/react-ui/src/components/chat/messages/AssistantMessage.tsx
 */
export const CustomAssistantMessage = (props: AssistantMessageProps) => {
  const { icons, labels } = useChatContext();
  const { isLight } = useStorage(exampleThemeStorage);
  const {
    message,
    isLoading,
    onRegenerate,
    onCopy,
    onThumbsUp,
    onThumbsDown,
    isCurrentMessage,
    markdownTagRenderers,
  } = props;
  const [copied, setCopied] = useState(false);
  const { messages } = useCopilotChatHeadless_c();

  const { isLastInSeries, assistantSeries } = useMemo(() => {
    if (!message) {
      return { isLastInSeries: true, assistantSeries: [] as any[] };
    }

    if (!messages || messages.length === 0) {
      return { isLastInSeries: true, assistantSeries: [message] };
    }

    const currentIndex = messages.findIndex((msg: any) => {
      if (!msg) return false;
      if (message?.id && msg?.id) {
        return msg.id === message.id;
      }
      return msg === message;
    });
    if (currentIndex === -1) {
      return { isLastInSeries: true, assistantSeries: [message] };
    }

    let prevUserIndex = -1;
    for (let i = currentIndex - 1; i >= 0; i--) {
      const role = (messages[i] as any)?.role;
      if (role === 'user') {
        prevUserIndex = i;
        break;
      }
    }

    let nextUserIndex = messages.length;
    for (let i = currentIndex + 1; i < messages.length; i++) {
      const role = (messages[i] as any)?.role;
      if (role === 'user') {
        nextUserIndex = i;
        break;
      }
    }

    const assistantGroup: any[] = [];
    for (let i = prevUserIndex + 1; i < nextUserIndex; i++) {
      const candidate = messages[i];
      if ((candidate as any)?.role === 'assistant') {
        assistantGroup.push(candidate);
      }
    }

    if (assistantGroup.length === 0) {
      return { isLastInSeries: true, assistantSeries: [message] };
    }

    const lastAssistant = assistantGroup[assistantGroup.length - 1];
    return {
      isLastInSeries: lastAssistant?.id === message.id,
      assistantSeries: assistantGroup,
    };
  }, [messages, message]);

  const aggregatedSeriesContent = useMemo(() => {
    if (!assistantSeries || assistantSeries.length === 0) {
      return '';
    }

    const parts = assistantSeries
      .map((msg: any) => extractTextFromMessage(msg))
      .filter((value: string) => typeof value === 'string' && value.trim().length > 0);

    if (parts.length === 0) {
      return '';
    }

    return parts.join('\n\n').trim();
  }, [assistantSeries]);

  const handleCopy = async () => {
    const textToCopy = aggregatedSeriesContent || extractTextFromMessage(message);
    const safeText = textToCopy?.trim();

    if (!safeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(safeText);
      setCopied(true);
      if (onCopy) {
        onCopy(safeText);
      }
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy assistant response:', error);
    }
  };

  const handleRegenerate = () => {
    if (onRegenerate) onRegenerate();
  };

  const handleThumbsUp = () => {
    if (onThumbsUp && message) {
      onThumbsUp(message);
    }
  };

  const handleThumbsDown = () => {
    if (onThumbsDown && message) {
      onThumbsDown(message);
    }
  };

  const LoadingIcon = () => <span>{icons.activityIcon}</span>;
  const content = message?.content || "";
  const subComponent = message?.generativeUI?.();
  const shouldRenderControls = Boolean(content) && !isLoading && isLastInSeries;

  const assistantMessageStyle = shouldRenderControls
    ? {
        marginBottom: '1rem',
      }
    : undefined;

  return (
    <>
      {content && (
        <div
          className="copilotKitMessage copilotKitAssistantMessage"
          style={assistantMessageStyle}
        >
          {content && <Markdown content={content} components={markdownTagRenderers} />}

          {shouldRenderControls && (
            <div
              className={`copilotKitMessageControls ${isCurrentMessage ? "currentMessage" : ""}`}
            >
              {/* <button
                className="copilotKitMessageControlButton"
                onClick={handleRegenerate}
                aria-label={labels.regenerateResponse}
                title={labels.regenerateResponse}
              >
                {icons.regenerateIcon}
              </button> */}
              <button
                className="copilotKitMessageControlButton"
                onClick={handleCopy}
                aria-label={labels.copyToClipboard}
                title={labels.copyToClipboard}
                style={{
                  width: '28px',
                  height: '28px',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: 'none',
              backgroundColor: 'transparent',
                  color: copied ? '#22c55e' : isLight ? '#0C1117' : '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }}
              >
                {copied ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      width: '13px',
                      height: '13px',
                      strokeWidth: '2',
                      shapeRendering: 'geometricPrecision',
                      WebkitFontSmoothing: 'antialiased',
                    }}
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      width: '13px',
                      height: '13px',
                      strokeWidth: '2',
                      shapeRendering: 'geometricPrecision',
                      WebkitFontSmoothing: 'antialiased',
                    }}
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
              {/* {onThumbsUp && (
                <button
                  className="copilotKitMessageControlButton"
                  onClick={handleThumbsUp}
                  aria-label={labels.thumbsUp}
                  title={labels.thumbsUp}
                >
                  {icons.thumbsUpIcon}
                </button>
              )}
              {onThumbsDown && (
                <button
                  className="copilotKitMessageControlButton"
                  onClick={handleThumbsDown}
                  aria-label={labels.thumbsDown}
                  title={labels.thumbsDown}
                >
                  {icons.thumbsDownIcon}
                </button>
              )} */}
            </div>
          )}
        </div>
      )}
      <div style={{ marginBottom: "0.5rem" }}>{subComponent}</div>
      {isLoading && <LoadingIcon />}
    </>
  );
};

