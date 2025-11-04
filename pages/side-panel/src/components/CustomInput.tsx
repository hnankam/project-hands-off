import React, { useMemo, useRef, useState, useEffect } from 'react';
import type { InputProps } from '@copilotkit/react-ui';
import { useChatContext } from '@copilotkit/react-ui';
import { useCopilotContext } from '@copilotkit/react-core';
import { COPIOLITKIT_CONFIG } from '../constants';
import { ensureFirebase } from '../utils/firebaseStorage';
import { ref as fbRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { debug, useStorage } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';

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
  onPaste?: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  disabled?: boolean;
}

const AutoResizingTextarea = React.forwardRef<HTMLTextAreaElement, AutoResizingTextareaProps>(
  ({ placeholder, autoFocus, maxRows = 6, value, onChange, onCompositionStart, onCompositionEnd, onKeyDown, onPaste, disabled = false }, ref) => {
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
        onPaste={disabled ? undefined : onPaste}
        disabled={disabled}
        rows={1}
        style={{
          resize: 'none',
          overflow: 'auto',
          boxSizing: 'border-box',
          opacity: disabled ? 0.6 : 1,
          backgroundColor: disabled ? 'transparent' : undefined,
          cursor: disabled ? 'not-allowed' : undefined,
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
      <path d="M12 5v14" />
      <path d="M5 12h14" />
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
  isAgentAndModelSelected?: boolean;
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
  isAgentAndModelSelected = true,
}) => {
  const context = useChatContext();
  const copilotContext = useCopilotContext();
  const { isLight } = useStorage(exampleThemeStorage);
  const isInputEnabled = Boolean(isAgentAndModelSelected);

  // Log input enabled state changes
  useEffect(() => {
    console.log(`[CustomInput] Input state changed for session ${listenSessionId?.slice(0, 8) || 'unknown'}:`, {
      isAgentAndModelSelected,
      isInputEnabled,
    });
  }, [isAgentAndModelSelected, isInputEnabled, listenSessionId]);

  const showPoweredBy = !copilotContext.copilotApiConfig?.publicApiKey;

  const pushToTalkConfigured =
    copilotContext.copilotApiConfig.textToSpeechUrl !== undefined &&
    copilotContext.copilotApiConfig.transcribeAudioUrl !== undefined;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isComposing, setIsComposing] = useState(false);

  // Drag & drop state for file uploads
  const [isDragActive, setIsDragActive] = useState(false);
  const dragCounterRef = useRef(0);

  type AttachmentItem = {
    id: string;
    file: File;
    name: string;
    size: number;
    previewUrl: string; // object URL for quick preview
    status: 'pending' | 'uploading' | 'uploaded' | 'error';
    progress: number; // 0..100
    uploadedUrl?: string; // Firebase download URL
    error?: string;
  };

  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);

  useEffect(() => {
    if (!isInputEnabled) {
      setText('');
      setAttachments(prev => {
        prev.forEach(a => URL.revokeObjectURL(a.previewUrl));
        return [];
      });
    }
  }, [isInputEnabled]);

  const handleDivClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

    // If the user clicked a button or inside a button, don't focus the textarea
    if (target.closest('button')) return;

    // If the user clicked the textarea, do nothing (it's already focused)
    if (target.tagName === 'TEXTAREA') return;

    if (!isInputEnabled) return;

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

      if (prefillText && prefillText.trim() && isInputEnabled) {
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
  }, [listenSessionId, isInputEnabled]);

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

  const uploadAttachment = async (item: AttachmentItem, sessionId: string) => {
    if (!COPIOLITKIT_CONFIG.ENABLE_FIREBASE_UPLOADS || !COPIOLITKIT_CONFIG.FIREBASE?.storageBucket) {
      return item; // fallback to blob URL
    }
    try {
      const storage = ensureFirebase(COPIOLITKIT_CONFIG.FIREBASE as any);
      const ts = Date.now();
      const safeName = item.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `attachments/${sessionId || 'default'}/${ts}-${safeName}`;
      const storageRef = fbRef(storage as any, path);
      return await new Promise<AttachmentItem>((resolve, reject) => {
        const task = uploadBytesResumable(storageRef as any, item.file);
        setAttachments(prev => prev.map(a => a.id === item.id ? { ...a, status: 'uploading', progress: 0 } : a));
        task.on('state_changed', (snap: any) => {
          const prog = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          setAttachments(prev => prev.map(a => a.id === item.id ? { ...a, progress: prog } : a));
        }, (err: any) => {
          setAttachments(prev => prev.map(a => a.id === item.id ? { ...a, status: 'error', error: String(err) } : a));
          reject(err);
        }, async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          const updated: AttachmentItem = { ...item, status: 'uploaded', progress: 100, uploadedUrl: url };
          setAttachments(prev => prev.map(a => a.id === item.id ? updated : a));
          resolve(updated);
        });
      });
    } catch (e: any) {
      setAttachments(prev => prev.map(a => a.id === item.id ? { ...a, status: 'error', error: String(e) } : a));
      return item;
    }
  };

  const send = async () => {
    if (inProgress || !isInputEnabled) return;

    // Upload all pending attachments first
    const sessionId = listenSessionId || 'default';
    const updatedAttachments = [...attachments];
    for (let i = 0; i < updatedAttachments.length; i++) {
      const item = updatedAttachments[i];
      if (item.status === 'pending') {
        // eslint-disable-next-line no-await-in-loop
        const uploaded = await uploadAttachment(item, sessionId);
        updatedAttachments[i] = uploaded;
      }
    }
    // Commit any state changes so UI reflects uploaded URLs/progress
    setAttachments(updatedAttachments);

    // Build final message as single text (GraphQL API expects string, not content parts)
    // Build hidden manifest block for server/UI parsing
    const manifest = updatedAttachments
      .filter(a => a.status !== 'error')
      .map(a => ({
        name: a.name,
        type: a.file.type || 'application/octet-stream',
        size: a.size,
        url: a.uploadedUrl || a.previewUrl,
      }));
    const manifestBlock = manifest.length > 0
      ? `\n\n<!--ATTACHMENTS:\n${JSON.stringify(manifest)}\n-->`
      : '';
    const finalText = `${text}${manifestBlock}`;

    debug.log('[CustomInput] Final text:', finalText);

    onSend(finalText);
    setText('');

    // Cleanup attachments
    attachments.forEach(a => URL.revokeObjectURL(a.previewUrl));
    setAttachments([]);

    textareaRef.current?.focus();
  };

  const { pushToTalkState, setPushToTalkState } = usePushToTalk({
    sendFunction: onSend,
    inProgress,
  });

  const isInProgress = inProgress || pushToTalkState === 'transcribing';
  const buttonIcon = isInProgress && !hideStopButton ? CustomIcons.stop : CustomIcons.send;
  const showPushToTalk =
    pushToTalkConfigured && (pushToTalkState === 'idle' || pushToTalkState === 'recording') && !inProgress && isInputEnabled;

  const canSend = useMemo(() => {
    if (!isInputEnabled) return false;

    const interruptEvent = copilotContext.langGraphInterruptAction?.event;
    const interruptInProgress = interruptEvent?.name === 'LangGraphInterruptEvent' && !interruptEvent?.response;

    return !isInProgress && text.trim().length > 0 && pushToTalkState === 'idle' && !interruptInProgress;
  }, [copilotContext.langGraphInterruptAction?.event, isInProgress, text, pushToTalkState, isInputEnabled]);

  const canStop = useMemo(() => {
    return isInProgress && !hideStopButton;
  }, [isInProgress, hideStopButton]);

  const sendDisabled = !canSend && !canStop;

  // Upload any file types by inserting object URLs into the input as links
  const handleFilesPicked = (files: FileList | null) => {
    if (!isInputEnabled || !files || files.length === 0) return;
    const newItems: AttachmentItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files.item(i)!;
      const id = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`;
      const url = URL.createObjectURL(f);
      const tooLarge = f.size > MAX_UPLOAD_BYTES;
      newItems.push({
        id,
        file: f,
        name: f.name,
        size: f.size,
        previewUrl: url,
        status: tooLarge ? 'error' : 'pending',
        progress: 0,
        error: tooLarge ? `File exceeds 30MB limit (${formatSize(f.size)})` : undefined,
      });
    }
    setAttachments(prev => [...prev, ...newItems]);
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => {
      const found = prev.find(a => a.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter(a => a.id !== id);
    });
  };

  const formatSize = (bytes: number): string => {
    const kb = bytes / 1024;
    if (kb >= 1024) {
      const mb = kb / 1024;
      return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
    }
    return `${Math.max(1, Math.round(kb))} KB`;
  };

  const MAX_UPLOAD_BYTES = 30 * 1024 * 1024; // 30MB

  const openFilePicker = () => {
    if (!isInputEnabled) return;
    if (fileInputRef.current) fileInputRef.current.click();
  };

  // Helpers to handle drag & drop uploads
  const eventHasFiles = (e: React.DragEvent) => {
    if (!isInputEnabled) return false;
    try {
      const items = Array.from(e.dataTransfer?.items || []);
      if (items.some(i => i.kind === 'file')) return true;
      const types = Array.from(e.dataTransfer?.types || []);
      return types.includes('Files');
    } catch {
      return false;
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isInputEnabled) return;
    dragCounterRef.current += 1;
    if (eventHasFiles(e)) setIsDragActive(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isInputEnabled) return;
    if (eventHasFiles(e)) {
      e.dataTransfer.dropEffect = 'copy';
      if (!isDragActive) setIsDragActive(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isInputEnabled) return;
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isInputEnabled) return;
    setIsDragActive(false);
    dragCounterRef.current = 0;
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFilesPicked(files);
      try { e.dataTransfer.clearData(); } catch {}
    }
  };

  // Paste handler for images/files from clipboard
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!isInputEnabled) return;
    try {
      const items = Array.from(e.clipboardData?.items || []);
      const fileItems = items.filter(i => i.kind === 'file');
      if (fileItems.length === 0) return;
      e.preventDefault();
      const files: File[] = [];
      for (const item of fileItems) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
      if (files.length > 0) {
        // Convert to FileList-like handle by creating a DataTransfer
        const dt = new DataTransfer();
        files.forEach(f => dt.items.add(f));
        handleFilesPicked(dt.files);
      }
    } catch (err) {
      console.warn('[CustomInput] Paste handling failed:', err);
    }
  };

  return (
    <div className={`copilotKitInputContainer ${showPoweredBy ? 'poweredByContainer' : ''}`}>
      <div
        className="copilotKitInput"
        onClick={handleDivClick}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ position: 'relative' }}
      >
        {isDragActive && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              border: isLight ? '2px dashed rgba(59,130,246,0.5)' : '2px dashed rgba(255,255,255,0.25)',
              background: isLight ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            <span style={{ fontSize: '12px', opacity: 0.8 }}>
              Drop files to attach
            </span>
          </div>
        )}
        <AutoResizingTextarea
          ref={textareaRef}
          placeholder={
            isInputEnabled
              ? context.labels.placeholder
              : 'Please select an agent and model to start chatting'
          }
          autoFocus={false}
          maxRows={MAX_NEWLINES}
          value={text}
          onChange={event => setText(event.target.value)}
          onPaste={handlePaste}
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
        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div
            className="mt-1 px-1"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px',
              maxHeight: '120px',
              overflowY: 'auto',
            }}
          >
            {attachments.map(att => {
              const isError = att.status === 'error';
              const bgCol = isError
                ? (isLight ? 'rgba(239,68,68,0.08)' : 'rgba(248,113,113,0.12)')
                : (isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.07)');
              const pillStyle: React.CSSProperties = {
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '2px 6px',
                borderRadius: '9999px',
                background: bgCol,
                fontSize: '11px',
                color: isLight ? '#0C1117' : '#e5e7eb',
                maxWidth: '100%',
                whiteSpace: 'nowrap',
              };
              const dotColor = att.status === 'uploaded' ? '#10b981' : att.status === 'error' ? '#ef4444' : '#3b82f6';
              return (
                <div key={att.id} style={pillStyle} title={att.name}>
                  {/* File icon */}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                  {/* Content wrapper with gradient mask so it doesn't overlap the remove button */}
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      maxWidth: '240px',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Name and size */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{att.name}</span>
                      <span style={{ opacity: 0.85 }}>({formatSize(att.size)})</span>
                    </div>
                    {/* Status */}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: dotColor, display: 'inline-block' }} />
                      {att.status === 'uploading' && <span style={{ opacity: 0.85 }}>{Math.max(0, Math.min(att.progress, 100))}%</span>}
                    </span>
                  </div>
                  {/* Remove */}
                  <button
                    onClick={() => removeAttachment(att.id)}
                    title="Remove attachment"
                    style={{
                      marginLeft: '3px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: 'inherit',
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div className="copilotKitInputControls">
          {/* Enable upload for all file types via hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="*/*"
            style={{ display: 'none' }}
            onChange={(e) => handleFilesPicked(e.target.files)}
            disabled={!isInputEnabled}
          />
          <button
            onClick={openFilePicker}
            className="copilotKitInputControlButton"
            disabled={!isInputEnabled}
          >
            {CustomIcons.upload}
          </button>
          

          <div style={{ flexGrow: 1 }} />

          {showPushToTalk && (
            <button
              onClick={() => setPushToTalkState(pushToTalkState === 'idle' ? 'recording' : 'transcribing')}
              className={
                pushToTalkState === 'recording'
                  ? 'copilotKitInputControlButton copilotKitPushToTalkRecording'
                  : 'copilotKitInputControlButton'
              }
              disabled={!isInputEnabled}
            >
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
