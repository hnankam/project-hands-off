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
 * - File drag & drop handling
 * - File paste handling (Ctrl/Cmd+V)
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
import { ContextSelector } from '../selectors/ContextSelector';
import { useChatSessionIdSafe } from '../../context/ChatSessionIdContext';
import { useAuth } from '../../context/AuthContext';
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, cn } from '@extension/ui';
import { COPIOLITKIT_CONFIG } from '../../constants';
import { ensureFirebase, ensureFirebaseAuth } from '../../utils/firebaseStorage';
import { ref as fbRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useCopilotChat, type Message } from '../../hooks/copilotkit';
import { GmailItemsModal } from '../modals/GmailItemsModal';
import { SlackItemsModal } from '../modals/SlackItemsModal';

// Context for sharing page selector state and agent state between ChatInner and CustomInputV2
interface PageSelectorContextValue {
  selectedPageURLs: string[];
  onPagesChange: (urls: string[]) => void;
  currentPageURL: string | null;
  agentState?: {
    plans?: Record<string, any>;
    graphs?: Record<string, any>;
  };
  // Workspace context items
  selectedNotes?: any[];
  selectedCredentials?: any[];
  onNotesChange?: (notes: any[]) => void;
  onCredentialsChange?: (credentials: any[]) => void;
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
  workspaceFiles: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <path d="M2 11h20" />
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
  file: File | null; // null for workspace files that are already uploaded
  name: string;
  size: number;
  previewUrl: string; // object URL for quick preview
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  progress: number; // 0..100
  uploadedUrl?: string; // Firebase download URL
  mimeType?: string; // MIME type for workspace files
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
  const { user } = useAuth();
  const context = useCopilotChatContext();
  const { sendMessage } = useCopilotChat();
  
  // Get page selector context from parent (ChatInner)
  const pageSelectorCtx = usePageSelectorContext();
  
  // Pages selector state - use context if available, otherwise local state
  const [localSelectedPageURLs, setLocalSelectedPageURLs] = useState<string[]>([]);
  const selectedPageURLs = pageSelectorCtx?.selectedPageURLs ?? localSelectedPageURLs;
  const setSelectedPageURLs = pageSelectorCtx?.onPagesChange ?? setLocalSelectedPageURLs;
  const currentPageURL = pageSelectorCtx?.currentPageURL ?? null;
  
  // Workspace context state - use context if available, otherwise local state
  const [localNotesWithContent, setLocalNotesWithContent] = useState<any[]>([]);
  const [localCredentialsWithSecrets, setLocalCredentialsWithSecrets] = useState<any[]>([]);
  
  const selectedNotes = pageSelectorCtx?.selectedNotes ?? localNotesWithContent;
  const setSelectedNotes = pageSelectorCtx?.onNotesChange ?? setLocalNotesWithContent;
  const selectedCredentials = pageSelectorCtx?.selectedCredentials ?? localCredentialsWithSecrets;
  const setSelectedCredentials = pageSelectorCtx?.onCredentialsChange ?? setLocalCredentialsWithSecrets;
  
  // Track selected IDs locally for the selector UI
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [selectedCredentialIds, setSelectedCredentialIds] = useState<string[]>([]);
  
  // File input refs for upload functionality
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  
  // Drag & drop state
  const [isDragActive, setIsDragActive] = useState(false);
  const dragCounterRef = useRef(0);
  
  // Attachments state
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const attachmentsRef = useRef<AttachmentItem[]>([]);
  
  // Workspace files selector state
  const [showWorkspaceFilesModal, setShowWorkspaceFilesModal] = useState(false);
  const [workspaceFiles, setWorkspaceFiles] = useState<any[]>([]);
  const [selectedWorkspaceFileIds, setSelectedWorkspaceFileIds] = useState<Set<string>>(new Set());
  const [loadingWorkspaceFiles, setLoadingWorkspaceFiles] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  
  // Gmail modal state
  const [showGmailModal, setShowGmailModal] = useState(false);
  const [gmailConnectionId, setGmailConnectionId] = useState<string | null>(null);
  
  // Slack modal state
  const [showSlackModal, setShowSlackModal] = useState(false);
  const [slackConnectionId, setSlackConnectionId] = useState<string | null>(null);
  
  // Workspace connections state
  const [workspaceConnections, setWorkspaceConnections] = useState<any[]>([]);
  
