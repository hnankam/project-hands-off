import React, { useMemo, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { InputProps } from '@copilotkit/react-ui';
import { useChatContext } from '@copilotkit/react-ui';
import { useCopilotContext } from '@copilotkit/react-core';
import { COPIOLITKIT_CONFIG } from '../constants';
import { ensureFirebase } from '../utils/firebaseStorage';
import { ref as fbRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { debug, useStorage } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { TaskProgressCard, AgentStepState } from './TaskProgressCard';
import { cn } from '@extension/ui';
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from '@extension/ui';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Mention } from '@tiptap/extension-mention';
import Link from '@tiptap/extension-link';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { EnterToSend } from './tiptap/EnterToSendExtension';
import { createSlashCommandExtension, type SlashCommand } from './tiptap/SlashCommandExtension';
import { createMentionSuggestion, type MentionSuggestion } from './tiptap/MentionExtension';
import { editorToMarkdown } from './tiptap/markdownSerializer';

const MAX_NEWLINES = 6;

// Create lowlight instance for code highlighting
const lowlight = createLowlight(common);

/**
 * AutoResizingTextarea Component
 * Internal component for auto-resizing textarea
 * DEPRECATED: Keeping for potential fallback, but replaced by Tiptap
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
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  ),
  plan: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <path d="M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      <path d="M9 14l2 2 4-4" />
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
  image: (
    <svg
      width="16"
      height="16"
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
  file: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  ),
  recentFile: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l4 2" />
    </svg>
  ),
  workflow: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
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
  // Task Progress Card props
  taskProgressState?: AgentStepState;
  onTaskProgressStateChange?: (state: AgentStepState) => void;
  showTaskProgress?: boolean;
  sessionId?: string;
  onToggleTaskProgress?: () => void;
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
  taskProgressState,
  onTaskProgressStateChange,
  showTaskProgress = false,
  sessionId,
  onToggleTaskProgress,
}) => {
  const context = useChatContext();
  const copilotContext = useCopilotContext();
  const { isLight } = useStorage(exampleThemeStorage);
  const inputBackground = isLight ? '#ffffff' : '#151C24';
  const inputBackgroundVar = `var(--copilot-kit-input-background-color, ${inputBackground})`;
  const planHorizontalInset = 35;
  const isInputEnabled = Boolean(isAgentAndModelSelected);
  
  // Tooltip state for plan toggle button
  const [showPlanTooltip, setShowPlanTooltip] = useState(false);
  const [planTooltipRect, setPlanTooltipRect] = useState<{ left: number; top: number } | null>(null);
  const planButtonRef = useRef<HTMLButtonElement>(null);
  const planCardRef = useRef<HTMLDivElement>(null);
  
  // Force browser reflow when showTaskProgress changes to trigger animation
  useEffect(() => {
    if (planCardRef.current) {
      // Trigger reflow
      void planCardRef.current.offsetHeight;
    }
  }, [showTaskProgress]);

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
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Drag & drop state for file uploads
  const [isDragActive, setIsDragActive] = useState(false);
  const dragCounterRef = useRef(0);

  // Sample mention suggestions
  const mentionSuggestions: MentionSuggestion[] = useMemo(() => [
    { id: '1', label: 'AI Assistant', type: 'agent' },
    { id: '2', label: 'Code Agent', type: 'agent' },
    { id: '3', label: 'Data Analyst', type: 'agent' },
    { id: '4', label: 'project-spec.md', type: 'file' },
    { id: '5', label: 'database-schema.sql', type: 'file' },
    { id: '6', label: 'api-docs.json', type: 'file' },
    { id: '7', label: 'USER_ID', type: 'variable' },
    { id: '8', label: 'API_KEY', type: 'variable' },
  ], []);

  // Slash commands configuration
  const slashCommands: SlashCommand[] = useMemo(() => [
    {
      title: 'Code Block',
      description: '',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
      command: ({ editor, range }) => {
        // Delete the slash command trigger text first
        editor.chain().focus().deleteRange(range).run();
        
        // Get the current node type
        const { $from } = editor.state.selection;
        const currentNode = $from.node($from.depth);
        
        // If we're in a code block, toggle it off (convert back to paragraph)
        if (currentNode.type.name === 'codeBlock') {
          editor.chain().focus().toggleCodeBlock().run();
        } else {
          // If we're in any other node, convert it to a code block
          // Use setNode to replace the current block with a code block
          editor.chain().focus().setNode('codeBlock').run();
        }
      },
    },
    {
      title: 'Bold',
      description: '',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path></svg>',
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .toggleBold()
          .run();
      },
    },
    {
      title: 'Italic',
      description: '',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"></line><line x1="14" y1="20" x2="5" y2="20"></line><line x1="15" y1="4" x2="9" y2="20"></line></svg>',
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .toggleItalic()
          .run();
      },
    },
    {
      title: 'Heading 1',
      description: 'Large heading',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8M4 18V6M12 18V6M17 12h3M17 18h3M17 6h3"></path></svg>',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run();
      },
    },
    {
      title: 'Heading 2',
      description: 'Medium heading',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8M4 18V6M12 18V6M18 18h4l-4-6h4"></path></svg>',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run();
      },
    },
    {
      title: 'Heading 3',
      description: 'Small heading',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8M4 18V6M12 18V6M18 12h4l-4-6h4M18 18h4l-4-6"></path></svg>',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run();
      },
    },
    {
      title: 'Blockquote',
      description: 'Insert a quote',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"></path></svg>',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode('blockquote').run();
      },
    },
    {
      title: 'Horizontal Rule',
      description: 'Insert a divider',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line></svg>',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHorizontalRule().run();
      },
    },
    {
      title: 'separator',
      description: '',
      icon: '',
      command: () => {},
    },
    {
      title: 'Create Command',
      description: '',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        // TODO: Open create command modal
        console.log('Create Command clicked');
      },
    },
  ], []);

  // Tiptap Editor Setup
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
        horizontalRule: {},
        blockquote: {},
        codeBlock: false, // We'll use CodeBlockLowlight instead
      }),
      Link.configure({
        openOnClick: true,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: {
          class: 'editor-link',
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class: 'code-block',
        },
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'mention',
        },
        suggestion: createMentionSuggestion(mentionSuggestions),
      }),
      Placeholder.configure({
        placeholder: () => {
          if (!isInputEnabled) {
            return 'Please select an agent and model to start chatting';
          }
          // return context.labels.placeholder || 'Type a message... (/ for commands, @ for context)';
          return 'Type a message... (/ for commands, @ for context)';
        },
      }),
      EnterToSend.configure({
        onSend: () => {
          send();
        },
        canSend: (): boolean => {
          if (!editor || !isInputEnabled) return false;
          const interruptEvent = copilotContext.langGraphInterruptAction?.event;
          const interruptInProgress = interruptEvent?.name === 'LangGraphInterruptEvent' && !interruptEvent?.response;
          const hasContent = !editor.isEmpty;
          return !inProgress && hasContent && !interruptInProgress;
        },
      }),
      createSlashCommandExtension(slashCommands),
    ],
    editorProps: {
      attributes: {
        class: 'copilotKitInputTextarea tiptap-editor',
        spellcheck: 'true',
      },
      handlePaste: (view, event) => {
        if (!isInputEnabled) return false;
        
        try {
          const items = Array.from(event.clipboardData?.items || []);
          const fileItems = items.filter(i => i.kind === 'file');
          
          if (fileItems.length === 0) {
            // No files, let Tiptap handle text paste normally
            return false;
          }
          
          // Prevent default text paste when files are present
          event.preventDefault();
          
          const files: File[] = [];
          for (const item of fileItems) {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
          
          if (files.length > 0) {
            // Create FileList-like object for handleFilesPicked
            const fileList = {
              length: files.length,
              item: (index: number) => files[index] || null,
              [Symbol.iterator]: function* () {
                for (const file of files) {
                  yield file;
                }
              },
            } as unknown as FileList;
            
            handleFilesPicked(fileList);
          }
          
          return true; // We handled the paste
        } catch (error) {
          console.error('[CustomInput] Paste error:', error);
          return false;
        }
      },
    },
    editable: isInputEnabled,
    shouldRerenderOnTransaction: false, // Performance optimization: prevent re-renders on every transaction
    onCreate: () => {
      // Auto-focus behavior can be added here if needed
    },
    onUpdate: () => {
      // Optional: track content changes
    },
  }, [isInputEnabled, context.labels.placeholder, slashCommands, mentionSuggestions]);

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

  // Update editor editable state when input is disabled
  useEffect(() => {
    if (!isInputEnabled && editor) {
      editor.commands.clearContent();
      setAttachments(prev => {
        prev.forEach(a => URL.revokeObjectURL(a.previewUrl));
        return [];
      });
    }
    if (editor) {
      editor.setEditable(isInputEnabled);
    }
  }, [isInputEnabled, editor]);

  const handleDivClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

    // If the user clicked a button or inside a button, don't focus the editor
    if (target.closest('button')) return;

    // If the user clicked the editor, do nothing (it's already focused)
    if (target.closest('.tiptap-editor')) return;

    if (!isInputEnabled || !editor) return;

    // Otherwise, focus the editor
    editor.commands.focus('end');
  };

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

      if (prefillText && prefillText.trim() && isInputEnabled && editor) {
        console.log('[CustomInput] Setting editor content to prefill text');
        editor.commands.setContent(prefillText);
        editor.commands.focus('end');
      }
    };

    window.addEventListener('copilot-prefill-text', handlePrefillEvent);
    console.log('[CustomInput] Registered copilot-prefill-text event listener');

    return () => {
      window.removeEventListener('copilot-prefill-text', handlePrefillEvent);
      console.log('[CustomInput] Unregistered copilot-prefill-text event listener');
    };
  }, [listenSessionId, isInputEnabled, editor]);

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
    if (inProgress || !isInputEnabled || !editor) return;

    // Get markdown from editor
    const markdown = editorToMarkdown(editor);
    if (!markdown.trim() && attachments.length === 0) return;

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
    const finalText = `${markdown}${manifestBlock}`;

    debug.log('[CustomInput] Final markdown:', finalText);

    onSend(finalText);
    editor.commands.clearContent();

    // Cleanup attachments
    attachments.forEach(a => URL.revokeObjectURL(a.previewUrl));
    setAttachments([]);

    editor.commands.focus();
  };

  const { pushToTalkState, setPushToTalkState } = usePushToTalk({
    sendFunction: onSend,
    inProgress,
  });

  const isInProgress = inProgress || pushToTalkState === 'transcribing';
  const buttonIcon = isInProgress && !hideStopButton ? CustomIcons.stop : CustomIcons.send;
  const showPushToTalk =
    pushToTalkConfigured && (pushToTalkState === 'idle' || pushToTalkState === 'recording') && !inProgress && isInputEnabled;

  const canSend: boolean = useMemo(() => {
    if (!isInputEnabled || !editor) return false;

    const interruptEvent = copilotContext.langGraphInterruptAction?.event;
    const interruptInProgress = interruptEvent?.name === 'LangGraphInterruptEvent' && !interruptEvent?.response;

    // Check if editor has any content (works with all node types)
    const hasContent = !editor.isEmpty;
    return !isInProgress && hasContent && pushToTalkState === 'idle' && !interruptInProgress;
  }, [copilotContext.langGraphInterruptAction?.event, isInProgress, editor, pushToTalkState, isInputEnabled]);

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

  const hasTaskProgress = Boolean(
    taskProgressState?.steps?.some(step => step.status !== 'deleted')
  );

  const canToggleTaskProgress = hasTaskProgress && Boolean(onToggleTaskProgress);

  const handleToggleTaskProgress = () => {
    if (!canToggleTaskProgress || !onToggleTaskProgress) return;
    onToggleTaskProgress();
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

  const openImagePicker = () => {
    if (!isInputEnabled) return;
    if (imageInputRef.current) imageInputRef.current.click();
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

  const floatingCardOffset = 12;

  return (
    <div
      className={`copilotKitInputContainer ${showPoweredBy ? 'poweredByContainer' : ''}`}
      style={{ position: 'relative', zIndex: 5 }}
    >
      {/* Task Progress Card - placed above chat input with slide animation */}
      {taskProgressState?.steps && taskProgressState.steps.length > 0 && onTaskProgressStateChange && (
        <div 
          data-session-id={sessionId}
          style={{
            width: '100%',
            paddingLeft: planHorizontalInset,
            paddingRight: planHorizontalInset,
            paddingBottom: 0,
            boxSizing: 'border-box',
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: '100%',
            zIndex: 10,
          }}
        >
          <div
            className={cn(
              'overflow-hidden transition-all ease-in-out',
              showTaskProgress 
                ? 'max-h-[500px] opacity-100 duration-500' 
                : 'max-h-0 opacity-0 duration-400'
            )}
            style={{
              pointerEvents: showTaskProgress ? 'auto' : 'none',
            }}
          >
            <div
              ref={planCardRef}
              className={cn(
                'transition-all ease-in-out',
                showTaskProgress 
                  ? 'translate-y-0 duration-300 delay-100' 
                  : '-translate-y-4 duration-200'
              )}
            >
              <TaskProgressCard 
                state={taskProgressState} 
                setState={onTaskProgressStateChange}
                isCollapsed={true} 
                isHistorical={false}
                showControls={true}
              />
            </div>
          </div>
        </div>
      )}
      <div
        className="copilotKitInput"
        onClick={handleDivClick}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ 
          position: 'relative',
          ...(taskProgressState?.steps && taskProgressState.steps.length > 0 && showTaskProgress && {
            borderTopLeftRadius: '0',
            borderTopRightRadius: '0',
            // top border remains visible to preserve outline, so no borderTop override
            marginTop: '0'
          })
        }}
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
        {editor && <EditorContent editor={editor} />}
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
                borderRadius: '6px',
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
          {/* Hidden file inputs for different file types */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.txt,.sql,.csv,.json,.xml,.md,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            style={{ display: 'none' }}
            onChange={(e) => handleFilesPicked(e.target.files)}
            disabled={!isInputEnabled}
          />
          <input
            ref={imageInputRef}
            type="file"
            multiple
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => handleFilesPicked(e.target.files)}
            disabled={!isInputEnabled}
          />
          <button
            ref={planButtonRef}
            type="button"
            onClick={handleToggleTaskProgress}
            onMouseEnter={(e) => {
              if (!canToggleTaskProgress) return;
              const rect = e.currentTarget.getBoundingClientRect();
              setPlanTooltipRect({ left: rect.left + rect.width / 2, top: rect.top });
              setShowPlanTooltip(true);
            }}
            onMouseLeave={() => {
              setShowPlanTooltip(false);
            }}
            className={`copilotKitInputControlButton ${
              canToggleTaskProgress
                ? showTaskProgress
                  ? isLight
                    ? 'text-blue-600 bg-blue-100 hover:bg-blue-200'
                    : 'text-blue-400 bg-blue-900/50 hover:bg-blue-900/70'
                  : isLight
                    ? 'text-gray-600 hover:bg-gray-200'
                    : 'text-gray-400 hover:bg-gray-700'
                : 'opacity-40 cursor-not-allowed'
            }`}
            disabled={!canToggleTaskProgress}
            aria-label={showTaskProgress ? 'Hide plan progress' : 'Show plan progress'}
          >
            {CustomIcons.plan}
          </button>
          
          {/* Upload dropdown menu */}
          <DropdownMenu
            trigger={
          <button
                type="button"
            className="copilotKitInputControlButton"
            disabled={!isInputEnabled}
                style={{
                  opacity: !isInputEnabled ? 0.4 : 1,
                  cursor: !isInputEnabled ? 'not-allowed' : 'pointer'
                }}
          >
            {CustomIcons.upload}
          </button>
            }
            align="left"
            direction="up"
            isLight={isLight}
          >
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                openImagePicker();
              }}
              isLight={isLight}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {CustomIcons.image}
                <span>Upload Images</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                openFilePicker();
              }}
              isLight={isLight}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {CustomIcons.file}
                <span>Upload Files</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={true}
              isLight={isLight}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {CustomIcons.recentFile}
                <span>Recent Files</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator isLight={isLight} />
            <DropdownMenuItem
              disabled={true}
              isLight={isLight}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {CustomIcons.plan}
                <span>Plan</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={true}
              isLight={isLight}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {CustomIcons.workflow}
                <span>Workflow</span>
              </div>
            </DropdownMenuItem>
          </DropdownMenu>

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
      
      {/* Custom tooltip for plan toggle button */}
      {showPlanTooltip && planTooltipRect && canToggleTaskProgress && createPortal(
        <div
          style={{
            position: 'fixed',
            left: Math.max(80, Math.min(planTooltipRect.left, window.innerWidth - 80)),
            top: planTooltipRect.top,
            transform: 'translateX(-50%) translateY(32px)',
            zIndex: 999999,
            pointerEvents: 'none',
          }}
        >
          <div className={`px-2 py-1.5 text-[11px] rounded-md border shadow-lg whitespace-nowrap ${
            isLight ? 'bg-white border-gray-200 text-gray-800' : 'bg-[#151C24] border-gray-700 text-gray-100'
          }`}>
            {showTaskProgress ? 'Hide plan progress' : 'Show plan progress'}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
