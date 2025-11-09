import { useState } from "react";
import type { AssistantMessageProps } from '@copilotkit/react-ui';
import { useChatContext, Markdown } from '@copilotkit/react-ui';
import { useStorage } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';

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

  const handleCopy = () => {
    const content = message?.content || "";
    if (content && onCopy) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      onCopy(content);
      setTimeout(() => setCopied(false), 2000);
    } else if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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

  return (
    <>
      {content && (
        <div className="copilotKitMessage copilotKitAssistantMessage">
          {content && <Markdown content={content} components={markdownTagRenderers} />}

          {content && !isLoading && (
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
                  backgroundColor: copied
                    ? isLight
                      ? 'rgba(34, 197, 94, 0.15)'
                      : 'rgba(34, 197, 94, 0.25)'
                    : 'transparent',
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