  // Keep ref in sync with state
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);
  
  // Load workspace connections
  useEffect(() => {
    const loadConnections = async () => {
      try {
        const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
        const response = await fetch(`${baseURL}/api/workspace/connections`, {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setWorkspaceConnections(data.connections.filter((conn: any) => conn.status === 'active'));
        }
      } catch (error) {
        console.error('[Workspace Connections] Failed to load:', error);
      }
    };
    loadConnections();
  }, []);
  
  // Close dropdown when modal opens
  useEffect(() => {
    if (showWorkspaceFilesModal) {
      // Close dropdown by dispatching a mousedown event outside the dropdown area
      const event = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      document.body.dispatchEvent(event);
    }
  }, [showWorkspaceFilesModal]);

  // Debug workspace files state changes (development only)
  useEffect(() => {
    if (import.meta.env.DEV) {
    console.log('[Workspace Files] State changed:', {
      count: workspaceFiles.length,
      loading: loadingWorkspaceFiles,
      modalOpen: showWorkspaceFilesModal
    });
    }
  }, [workspaceFiles, loadingWorkspaceFiles, showWorkspaceFilesModal]);
  
  // V1-style colors - matching user message backgrounds
  const borderColor = isLight ? '#e5e7eb' : '#374151'; // gray-200 / gray-700
  const backgroundColor = isLight ? '#f9fafb' : '#151C24'; // Matches user message background
  
  // Constants
  const MAX_UPLOAD_BYTES = 30 * 1024 * 1024; // 30MB
  
  // File size formatter (matching FilesPanel)
  const formatSize = (bytes: number): string => {
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  // Get file icon (matching FilesPanel)
  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const iconClass = cn('w-4 h-4', isLight ? 'text-gray-400' : 'text-gray-500');
    
    // Document icons
    if (['pdf'].includes(ext || '')) {
      return <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>;
    }
    if (['doc', 'docx', 'txt', 'md'].includes(ext || '')) {
      return <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
    }
    // Image icons
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext || '')) {
      return <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
    }
    // Spreadsheet icons
    if (['xls', 'xlsx', 'csv'].includes(ext || '')) {
      return <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>;
    }
    // Default file icon
    return <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>;
  };

  // Get file type category (matching FilesPanel)
  const getFileTypeCategory = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext || '')) {
      return 'Image';
    }
    if (['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt'].includes(ext || '')) {
      return 'Document';
    }
    if (['xls', 'xlsx', 'csv', 'ods'].includes(ext || '')) {
      return 'Spreadsheet';
    }
    if (['ppt', 'pptx', 'odp'].includes(ext || '')) {
      return 'Presentation';
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
      return 'Archive';
    }
    if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext || '')) {
      return 'Video';
    }
    if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext || '')) {
      return 'Audio';
    }
    if (['json', 'xml', 'yaml', 'yml', 'toml'].includes(ext || '')) {
      return 'Data';
    }
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'go', 'rs', 'rb', 'php', 'html', 'css', 'scss'].includes(ext || '')) {
      return 'Code';
    }
    return 'File';
  };

  // Format date (matching FilesPanel)
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };
  
  // Render service logo for connections (matching ConnectionsPanel)
  const renderServiceLogo = (service: string, size = 'w-4 h-4') => {
    switch (service) {
      case 'gmail':
        return (
          <svg className={size} viewBox="0 0 24 24" fill="none">
            <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L12 9.545l8.073-6.052C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/>
          </svg>
        );
      case 'outlook':
        return (
          <svg className={size} viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="9" height="9" rx="1" fill="#0078D4"/>
            <path d="M7.5 6C6.1 6 5 7.1 5 8.5C5 9.9 6.1 11 7.5 11C8.9 11 10 9.9 10 8.5C10 7.1 8.9 6 7.5 6ZM7.5 9.5C7 9.5 6.5 9 6.5 8.5C6.5 8 7 7.5 7.5 7.5C8 7.5 8.5 8 8.5 8.5C8.5 9 8 9.5 7.5 9.5Z" fill="white"/>
            <path d="M13 6V11L21 15V10L13 6Z" fill="#0078D4"/>
          </svg>
        );
      case 'slack':
        return (
          <svg className={size} viewBox="0 0 24 24" fill="none">
            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52z" fill="#E01E5A"/>
            <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834z" fill="#36C5F0"/>
            <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834z" fill="#2EB67D"/>
            <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52z" fill="#ECB22E"/>
          </svg>
        );
      case 'google-drive':
        return (
          <svg className={size} viewBox="0 0 24 24" fill="none">
            <path d="M8 3L12 9.5L16 3H8Z" fill="#0066DA"/>
            <path d="M16 3L20 9.5L16 16L12 9.5L16 3Z" fill="#FFC107"/>
            <path d="M8 3L4 9.5L8 16L12 9.5L8 3Z" fill="#0F9D58"/>
            <path d="M12 16L8 16L12 21L16 16L12 16Z" fill="#4285F4"/>
          </svg>
        );
      case 'onedrive':
        return (
          <svg className={size} viewBox="0 0 24 24" fill="none">
            <path d="M5.9 19.5C2.6 19.5 0 16.9 0 13.75C0 10.65 2.5 8.1 5.65 8C7.0 5.9 9.3 4.5 12 4.5C15.5 4.5 18.4 6.8 19.2 10C22.0 10 24 12.1 24 14.75C24 17.3 21.8 19.5 19.4 19.5H5.9Z" fill="#0364B8"/>
          </svg>
        );
      case 'dropbox':
        return (
          <svg className={size} viewBox="0 0 24 24" fill="none">
            <path d="M6 2L12 6L18 2L12 6L6 2Z" fill="#0061FF"/>
            <path d="M12 6L6 10L12 14L18 10L12 6Z" fill="#0061FF"/>
          </svg>
        );
      default:
        return (
          <svg className={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        );
    }
  };
  
  // Get connection display name
  const getConnectionDisplayName = (service: string) => {
    const names: Record<string, string> = {
      'gmail': 'Gmail',
      'outlook': 'Outlook',
      'slack': 'Slack',
      'google-drive': 'Google Drive',
      'onedrive': 'OneDrive',
      'dropbox': 'Dropbox',
    };
    return names[service] || service.charAt(0).toUpperCase() + service.slice(1);
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
      // Use consistent workspace path structure: workspace/{userId}/{timestamp}-{filename}
      const userId = user?.id || 'anonymous';
      const path = `workspace/${userId}/${ts}-${safeName}`;
      const storageRef = fbRef(storage as any, path);
      
      return await new Promise<AttachmentItem>((resolve, reject) => {
        const task = uploadBytesResumable(storageRef as any, item.file!);
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
              
              // Save to workspace files for unified experience
              try {
                const payload: any = {
                  file_name: item.name,
                  file_type: item.file!.type,
                  file_size: item.file!.size,
                  storage_url: url,
                  folder: 'chat-uploads',
                  description: 'Uploaded via chat',
                };
                
                // If file is text, extract content
                if (item.file!.type.startsWith('text/')) {
                  try {
                    const text = await item.file!.text();
                    payload.extracted_text = text;
                  } catch (textError) {
                    console.warn('[FileUpload] Failed to extract text:', textError);
                  }
                }
                
                const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
                await fetch(`${baseURL}/api/workspace/files/register`, {
                  method: 'POST',
                  credentials: 'include',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(payload),
                });
                
                console.debug('[FileUpload] Registered file in workspace:', item.name);
              } catch (workspaceError) {
                console.warn('[FileUpload] Failed to register file in workspace:', workspaceError);
                // Don't fail the upload if workspace registration fails
              }
              
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
  
  // Fetch workspace files
  const fetchWorkspaceFiles = async () => {
    setLoadingWorkspaceFiles(true);
    try {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/workspace/files`, {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setWorkspaceFiles(data.files || []);
      } else {
        console.error('[Workspace Files] Failed to load. Status:', response.status);
        setWorkspaceFiles([]);
      }
    } catch (error) {
      console.error('[Workspace Files] Error loading files:', error);
      setWorkspaceFiles([]);
    } finally {
      setLoadingWorkspaceFiles(false);
    }
  };
  
  // Group files by folder/source
  const groupFilesByFolder = () => {
    const grouped: Record<string, any[]> = {};
    workspaceFiles.forEach(file => {
      const folder = file.folder || 'other';
      if (!grouped[folder]) {
        grouped[folder] = [];
      }
      grouped[folder].push(file);
    });
    return grouped;
  };

  const getFolderLabel = (folder: string): string => {
    const labels: Record<string, string> = {
      'chat-uploads': 'Chat Attachments',
      'uploads': 'Uploads',
      'screenshots': 'Screenshots',
      'generated': 'AI Generated',
      'other': 'Other Files',
    };
    return labels[folder] || folder.charAt(0).toUpperCase() + folder.slice(1);
  };

  const toggleFolder = (folder: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folder)) {
        next.delete(folder);
      } else {
        next.add(folder);
      }
      return next;
    });
  };
  
  // Open workspace files modal
  const openWorkspaceFilesModal = () => {
    setShowWorkspaceFilesModal(true);
    fetchWorkspaceFiles();
    // Expand all folders by default
    setExpandedFolders(new Set(['chat-uploads', 'uploads', 'screenshots', 'generated', 'other']));
  };
  
  // Add workspace files as attachments
  const addWorkspaceFilesAsAttachments = () => {
    const filesToAdd = workspaceFiles.filter((f, idx) => {
      const fileId = f?.id || `file-${idx}`;
      return selectedWorkspaceFileIds.has(fileId);
    });
    
    const newAttachments: AttachmentItem[] = filesToAdd.map((file, idx) => {
      const fileId = file?.id || `file-${idx}`;
      return {
        id: `workspace-${fileId}`,
      file: null as any, // Not a File object, already uploaded
      name: file.file_name,
      size: file.file_size,
      previewUrl: file.storage_url, // Use storage URL directly
      status: 'uploaded' as const, // Already uploaded to Firebase
      progress: 100,
      uploadedUrl: file.storage_url, // Already have the URL
      mimeType: file.file_type,
      };
    });
    
    setAttachments(prev => [...prev, ...newAttachments]);
    setShowWorkspaceFilesModal(false);
    setSelectedWorkspaceFileIds(new Set());
  };
  
  // Toggle workspace file selection
  const toggleWorkspaceFileSelection = (fileId: string) => {
    setSelectedWorkspaceFileIds(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };
  
  // Gmail handlers
  const openGmailModal = (connectionId: string) => {
    setGmailConnectionId(connectionId);
    setShowGmailModal(true);
  };
  
  const handleGmailItemsSelected = async (emails: any[]) => {
    // Group emails by thread to detect which ones need full thread fetching
    const threadMap = new Map<string, any[]>();
    emails.forEach(email => {
      if (!threadMap.has(email.threadId)) {
        threadMap.set(email.threadId, []);
      }
      threadMap.get(email.threadId)!.push(email);
    });
    
    const newAttachments: AttachmentItem[] = [];
    
    // Process each unique thread
    for (const [threadId, threadEmails] of threadMap.entries()) {
      const email = threadEmails[0]; // Use first email as reference
      const isPartOfThread = email.isPartOfThread || email.threadMessageCount > 1;
      
      if (isPartOfThread) {
        // Fetch full thread
        try {
          const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
          const response = await fetch(
            `${baseURL}/api/workspace/connections/${gmailConnectionId}/gmail/thread/${threadId}`,
            { credentials: 'include' }
          );
          
          if (response.ok) {
            const data = await response.json();
            const thread = data.thread;
            
            // Format entire thread as single file
            const threadText = formatGmailThreadAsText(thread);
            const blob = new Blob([threadText], { type: 'text/plain; charset=utf-8' });
            const fileName = `gmail-thread-${thread.messages[0].subject.substring(0, 40).replace(/[^a-zA-Z0-9-_\s]/g, '_')}-${thread.messageCount}msgs.txt`.replace(/\s+/g, '-');
            const file = new File([blob], fileName, { type: 'text/plain' });
            
            const id = `gmail-thread-${threadId}-${Date.now()}`;
            const url = URL.createObjectURL(file);
            
            newAttachments.push({
              id,
              file,
              name: file.name,
              size: file.size,
              previewUrl: url,
              status: 'pending' as const,
              progress: 0,
              mimeType: 'text/plain',
            });
          } else {
            // Fallback to single email if thread fetch fails - fetch full content
            console.warn(`Failed to fetch thread ${threadId}, using single email`);
            try {
              const emailResponse = await fetch(
                `${baseURL}/api/workspace/connections/${gmailConnectionId}/gmail/email/${email.id}`,
                { credentials: 'include' }
              );
              
              let fullEmail = email;
              if (emailResponse.ok) {
                const emailData = await emailResponse.json();
                fullEmail = { ...email, ...emailData.email };
              }
              
              const emailText = formatEmailAsText(fullEmail);
              const blob = new Blob([emailText], { type: 'text/plain; charset=utf-8' });
              const file = new File([blob], generateEmailFilename(fullEmail), { type: 'text/plain' });
              
              const id = `gmail-${email.id}-${Date.now()}`;
              const url = URL.createObjectURL(file);
              
              newAttachments.push({
                id,
                file,
                name: file.name,
                size: file.size,
                previewUrl: url,
                status: 'pending' as const,
                progress: 0,
                mimeType: 'text/plain',
              });
            } catch (emailError) {
              console.error(`Error fetching email ${email.id}:`, emailError);
              // Final fallback to snippet
              const emailText = formatEmailAsText(email);
              const blob = new Blob([emailText], { type: 'text/plain; charset=utf-8' });
              const file = new File([blob], generateEmailFilename(email), { type: 'text/plain' });
              
              const id = `gmail-${email.id}-${Date.now()}`;
              const url = URL.createObjectURL(file);
              
              newAttachments.push({
                id,
                file,
                name: file.name,
                size: file.size,
                previewUrl: url,
                status: 'pending' as const,
                progress: 0,
                mimeType: 'text/plain',
              });
            }
          }
        } catch (error) {
          console.error(`Error fetching thread ${threadId}:`, error);
          // Fallback to single email with full content
          try {
            const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
            const emailResponse = await fetch(
              `${baseURL}/api/workspace/connections/${gmailConnectionId}/gmail/email/${email.id}`,
              { credentials: 'include' }
            );
            
            let fullEmail = email;
            if (emailResponse.ok) {
              const emailData = await emailResponse.json();
              fullEmail = { ...email, ...emailData.email };
            }
            
            const emailText = formatEmailAsText(fullEmail);
            const blob = new Blob([emailText], { type: 'text/plain; charset=utf-8' });
            const file = new File([blob], generateEmailFilename(fullEmail), { type: 'text/plain' });
            
            const id = `gmail-${email.id}-${Date.now()}`;
            const url = URL.createObjectURL(file);
            
            newAttachments.push({
              id,
              file,
              name: file.name,
              size: file.size,
              previewUrl: url,
              status: 'pending' as const,
              progress: 0,
              mimeType: 'text/plain',
            });
          } catch (emailError) {
            console.error(`Error fetching email ${email.id}:`, emailError);
            // Final fallback to snippet
            const emailText = formatEmailAsText(email);
            const blob = new Blob([emailText], { type: 'text/plain; charset=utf-8' });
            const file = new File([blob], generateEmailFilename(email), { type: 'text/plain' });
            
            const id = `gmail-${email.id}-${Date.now()}`;
            const url = URL.createObjectURL(file);
            
            newAttachments.push({
              id,
              file,
              name: file.name,
              size: file.size,
              previewUrl: url,
              status: 'pending' as const,
              progress: 0,
              mimeType: 'text/plain',
            });
          }
        }
      } else {
        // Single email, not part of a thread - fetch full content
        try {
          const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
          const response = await fetch(
            `${baseURL}/api/workspace/connections/${gmailConnectionId}/gmail/email/${email.id}`,
            { credentials: 'include' }
          );
          
          let fullEmail = email;
          if (response.ok) {
            const data = await response.json();
            // Merge full email data with existing email data
            fullEmail = { ...email, ...data.email };
          } else {
            console.warn(`Failed to fetch full email ${email.id}, using snippet`);
          }
          
          const emailText = formatEmailAsText(fullEmail);
          const blob = new Blob([emailText], { type: 'text/plain; charset=utf-8' });
          const file = new File([blob], generateEmailFilename(fullEmail), { type: 'text/plain' });
          
          const id = `gmail-${email.id}-${Date.now()}`;
          const url = URL.createObjectURL(file);
          
          newAttachments.push({
            id,
            file,
            name: file.name,
            size: file.size,
            previewUrl: url,
            status: 'pending' as const,
            progress: 0,
            mimeType: 'text/plain',
          });
        } catch (error) {
          console.error(`Error fetching email ${email.id}:`, error);
          // Fallback to snippet
          const emailText = formatEmailAsText(email);
          const blob = new Blob([emailText], { type: 'text/plain; charset=utf-8' });
          const file = new File([blob], generateEmailFilename(email), { type: 'text/plain' });
          
          const id = `gmail-${email.id}-${Date.now()}`;
          const url = URL.createObjectURL(file);
          
          newAttachments.push({
            id,
            file,
            name: file.name,
            size: file.size,
            previewUrl: url,
            status: 'pending' as const,
            progress: 0,
            mimeType: 'text/plain',
          });
        }
      }
    }
    
    setAttachments(prev => [...prev, ...newAttachments]);
  };
  
  // Slack handlers
  const openSlackModal = (connectionId: string) => {
    setSlackConnectionId(connectionId);
    setShowSlackModal(true);
  };
  
  const handleSlackItemsSelected = async (messages: any[]) => {
    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const newAttachments: AttachmentItem[] = [];
    
    for (const message of messages) {
      try {
        let messageText: string;
        let filename: string;
        
        // Check if this message is a thread (has replies)
        const isThread = message.reply_count && message.reply_count > 0;
        
        if (isThread) {
          // Fetch the entire thread
          console.log(`[CustomInputV2] Fetching thread for message ${message.ts} with ${message.reply_count} replies...`);
          
          const response = await fetch(
            `${baseURL}/api/workspace/connections/${slackConnectionId}/slack/thread/${message.channelId}/${message.ts}`,
            { credentials: 'include' }
          );
          
          if (!response.ok) {
            throw new Error(`Failed to fetch thread: ${response.status}`);
          }
          
          const data = await response.json();
          const threadMessages = data.messages || [];
          
          // Format the entire thread as text
          messageText = formatSlackThreadAsText(threadMessages, message.channelName);
          filename = generateSlackThreadFilename(message, threadMessages.length);
          
          console.log(`[CustomInputV2] Successfully fetched thread with ${threadMessages.length} messages`);
        } else {
          // Single message, not a thread
          messageText = formatSlackMessageAsText(message);
          filename = generateSlackFilename(message);
        }
        
        // Create text file attachment
        const blob = new Blob([messageText], { type: 'text/plain; charset=utf-8' });
        const file = new File([blob], filename, { type: 'text/plain' });
        
        const id = `slack-${message.ts}-${Date.now()}`;
        const url = URL.createObjectURL(file);
        
        newAttachments.push({
          id,
          file,
          name: file.name,
          size: file.size,
          previewUrl: url,
          status: 'pending' as const,
          progress: 0,
          mimeType: 'text/plain',
        });
        
        // Download and attach files if present
        if (message.files && message.files.length > 0) {
          console.log(`[CustomInputV2] Downloading ${message.files.length} file(s) from Slack message...`);
          
          for (const slackFile of message.files) {
            try {
              const fileResponse = await fetch(
                `${baseURL}/api/workspace/connections/${slackConnectionId}/slack/file/download`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  credentials: 'include',
                  body: JSON.stringify({ file: slackFile }),
                }
              );
              
              if (!fileResponse.ok) {
                console.error(`[CustomInputV2] Failed to download file ${slackFile.name}: ${fileResponse.status}`);
                continue;
              }
              
              const contentType = fileResponse.headers.get('Content-Type');
              const contentLength = fileResponse.headers.get('Content-Length');
              console.log(`[CustomInputV2] Response headers - Content-Type: ${contentType}, Content-Length: ${contentLength}`);
              
              // Get array buffer first to ensure binary integrity
              const arrayBuffer = await fileResponse.arrayBuffer();
              console.log(`[CustomInputV2] Received arrayBuffer - size: ${arrayBuffer.byteLength} bytes`);
              
              // Convert to blob
              const fileBlob = new Blob([arrayBuffer], { type: slackFile.mimetype || 'application/octet-stream' });
              console.log(`[CustomInputV2] Created blob - size: ${fileBlob.size}, type: ${fileBlob.type}`);
              
              // Verify first few bytes for PDF files
              if (slackFile.mimetype === 'application/pdf' || slackFile.name.endsWith('.pdf')) {
                const firstBytes = new Uint8Array(arrayBuffer.slice(0, 4));
                const pdfSignature = [0x25, 0x50, 0x44, 0x46]; // %PDF
                const isPdf = firstBytes.every((byte, i) => byte === pdfSignature[i]);
                console.log(`[CustomInputV2] PDF signature check - First 4 bytes: ${Array.from(firstBytes).map(b => '0x' + b.toString(16)).join(' ')}, Valid: ${isPdf}`);
              }
              
              const downloadedFile = new File([fileBlob], slackFile.name, { type: slackFile.mimetype || 'application/octet-stream' });
              console.log(`[CustomInputV2] Created file - name: ${downloadedFile.name}, size: ${downloadedFile.size}, type: ${downloadedFile.type}`);
              
              const fileId = `slack-file-${slackFile.id}-${Date.now()}`;
              const fileUrl = URL.createObjectURL(downloadedFile);
              
              newAttachments.push({
                id: fileId,
                file: downloadedFile,
                name: downloadedFile.name,
                size: downloadedFile.size,
                previewUrl: fileUrl,
                status: 'pending' as const,
                progress: 0,
                mimeType: downloadedFile.type,
              });
              
              console.log(`[CustomInputV2] Successfully downloaded file: ${slackFile.name}, attached with preview URL`);
            } catch (fileError) {
              console.error(`[CustomInputV2] Error downloading file ${slackFile.name}:`, fileError);
            }
          }
        }
      } catch (error) {
        console.error('[CustomInputV2] Error processing Slack message:', error);
        // If thread/file fetch fails, fall back to basic message text
        const messageText = formatSlackMessageAsText(message);
        const blob = new Blob([messageText], { type: 'text/plain; charset=utf-8' });
        const file = new File([blob], generateSlackFilename(message), { type: 'text/plain' });
        
        const id = `slack-${message.ts}-${Date.now()}`;
        const url = URL.createObjectURL(file);
        
        newAttachments.push({
          id,
          file,
          name: file.name,
          size: file.size,
          previewUrl: url,
          status: 'pending' as const,
          progress: 0,
          mimeType: 'text/plain',
        });
      }
    }
    
    setAttachments(prev => [...prev, ...newAttachments]);
  };
  
  // Format Gmail email as text
  const formatEmailAsText = (email: any): string => {
    const lines = [];
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('📧 EMAIL');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push(`From: ${email.from}`);
    lines.push(`To: ${email.to}`);
    lines.push(`Subject: ${email.subject}`);
    lines.push(`Date: ${email.date}`);
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('MESSAGE CONTENT:');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push(email.body || email.snippet);
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return lines.join('\n');
  };
  
  // Format Gmail thread as text (all messages in chronological order)
  const formatGmailThreadAsText = (thread: any): string => {
    const lines = [];
    
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`📧 EMAIL THREAD (${thread.messageCount} messages)`);
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    
    thread.messages.forEach((message: any, index: number) => {
      if (index > 0) {
        lines.push('');
        lines.push('─────────────────────────────────────────────────────────────────────');
        lines.push(`MESSAGE ${index + 1} OF ${thread.messageCount}`);
        lines.push('─────────────────────────────────────────────────────────────────────');
        lines.push('');
      }
      
      lines.push(`From: ${message.from}`);
      lines.push(`To: ${message.to}`);
      lines.push(`Subject: ${message.subject}`);
      lines.push(`Date: ${message.date}`);
      lines.push('');
      lines.push(message.body || message.snippet);
      
      if (index === thread.messageCount - 1) {
        lines.push('');
        lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }
    });
    
    return lines.join('\n');
  };
  
  // Format Slack timestamp (must be defined first as it's used by other functions)
  const formatSlackTimestamp = (ts: string): string => {
    const timestamp = parseFloat(ts) * 1000;
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };
  
  // Format Slack message as text
  const formatSlackMessageAsText = (message: any): string => {
    const lines = [];
    lines.push('========================================================================');
    lines.push('SLACK MESSAGE');
    lines.push('========================================================================');
    lines.push('');
    lines.push(`Channel: #${message.channelName}`);
    lines.push(`Type: ${message.channelType}`);
    lines.push(`Timestamp: ${formatSlackTimestamp(message.ts)}`);
    if (message.thread_ts && message.thread_ts !== message.ts) {
      lines.push('Thread Reply: Yes');
    }
    lines.push('');
    lines.push('========================================================================');
    lines.push('MESSAGE CONTENT:');
    lines.push('========================================================================');
    lines.push('');
    lines.push(message.text || '[No text content]');
    if (message.attachments && message.attachments.length > 0) {
      lines.push('');
      lines.push('Attachments:');
      message.attachments.forEach((att: any, idx: number) => {
        lines.push(`  ${idx + 1}. ${att.title || att.fallback || 'Attachment'}`);
        if (att.text) {
          lines.push(`     ${att.text.substring(0, 100)}${att.text.length > 100 ? '...' : ''}`);
        }
      });
    }
    if (message.files && message.files.length > 0) {
      lines.push('');
      lines.push('Files:');
      message.files.forEach((file: any, idx: number) => {
        lines.push(`  ${idx + 1}. ${file.name} (${file.mimetype || 'unknown type'})`);
      });
    }
    lines.push('');
    lines.push('========================================================================');
    return lines.join('\n');
  };
  
  // Format Slack thread as text (all messages in chronological order)
  const formatSlackThreadAsText = (messages: any[], channelName: string): string => {
    const lines = [];
    
    lines.push('========================================================================');
    lines.push(`SLACK THREAD (${messages.length} messages)`);
    lines.push('========================================================================');
    lines.push('');
    lines.push(`Channel: #${channelName}`);
    lines.push('');
    
    messages.forEach((message: any, index: number) => {
      const isParent = index === 0;
      
      lines.push('========================================================================');
      lines.push(`${isParent ? 'PARENT MESSAGE' : `REPLY ${index}`}`);
      lines.push('========================================================================');
      lines.push('');
      lines.push(`Timestamp: ${formatSlackTimestamp(message.ts)}`);
      lines.push('');
      lines.push('MESSAGE CONTENT:');
      lines.push(message.text || '[No text content]');
      
      // Add attachments info if present
      if (message.attachments && message.attachments.length > 0) {
        lines.push('');
        lines.push('Attachments:');
        message.attachments.forEach((att: any, idx: number) => {
          lines.push(`  ${idx + 1}. ${att.title || att.fallback || 'Attachment'}`);
          if (att.text) {
            lines.push(`     ${att.text.substring(0, 100)}${att.text.length > 100 ? '...' : ''}`);
          }
        });
      }
      
      // Add files info if present
      if (message.files && message.files.length > 0) {
        lines.push('');
        lines.push('Files:');
        message.files.forEach((file: any, idx: number) => {
          lines.push(`  ${idx + 1}. ${file.name} (${file.mimetype || 'unknown type'})`);
        });
      }
      
      lines.push('');
    });
    
    lines.push('========================================================================');
    
    return lines.join('\n');
  };
  
  // Generate Gmail filename
  const generateEmailFilename = (email: any): string => {
    const subject = (email.subject || 'No Subject').substring(0, 50).replace(/[^a-zA-Z0-9-_\s]/g, '_');
    const from = email.from.split('<')[0].trim().substring(0, 30).replace(/[^a-zA-Z0-9-_\s]/g, '_');
    return `gmail-${from}-${subject}.txt`.replace(/\s+/g, '-');
  };
  
  // Generate Slack filename
  const generateSlackFilename = (message: any): string => {
    const channel = message.channelName.substring(0, 30).replace(/[^a-zA-Z0-9-_]/g, '_');
    const timestamp = formatSlackTimestamp(message.ts).replace(/[/:,\s]/g, '-');
    const preview = (message.text || 'message').substring(0, 30).replace(/[^a-zA-Z0-9-_]/g, '_');
    return `slack-${channel}-${timestamp}-${preview}.txt`;
  };
  
  // Generate Slack thread filename
  const generateSlackThreadFilename = (message: any, threadLength: number): string => {
    const channel = message.channelName.substring(0, 30).replace(/[^a-zA-Z0-9-_]/g, '_');
    const timestamp = formatSlackTimestamp(message.ts).replace(/[/:,\s]/g, '-');
    const preview = (message.text || 'thread').substring(0, 30).replace(/[^a-zA-Z0-9-_]/g, '_');
    return `slack-thread-${channel}-${timestamp}-${threadLength}-replies-${preview}.txt`;
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
  
  // Handle paste events to support pasting files from clipboard
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }
    
    if (files.length > 0) {
      e.preventDefault();
      // Convert to FileList-like object
      const dataTransfer = new DataTransfer();
      files.forEach(file => dataTransfer.items.add(file));
      handleFilesPicked(dataTransfer.files);
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
          mimeType: att.mimeType || att.file?.type || 'application/octet-stream',
          url: url,
          filename: att.name,
        });
      });
    
    debug.log('[CustomInputV2] Sending multimodal message (AG-UI format):', {
      contentParts: contentParts.length,
      hasText: contentParts.some(p => p.type === 'text'),
      hasBinary: contentParts.some(p => p.type === 'binary'),
      files: updatedAttachments.map(a => ({ name: a.name, type: a.mimeType || a.file?.type })),
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
    <>
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
              onPaste={handlePaste}
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
                    top: '-0.35rem',
                    left: 0,
                    right: 0,
                    bottom: '-0.1rem',
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
                    const isImage = att.file?.type.startsWith('image/') || att.mimeType?.startsWith('image/');
                    
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
                              {getFileType(att.name, att.mimeType || att.file?.type || '')}
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
                            {getFileType(att.name, att.mimeType || att.file?.type || '')} - {formatSize(att.size)}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          openWorkspaceFilesModal();
                        }}
                        isLight={isLight}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {CustomIcons.workspaceFiles}
                          <span>Workspace Files</span>
                        </div>
                      </DropdownMenuItem>
                      
                      {/* Active Connections */}
                      {workspaceConnections.length > 0 && (
                        <>
                      <DropdownMenuSeparator isLight={isLight} />
                          {workspaceConnections.map((connection) => (
                      <DropdownMenuItem
                              key={connection.id}
                              onClick={() => {
                                if (connection.service_name === 'gmail') {
                                  openGmailModal(connection.id);
                                } else if (connection.service_name === 'slack') {
                                  openSlackModal(connection.id);
                                } else {
                                  console.log(`Connection ${connection.service_name} not yet implemented`);
                                }
                              }}
                        isLight={isLight}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {renderServiceLogo(connection.service_name)}
                                <span>{getConnectionDisplayName(connection.service_name)}</span>
                        </div>
                      </DropdownMenuItem>
                          ))}
                        </>
                      )}
                    </DropdownMenu>
                    
                    <ContextSelector
                      isLight={isLight}
                      selectedPageURLs={selectedPageURLs}
                      currentPageURL={currentPageURL}
                      sessionId={sessionId || undefined}
                      onPagesChange={setSelectedPageURLs}
                      variant="compact"
                      showBrowserTabs={true}
                      selectedNoteIds={selectedNoteIds}
                      selectedCredentialIds={selectedCredentialIds}
                      onNotesChange={setSelectedNoteIds}
                      onCredentialsChange={setSelectedCredentialIds}
                      onNotesWithContentChange={setSelectedNotes}
                      onCredentialsWithSecretsChange={setSelectedCredentials}
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
    
    {/* Workspace Files Modal */}
    {showWorkspaceFilesModal && (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          style={{ zIndex: 10000 }}
        onClick={() => setShowWorkspaceFilesModal(false)}
        />
        
        {/* Modal */}
        <div
          className="fixed inset-0 flex items-center justify-center p-4 attachment-modal"
          style={{ zIndex: 10001 }}
        >
        <div
          className={cn(
              'w-full max-w-4xl rounded-lg shadow-xl',
              isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]'
          )}
          onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 'min(56rem, 90vw)' }}
        >
          {/* Header */}
            <div className={cn('flex items-center justify-between border-b px-3 py-2', isLight ? 'border-gray-200' : 'border-gray-700')}>
              <h2 className={cn('text-base font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
              Select Workspace Files
              </h2>
            <button
              onClick={() => setShowWorkspaceFilesModal(false)}
              className={cn(
                  'rounded-md p-0.5 transition-colors',
                  isLight ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              )}
            >
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
            
            {/* Content */}
            <div className="px-3 py-2">
          <div 
                className="overflow-y-auto" 
            style={{ 
                  maxHeight: '400px'
            }}
          >
            {loadingWorkspaceFiles ? (
                  <div className={cn('py-6 text-center text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>
                Loading files...
              </div>
            ) : !workspaceFiles || workspaceFiles.length === 0 ? (
                  <div className={cn('py-6 text-center text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>
                No files in workspace. Upload files to see them here.
              </div>
            ) : (
                  <div className="space-y-1">
                    {Object.entries(groupFilesByFolder()).map(([folder, folderFiles]) => {
                      if (folderFiles.length === 0) return null;
                      
                      const isExpanded = expandedFolders.has(folder);
                      
                  return (
                        <div key={folder}>
                          {/* Accordion Header */}
                          <div
                      className={cn(
                              'flex items-center justify-between px-2 py-1 text-xs font-medium border-b',
                              isLight ? 'border-gray-200' : 'border-gray-700'
                            )}
                          >
                            <button
                              onClick={() => toggleFolder(folder)}
                              className={cn(
                                'flex items-center gap-2 transition-colors flex-1 text-left',
                                isLight ? 'hover:text-gray-900' : 'hover:text-white'
                              )}
                              style={{ color: isLight ? '#374151' : '#bcc1c7' }}
                            >
                              <svg
                                className={cn(
                                  'w-3.5 h-3.5 transition-transform duration-200 ease-in-out flex-shrink-0',
                                  isLight ? 'text-gray-400' : 'text-gray-500',
                                  isExpanded && 'rotate-90'
                                )}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              <span className="whitespace-nowrap">{getFolderLabel(folder)}</span>
                              <span
                                className={cn(
                                  'px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0',
                                  isLight ? 'bg-gray-100 text-gray-600' : 'bg-gray-800 text-gray-400'
                                )}
                              >
                                {folderFiles.length}
                              </span>
                            </button>
                          </div>

                          {/* Accordion Content */}
                          <div 
                            className={cn(
                              'overflow-hidden transition-all duration-200 ease-in-out',
                              isExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
                            )}
                          >
                            <div className="w-full overflow-x-auto">
                              <table className="w-full border-collapse text-xs" style={{ minWidth: '100%' }}>
                                <thead className={cn('sticky top-0 z-10', isLight ? 'bg-gray-50' : 'bg-[#151C24]')}>
                                  <tr className={cn('border-b', isLight ? 'border-gray-200' : 'border-gray-700')}>
                                    <th className={cn('px-3 py-1.5 w-8', isLight ? 'text-gray-600' : 'text-gray-300')}></th>
                                    <th className={cn('px-3 py-1.5 text-left text-xs font-semibold whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-300')}>File Name</th>
                                    <th className={cn('px-3 py-1.5 text-left text-xs font-semibold whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-300')}>Type</th>
                                    <th className={cn('px-3 py-1.5 text-right text-xs font-semibold whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-300')}>Size</th>
                                    <th className={cn('px-3 py-1.5 text-left text-xs font-semibold whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-300')}>Created</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {folderFiles.map((file, index) => {
                                    if (!file) return null;
                                    
                                    const fileId = file.id || `file-${index}`;
                                    const isSelected = selectedWorkspaceFileIds.has(fileId);
                                    
                                    return (
                                      <tr
                                        key={fileId}
                                        onClick={() => toggleWorkspaceFileSelection(fileId)}
                                        className={cn(
                                          'transition-colors border-b group cursor-pointer',
                                          isLight ? 'border-gray-100 hover:bg-gray-50' : 'border-gray-700 hover:bg-gray-900/40',
                                          isSelected && (isLight ? 'bg-blue-50' : 'bg-blue-900/20')
                                        )}
                    >
                                        <td className="px-3 py-1.5">
                                          <div
                                            className={cn(
                                              'w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 transition-opacity',
                                              isSelected
                                                ? 'bg-blue-600/60 opacity-100'
                                                : cn('border opacity-100', isLight ? 'border-gray-400' : 'border-gray-500')
                                            )}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleWorkspaceFileSelection(fileId);
                                            }}
                                          >
                                            {isSelected && (
                                              <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                              </svg>
                                            )}
                                          </div>
                                        </td>
                                        <td className={cn('px-3 py-1.5')}>
                                          <div className="flex items-center gap-1 min-w-0">
                                            <div className="flex-shrink-0">{getFileIcon(file.file_name)}</div>
                                            <span className={cn('font-medium truncate', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')} title={file.file_name}>
                          {file.file_name || 'Unnamed file'}
                                            </span>
                        </div>
                                        </td>
                                        <td className={cn('px-3 py-1.5 whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-400')}>
                                          <span className={cn('text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                                            {getFileTypeCategory(file.file_name)}
                                          </span>
                                        </td>
                                        <td className={cn('px-3 py-1.5 text-right whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-400')}>
                                          {file.file_size ? formatSize(file.file_size) : 'Unknown'}
                                        </td>
                                        <td className={cn('px-3 py-1.5 whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-400')}>
                                          {file.created_at ? formatDate(file.created_at) : 'Unknown'}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                        </div>
                      </div>
                        </div>
                  );
                })}
              </div>
            )}
              </div>
          </div>
          
          {/* Footer */}
            <div className={cn('flex items-center justify-between border-t px-3 py-2', isLight ? 'border-gray-200' : 'border-gray-700')}>
              <span className="text-xs" style={{ color: isLight ? '#6b7280' : '#9ca3af' }}>
              {selectedWorkspaceFileIds.size} file(s) selected
            </span>
              <div className="flex items-center gap-2">
              <button
                onClick={() => setShowWorkspaceFilesModal(false)}
                className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    isLight ? 'bg-gray-200 hover:bg-gray-300' : 'bg-gray-700 hover:bg-gray-600'
                )}
                  style={{ color: isLight ? '#374151' : '#bcc1c7' }}
              >
                Cancel
              </button>
              <button
                onClick={addWorkspaceFilesAsAttachments}
                disabled={selectedWorkspaceFileIds.size === 0}
                className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  selectedWorkspaceFileIds.size === 0
                      ? 'opacity-50 cursor-not-allowed bg-gray-400 text-gray-600'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                )}
              >
                Add {selectedWorkspaceFileIds.size > 0 && `(${selectedWorkspaceFileIds.size})`}
              </button>
            </div>
          </div>
        </div>
      </div>
      </>
    )}
    
    {/* Gmail Items Modal */}
    {showGmailModal && gmailConnectionId && (
      <GmailItemsModal
        isOpen={showGmailModal}
        onClose={() => setShowGmailModal(false)}
        onSelect={handleGmailItemsSelected}
        connectionId={gmailConnectionId}
        isLight={isLight}
      />
    )}
    
    {/* Slack Items Modal */}
    {showSlackModal && slackConnectionId && (
      <SlackItemsModal
        isOpen={showSlackModal}
        onClose={() => setShowSlackModal(false)}
        onSelect={handleSlackItemsSelected}
        connectionId={slackConnectionId}
        isLight={isLight}
      />
    )}
    </>
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
