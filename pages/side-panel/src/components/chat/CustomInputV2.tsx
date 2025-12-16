/**
 * Custom Input Component for CopilotKit V2
 * 
 * A wrapper around CopilotChatInput that uses CustomTiptapTextArea.
 * 
 * Features:
 * - Tiptap rich text editor with markdown support
 * - Code block syntax highlighting
 * - Slash commands (/)
 * - Mentions (@)
 * - Link auto-detection
 * - Enter to send
 * - File paste handling
 * 
 * IMPORTANT: CopilotKit's renderSlot function checks `typeof slot === "function"`,
 * but React forwardRef components have `typeof === "object"`. To work around this,
 * we wrap the forwardRef component in a regular function component.
 */
import React, { useState, useRef, useEffect, useCallback, createContext, useContext } from 'react';
import { CopilotChatInput, type CopilotChatInputProps } from '@copilotkitnext/react';
import { CustomTiptapTextArea } from './CustomTiptapTextArea';
import { useCopilotChatContext } from '../../hooks/copilotkit';
import { useStorage, debug } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { PagesSelector } from '../selectors/PagesSelector';
import { useChatSessionIdSafe } from '../../context/ChatSessionIdContext';
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from '@extension/ui';
import { COPIOLITKIT_CONFIG } from '../../constants';
import { ensureFirebase, ensureFirebaseAuth } from '../../utils/firebaseStorage';
import { ref as fbRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useCopilotChat, type Message } from '../../hooks/copilotkit';

// Context for sharing page selector state and agent state between ChatInner and CustomInputV2
interface PageSelectorContextValue {
  selectedPageURLs: string[];
  onPagesChange: (urls: string[]) => void;
  currentPageURL: string | null;
  agentState?: {
    plans?: Record<string, any>;
    graphs?: Record<string, any>;
  };
}

export const PageSelectorContext = createContext<PageSelectorContextValue | null>(null);

export const PageSelectorProvider: React.FC<{ value: PageSelectorContextValue; children: React.ReactNode }> = ({ value, children }) => (
  <PageSelectorContext.Provider value={value}>{children}</PageSelectorContext.Provider>
);

const usePageSelectorContext = () => {
  const ctx = useContext(PageSelectorContext);
  if (!ctx) {
    // Fallback to local state if context not provided
    return null;
  }
  return ctx;
};

/**
 * Custom Icons for dropdown menu items
 */
const CustomIcons = {
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
 * CustomTiptapTextAreaSlotInner - The actual forwardRef component for Tiptap
 */
const CustomTiptapTextAreaSlotInner = React.forwardRef<
  HTMLDivElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>((textareaProps, ref) => {
  const { placeholder: propsPlaceholder, ...restProps } = textareaProps;
  const context = useCopilotChatContext();

  return (
    <CustomTiptapTextArea
      {...restProps}
      ref={ref}
      placeholder={propsPlaceholder || context.labels?.chatInputPlaceholder || 'Type a message...'}
    />
  );
});

CustomTiptapTextAreaSlotInner.displayName = 'CustomTiptapTextAreaSlotInner';

/**
 * CustomTiptapTextAreaSlot - Wrapper function (typeof === "function")
 * This works around CopilotKit's renderSlot treating forwardRef as objects
 */
function CustomTiptapTextAreaSlot(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: React.Ref<HTMLDivElement> }) {
  const { ref, ...restProps } = props;
  return <CustomTiptapTextAreaSlotInner ref={ref} {...restProps} />;
}

/**
 * AttachmentItem type for file uploads
 */
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

/**
 * CustomInputV2 - Main input component with custom container
 * 
 * Uses children render prop to build a custom container with V1-style design.
 * This approach gives us complete control over styling without fighting default styles.
 * 
 * Features:
 * - Custom container with V1-style colors and borders
 * - Theme-aware styling
 * - Full control over layout and spacing
 * - Uses all CopilotKit internal components
 * - Custom upload dropdown menu
 */
