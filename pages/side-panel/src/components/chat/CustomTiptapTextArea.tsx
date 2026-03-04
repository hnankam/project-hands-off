/**
 * Custom Tiptap TextArea Component for CopilotKit V2
 * 
 * A rich text editor component using Tiptap that replaces the default textarea.
 * Features:
 * - Markdown support
 * - Code block syntax highlighting
 * - Slash commands (/)
 * - Mentions (@)
 * - Link auto-detection
 * - Enter to send
 * - File paste handling
 */
import * as React from 'react';
import { useMemo, useRef, useEffect, useImperativeHandle, forwardRef, useContext } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Mention } from '@tiptap/extension-mention';
import Link from '@tiptap/extension-link';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { Markdown } from 'tiptap-markdown';
import { useCopilotRuntimeContext, useCopilotChatContext } from '../../hooks/copilotkit';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { EnterToSend } from '../tiptap/EnterToSendExtension';
import { createSlashCommandExtension, type SlashCommand } from '../tiptap/SlashCommandExtension';
import { createMentionSuggestion, type MentionSuggestion } from '../tiptap/MentionExtension';
import { editorToMarkdown } from '../tiptap/markdownSerializer';
import { PageSelectorContext } from './CustomInputV2';

// Create lowlight instance for code highlighting
const lowlight = createLowlight(common);

export interface CustomTiptapTextAreaHandle {
  getMarkdown: () => string;
  clear: () => void;
  focus: () => void;
  setContent: (content: string) => void;
  // DOM element properties for ResizeObserver compatibility
  offsetHeight?: number;
  offsetWidth?: number;
  scrollHeight?: number;
  clientHeight?: number;
  style?: CSSStyleDeclaration;
  className?: string;
}

interface CustomTiptapTextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  isInputEnabled?: boolean;
  isRunning?: boolean;
  onFilesPicked?: (files: FileList | null) => void;
  placeholder?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onMentionInsert?: (mention: { type: string; id: string; workspaceFileId?: string }) => void;
  onMentionDelete?: (mention: { type: string; id: string; workspaceFileId?: string }) => void;
}

/**
 * CustomTiptapTextArea - Tiptap-based rich text editor
 * 
 * Replaces the default textarea with a full-featured rich text editor.
 * Exposes methods via ref for getting content and clearing the editor.
 */
