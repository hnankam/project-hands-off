import React, { useMemo, useRef, useState, useEffect } from 'react';
import type { InputProps } from '@copilotkit/react-ui';
import { useChatContext } from '@copilotkit/react-ui';
import { useCopilotContext } from '@copilotkit/react-core';

const MAX_NEWLINES = 6;

/**
 * AutoResizingTextarea Component
 * Internal component for auto-resizing textarea
 */
interface AutoResizingTextareaProps {
  placeholder?: string;
  autoFocus?: boolean;
  maxRows?: number;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onCompositionStart?: () => void;
  onCompositionEnd?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

const AutoResizingTextarea = React.forwardRef<HTMLTextAreaElement, AutoResizingTextareaProps>(
  ({ placeholder, autoFocus, maxRows = 6, value, onChange, onCompositionStart, onCompositionEnd, onKeyDown }, ref) => {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const handleResize = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';

      // Calculate the new height based on content
      const lineHeight = parseInt(window.getComputedStyle(textarea).lineHeight);
      const maxHeight = lineHeight * maxRows;
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);

      textarea.style.height = `${newHeight}px`;
    };

    React.useEffect(() => {
      handleResize();
    }, [value]);

    return (
      <textarea
        ref={node => {
          textareaRef.current = node;
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        className="copilotKitInputTextarea"
        placeholder={placeholder}
        autoFocus={autoFocus}
        value={value}
        onChange={e => {
          onChange(e);
          handleResize();
        }}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        onKeyDown={onKeyDown}
        rows={1}
        style={{
          resize: 'none',
          overflow: 'auto',
          boxSizing: 'border-box',
        }}
      />
    );
  },
);

AutoResizingTextarea.displayName = 'AutoResizingTextarea';

/**
 * PoweredByTag Component
 * Internal component for "Powered by" tag
 */
const PoweredByTag: React.FC<{ showPoweredBy: boolean }> = ({ showPoweredBy }) => {
  if (!showPoweredBy) return null;

  return (
    <div className="copilotKitPoweredBy">
      <a
        href="https://copilotkit.ai"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontSize: '0.75rem',
          color: 'var(--copilot-kit-secondary-color, #6b7280)',
          textDecoration: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
        }}>
        Powered by CopilotKit
      </a>
    </div>
  );
};

/**
 * usePushToTalk Hook
 * Internal hook for push-to-talk functionality
 */
type PushToTalkState = 'idle' | 'recording' | 'transcribing';

interface UsePushToTalkProps {
  sendFunction: (text: string) => Promise<any>;
  inProgress: boolean;
}

const usePushToTalk = ({ sendFunction, inProgress }: UsePushToTalkProps) => {
  const [pushToTalkState, setPushToTalkState] = useState<PushToTalkState>('idle');
  const copilotContext = useCopilotContext();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        // Transcribe the audio
        if (copilotContext.copilotApiConfig?.transcribeAudioUrl) {
          try {
            const formData = new FormData();
            formData.append('audio', audioBlob);

            const response = await fetch(copilotContext.copilotApiConfig.transcribeAudioUrl, {
              method: 'POST',
              body: formData,
            });

            if (response.ok) {
              const result = await response.json();
              const transcribedText = result.text || result.transcription || '';
              if (transcribedText) {
                await sendFunction(transcribedText);
              }
            }
          } catch (error) {
            console.error('Transcription error:', error);
          }
        }

        setPushToTalkState('idle');
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setPushToTalkState('recording');
    } catch (error) {
      console.error('Error starting recording:', error);
      setPushToTalkState('idle');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      setPushToTalkState('transcribing');
      mediaRecorderRef.current.stop();
    }
  };

  React.useEffect(() => {
    if (pushToTalkState === 'transcribing') {
      stopRecording();
    }
  }, [pushToTalkState]);

  return {
    pushToTalkState,
    setPushToTalkState: (state: PushToTalkState) => {
      if (state === 'recording') {
        startRecording();
      } else if (state === 'transcribing') {
        stopRecording();
      } else {
        setPushToTalkState(state);
      }
    },
  };
};

/**
 * Custom Icons matching app style
 * Filled circle designs with inner symbols
 */
const CustomIcons = {
  send: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="11" />
      <path
        d="M12 7v10M12 7l-4 4M12 7l4 4"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  ),
  stop: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="11" />
      <rect x="8" y="8" width="8" height="8" rx="1" fill="white" />
    </svg>
  ),
  upload: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  microphone: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  ),
};

/**
 * Extended InputProps for CustomInput
 * Adds support for prefilling text (e.g., from context menu)
 */
interface CustomInputProps extends InputProps {
  // prefillText and onPrefillCleared removed - using custom events instead
  listenSessionId?: string; // Only handle events for this session
}

/**
 * Custom Input Component for CopilotChat
 *
 * Features (maintained from base component):
 * - Auto-resizing textarea
 * - Send button with loading state
 * - Stop button during generation
 * - Push-to-talk functionality (voice input)
 * - Upload button support
 * - Keyboard shortcuts (Enter to send, Shift+Enter for new line)
 * - Powered by CopilotKit tag
 * - IME composition support
 * - Custom icons matching app style
 * - **NEW**: Support for prefilling text from external sources (context menu, etc.)
 *
 * Future enhancements can be added here while maintaining all existing functionality
 */