function CustomInputV2Component(props: CopilotChatInputProps) {
  const { isLight } = useStorage(themeStorage);
  const sessionId = useChatSessionIdSafe();
  const context = useCopilotChatContext();
  const { sendMessage } = useCopilotChat();
  
  // Get page selector context from parent (ChatInner)
  const pageSelectorCtx = usePageSelectorContext();
  
  // Pages selector state - use context if available, otherwise local state
  const [localSelectedPageURLs, setLocalSelectedPageURLs] = useState<string[]>([]);
  const selectedPageURLs = pageSelectorCtx?.selectedPageURLs ?? localSelectedPageURLs;
  const setSelectedPageURLs = pageSelectorCtx?.onPagesChange ?? setLocalSelectedPageURLs;
  const currentPageURL = pageSelectorCtx?.currentPageURL ?? null;
  
  // File input refs for upload functionality
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  
  // Drag & drop state
  const [isDragActive, setIsDragActive] = useState(false);
  const dragCounterRef = useRef(0);
  
  // Attachments state
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const attachmentsRef = useRef<AttachmentItem[]>([]);
  
  // Keep ref in sync with state
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);
  
  // V1-style colors - matching user message backgrounds
  const borderColor = isLight ? '#e5e7eb' : '#374151'; // gray-200 / gray-700
  const backgroundColor = isLight ? '#f9fafb' : '#151C24'; // Matches user message background
  
  // Constants
  const MAX_UPLOAD_BYTES = 30 * 1024 * 1024; // 30MB
  
  // File size formatter
  const formatSize = (bytes: number): string => {
    const kb = bytes / 1024;
    if (kb >= 1024) {
      const mb = kb / 1024;
      return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
    }
    return `${Math.max(1, Math.round(kb))} KB`;
  };

  // Get 3-letter file extension
  const getFileType = (fileName: string, mimeType: string): string => {
    // Try to get extension from filename first
    const extension = fileName.split('.').pop()?.toUpperCase();
    if (extension && extension.length <= 3) {
      return extension.slice(0, 3);
    }
    // Fallback to mime type
    const mimePart = mimeType.split('/')[1];
    if (mimePart) {
      // Handle common types
      if (mimePart.includes('pdf')) return 'PDF';
      if (mimePart.includes('image')) {
        if (mimePart.includes('png')) return 'PNG';
        if (mimePart.includes('jpeg') || mimePart.includes('jpg')) return 'JPG';
        if (mimePart.includes('gif')) return 'GIF';
        return 'IMG';
      }
      if (mimePart.includes('csv')) return 'CSV';
      if (mimePart.includes('excel') || mimePart.includes('spreadsheet')) return 'XLS';
      if (mimePart.includes('word') || mimePart.includes('document')) return 'DOC';
      if (mimePart.includes('text')) return 'TXT';
      if (mimePart.includes('json')) return 'JSON';
      if (mimePart.includes('javascript')) return 'JS';
      if (mimePart.includes('python')) return 'PY';
      // Take first 3 chars of mime part
      return mimePart.slice(0, 3).toUpperCase();
    }
    return 'FILE';
  };
  
  // Upload attachment to Firebase
  const uploadAttachment = async (item: AttachmentItem, uploadSessionId: string) => {
    if (!COPIOLITKIT_CONFIG.ENABLE_FIREBASE_UPLOADS || !COPIOLITKIT_CONFIG.FIREBASE?.storageBucket) {
      return item; // fallback to blob URL
    }
    try {
      // Ensure Firebase is initialized and authenticated before uploading
      try {
        await ensureFirebaseAuth(COPIOLITKIT_CONFIG.FIREBASE as any);
      } catch (authError: any) {
        console.error('[FileUpload] Firebase authentication failed:', authError);
        setAttachments(prev => prev.map(a => 
          a.id === item.id 
            ? { ...a, status: 'error', error: `Authentication failed: ${authError.message || 'Unknown error'}` }
            : a
        ));
        return item;
      }
      
      const storage = ensureFirebase(COPIOLITKIT_CONFIG.FIREBASE as any);
      const ts = Date.now();
      const safeName = item.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `attachments/${uploadSessionId || 'default'}/${ts}-${safeName}`;
      const storageRef = fbRef(storage as any, path);
      
      return await new Promise<AttachmentItem>((resolve, reject) => {
        const task = uploadBytesResumable(storageRef as any, item.file);
        setAttachments(prev => prev.map(a => a.id === item.id ? { ...a, status: 'uploading', progress: 0 } : a));
        
        task.on('state_changed', 
          (snap: any) => {
            // Upload progress
            const prog = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            setAttachments(prev => prev.map(a => a.id === item.id ? { ...a, progress: prog } : a));
          },
          (err: any) => {
            // Upload error
            const errorMessage = err.code === 'storage/unauthorized' 
              ? 'Permission denied. Please check Firebase Storage rules.'
              : err.message || String(err);
            console.error('[FileUpload] Upload failed:', err);
            setAttachments(prev => prev.map(a => 
              a.id === item.id 
                ? { ...a, status: 'error', error: errorMessage }
                : a
            ));
            reject(err);
          },
          async () => {
            // Upload complete
            try {
              const url = await getDownloadURL(task.snapshot.ref);
              const updated: AttachmentItem = { 
                ...item, 
                status: 'uploaded', 
                progress: 100, 
                uploadedUrl: url 
              };
              setAttachments(prev => prev.map(a => a.id === item.id ? updated : a));
              resolve(updated);
            } catch (urlError: any) {
              console.error('[FileUpload] Failed to get download URL:', urlError);
              setAttachments(prev => prev.map(a => 
                a.id === item.id 
                  ? { ...a, status: 'error', error: 'Upload completed but failed to get URL' }
                  : a
              ));
              reject(urlError);
            }
          }
        );
      });
    } catch (e: any) {
      console.error('[FileUpload] Unexpected error:', e);
      setAttachments(prev => prev.map(a => 
        a.id === item.id 
          ? { ...a, status: 'error', error: e.message || String(e) }
          : a
      ));
      return item;
    }
  };
  
  // File picker handlers
  const openFilePicker = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };
  
  const openImagePicker = () => {
    if (imageInputRef.current) imageInputRef.current.click();
  };
  
  // Handle files picked from file input or drag & drop
  const handleFilesPicked = (files: FileList | null) => {
    if (!files || files.length === 0) return;
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
  
  // Remove attachment
  const removeAttachment = (id: string) => {
    setAttachments(prev => {
      const found = prev.find(a => a.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter(a => a.id !== id);
    });
  };
  
  // Drag & drop handlers
  const eventHasFiles = (e: React.DragEvent) => {
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
    dragCounterRef.current += 1;
    if (eventHasFiles(e)) setIsDragActive(true);
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (eventHasFiles(e)) {
      e.dataTransfer.dropEffect = 'copy';
      if (!isDragActive) setIsDragActive(true);
    }
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDragActive(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    dragCounterRef.current = 0;
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFilesPicked(files);
      try { e.dataTransfer.clearData(); } catch {}
    }
  };
  
  // Handle message submission with attachments
  // V2 Native Multimodal Approach: Uses Message.content as array
  const handleSubmitMessage = useCallback(async (value: string) => {
    const currentAttachments = attachmentsRef.current;
    
    // If no attachments, send as-is (let default handler work)
    if (currentAttachments.length === 0) {
      if (props.onSubmitMessage) {
        props.onSubmitMessage(value);
      }
      return;
    }
    
    // Upload all pending attachments in parallel (faster execution)
    const uploadSessionId = sessionId || 'default';
    const uploadPromises = currentAttachments.map(async (item) => {
      if (item.status === 'pending') {
        return await uploadAttachment(item, uploadSessionId);
      }
      return item; // Already uploaded or errored
    });
    
    // Wait for all uploads to complete in parallel
    const updatedAttachments = await Promise.all(uploadPromises);
    
    // Update state to reflect uploaded URLs/progress
    setAttachments(updatedAttachments);
    
    // Build multimodal content array (AG-UI format)
    // Reference: https://docs.ag-ui.com/concepts/messages
    const contentParts: any[] = [];
    
    // Add text content
    if (value.trim()) {
      contentParts.push({
        type: 'text',
        text: value,
      });
    }
    
    // Add binary file parts (AG-UI BinaryInputContent format)
    updatedAttachments
      .filter(a => a.status !== 'error')
      .forEach(att => {
        const url = att.uploadedUrl || att.previewUrl;
        
        // Use BinaryInputContent format for all files (images, docs, etc.)
        contentParts.push({
          type: 'binary',
          mimeType: att.file.type || 'application/octet-stream',
          url: url,
          filename: att.name,
        });
      });
    
    debug.log('[CustomInputV2] Sending multimodal message (AG-UI format):', {
      contentParts: contentParts.length,
      hasText: contentParts.some(p => p.type === 'text'),
      hasBinary: contentParts.some(p => p.type === 'binary'),
      files: updatedAttachments.map(a => ({ name: a.name, type: a.file.type })),
    });
    
    // Create user message with multimodal content
    const userMessage: Message = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      role: 'user',
      content: contentParts as any, // Array of content parts
    };
    
    // Clear UI immediately for better UX (before async send completes)
    if (props.onChange) {
      props.onChange('');
    }
    setAttachments([]);
    
    // Send via useCopilotChat hook (bypasses onSubmitMessage)
    // This allows us to send Message objects with content arrays
    try {
      await sendMessage(userMessage);
      
      debug.log('[CustomInputV2] Multimodal message sent successfully');
      
      // Cleanup object URLs after successful send
      currentAttachments.forEach(a => URL.revokeObjectURL(a.previewUrl));
    } catch (error) {
      console.error('[CustomInputV2] Failed to send multimodal message:', error);
      
      debug.log('[CustomInputV2] Message was already added, skipping fallback to prevent duplicate');
      
      // Cleanup object URLs even on error
      currentAttachments.forEach(a => URL.revokeObjectURL(a.previewUrl));
      
      // Optionally show error to user
      // TODO: Add toast notification for upload failure
    }
  }, [sessionId, uploadAttachment, sendMessage, props.onChange, setAttachments]);

  return (
    <CopilotChatInput
      {...props}
      textArea={CustomTiptapTextAreaSlot as any}
      onSubmitMessage={handleSubmitMessage}
    >
      {({
        textArea,
        sendButton,
        addMenuButton,
        startTranscribeButton,
        cancelTranscribeButton,
        finishTranscribeButton,
        audioRecorder,
      }) => {
        // Pass addMenuButton directly to DropdownMenu - no cloning to avoid ref errors
        // CSS will handle hover styles
        const enabledAddMenuButton = addMenuButton;
        
        // Check button state for conditional styling
        const isButtonDisabled = React.isValidElement(sendButton) 
          ? (sendButton as any).props?.disabled === true 
          : false;
        const isRunning = props.isRunning === true;
        const isEnabled = !isButtonDisabled || isRunning;
        
        // Clone sendButton with custom styles - different colors for disabled vs enabled
        const styledSendButton = React.isValidElement(sendButton)
          ? React.cloneElement(sendButton as React.ReactElement<any>, {
              style: {
                ...((sendButton as any).props?.style || {}),
                // Different background colors based on state
                backgroundColor: isEnabled
                  ? (isLight 
                      ? 'rgba(229, 231, 235, 0.8)'  // gray-200/80 - enabled state
                      : 'rgba(55, 65, 81, 0.6)')    // gray-700/60 - enabled state
                  : (isLight 
                      ? 'rgba(229, 231, 235, 0.4)'  // gray-200/40 - disabled state (more muted)
                      : 'rgba(55, 65, 81, 0.3)'),   // gray-700/30 - disabled state (more muted)
                // Different text/icon colors based on state
                color: isEnabled
                  ? (isLight ? '#374151' : '#d1d5db')  // gray-700 / gray-300 - enabled (full opacity)
                  : (isLight ? '#9ca3af' : '#6b7280'), // gray-400 / gray-500 - disabled (muted)
                opacity: isEnabled ? 1 : 0.6, // Additional visual feedback for disabled state
              },
              onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
                if (isEnabled) {
                  e.currentTarget.style.transform = 'scale(1.05)';
                }
              },
              onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
                e.currentTarget.style.transform = 'scale(1)';
              },
            })
          : sendButton;

        return (
          <>
            {/* Hidden file inputs for different file types */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.txt,.sql,.csv,.json,.xml,.md,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              style={{ display: 'none' }}
              onChange={(e) => handleFilesPicked(e.target.files)}
            />
            <input
              ref={imageInputRef}
              type="file"
              multiple
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleFilesPicked(e.target.files)}
            />
            
            <div
              className="custom-input-v2-container"
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                backgroundColor,
                border: `1px solid ${borderColor}`,
                borderRadius: '14px',
                padding: '0.25rem 0rem 0.1rem 0rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0rem',
                boxShadow: 'none',
                WebkitBoxShadow: 'none',
                position: 'relative',
              }}
            >
              {/* Drag & drop overlay */}
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
                    borderRadius: '14px',
                    pointerEvents: 'none',
                    zIndex: 5,
                  }}
                >
                  <span style={{ fontSize: '12px', opacity: 0.8, color: isLight ? '#374151' : '#d1d5db' }}>
                    Drop files to attach
                  </span>
                </div>
              )}
              
              {/* Row 1: Text Area only */}
              <div style={{ width: '100%' }}>
                {textArea}
              </div>
              
              {/* Attachments preview */}
              {attachments.length > 0 && (
                <div
                  className="mt-1 px-2 pb-1 attachment-cards-scroll"
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    gap: '6px',
                    overflowX: 'auto',
                    overflowY: 'hidden',
                    justifyContent: 'flex-start',
                    // alignItems: 'stretch',
                    alignItems: 'flex-start',
                    textAlign: 'left',
                    width: '100%',
                  }}
                >
                  {attachments.map(att => {
                    const isError = att.status === 'error';
                    const isImage = att.file.type.startsWith('image/');
                    
                    return (
                      <div
                        key={att.id}
                        style={{
                          position: 'relative',
                          flexShrink: 0,
                          width: '60px',
                          height: '80px',
                          borderRadius: '6px',
                          // border: `1px solid ${isLight ? '#e5e7eb' : '#374151'}`,
                          background: isLight ? '#ffffff' : '#1a1f2e',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        {/* Thumbnail / Icon Area */}
                        <div
                          style={{
                            width: '100%',
                            height: '40px',
                            background: isImage
                              ? `url(${att.previewUrl}) center/cover no-repeat`
                              : (isLight ? '#f3f4f6' : '#0f1419'),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                          }}
                        >
                          {!isImage && (
                            <div
                              style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                color: isLight ? '#6b7280' : '#9ca3af',
                                letterSpacing: '0.5px',
                              }}
                            >
                              {getFileType(att.name, att.file.type)}
                            </div>
                          )}
                          {/* Status overlay */}
                          {att.status === 'uploading' && (
                            <div
                              style={{
                                position: 'absolute',
                                inset: 0,
                                background: 'rgba(0, 0, 0, 0.5)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff',
                                fontSize: '9px',
                                fontWeight: 600,
                              }}
                            >
                              {Math.max(0, Math.min(att.progress, 100))}%
                            </div>
                          )}
                          {isError && (
                            <div
                              style={{
                                position: 'absolute',
                                inset: 0,
                                background: 'rgba(239, 68, 68, 0.1)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#ef4444"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                              </svg>
                            </div>
                          )}
                        </div>
                        
                        {/* File Info */}
                        <div
                          style={{
                            padding: '3px 4px 2px 4px',
                            background: isLight ? 'rgba(229, 231, 235, 0.8)' : 'rgba(55, 65, 81, 0.6)',
                            height: '40px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div
                            className="attachment-file-name"
                            style={{
                              fontSize: '11px',
                              fontWeight: 500,
                              color: isLight ? '#374151' : '#d1d5db',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              lineHeight: '1.2',
                            }}
                            title={att.name}
                          >
                            {att.name}
                          </div>
                          <div
                            className="attachment-file-type-size"
                            style={{
                              fontSize: '10px',
                              color: isLight ? '#374151' : '#d1d5db',
                              lineHeight: '1',
                              opacity: 0.6,
                              marginTop: 'auto',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {getFileType(att.name, att.file.type)} - {formatSize(att.size)}
                          </div>
                        </div>
                        
                        {/* Remove button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeAttachment(att.id);
                          }}
                          title="Remove attachment"
                          style={{
                            position: 'absolute',
                            top: '2px',
                            right: '2px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            border: 'none',
                            background: 'rgba(0, 0, 0, 0.6)',
                            cursor: 'pointer',
                            color: '#ffffff',
                            backdropFilter: 'blur(4px)',
                          }}
                        >
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Row 2: All buttons */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0rem',
                  paddingBottom: '2.5px',
                  justifyContent: 'space-between',
                }}
              >
                  {/* Left side buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.05rem', marginLeft: '6px' }}>
                    {/* Upload dropdown menu - using CopilotKit's addMenuButton as trigger */}
                    <DropdownMenu
                      trigger={enabledAddMenuButton}
                      align="left"
                      direction="up"
                      isLight={isLight}
                      className="cursor-pointer"
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
                    
                    <PagesSelector
                      isLight={isLight}
                      selectedPageURLs={selectedPageURLs}
                      currentPageURL={currentPageURL}
                      sessionId={sessionId || undefined}
                      onPagesChange={setSelectedPageURLs}
                      variant="compact"
                      showBrowserTabs={true}
                    />
                  </div>
                
                {/* Right side: Send button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  {audioRecorder}
                  <div className="custom-input-hover-button">{cancelTranscribeButton}</div>
                  <div className="custom-input-hover-button">{finishTranscribeButton}</div>
                  <div className="custom-input-hover-button">{startTranscribeButton}</div>
                  {styledSendButton}
                </div>
              </div>
            </div>
          </>
        );
      }}
    </CopilotChatInput>
  );
}

CustomInputV2Component.displayName = 'CustomInputV2';

/**
 * Export CustomInputV2 with namespace properties from CopilotChatInput
 * This makes it compatible with the input slot type: typeof CopilotChatInput
 */
export const CustomInputV2 = Object.assign(CustomInputV2Component, {
  SendButton: CopilotChatInput.SendButton,
  ToolbarButton: CopilotChatInput.ToolbarButton,
  StartTranscribeButton: CopilotChatInput.StartTranscribeButton,
  CancelTranscribeButton: CopilotChatInput.CancelTranscribeButton,
  FinishTranscribeButton: CopilotChatInput.FinishTranscribeButton,
  AddMenuButton: CopilotChatInput.AddMenuButton,
  TextArea: CustomTiptapTextAreaSlot as any,  // Using Tiptap editor
  // TextArea: CopilotChatInput.TextArea,
  AudioRecorder: CopilotChatInput.AudioRecorder,
});

// CustomInputV2 is ready to use with CopilotChat

export default CustomInputV2;