export const CustomTiptapTextArea = forwardRef<HTMLDivElement, CustomTiptapTextAreaProps>(
  (
    {
      isInputEnabled = true,
      isRunning = false,
      onFilesPicked,
      placeholder,
      value,
      onChange,
      onKeyDown,
      onMentionInsert,
      onMentionDelete,
      className,
      ...restProps
    },
    ref
  ) => {

    const context = useCopilotChatContext();
    const copilotRuntimeContext = useCopilotRuntimeContext();
    const { isLight } = useStorage(themeStorage);
    
    // Access raw context for langGraphInterruptAction (not in typed interface)
    const copilotContext = (copilotRuntimeContext as any)._rawContext || copilotRuntimeContext;
    
    // Get selected pages, notes, credentials, files, and agent state from PageSelectorContext
    const pageSelectorCtx = useContext(PageSelectorContext);
    const selectedPageURLs = pageSelectorCtx?.selectedPageURLs ?? [];
    const selectedNotes = pageSelectorCtx?.selectedNotes ?? [];
    const selectedCredentials = pageSelectorCtx?.selectedCredentials ?? [];
    const selectedFiles = pageSelectorCtx?.selectedFiles ?? [];
    const agentState = pageSelectorCtx?.agentState;
    
    // Internal ref for the container div - this is what ResizeObserver will observe
    const containerRef = useRef<HTMLDivElement>(null);
    
    // Forward ref to container div for ResizeObserver compatibility
    useEffect(() => {
      if (ref) {
        if (typeof ref === 'function') {
          ref(containerRef.current);
        } else {
          ref.current = containerRef.current;
        }
      }
    }, [ref]);

    // Mention suggestions - only pages (fetched dynamically in MentionExtension)
    const mentionSuggestions: MentionSuggestion[] = useMemo(
      () => [],
      []
    );

    // Slash commands configuration
    const slashCommands: SlashCommand[] = useMemo(
      () => [
        {
          title: 'Code Block',
          description: '',
          icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
          command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).run();
            const { $from } = editor.state.selection;
            const currentNode = $from.node($from.depth);
            if (currentNode.type.name === 'codeBlock') {
              editor.chain().focus().toggleCodeBlock().run();
            } else {
              editor.chain().focus().setNode('codeBlock').run();
            }
          },
        },
        {
          title: 'Bold',
          description: '',
          icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path></svg>',
          command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).toggleBold().run();
          },
        },
        {
          title: 'Italic',
          description: '',
          icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"></line><line x1="14" y1="20" x2="5" y2="20"></line><line x1="15" y1="4" x2="9" y2="20"></line></svg>',
          command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).toggleItalic().run();
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
            console.log('Create Command clicked');
          },
        },
      ],
      []
    );

    // Use refs to store latest values for extension callbacks
    const onKeyDownRef = useRef(onKeyDown);
    const isRunningRef = useRef(isRunning);
    const isInputEnabledRef = useRef(isInputEnabled);
    const selectedPageURLsRef = useRef(selectedPageURLs);
    const agentStateRef = useRef(agentState);
    const selectedNotesRef = useRef(selectedNotes);
    const selectedCredentialsRef = useRef(selectedCredentials);
    const selectedFilesRef = useRef(selectedFiles);
    
    // Update refs when values change
    useEffect(() => {
      onKeyDownRef.current = onKeyDown;
    }, [onKeyDown]);
    
    useEffect(() => {
      isRunningRef.current = isRunning;
    }, [isRunning]);
    
    useEffect(() => {
      isInputEnabledRef.current = isInputEnabled;
    }, [isInputEnabled]);
    
    useEffect(() => {
      selectedPageURLsRef.current = selectedPageURLs;
    }, [selectedPageURLs]);
    
    useEffect(() => {
      agentStateRef.current = agentState;
    }, [agentState]);
    
    useEffect(() => {
      selectedNotesRef.current = selectedNotes;
    }, [selectedNotes]);
    
    useEffect(() => {
      selectedCredentialsRef.current = selectedCredentials;
    }, [selectedCredentials]);
    
    useEffect(() => {
      selectedFilesRef.current = selectedFiles;
    }, [selectedFiles]);

    // Track inserted mentions to detect new ones and deletions
    const insertedMentionsRef = useRef<Set<string>>(new Set());
    const previousMentionsRef = useRef<Set<string>>(new Set());
    const mentionDataCacheRef = useRef<Map<string, { type: string; workspaceFileId?: string }>>(new Map());
    const onMentionInsertRef = useRef(onMentionInsert);
    const onMentionDeleteRef = useRef(onMentionDelete);
    
    useEffect(() => {
      onMentionInsertRef.current = onMentionInsert;
    }, [onMentionInsert]);
    
    useEffect(() => {
      onMentionDeleteRef.current = onMentionDelete;
    }, [onMentionDelete]);

    // Tiptap Editor Setup - create editor first before using it in callbacks
    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3, 4, 5, 6],
          },
          horizontalRule: {},
          blockquote: {},
          codeBlock: false, // We'll use CodeBlockLowlight instead
          link: false, // Disable Link in StarterKit to avoid duplicate with our Link extension
        }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          HTMLAttributes: {
            class: 'editor-link',
            rel: 'noopener noreferrer',
          },
        }),
        Markdown.configure({
          html: false,
          tightLists: true,
          tightListClass: 'tight',
          bulletListMarker: '-',
          linkify: true,
          breaks: false,
          transformPastedText: true,
          transformCopiedText: true,
        }),
        CodeBlockLowlight.configure({
          lowlight,
          HTMLAttributes: {
            class: 'code-block',
          },
        }),
        Mention.extend({
          addAttributes() {
            // Get parent attributes and merge with custom ones
            const parentAttrs = this.parent?.() || {};
            return {
              ...parentAttrs,
              id: {
                default: null,
                parseHTML: element => element.getAttribute('data-id'),
                renderHTML: attributes => {
                  if (!attributes.id) {
                    return {};
                  }
                  return {
                    'data-id': attributes.id,
                  };
                },
              },
              label: {
                default: null,
                parseHTML: element => element.getAttribute('data-label'),
                renderHTML: attributes => {
                  if (!attributes.label) {
                    return {};
                  }
                  return {
                    'data-label': attributes.label,
                  };
                },
              },
              pageURL: {
                default: null,
                parseHTML: element => element.getAttribute('data-page-url'),
                renderHTML: attributes => {
                  if (!attributes.pageURL) {
                    return {};
                  }
                  return {
                    'data-page-url': attributes.pageURL,
                  };
                },
              },
              type: {
                default: null,
                parseHTML: element => element.getAttribute('data-type'),
                renderHTML: attributes => {
                  if (!attributes.type) {
                    return {};
                  }
                  return {
                    'data-type': attributes.type,
                  };
                },
              },
            };
          },
          addNodeView() {
            return ({ node }) => {
              console.log('[Mention NodeView] Rendering mention node:', {
                attrs: node.attrs,
              });
              const span = document.createElement('span');
              span.className = 'mention';
              // Don't add @ here - Tiptap adds it automatically
              span.textContent = node.attrs.label || node.attrs.id || '[mention]';
              return {
                dom: span,
              };
            };
          },
        }).configure({
          HTMLAttributes: {
            class: 'mention',
          },
          renderLabel({ node }) {
            console.log('[Mention renderLabel] Called with node:', {
              attrs: node.attrs,
            });
            const label = node.attrs.label || node.attrs.id || 'unknown';
            
            // Visual display - don't add @ here, Tiptap adds it automatically
            return label;
          },
          suggestion: createMentionSuggestion(mentionSuggestions, selectedPageURLsRef, agentStateRef, selectedNotesRef, selectedCredentialsRef, selectedFilesRef),
        }),
        Placeholder.configure({
          placeholder: () => {
            if (!isInputEnabledRef.current) {
              return 'Please select an agent and model to start chatting';
            }
            // return placeholder || context.labels?.chatInputPlaceholder || 'Type a message... (/ for commands, @ for context)';
            return 'Type a message... (/ for commands, @ for context)';
          },
        }),
        EnterToSend.configure({
          onSend: () => {
            if (isRunningRef.current || !isInputEnabledRef.current) {
              return;
            }

            // Get markdown content
            const json = editor!.getJSON();
            console.log('[CustomTiptapTextArea] Editor JSON before serialization:', JSON.stringify(json, null, 2));
            
            const markdown = editorToMarkdown(editor!);
            console.log('[CustomTiptapTextArea] Serialized markdown:', markdown);
            
            if (!markdown.trim()) {
              return;
            }

            // Sync the markdown to parent's value state
            if (onChange) {
              const syntheticChangeEvent = {
                target: { value: markdown },
              } as React.ChangeEvent<HTMLTextAreaElement>;
              onChange(syntheticChangeEvent);
            }

            // Wait for React to flush the state update, then trigger parent's handler
            setTimeout(() => {
              if (!onKeyDownRef.current) {
                return;
              }

              // Create a proper React synthetic event
              const syntheticEvent = {
                key: 'Enter',
                code: 'Enter',
                shiftKey: false,
                ctrlKey: false,
                metaKey: false,
                altKey: false,
                preventDefault: () => {},
                stopPropagation: () => {},
                currentTarget: containerRef.current,
                target: containerRef.current,
              } as unknown as React.KeyboardEvent<HTMLTextAreaElement>;

              onKeyDownRef.current(syntheticEvent);
            }, 0);
          },
          canSend: (): boolean => {
            if (!editor || !isInputEnabledRef.current) return false;
            const interruptEvent = copilotContext.langGraphInterruptAction?.event;
            const interruptInProgress =
              interruptEvent?.name === 'LangGraphInterruptEvent' && !interruptEvent?.response;
            const hasContent = !editor.isEmpty;
            return !isRunningRef.current && hasContent && !interruptInProgress;
          },
        }),
        createSlashCommandExtension(slashCommands),
      ],
      editorProps: {
        attributes: {
          class: `copilotKitInputTextarea tiptap-editor ${className || ''}`.trim(),
          spellcheck: 'true',
        },
        handlePaste: (view, event) => {
          if (!isInputEnabled) return false;

          try {
            const items = Array.from(event.clipboardData?.items || []);
            const fileItems = items.filter((i) => i.kind === 'file');

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

            if (files.length > 0 && onFilesPicked) {
              // Create FileList-like object
              const fileList = {
                length: files.length,
                item: (index: number) => files[index] || null,
                [Symbol.iterator]: function* () {
                  for (const file of files) {
                    yield file;
                  }
                },
              } as unknown as FileList;

              onFilesPicked(fileList);
            }

            return true; // We handled the paste
          } catch (error) {
            console.error('[CustomTiptapTextArea] Paste error:', error);
            return false;
          }
        },
      },
      editable: isInputEnabled,
      shouldRerenderOnTransaction: false,
      onCreate: () => {
        // Auto-focus can be added here if needed
      },
      onUpdate: ({ editor }) => {
        const doc = editor.state.doc;
        const currentMentions = new Set<string>();
        const mentionDataMap = new Map<string, { type: string; workspaceFileId?: string }>();
        
        // Find all mentions in the document
        doc.descendants((node, pos) => {
          if (node.type.name === 'mention') {
            const mentionId = node.attrs.id || `${node.attrs.type}-${pos}`;
            currentMentions.add(mentionId);
            mentionDataMap.set(mentionId, {
              type: node.attrs.type || 'unknown',
              workspaceFileId: node.attrs.type === 'workspace_file' || mentionId.startsWith('workspace_file-')
                ? mentionId.replace('workspace_file-', '')
                : undefined,
            });
            
            // Check if this is a new mention
            if (!insertedMentionsRef.current.has(mentionId)) {
              insertedMentionsRef.current.add(mentionId);
              
              // Store mention data in cache
              const mentionData = {
                type: node.attrs.type || 'unknown',
                workspaceFileId: node.attrs.type === 'workspace_file' || mentionId.startsWith('workspace_file-')
                  ? mentionId.replace('workspace_file-', '')
                  : undefined,
              };
              mentionDataCacheRef.current.set(mentionId, mentionData);
              
              // Extract workspaceFileId from the mention ID (format: workspace_file-{fileId})
              if (node.attrs.type === 'workspace_file' || mentionId.startsWith('workspace_file-')) {
                const workspaceFileId = mentionId.replace('workspace_file-', '');
                if (onMentionInsertRef.current) {
                  onMentionInsertRef.current({
                    type: 'workspace_file',
                    id: mentionId,
                    workspaceFileId,
                  });
                }
              }
            }
          }
        });
        
        // Detect deleted mentions
        if (onMentionDeleteRef.current) {
          const previousMentions = previousMentionsRef.current;
          previousMentions.forEach(mentionId => {
            if (!currentMentions.has(mentionId)) {
              // This mention was deleted - get data from cache
              const mentionData = mentionDataCacheRef.current.get(mentionId);
              if (mentionData && mentionData.type === 'workspace_file') {
                if (onMentionDeleteRef.current) {
                  onMentionDeleteRef.current({
                    type: 'workspace_file',
                    id: mentionId,
                    workspaceFileId: mentionData.workspaceFileId,
                  });
                }
              }
              // Remove from inserted mentions tracking and cache
              insertedMentionsRef.current.delete(mentionId);
              mentionDataCacheRef.current.delete(mentionId);
            }
          });
        }
        
        // Update previous mentions for next comparison
        previousMentionsRef.current = new Set(currentMentions);
        
        // Sync with onChange if provided - defer to avoid updating during render
        if (onChange) {
          queueMicrotask(() => {
            const markdown = editorToMarkdown(editor);
            // Create a synthetic event for onChange
            const syntheticEvent = {
              target: { value: markdown },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            onChange(syntheticEvent);
          });
        }
      },
    }, [
      // Only include stable dependencies to avoid re-creating editor
      isInputEnabled,
      placeholder,
      className,
      // Removed: context.labels, slashCommands, mentionSuggestions, isRunning, onFilesPicked, onChange, onSubmitMessage, copilotContext
      // These cause re-renders but extensions can access them via closure
    ]);

    // Sync external value prop with editor
    useEffect(() => {
      if (value !== undefined && editor) {
        const currentMarkdown = editorToMarkdown(editor);
        if (typeof value === 'string' && value !== currentMarkdown) {
          editor.commands.setContent(value);
        }
      }
    }, [value, editor]);

    // Update editable state
    useEffect(() => {
      if (editor) {
        editor.setEditable(isInputEnabled);
        if (!isInputEnabled) {
          editor.commands.clearContent();
        }
      }
    }, [isInputEnabled, editor]);

    // Focus editor when focus is called
    useEffect(() => {
      if (editor && containerRef.current) {
        const handleFocus = () => {
          editor.commands.focus('end');
        };
        containerRef.current.addEventListener('focus', handleFocus);
        return () => {
          containerRef.current?.removeEventListener('focus', handleFocus);
        };
      }
      return undefined;
    }, [editor]);

    if (!editor) {
      return <div ref={containerRef} style={{ minHeight: '32px' }} />;
    }

    return (
      <div 
        ref={containerRef}
        style={{ 
          minHeight: '32px', /* 2 lines default with padding */
          width: '100%',
        }}
      >
        <EditorContent editor={editor} />
      </div>
    );
  }
);

CustomTiptapTextArea.displayName = 'CustomTiptapTextArea';