export const CustomInput: React.FC<CustomInputProps> = ({
  inProgress,
  onSend,
  isVisible = false,
  onStop,
  onUpload,
  hideStopButton = false,
  listenSessionId,
}) => {
  const context = useChatContext();
  const copilotContext = useCopilotContext();

  const showPoweredBy = !copilotContext.copilotApiConfig?.publicApiKey;

  const pushToTalkConfigured =
    copilotContext.copilotApiConfig.textToSpeechUrl !== undefined &&
    copilotContext.copilotApiConfig.transcribeAudioUrl !== undefined;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isComposing, setIsComposing] = useState(false);

  const handleDivClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

    // If the user clicked a button or inside a button, don't focus the textarea
    if (target.closest('button')) return;

    // If the user clicked the textarea, do nothing (it's already focused)
    if (target.tagName === 'TEXTAREA') return;

    // Otherwise, focus the textarea
    textareaRef.current?.focus();
  };

  const [text, setText] = useState('');
  const lastPrefillTimestampRef = useRef<number>(0);
  const focusPendingRef = useRef<number | null>(null);

  // Handle prefilled text from external sources (e.g., context menu)
  // Listen for custom event instead of relying on props
  useEffect(() => {
    const handlePrefillEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ text: string; timestamp: number; sessionId?: string }>;
      const { text: prefillText, timestamp, sessionId } = customEvent.detail || ({} as any);

      // If we have a scoped session, ignore events for other sessions
      if (listenSessionId && sessionId && listenSessionId !== sessionId) {
        return;
      }

      console.log(
        '[CustomInput] Received prefill event:',
        prefillText.substring(0, 50) + '...',
        'timestamp:',
        timestamp,
      );

      // Avoid processing the same prefill multiple times
      if (timestamp <= lastPrefillTimestampRef.current) {
        console.log('[CustomInput] Skipping duplicate prefill event');
        return;
      }
      lastPrefillTimestampRef.current = timestamp;

      if (prefillText && prefillText.trim()) {
        console.log('[CustomInput] Setting text to prefill content');
        setText(prefillText);

        // Mark that we need to focus for this timestamp
        focusPendingRef.current = timestamp;
      }
    };

    window.addEventListener('copilot-prefill-text', handlePrefillEvent);
    console.log('[CustomInput] Registered copilot-prefill-text event listener');

    return () => {
      window.removeEventListener('copilot-prefill-text', handlePrefillEvent);
      console.log('[CustomInput] Unregistered copilot-prefill-text event listener');
    };
  }, [listenSessionId]);

  // Separate effect to handle focusing after text is set
  // This only runs when text changes and we have a pending focus
  useEffect(() => {
    if (focusPendingRef.current && text && textareaRef.current) {
      const timestamp = focusPendingRef.current;
      focusPendingRef.current = null; // Clear immediately to prevent multiple focuses

      // Small delay to ensure DOM is updated
      setTimeout(() => {
        console.log('[CustomInput] Focusing textarea for timestamp:', timestamp);
        if (textareaRef.current) {
          textareaRef.current.focus();
          // Move cursor to end
          const length = text.length;
          textareaRef.current.setSelectionRange(length, length);
          console.log('[CustomInput] Cursor positioned at end');
        }
      }, 100);
    }
  }, [text]);

  const send = () => {
    if (inProgress) return;
    onSend(text);
    setText('');

    textareaRef.current?.focus();
  };

  const { pushToTalkState, setPushToTalkState } = usePushToTalk({
    sendFunction: onSend,
    inProgress,
  });

  const isInProgress = inProgress || pushToTalkState === 'transcribing';
  const buttonIcon = isInProgress && !hideStopButton ? CustomIcons.stop : CustomIcons.send;
  const showPushToTalk =
    pushToTalkConfigured && (pushToTalkState === 'idle' || pushToTalkState === 'recording') && !inProgress;

  const canSend = useMemo(() => {
    const interruptEvent = copilotContext.langGraphInterruptAction?.event;
    const interruptInProgress = interruptEvent?.name === 'LangGraphInterruptEvent' && !interruptEvent?.response;

    return !isInProgress && text.trim().length > 0 && pushToTalkState === 'idle' && !interruptInProgress;
  }, [copilotContext.langGraphInterruptAction?.event, isInProgress, text, pushToTalkState]);

  const canStop = useMemo(() => {
    return isInProgress && !hideStopButton;
  }, [isInProgress, hideStopButton]);

  const sendDisabled = !canSend && !canStop;

  return (
    <div className={`copilotKitInputContainer ${showPoweredBy ? 'poweredByContainer' : ''}`}>
      <div className="copilotKitInput" onClick={handleDivClick}>
        <AutoResizingTextarea
          ref={textareaRef}
          placeholder={context.labels.placeholder}
          autoFocus={false}
          maxRows={MAX_NEWLINES}
          value={text}
          onChange={event => setText(event.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !isComposing) {
              event.preventDefault();
              if (canSend) {
                send();
              }
            }
          }}
        />
        <div className="copilotKitInputControls">
          {onUpload && (
            <button onClick={onUpload} className="copilotKitInputControlButton">
              {CustomIcons.upload}
            </button>
          )}

          <div style={{ flexGrow: 1 }} />

          {showPushToTalk && (
            <button
              onClick={() => setPushToTalkState(pushToTalkState === 'idle' ? 'recording' : 'transcribing')}
              className={
                pushToTalkState === 'recording'
                  ? 'copilotKitInputControlButton copilotKitPushToTalkRecording'
                  : 'copilotKitInputControlButton'
              }>
              {CustomIcons.microphone}
            </button>
          )}
          <button
            disabled={sendDisabled}
            onClick={isInProgress && !hideStopButton ? onStop : send}
            data-copilotkit-in-progress={inProgress}
            data-test-id={inProgress ? 'copilot-chat-request-in-progress' : 'copilot-chat-ready'}
            className="copilotKitInputControlButton">
            {buttonIcon}
          </button>
        </div>
      </div>
      <PoweredByTag showPoweredBy={showPoweredBy} />
    </div>
  );
};
