import { COPIOLITKIT_CONFIG } from '../../constants';
import { useAuth } from '../../context/AuthContext';
import { ensureFirebase, ensureFirebaseAuth } from '../../utils/firebaseStorage';
import { AdminConfirmDialog } from '../admin/modals/AdminConfirmDialog';
import { cn, DropdownMenu, DropdownMenuItem } from '@extension/ui';
import { ref as fbRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CustomMarkdownRenderer } from '../chat/CustomMarkdownRenderer';
import { CodeBlock } from '../chat/slots/CustomCodeBlock';

interface WorkspaceFile {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_url: string;
  folder: string | null;
  tags: string[];
  description: string;
  created_at: string;
}

interface FolderItem {
  name: string;
  path: string;
  file_count: number;
  subfolder_count: number;
}

interface FileMoreOptionsButtonProps {
  file: WorkspaceFile;
  isLight: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onMove: () => void;
  disabled?: boolean;
}

interface FolderMoreOptionsButtonProps {
  folder: FolderItem;
  isLight: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onDelete: () => void;
  disabled?: boolean;
}

interface FolderSelectorProps {
  isLight: boolean;
  folders: FolderItem[];
  selectedFolder: string | null;
  onChange: (folder: string | null) => void;
}

const FolderSelector: React.FC<FolderSelectorProps> = ({ isLight, folders, selectedFolder, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
    return undefined;
  }, [isOpen]);

  // Calculate dropdown position
  const [position, setPosition] = useState<'up' | 'down'>('down');
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - buttonRect.bottom;
      const spaceAbove = buttonRect.top;
      const dropdownHeight = 200;
      setPosition(spaceBelow < dropdownHeight && spaceAbove > spaceBelow ? 'up' : 'down');
    }
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full rounded border px-2 py-1.5 text-xs text-left flex items-center justify-between',
          isLight 
            ? 'border-gray-300 bg-white text-gray-900 hover:border-gray-400' 
            : 'border-gray-600 bg-[#1a1f28] text-white hover:border-gray-500'
        )}
      >
        <span className="truncate flex-1">{selectedFolder || 'Root (No folder)'}</span>
        <svg
          className={cn('h-3 w-3 flex-shrink-0 ml-2 transition-transform', 
            isLight ? 'text-gray-500' : 'text-gray-400',
            isOpen && 'rotate-180'
          )}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute left-0 w-full rounded-md border shadow-lg z-[9999] max-h-[200px] overflow-y-auto',
            position === 'up' ? 'bottom-full mb-1' : 'top-full mt-1',
            isLight
              ? 'bg-white border-gray-200'
              : 'bg-[#151C24] border-gray-700'
          )}
        >
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setIsOpen(false);
            }}
            className={cn(
              'w-full px-2.5 py-1.5 text-xs text-left transition-colors',
              isLight
                ? 'text-gray-700 hover:bg-gray-100'
                : 'text-gray-200 hover:bg-gray-700',
              !selectedFolder && (isLight ? 'bg-blue-50' : 'bg-blue-900/20')
            )}
          >
            Root (No folder)
          </button>
          {folders.map(folder => (
            <button
              type="button"
              key={folder.path}
              onClick={() => {
                onChange(folder.path);
                setIsOpen(false);
              }}
              className={cn(
                'w-full px-2.5 py-1.5 text-xs text-left transition-colors break-words',
                isLight
                  ? 'text-gray-700 hover:bg-gray-100'
                  : 'text-gray-200 hover:bg-gray-700',
                selectedFolder === folder.path && (isLight ? 'bg-blue-50' : 'bg-blue-900/20')
              )}
            >
              {folder.path}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const FolderMoreOptionsButton: React.FC<FolderMoreOptionsButtonProps> = ({
  folder,
  isLight,
  isOpen,
  onToggle,
  onDelete,
  disabled = false,
}) => {
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreDropdownRef = useRef<HTMLDivElement>(null);

  const buttonClassName = cn(
    'rounded p-1 opacity-0 transition-all group-hover:opacity-100',
    disabled && 'cursor-not-allowed opacity-50',
    isLight ? 'text-gray-400 hover:text-gray-600' : 'text-gray-500 hover:text-gray-300'
  );

  const dropdownStyles: React.CSSProperties = {
    position: 'fixed',
    backgroundColor: isLight ? '#ffffff' : '#151C24',
    border: `1px solid ${isLight ? '#e5e7eb' : '#374151'}`,
    borderRadius: '6px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    zIndex: 10000,
    minWidth: '160px',
    overflow: 'hidden',
    pointerEvents: 'auto',
  };

  const menuItemBaseStyles: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: 'none',
    backgroundColor: 'transparent',
    fontSize: '12px',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  };

  const menuItemTextColor = isLight ? '#374151' : '#d1d5db';
  const menuItemHoverBg = isLight ? '#f3f4f6' : '#1f2937';

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (!disabled) {
      onToggle();
    }
  };

  const handleDelete = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete();
    onToggle();
  };

  // Position dropdown near button
  useEffect(() => {
    if (isOpen && moreButtonRef.current && moreDropdownRef.current) {
      const buttonRect = moreButtonRef.current.getBoundingClientRect();
      const dropdown = moreDropdownRef.current;
      
      dropdown.style.top = `${buttonRect.bottom + 4}px`;
      dropdown.style.right = `${window.innerWidth - buttonRect.right}px`;
    }
  }, [isOpen]);

  return (
    <>
      <button
        ref={moreButtonRef}
        className={buttonClassName}
        title="More options"
        onClick={handleClick}
        disabled={disabled}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          width="16"
          height="16"
        >
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>
      
      {isOpen &&
        createPortal(
          <div
            ref={moreDropdownRef}
            className="folderMoreOptionsDropdownMenu"
            style={dropdownStyles}
          >
            {/* Delete Option */}
            <button
              type="button"
              onClick={handleDelete}
              style={{
                ...menuItemBaseStyles,
                color: isLight ? '#dc2626' : '#ef4444',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = menuItemHoverBg;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="14"
                height="14"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete folder
            </button>
          </div>,
          document.body,
        )}
    </>
  );
};

const FileMoreOptionsButton: React.FC<FileMoreOptionsButtonProps> = ({
  file,
  isLight,
  isOpen,
  onToggle,
  onDownload,
  onDelete,
  onMove,
  disabled = false,
}) => {
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreDropdownRef = useRef<HTMLDivElement>(null);

  // Position dropdown when it opens
  useEffect(() => {
    if (isOpen && moreButtonRef.current && moreDropdownRef.current) {
      requestAnimationFrame(() => {
        if (moreButtonRef.current && moreDropdownRef.current) {
          const buttonRect = moreButtonRef.current.getBoundingClientRect();
          const top = buttonRect.bottom + 4;
          const right = window.innerWidth - buttonRect.right;
          moreDropdownRef.current.style.top = `${top}px`;
          moreDropdownRef.current.style.right = `${right}px`;
        }
      });
    }
  }, [isOpen]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const element = target as Element;
      
      const clickedInsideButton = moreButtonRef.current?.contains(target);
      const clickedInsideDropdown = moreDropdownRef.current?.contains(target);
      const isButton = element.tagName === 'BUTTON' || element.closest('button');
      
      if (!clickedInsideButton && !clickedInsideDropdown && !isButton) {
        onToggle();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [isOpen, onToggle]);

  const buttonClassName = cn(
    'p-1 rounded transition-colors',
    disabled
      ? 'cursor-not-allowed opacity-50'
      : isLight ? 'text-gray-400 hover:text-gray-600' : 'text-gray-500 hover:text-gray-300',
  );

  const dropdownStyles: React.CSSProperties = {
    position: 'fixed',
    top: '0px',
    right: '0px',
    marginTop: '0',
    backgroundColor: isLight ? '#f9fafb' : '#151C24',
    border: isLight ? '1px solid #e5e7eb' : '1px solid #374151',
    borderRadius: '6px',
    boxShadow: '0 10px 20px rgba(0, 0, 0, 0.15)',
    zIndex: 10002,
    minWidth: '160px',
    maxWidth: '200px',
    width: 'auto',
    overflow: 'visible',
    visibility: 'visible',
    opacity: 1,
    pointerEvents: 'auto',
  };

  const menuItemBaseStyles: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: 'none',
    backgroundColor: 'transparent',
    fontSize: '12px',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  };

  const menuItemTextColor = isLight ? '#374151' : '#d1d5db';
  const menuItemBorderColor = isLight ? '#e5e7eb' : '#374151';
  const menuItemHoverBg = isLight ? '#f3f4f6' : '#1f2937';

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (!disabled) {
      onToggle();
    }
  };

  const handleDownload = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onDownload();
    onToggle();
  };

  const handleMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onMove();
    onToggle();
  };

  const handleDelete = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete();
    onToggle();
  };

  return (
    <>
      <button
        ref={moreButtonRef}
        className={buttonClassName}
        title="More options"
        onClick={handleClick}
        disabled={disabled}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          width="16"
          height="16"
        >
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>
      
      {isOpen &&
        createPortal(
          <div
            ref={moreDropdownRef}
            className="fileMoreOptionsDropdownMenu"
            style={dropdownStyles}
          >
            {/* Download Option */}
            <button
              type="button"
              onClick={handleDownload}
              style={{
                ...menuItemBaseStyles,
                color: menuItemTextColor,
                borderBottom: `1px solid ${menuItemBorderColor}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = menuItemHoverBg;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="14"
                height="14"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download file
            </button>
            
            {/* Move Option */}
            <button
              type="button"
              onClick={handleMove}
              style={{
                ...menuItemBaseStyles,
                color: menuItemTextColor,
                borderBottom: `1px solid ${menuItemBorderColor}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = menuItemHoverBg;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="14"
                height="14"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-3-3l3 3-3 3" />
              </svg>
              Move file
            </button>
            
            {/* Delete Option */}
            <button
              type="button"
              onClick={handleDelete}
              style={{
                ...menuItemBaseStyles,
                color: isLight ? '#dc2626' : '#ef4444',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = menuItemHoverBg;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="14"
                height="14"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete file
            </button>
          </div>,
          document.body,
        )}
    </>
  );
};

export const FilesPanel: React.FC<{ isLight: boolean; onStatsChange?: () => void }> = ({ isLight, onStatsChange }) => {
  const { user } = useAuth();
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null); // null = root
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const dragCounterRef = React.useRef(0);

  // Delete state
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<{ id: string; name: string } | null>(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [folderDeleteDialogOpen, setFolderDeleteDialogOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<{ path: string; name: string; fileCount: number } | null>(null);
  const [deleteFilesInFolder, setDeleteFilesInFolder] = useState(false);

  // Rename state
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = React.useRef<HTMLInputElement>(null);

  // New folder state
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const newFolderInputRef = React.useRef<HTMLInputElement>(null);

  // File preview state
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [fileContents, setFileContents] = useState<Map<string, { content: string; loading: boolean; error?: string }>>(new Map());
  const [loadingPreviews, setLoadingPreviews] = useState<Set<string>>(new Set());

  // More options menu state
  const [openMoreMenuFileId, setOpenMoreMenuFileId] = useState<string | null>(null);
  const [openMoreMenuFolderPath, setOpenMoreMenuFolderPath] = useState<string | null>(null);

  // Move file state
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [fileToMove, setFileToMove] = useState<{ id: string; name: string; currentFolder: string | null } | null>(null);
  const [selectedMoveFolder, setSelectedMoveFolder] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  // Bulk move state
  const [bulkMoveDialogOpen, setBulkMoveDialogOpen] = useState(false);
  const [bulkMoveDestFolder, setBulkMoveDestFolder] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    try {
      const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/workspace/files`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setFiles(data.files);
      }
    } catch (error) {
      console.error('[Workspace] Failed to load files:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFolders = useCallback(async () => {
    try {
      const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/workspace/folders`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setFolders(data.folders || []);
      }
    } catch (error) {
      console.error('[Workspace] Failed to load folders:', error);
    }
  }, []);

  useEffect(() => {
    loadFiles();
    loadFolders();
  }, [loadFiles, loadFolders]);

  // Reload files when navigating to a folder to ensure fresh data
  useEffect(() => {
    if (currentFolder !== null) {
      loadFiles();
    }
  }, [currentFolder, loadFiles]);

  // Focus new folder input when it appears
  React.useEffect(() => {
    if (showNewFolderInput && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
    }
  }, [showNewFolderInput]);

  const uploadFile = async (file: File) => {
    setUploading(true);

    try {
      if (!COPIOLITKIT_CONFIG.ENABLE_FIREBASE_UPLOADS || !COPIOLITKIT_CONFIG.FIREBASE?.storageBucket) {
        throw new Error('Firebase Storage not configured');
      }

      await ensureFirebaseAuth(COPIOLITKIT_CONFIG.FIREBASE as any);
      const storage = ensureFirebase(COPIOLITKIT_CONFIG.FIREBASE as any);
      const userId = user?.id || 'anonymous';
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `workspace/${userId}/uploads/${timestamp}-${safeName}`;
      const storageRef = fbRef(storage as any, storagePath);

      const uploadTask = uploadBytesResumable(storageRef as any, file);

      await new Promise<string>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          snapshot => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log('[Workspace] Upload progress:', progress);
          },
          error => {
            console.error('[Workspace] Firebase upload error:', error);
            reject(error);
          },
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadURL);
            } catch (error) {
              reject(error);
            }
          },
        );
      });

      const storageUrl = await getDownloadURL(uploadTask.snapshot.ref);

      const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/workspace/files/register`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          storage_url: storageUrl,
          folder: currentFolder ?? null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to register file');
      }

      await loadFiles();
      onStatsChange?.();
    } catch (error) {
      console.error('[Workspace] Upload error:', error);
      alert('Failed to upload file: ' + (error as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await uploadFile(file);
      event.target.value = '';
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      await uploadFile(file);
    }
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';
      const folderPath = currentFolder ? `${currentFolder}/${newFolderName.trim()}` : newFolderName.trim();
      
      const response = await fetch(`${baseURL}/api/workspace/folders`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folder_name: folderPath,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create folder');
      }

      await loadFolders();
      setShowNewFolderInput(false);
      setNewFolderName('');
    } catch (error) {
      console.error('[Workspace] Create folder error:', error);
      alert('Failed to create folder');
    }
  };

  const openDeleteDialog = (fileId: string, fileName: string) => {
    setFileToDelete({ id: fileId, name: fileName });
    setDeleteDialogOpen(true);
  };

  const confirmDeleteFile = async () => {
    if (!fileToDelete) return;

    setDeleting(true);
    try {
      const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/workspace/files/${fileToDelete.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Delete failed');
      }

      await loadFiles();
      onStatsChange?.();
      setDeleteDialogOpen(false);
      setFileToDelete(null);
      setOpenMoreMenuFileId(null); // Close more options menu after deletion
    } catch (error) {
      console.error('[Workspace] Delete error:', error);
      alert('Failed to delete file');
    } finally {
      setDeleting(false);
    }
  };

  const openFolderDeleteDialog = (folder: FolderItem) => {
    setFolderToDelete({ path: folder.path, name: folder.name, fileCount: folder.file_count });
    setDeleteFilesInFolder(false);
    setFolderDeleteDialogOpen(true);
  };

  const confirmDeleteFolder = async () => {
    if (!folderToDelete) return;

    setDeleting(true);
    try {
      const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';
      const encodedPath = encodeURIComponent(folderToDelete.path);
      const response = await fetch(`${baseURL}/api/workspace/folders/${encodedPath}?deleteFiles=${deleteFilesInFolder}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Delete failed');
      }

      await loadFiles();
      await loadFolders();
      onStatsChange?.();
      setFolderDeleteDialogOpen(false);
      setFolderToDelete(null);
      setDeleteFilesInFolder(false);
    } catch (error) {
      console.error('[Workspace] Delete folder error:', error);
      alert('Failed to delete folder');
    } finally {
      setDeleting(false);
    }
  };

  const toggleBulkSelectMode = () => {
    setBulkSelectMode(!bulkSelectMode);
    if (bulkSelectMode) {
      // Exiting bulk select mode
      setSelectedFiles(new Set());
      setSelectedFolders(new Set());
    }
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const toggleFolderSelection = (folderPath: string) => {
    setSelectedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allSelected = 
      currentFiles.every(f => selectedFiles.has(f.id)) &&
      currentFolders.every(f => selectedFolders.has(f.path)) &&
      (currentFiles.length + currentFolders.length) > 0;

    if (allSelected) {
      setSelectedFiles(new Set());
      setSelectedFolders(new Set());
    } else {
      setSelectedFiles(new Set(currentFiles.map(f => f.id)));
      setSelectedFolders(new Set(currentFolders.map(f => f.path)));
    }
  };

  const openBulkDeleteDialog = () => {
    if (selectedFiles.size === 0 && selectedFolders.size === 0) return;
    setBulkDeleteDialogOpen(true);
  };

  const confirmBulkDelete = async () => {
    setDeleting(true);
    try {
      const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';

      // Delete files
      if (selectedFiles.size > 0) {
        const response = await fetch(`${baseURL}/api/workspace/files/bulk`, {
          method: 'DELETE',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fileIds: Array.from(selectedFiles),
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to delete files');
        }
      }

      // Delete folders
      if (selectedFolders.size > 0) {
        const response = await fetch(`${baseURL}/api/workspace/folders/bulk`, {
          method: 'DELETE',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            folderPaths: Array.from(selectedFolders),
            deleteFiles: deleteFilesInFolder,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to delete folders');
        }
      }

      await loadFiles();
      await loadFolders();
      onStatsChange?.();
      setSelectedFiles(new Set());
      setSelectedFolders(new Set());
      setBulkSelectMode(false);
      setBulkDeleteDialogOpen(false);
      setDeleteFilesInFolder(false);
    } catch (error) {
      console.error('[Workspace] Bulk delete error:', error);
      alert('Failed to delete items: ' + (error as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const openMoveDialog = (file: WorkspaceFile) => {
    setFileToMove({ id: file.id, name: file.file_name, currentFolder: normalizeFolder(file.folder) });
    setSelectedMoveFolder(null); // Default to root
    setMoveDialogOpen(true);
  };

  const confirmMoveFile = async () => {
    if (!fileToMove) return;

    // Check if moving to the same location
    const normalizedCurrentFolder = fileToMove.currentFolder || null;
    const normalizedSelectedFolder = selectedMoveFolder || null;
    if (normalizedCurrentFolder === normalizedSelectedFolder) {
      alert('File is already in the selected location.');
      return;
    }

    setMoving(true);
    try {
      const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/workspace/files/${fileToMove.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folder: selectedMoveFolder,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Move failed');
      }

      await loadFiles();
      onStatsChange?.();
      setMoveDialogOpen(false);
      setFileToMove(null);
      setSelectedMoveFolder(null);
      setOpenMoreMenuFileId(null); // Close more options menu after move
    } catch (error) {
      console.error('[Workspace] Move error:', error);
      alert('Failed to move file: ' + (error as Error).message);
    } finally {
      setMoving(false);
    }
  };

  const openBulkMoveDialog = () => {
    if (selectedFiles.size === 0 && selectedFolders.size === 0) return;
    setBulkMoveDestFolder(null); // Default to root
    setBulkMoveDialogOpen(true);
  };

  const confirmBulkMove = async () => {
    if (selectedFiles.size === 0 && selectedFolders.size === 0) return;

    setMoving(true);
    try {
      const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';

      // Move files
      if (selectedFiles.size > 0) {
        const movePromises = Array.from(selectedFiles).map(fileId => 
          fetch(`${baseURL}/api/workspace/files/${fileId}`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              folder: bulkMoveDestFolder,
            }),
          })
        );

        const responses = await Promise.all(movePromises);
        const failedFiles = responses.filter(r => !r.ok);
        if (failedFiles.length > 0) {
          throw new Error(`Failed to move ${failedFiles.length} file(s)`);
        }
      }

      // Move folders - note: this requires backend support for moving folders
      // For now, we'll show a message if folders are selected
      if (selectedFolders.size > 0) {
        alert('Moving folders is not yet supported. Only files have been moved.');
      }

      await loadFiles();
      await loadFolders();
      onStatsChange?.();
      setSelectedFiles(new Set());
      setSelectedFolders(new Set());
      setBulkSelectMode(false);
      setBulkMoveDialogOpen(false);
      setBulkMoveDestFolder(null);
    } catch (error) {
      console.error('[Workspace] Bulk move error:', error);
      alert('Failed to move items: ' + (error as Error).message);
    } finally {
      setMoving(false);
    }
  };

  const handleStartRename = (file: WorkspaceFile) => {
    setRenamingFileId(file.id);
    setRenameValue(file.file_name);
    setOpenMoreMenuFileId(null); // Close more options menu when starting rename
  };

  const handleCancelRename = () => {
    setRenamingFileId(null);
    setRenameValue('');
    setOpenMoreMenuFileId(null); // Close more options menu when cancelling rename
  };

  const handleSaveRename = async (fileId: string) => {
    if (!renameValue.trim() || renameValue === files.find(f => f.id === fileId)?.file_name) {
      handleCancelRename();
      return;
    }

    try {
      const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/workspace/files/${fileId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_name: renameValue.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Rename failed');
      }

      await loadFiles();
      handleCancelRename();
    } catch (error) {
      console.error('[Workspace] Rename error:', error);
      alert('Failed to rename file');
      handleCancelRename();
    }
  };

  React.useEffect(() => {
    if (renamingFileId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingFileId]);

  // Close more options menus when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const isMoreMenuClick = target.closest('.fileMoreOptionsDropdownMenu') || target.closest('.folderMoreOptionsDropdownMenu');
      
      if (!isMoreMenuClick) {
        setOpenMoreMenuFileId(null);
        setOpenMoreMenuFolderPath(null);
      }
    };

    if (openMoreMenuFileId || openMoreMenuFolderPath) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
    return undefined;
  }, [openMoreMenuFileId, openMoreMenuFolderPath]);

  const formatSize = (bytes: number) => {
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  if (loading) {
    return (
      <div className={cn('py-8 text-center text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>
        Loading files...
      </div>
    );
  }

  // Normalize folder value: treat null, '', and 'root' as root
  const normalizeFolder = (folder: string | null): string | null => {
    if (!folder || folder === '' || folder === 'root') return null;
    return folder;
  };

  // Get folders and files for current directory
  const currentFolders = folders.filter(f => {
    if (!currentFolder) {
      // Root: show folders without parent (no slash or only one level)
      return !f.path.includes('/') || f.path.split('/').length === 1;
    }
    // Show folders that are direct children
    const folderDepth = currentFolder.split('/').length;
    const itemDepth = f.path.split('/').length;
    return f.path.startsWith(currentFolder + '/') && itemDepth === folderDepth + 1;
  });

  // Filter files for current directory
  const currentFiles = files.filter(f => {
    const fileFolder = normalizeFolder(f.folder);
    return fileFolder === currentFolder;
  });

  // Breadcrumb path
  const pathParts = currentFolder ? currentFolder.split('/') : [];

  const navigateToFolder = (folderPath: string | null) => {
    setCurrentFolder(folderPath);
    setSelectedFiles(new Set());
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const iconClass = cn('w-4 h-4', isLight ? 'text-gray-400' : 'text-gray-500');

    if (['pdf'].includes(ext || '')) {
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
    }
    if (['doc', 'docx', 'txt', 'md'].includes(ext || '')) {
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    }
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext || '')) {
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    }
    return (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  };

  const folderIcon = (
    <svg className={cn('w-4 h-4', isLight ? 'text-blue-500' : 'text-blue-400')} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );

  // File preview functions
  const toggleFilePreview = async (fileId: string, file: WorkspaceFile) => {
    if (expandedFiles.has(fileId)) {
      // Collapse
      const newExpanded = new Set(expandedFiles);
      newExpanded.delete(fileId);
      setExpandedFiles(newExpanded);
    } else {
      // Expand and fetch content if not already loaded
      const newExpanded = new Set(expandedFiles);
      newExpanded.add(fileId);
      setExpandedFiles(newExpanded);

      // Check if it's a PDF - PDFs don't need content fetching
      const fileType = getFileType(file.file_name);
      if (!fileType.isPdf && !fileContents.has(fileId)) {
        await fetchFileContent(fileId, file);
      }
    }
  };

  const fetchFileContent = async (fileId: string, file: WorkspaceFile) => {
    const newLoadingPreviews = new Set(loadingPreviews);
    newLoadingPreviews.add(fileId);
    setLoadingPreviews(newLoadingPreviews);

    try {
      const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/workspace/files/${fileId}/content`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch file content');
      }

      const data = await response.json();
      const newContents = new Map(fileContents);
      newContents.set(fileId, {
        content: data.content || '',
        loading: false,
      });
      setFileContents(newContents);
    } catch (error) {
      console.error('[Workspace] Failed to fetch file content:', error);
      const newContents = new Map(fileContents);
      newContents.set(fileId, {
        content: '',
        loading: false,
        error: 'Failed to load content',
      });
      setFileContents(newContents);
    } finally {
      const newLoadingPreviews = new Set(loadingPreviews);
      newLoadingPreviews.delete(fileId);
      setLoadingPreviews(newLoadingPreviews);
    }
  };

  const handleDownloadFile = async (file: WorkspaceFile) => {
    try {
      console.log('[Workspace] Downloading file:', file.file_name);
      
      let fileBlob: Blob;
      
      // Check if storage_url is a data URI (placeholder) - fetch full content from API
      if (file.storage_url.startsWith('data:')) {
        console.log('[Workspace] Storage URL is a data URI, fetching full content from API');
        
        // Fetch full content from the API endpoint
        const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';
        const response = await fetch(`${baseURL}/api/workspace/files/${file.id}/content`, {
          credentials: 'include',
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch file content from API');
        }
        
        const data = await response.json();
        const content = data.content || '';
        
        // Create blob from text content
        fileBlob = new Blob([content], { type: file.file_type || 'text/plain' });
      } else {
        // Fetch the file from Firebase Storage or other URL
        console.log('[Workspace] Fetching from storage URL');
        const response = await fetch(file.storage_url);
        
        if (!response.ok) {
          throw new Error(`Failed to download file: ${response.status}`);
        }
        
        // Get the blob
        const blob = await response.blob();
        
        // Create a blob with the correct MIME type
        fileBlob = new Blob([blob], { type: file.file_type || 'application/octet-stream' });
      }
      
      // Create object URL and trigger download
      const url = URL.createObjectURL(fileBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.file_name;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log('[Workspace] File downloaded successfully:', file.file_name);
    } catch (error) {
      console.error('[Workspace] Error downloading file:', error);
      alert('Failed to download file. Please try again.');
    }
  };

  const getFileType = (fileName: string): { language: string; isMarkdown: boolean; isImage: boolean; isPdf: boolean } => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    if (['md', 'markdown'].includes(ext)) {
      return { language: 'markdown', isMarkdown: true, isImage: false, isPdf: false };
    }

    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
      return { language: '', isMarkdown: false, isImage: true, isPdf: false };
    }

    if (ext === 'pdf') {
      return { language: '', isMarkdown: false, isImage: false, isPdf: true };
    }

    const languageMap: Record<string, string> = {
      js: 'javascript',
      jsx: 'jsx',
      ts: 'typescript',
      tsx: 'tsx',
      py: 'python',
      rb: 'ruby',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      cs: 'csharp',
      go: 'go',
      rs: 'rust',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
      scala: 'scala',
      html: 'html',
      css: 'css',
      scss: 'scss',
      sass: 'sass',
      json: 'json',
      xml: 'xml',
      yaml: 'yaml',
      yml: 'yaml',
      sql: 'sql',
      sh: 'bash',
      bash: 'bash',
      zsh: 'bash',
      ps1: 'powershell',
      dockerfile: 'dockerfile',
      txt: 'text',
    };

    return { 
      language: languageMap[ext] || 'text',
      isMarkdown: false,
      isImage: false,
      isPdf: false,
    };
  };

  const renderFilePreview = (file: WorkspaceFile) => {
    const fileData = fileContents.get(file.id);
    const fileType = getFileType(file.file_name);

    // For PDFs, we don't need to load content - just show the iframe
    if (fileType.isPdf) {
      // PDFs should always have Firebase Storage URLs, not data URIs
      const pdfUrl = file.storage_url.startsWith('data:') ? null : file.storage_url;
      
      if (!pdfUrl) {
        return (
          <div className={cn('flex items-center justify-center py-8', isLight ? 'text-gray-500' : 'text-gray-400')}>
            <div className="text-xs">PDF preview not available. Please download the file.</div>
          </div>
        );
      }
      
      return (
        <div className="flex flex-col items-center justify-center py-4 px-4">
          <iframe
            src={pdfUrl}
            className="w-full rounded border"
            style={{
              height: '600px',
              borderColor: isLight ? '#e5e7eb' : '#374151',
            }}
            title={file.file_name}
          />
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'mt-3 flex items-center gap-2 rounded px-3 py-2 text-xs font-medium transition-colors',
              isLight
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            )}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open in New Tab
          </a>
        </div>
      );
    }

    if (!fileData) return null;

    if (fileData.loading) {
      return (
        <div className={cn('flex items-center justify-center py-8', isLight ? 'text-gray-500' : 'text-gray-400')}>
          <div className="text-xs">Loading preview...</div>
        </div>
      );
    }

    if (fileData.error) {
      return (
        <div className={cn('flex items-center justify-center py-8', isLight ? 'text-red-600' : 'text-red-400')}>
          <div className="text-xs">{fileData.error}</div>
        </div>
      );
    }

    // Render image
    if (fileType.isImage) {
      // Images should always have Firebase Storage URLs, not data URIs
      const imageUrl = file.storage_url.startsWith('data:') ? null : file.storage_url;
      
      if (!imageUrl) {
        return (
          <div className={cn('flex items-center justify-center py-8', isLight ? 'text-gray-500' : 'text-gray-400')}>
            <div className="text-xs">Image preview not available. Please download the file.</div>
          </div>
        );
      }
      
      return (
        <div className="flex items-center justify-center py-4 px-4">
          <img
            src={imageUrl}
            alt={file.file_name}
            className="max-h-96 max-w-full rounded border"
            style={{
              borderColor: isLight ? '#e5e7eb' : '#374151',
            }}
            referrerPolicy="no-referrer"
            onError={(e) => {
              console.error('[Workspace] Failed to load image:', file.storage_url);
              const target = e.currentTarget;
              target.style.display = 'none';
              const errorDiv = document.createElement('div');
              errorDiv.className = isLight ? 'text-gray-500' : 'text-gray-400';
              errorDiv.textContent = 'Failed to load image';
              errorDiv.className += ' text-xs';
              target.parentElement?.appendChild(errorDiv);
            }}
          />
        </div>
      );
    }

    // Render markdown
    if (fileType.isMarkdown) {
      return (
        <div 
          className={cn('files-card-markdown', isLight ? '' : 'dark')} 
          style={{ 
            maxWidth: '100%', 
            width: '100%',
            overflow: 'hidden',
            overflowX: 'hidden',
            boxSizing: 'border-box',
          }}>
          <div 
            style={{ 
              maxWidth: '100%', 
              width: '100%',
              overflow: 'hidden', 
              overflowX: 'hidden',
              boxSizing: 'border-box',
            }}>
            <div style={{ maxWidth: '100%', overflowX: 'auto', width: '100%' }}>
          <CustomMarkdownRenderer content={fileData.content} isLight={isLight} hideToolbars={true} />
            </div>
          </div>
        </div>
      );
    }

    // Render code/text
    return (
      <div 
        className="overflow-auto" 
        style={{ 
          maxHeight: '400px', 
          maxWidth: '100%',
          width: '100%',
          overflowX: 'hidden',
          overflowY: 'auto',
          boxSizing: 'border-box',
        }}>
        <CodeBlock language={fileType.language} code={fileData.content} isLight={isLight} hideToolbar={true}/>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileUpload}
        disabled={uploading}
        accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
      />

      <div
        className={cn(
          'relative overflow-hidden rounded-lg border',
          isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-[#151C24]',
        )}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}>
        {isDragging && (
          <div
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg"
            style={{
              border: isLight ? '2px dashed rgba(59,130,246,0.5)' : '2px dashed rgba(255,255,255,0.25)',
              background: isLight ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.06)',
            }}>
            <div className="text-center">
              <svg className={cn('mx-auto mb-2 h-12 w-12', isLight ? 'text-blue-500/90' : 'text-blue-400/90')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className={cn('text-sm font-medium', isLight ? 'text-blue-700/90' : 'text-blue-300/90')}>
                Drop file to upload
              </p>
            </div>
          </div>
        )}

        {/* Header with breadcrumbs */}
        <div className={cn('flex items-center justify-between border-b px-4 py-2', isLight ? 'border-gray-200' : 'border-gray-700')}>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button
              onClick={() => navigateToFolder(null)}
              className={cn(
                'flex items-center gap-1 text-xs font-medium transition-colors',
                !currentFolder
                  ? isLight ? 'text-gray-900' : 'text-white'
                  : isLight ? 'text-gray-500 hover:text-gray-700' : 'text-gray-400 hover:text-gray-200'
              )}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Root
            </button>
            {pathParts.map((part, index) => {
              const fullPath = pathParts.slice(0, index + 1).join('/');
              const isLast = index === pathParts.length - 1;
              return (
                <React.Fragment key={fullPath}>
                  <span className={cn('text-xs', isLight ? 'text-gray-400' : 'text-gray-500')}>/</span>
                  <button
                    onClick={() => navigateToFolder(fullPath)}
                    className={cn(
                      'text-xs font-medium truncate transition-colors',
                      isLast
                        ? isLight ? 'text-gray-900' : 'text-white'
                        : isLight ? 'text-gray-500 hover:text-gray-700' : 'text-gray-400 hover:text-gray-200'
                    )}>
                    {part}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            {bulkSelectMode && (
              <>
                <button
                  onClick={openBulkMoveDialog}
                  disabled={selectedFiles.size === 0 && selectedFolders.size === 0}
                  className={cn(
                    'flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-medium transition-colors',
                    selectedFiles.size === 0 && selectedFolders.size === 0
                      ? 'cursor-not-allowed opacity-50'
                      : isLight
                        ? 'border-blue-300 text-blue-600 hover:bg-blue-50'
                        : 'border-blue-700 text-blue-400 hover:bg-blue-900/20',
                  )}
                  title="Move selected">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-3-3l3 3-3 3" />
                  </svg>
                  MOVE ({selectedFiles.size + selectedFolders.size})
                </button>
              <button
                onClick={openBulkDeleteDialog}
                disabled={selectedFiles.size === 0 && selectedFolders.size === 0}
                className={cn(
                  'flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-medium transition-colors',
                  selectedFiles.size === 0 && selectedFolders.size === 0
                    ? 'cursor-not-allowed opacity-50'
                    : isLight
                      ? 'border-red-300 text-red-600 hover:bg-red-50'
                      : 'border-red-700 text-red-400 hover:bg-red-900/20',
                )}
                title="Delete selected">
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                DELETE ({selectedFiles.size + selectedFolders.size})
              </button>
              </>
            )}
            <button
              onClick={toggleBulkSelectMode}
              className={cn(
                'flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-medium transition-colors',
                bulkSelectMode
                  ? isLight
                    ? 'border-blue-300 bg-blue-50 text-blue-600'
                    : 'border-blue-700 bg-blue-900/20 text-blue-400'
                  : isLight
                    ? 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    : 'border-gray-700 text-gray-300 hover:bg-gray-800',
              )}
              title={bulkSelectMode ? 'Exit select mode' : 'Select multiple items'}>
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              {bulkSelectMode ? 'DONE' : 'SELECT'}
            </button>
            {!bulkSelectMode && (
              <>
            <button
              onClick={() => setShowNewFolderInput(true)}
              className={cn(
                'flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-medium transition-colors',
                isLight
                  ? 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  : 'border-gray-700 text-gray-300 hover:bg-gray-800',
              )}
              title="New folder">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              FOLDER
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={cn(
                'flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-medium transition-colors',
                uploading
                  ? 'cursor-not-allowed opacity-50'
                  : isLight
                    ? 'border-gray-200 text-blue-600 hover:bg-blue-50'
                    : 'border-gray-700 text-blue-300 hover:bg-blue-900/20',
              )}
              title="Upload file">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {uploading ? 'UPLOADING...' : 'UPLOAD'}
            </button>
              </>
            )}
          </div>
        </div>

        {/* New folder input */}
        {showNewFolderInput && (
          <div className={cn('flex items-center gap-2 border-b px-4 py-2', isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#0d1117]')}>
            {folderIcon}
            <input
              ref={newFolderInputRef}
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  createFolder();
                } else if (e.key === 'Escape') {
                  setShowNewFolderInput(false);
                  setNewFolderName('');
                }
              }}
              onBlur={() => {
                if (!newFolderName.trim()) {
                  setShowNewFolderInput(false);
                }
              }}
              placeholder="Folder name"
              className={cn(
                'flex-1 rounded border px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500',
                isLight ? 'border-gray-300 bg-white text-gray-900' : 'border-gray-600 bg-[#1a1f28] text-white',
              )}
            />
            <button
              onClick={createFolder}
              disabled={!newFolderName.trim()}
              className={cn(
                'rounded px-2 py-1 text-xs font-medium transition-colors',
                !newFolderName.trim()
                  ? 'cursor-not-allowed opacity-50'
                  : isLight
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700',
              )}>
              Create
            </button>
          </div>
        )}

        {/* Bulk select toolbar */}
        {bulkSelectMode && (currentFolders.length > 0 || currentFiles.length > 0) && (
          <div className={cn('flex items-center justify-between border-b px-4 py-2', isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#0d1117]')}>
            <div
              className="flex cursor-pointer items-center gap-2"
              onClick={toggleSelectAll}>
              <div
                className={cn(
                  'flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded transition-opacity',
                  currentFiles.every(f => selectedFiles.has(f.id)) &&
                  currentFolders.every(f => selectedFolders.has(f.path)) &&
                  (currentFiles.length + currentFolders.length) > 0
                    ? 'bg-blue-600/80 opacity-100'
                    : cn('opacity-100 border', isLight ? 'border-gray-400' : 'border-gray-500'),
                )}>
                {currentFiles.every(f => selectedFiles.has(f.id)) &&
                currentFolders.every(f => selectedFolders.has(f.path)) &&
                (currentFiles.length + currentFolders.length) > 0 && (
                  <svg
                    className="h-2 w-2 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className={cn('text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                Select All
              </span>
            </div>
            <span className={cn('text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
              {selectedFiles.size + selectedFolders.size} selected
            </span>
          </div>
        )}

        {/* Files and folders list */}
        {currentFolders.length === 0 && currentFiles.length === 0 ? (
          <div className={cn('px-4 py-8 text-center text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
            {currentFolder ? 'This folder is empty.' : 'No files yet. Upload your first file or create a folder.'}
          </div>
        ) : (
          <div className="w-full" style={{ overflowX: 'auto', maxWidth: '100%' }}>
            <table className="w-full border-collapse text-xs" style={{ minWidth: 0 }}>
              <thead className={cn('sticky top-0 z-10', isLight ? 'bg-gray-50' : 'bg-[#151C24]')}>
                <tr className={cn('border-b', isLight ? 'border-gray-200' : 'border-gray-700')}>
                  {bulkSelectMode && (
                    <th className={cn('w-8 px-3 py-1.5', isLight ? 'text-gray-600' : 'text-gray-300')}></th>
                  )}
                  <th className={cn('px-3 py-1.5 text-left text-xs font-semibold', isLight ? 'text-gray-600' : 'text-gray-300')}>
                    Name
                  </th>
                  <th className={cn('px-3 py-1.5 text-right text-xs font-semibold', isLight ? 'text-gray-600' : 'text-gray-300')}>
                    Size
                  </th>
                  <th className={cn('px-3 py-1.5 text-left text-xs font-semibold', isLight ? 'text-gray-600' : 'text-gray-300')}>
                    Created
                  </th>
                  {!bulkSelectMode && (
                  <th className={cn('w-24 px-3 py-1.5 text-right text-xs font-semibold', isLight ? 'text-gray-600' : 'text-gray-300')}>
                    Actions
                  </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {/* Folders */}
                {currentFolders.map(folder => (
                  <tr
                    key={folder.path}
                    className={cn(
                      'group border-b transition-colors',
                      !bulkSelectMode && 'cursor-pointer',
                      isLight ? 'border-gray-100 hover:bg-blue-50/50' : 'border-gray-700 hover:bg-blue-900/10',
                    )}
                    onClick={(e) => {
                      if (bulkSelectMode) {
                        e.stopPropagation();
                        toggleFolderSelection(folder.path);
                      } else {
                        navigateToFolder(folder.path);
                      }
                    }}>
                    {bulkSelectMode && (
                      <td className="px-3 py-1.5">
                        <div
                          className={cn(
                            'flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded transition-opacity',
                            selectedFolders.has(folder.path)
                              ? 'bg-blue-600/80 opacity-100'
                              : cn('opacity-100 border', isLight ? 'border-gray-400' : 'border-gray-500'),
                          )}
                          onClick={e => {
                            e.stopPropagation();
                            toggleFolderSelection(folder.path);
                          }}>
                          {selectedFolders.has(folder.path) && (
                            <svg
                              className="h-2 w-2 text-white"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        {folderIcon}
                        <span className={cn('font-medium', isLight ? 'text-blue-600' : 'text-blue-400')}>
                          {folder.name}
                        </span>
                        <span className={cn('text-[10px]', isLight ? 'text-gray-500' : 'text-gray-500')}>
                          ({folder.file_count} {folder.file_count === 1 ? 'file' : 'files'}
                          {folder.subfolder_count > 0 && `, ${folder.subfolder_count} ${folder.subfolder_count === 1 ? 'folder' : 'folders'}`})
                        </span>
                      </div>
                    </td>
                    <td className={cn('px-3 py-1.5 text-right', isLight ? 'text-gray-600' : 'text-gray-400')}>—</td>
                    <td className={cn('px-3 py-1.5', isLight ? 'text-gray-600' : 'text-gray-400')}>—</td>
                    {!bulkSelectMode && (
                      <td className="px-3 py-1.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <FolderMoreOptionsButton
                            folder={folder}
                            isLight={isLight}
                            isOpen={openMoreMenuFolderPath === folder.path}
                            onToggle={() => {
                              setOpenMoreMenuFolderPath(prev => prev === folder.path ? null : folder.path);
                              setOpenMoreMenuFileId(null); // Close file menu if open
                            }}
                            onDelete={() => {
                              openFolderDeleteDialog(folder);
                              setOpenMoreMenuFolderPath(null);
                            }}
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}

                {/* Files */}
                {currentFiles.map(file => (
                  <React.Fragment key={file.id}>
                  <tr
                    className={cn(
                      'group border-b transition-colors',
                      isLight ? 'border-gray-100 hover:bg-gray-50' : 'border-gray-700 hover:bg-gray-900/40',
                      )}
                      onClick={() => {
                        if (bulkSelectMode) {
                          toggleFileSelection(file.id);
                        }
                      }}>
                      {bulkSelectMode && (
                        <td className="px-3 py-1.5">
                          <div
                            className={cn(
                              'flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded transition-opacity',
                              selectedFiles.has(file.id)
                                ? 'bg-blue-600/80 opacity-100'
                                : cn('opacity-100 border', isLight ? 'border-gray-400' : 'border-gray-500'),
                            )}
                            onClick={e => {
                              e.stopPropagation();
                              toggleFileSelection(file.id);
                            }}>
                            {selectedFiles.has(file.id) && (
                              <svg
                                className="h-2 w-2 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </td>
                      )}
                    <td className="px-3 py-1.5">
                      {renamingFileId === file.id ? (
                        <div className="flex items-center gap-2">
                            <div className="w-3" /> {/* Spacer for chevron alignment */}
                          {getFileIcon(file.file_name)}
                          <input
                            ref={renameInputRef}
                            type="text"
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                handleSaveRename(file.id);
                              } else if (e.key === 'Escape') {
                                handleCancelRename();
                              }
                            }}
                            onBlur={() => handleSaveRename(file.id)}
                            className={cn(
                              'flex-1 rounded border px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500',
                              isLight ? 'border-gray-300 bg-white text-gray-900' : 'border-gray-600 bg-[#1a1f28] text-white',
                            )}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                            {/* Chevron for preview toggle */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFilePreview(file.id, file);
                              }}
                              className={cn(
                                'flex items-center justify-center rounded p-0.5 transition-all',
                                isLight
                                  ? 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                                  : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300',
                              )}
                              title={expandedFiles.has(file.id) ? 'Hide preview' : 'Show preview'}>
                              <svg
                                className="h-3 w-3 transition-transform"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                strokeWidth={2.5}
                                style={{
                                  transform: expandedFiles.has(file.id) ? 'rotate(90deg)' : 'rotate(0deg)',
                                }}>
                                <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          {getFileIcon(file.file_name)}
                          <span className={cn('font-medium truncate', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')} title={file.file_name}>
                            {file.file_name}
                          </span>
                          <button
                            onClick={() => handleStartRename(file)}
                            disabled={renamingFileId !== null}
                            className={cn(
                              'rounded p-0.5 opacity-0 transition-all group-hover:opacity-100',
                              renamingFileId !== null
                                ? 'cursor-not-allowed'
                                : isLight
                                  ? 'text-gray-400 hover:bg-blue-50 hover:text-blue-600'
                                  : 'text-gray-500 hover:bg-blue-900/20 hover:text-blue-400',
                            )}
                            title="Rename file">
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </td>
                    <td className={cn('px-3 py-1.5 text-right', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      {formatSize(file.file_size)}
                    </td>
                    <td className={cn('px-3 py-1.5', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      {formatDate(file.created_at)}
                    </td>
                    {!bulkSelectMode && (
                    <td className="px-3 py-1.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFilePreview(file.id, file);
                          }}
                          className={cn(
                            'rounded p-1 transition-colors',
                            expandedFiles.has(file.id)
                              ? isLight
                                ? 'text-blue-600'
                                : 'text-blue-400'
                              : isLight
                                ? 'text-gray-400 hover:text-blue-600'
                                : 'text-gray-500 hover:text-blue-400',
                          )}
                          title={expandedFiles.has(file.id) ? 'Hide preview' : 'View file'}>
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                        <FileMoreOptionsButton
                          file={file}
                          isLight={isLight}
                          isOpen={openMoreMenuFileId === file.id}
                          onToggle={() => setOpenMoreMenuFileId(openMoreMenuFileId === file.id ? null : file.id)}
                          onDownload={() => handleDownloadFile(file)}
                          onMove={() => openMoveDialog(file)}
                          onDelete={() => openDeleteDialog(file.id, file.file_name)}
                          disabled={renamingFileId !== null}
                        />
                      </div>
                    </td>
                    )}
                  </tr>
                  {/* File Preview Row */}
                  {expandedFiles.has(file.id) && (
                    <tr
                      key={`${file.id}-preview`}
                      className={cn(
                        'border-b',
                        isLight ? 'border-gray-100 bg-gray-50/50' : 'border-gray-700 bg-gray-900/20',
                      )}>
                      <td 
                        colSpan={bulkSelectMode ? 5 : 4}
                        style={{
                          padding: 0,
                          width: 0,
                          maxWidth: 0,
                        }}>
                        <div
                          className={cn(
                            'ml-3',
                            isLight ? 'bg-gray-50' : 'bg-[#0d1117]',
                          )}
                          style={{
                            maxHeight: '500px',
                            overflowY: 'auto',
                            overflowX: 'hidden',
                            maxWidth: '100%',
                            width: '100%',
                            boxSizing: 'border-box',
                            wordBreak: 'break-word',
                            overflowWrap: 'break-word',
                          }}>
                          {renderFilePreview(file)}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete File Confirmation Dialog */}
      <AdminConfirmDialog
        isOpen={deleteDialogOpen && !!fileToDelete}
        onClose={() => {
          setDeleteDialogOpen(false);
          setFileToDelete(null);
        }}
        onConfirm={confirmDeleteFile}
        title="Delete File"
        message={
          <div className="flex items-start gap-3">
            <div className={cn('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full', isLight ? 'bg-red-100' : 'bg-red-900/30')}>
              <svg className={cn('h-3.5 w-3.5', isLight ? 'text-red-600' : 'text-red-400')} fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className={cn('text-sm font-medium', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
                Delete "{fileToDelete?.name}"?
              </p>
              <p className={cn('mt-1 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                This file will be permanently deleted from your workspace. This action cannot be undone.
              </p>
            </div>
          </div>
        }
        confirmText="Delete File"
        variant="danger"
        isLight={isLight}
        isLoading={deleting}
      />

      {/* Delete Folder Confirmation Dialog */}
      {folderDeleteDialogOpen && folderToDelete && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[10000] backdrop-blur-sm"
            onClick={() => {
              setFolderDeleteDialogOpen(false);
              setFolderToDelete(null);
              setDeleteFilesInFolder(false);
            }}
          />
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 pointer-events-none">
            <div
              className={cn(
                'w-full max-w-md rounded-lg shadow-xl pointer-events-auto',
                isLight ? 'bg-gray-50 border border-gray-200' : 'bg-[#151C24] border border-gray-700'
              )}
              onClick={(e) => e.stopPropagation()}>
              <div className={cn('flex items-center justify-between px-4 py-3 border-b', isLight ? 'border-gray-200' : 'border-gray-700')}>
                <h2 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                  Delete Folder
                </h2>
              </div>
              <div className="px-4 py-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className={cn('flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center', isLight ? 'bg-red-100' : 'bg-red-900/30')}>
                    <svg className={cn('w-4 h-4', isLight ? 'text-red-600' : 'text-red-400')} fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className={cn('text-sm font-medium', isLight ? 'text-gray-900' : 'text-gray-100')}>
                      Delete folder "{folderToDelete.name}"?
                    </p>
                    <p className={cn('text-xs mt-1', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      This folder contains {folderToDelete.fileCount} {folderToDelete.fileCount === 1 ? 'file' : 'files'}.
                    </p>
                  </div>
                </div>
                <div className={cn('rounded p-3', isLight ? 'bg-gray-100' : 'bg-gray-800/50')}>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deleteFilesInFolder}
                      onChange={(e) => setDeleteFilesInFolder(e.target.checked)}
                      className="mt-0.5"
                    />
                    <div>
                      <div className={cn('text-xs font-medium', isLight ? 'text-gray-900' : 'text-gray-100')}>
                        Delete all files in folder
                      </div>
                      <div className={cn('text-[10px] mt-0.5', isLight ? 'text-gray-600' : 'text-gray-400')}>
                        If unchecked, files will be moved to root folder
                      </div>
                    </div>
                  </label>
                </div>
              </div>
              <div className={cn('flex items-center justify-end gap-2 px-4 py-3 border-t', isLight ? 'border-gray-200' : 'border-gray-700')}>
                <button
                  onClick={() => {
                    setFolderDeleteDialogOpen(false);
                    setFolderToDelete(null);
                    setDeleteFilesInFolder(false);
                  }}
                  disabled={deleting}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    deleting ? 'opacity-50 cursor-not-allowed' : '',
                    isLight ? 'bg-gray-200 text-gray-900 hover:bg-gray-300' : 'bg-gray-700 text-gray-100 hover:bg-gray-600'
                  )}>
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteFolder}
                  disabled={deleting}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    deleting ? 'opacity-50 cursor-not-allowed' : '',
                    'bg-red-600 text-white hover:bg-red-700'
                  )}>
                  {deleting ? 'Deleting...' : 'Delete Folder'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Move File Dialog */}
      {moveDialogOpen && fileToMove && (
        <>
          <div
            className="fixed bg-black/50 backdrop-blur-sm"
            style={{ 
              top: 0, 
              left: 0, 
              right: 0, 
              bottom: 0, 
              position: 'fixed',
              zIndex: 100,
              width: '100vw',
              height: '100vh'
            }}
            onClick={() => {
              setMoveDialogOpen(false);
              setFileToMove(null);
              setSelectedMoveFolder(null);
            }}
          />
          <div 
            className="fixed flex items-center justify-center p-4 pointer-events-none" 
            style={{ 
              top: 0, 
              left: 0, 
              right: 0, 
              bottom: 0,
              zIndex: 101,
              overflow: 'visible'
            }}
          >
            <div
              className={cn(
                'w-full max-w-md shadow-xl pointer-events-auto',
                isLight ? 'bg-gray-50 border border-gray-200' : 'bg-[#151C24] border border-gray-700'
              )}
              style={{ 
                overflow: 'visible',
                borderRadius: '0.5rem'
              }}
              onClick={(e) => e.stopPropagation()}>
              <div className={cn('flex items-center justify-between px-4 py-3 border-b', isLight ? 'border-gray-200' : 'border-gray-700')}>
                <h2 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                  Move File
                </h2>
              </div>
              <div className="px-4 py-4 space-y-3" style={{ overflow: 'visible' }}>
                <div className="flex items-start gap-3">
                  <div className={cn('flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center', isLight ? 'bg-blue-100' : 'bg-blue-900/30')}>
                    <svg className={cn('w-4 h-4', isLight ? 'text-blue-600' : 'text-blue-400')} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-3-3l3 3-3 3" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className={cn('text-sm font-medium', isLight ? 'text-gray-900' : 'text-gray-100')}>
                      Move "{fileToMove.name}"?
                    </p>
                    <p className={cn('text-xs mt-1', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      Select a destination folder
                    </p>
                  </div>
                </div>
                <div className={cn('rounded p-3', isLight ? 'bg-gray-100' : 'bg-gray-800/50')}>
                  <label className={cn('text-xs font-medium block mb-2', isLight ? 'text-gray-900' : 'text-gray-100')}>
                    Destination Folder
                  </label>
                  <FolderSelector
                    isLight={isLight}
                    folders={folders.filter(folder => folder.path !== fileToMove.currentFolder)}
                    selectedFolder={selectedMoveFolder}
                    onChange={setSelectedMoveFolder}
                  />
                  {fileToMove.currentFolder && (
                    <p className={cn('text-[10px] mt-1.5', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      Current location: {fileToMove.currentFolder}
                    </p>
                  )}
                </div>
              </div>
              <div className={cn('flex items-center justify-end gap-2 px-4 py-3 border-t', isLight ? 'border-gray-200' : 'border-gray-700')}>
                <button
                  onClick={() => {
                    setMoveDialogOpen(false);
                    setFileToMove(null);
                    setSelectedMoveFolder(null);
                  }}
                  disabled={moving}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    moving ? 'opacity-50 cursor-not-allowed' : '',
                    isLight ? 'bg-gray-200 text-gray-900 hover:bg-gray-300' : 'bg-gray-700 text-gray-100 hover:bg-gray-600'
                  )}>
                  Cancel
                </button>
                <button
                  onClick={confirmMoveFile}
                  disabled={moving}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    moving ? 'opacity-50 cursor-not-allowed' : '',
                    'bg-blue-600 text-white hover:bg-blue-700'
                  )}>
                  {moving ? 'Moving...' : 'Move File'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Bulk Delete Confirmation Dialog */}
      {bulkDeleteDialogOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[10000] backdrop-blur-sm"
            onClick={() => {
              setBulkDeleteDialogOpen(false);
              setDeleteFilesInFolder(false);
            }}
          />
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 pointer-events-none">
            <div
              className={cn(
                'w-full max-w-md rounded-lg shadow-xl pointer-events-auto',
                isLight ? 'bg-gray-50 border border-gray-200' : 'bg-[#151C24] border border-gray-700'
              )}
              onClick={(e) => e.stopPropagation()}>
              <div className={cn('flex items-center justify-between px-4 py-3 border-b', isLight ? 'border-gray-200' : 'border-gray-700')}>
                <h2 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                  Delete Multiple Items
                </h2>
              </div>
              <div className="px-4 py-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className={cn('flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center', isLight ? 'bg-red-100' : 'bg-red-900/30')}>
                    <svg className={cn('w-4 h-4', isLight ? 'text-red-600' : 'text-red-400')} fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className={cn('text-sm font-medium', isLight ? 'text-gray-900' : 'text-gray-100')}>
                      Delete {selectedFiles.size + selectedFolders.size} item(s)?
                    </p>
                    <div className={cn('text-xs mt-1', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      {selectedFiles.size > 0 && <div>• {selectedFiles.size} {selectedFiles.size === 1 ? 'file' : 'files'}</div>}
                      {selectedFolders.size > 0 && <div>• {selectedFolders.size} {selectedFolders.size === 1 ? 'folder' : 'folders'}</div>}
                    </div>
                  </div>
                </div>
                {selectedFolders.size > 0 && (
                  <div className={cn('rounded p-3', isLight ? 'bg-gray-100' : 'bg-gray-800/50')}>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={deleteFilesInFolder}
                        onChange={(e) => setDeleteFilesInFolder(e.target.checked)}
                        className="mt-0.5"
                      />
                      <div>
                        <div className={cn('text-xs font-medium', isLight ? 'text-gray-900' : 'text-gray-100')}>
                          Delete all files in folders
                        </div>
                        <div className={cn('text-[10px] mt-0.5', isLight ? 'text-gray-600' : 'text-gray-400')}>
                          If unchecked, files will be moved to root folder
                        </div>
                      </div>
                    </label>
                  </div>
                )}
              </div>
              <div className={cn('flex items-center justify-end gap-2 px-4 py-3 border-t', isLight ? 'border-gray-200' : 'border-gray-700')}>
                <button
                  onClick={() => {
                    setBulkDeleteDialogOpen(false);
                    setDeleteFilesInFolder(false);
                  }}
                  disabled={deleting}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    deleting ? 'opacity-50 cursor-not-allowed' : '',
                    isLight ? 'bg-gray-200 text-gray-900 hover:bg-gray-300' : 'bg-gray-700 text-gray-100 hover:bg-gray-600'
                  )}>
                  Cancel
                </button>
                <button
                  onClick={confirmBulkDelete}
                  disabled={deleting}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    deleting ? 'opacity-50 cursor-not-allowed' : '',
                    'bg-red-600 text-white hover:bg-red-700'
                  )}>
                  {deleting ? 'Deleting...' : `Delete ${selectedFiles.size + selectedFolders.size} Item(s)`}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Bulk Move Dialog */}
      {bulkMoveDialogOpen && (
        <>
          <div
            className="fixed bg-black/50 backdrop-blur-sm"
            style={{ 
              top: 0, 
              left: 0, 
              right: 0, 
              bottom: 0, 
              position: 'fixed',
              zIndex: 100,
              width: '100vw',
              height: '100vh'
            }}
            onClick={() => {
              setBulkMoveDialogOpen(false);
              setBulkMoveDestFolder(null);
            }}
          />
          <div 
            className="fixed flex items-center justify-center p-4 pointer-events-none" 
            style={{ 
              top: 0, 
              left: 0, 
              right: 0, 
              bottom: 0,
              zIndex: 101,
              overflow: 'visible'
            }}
          >
            <div
              className={cn(
                'w-full max-w-md shadow-xl pointer-events-auto',
                isLight ? 'bg-gray-50 border border-gray-200' : 'bg-[#151C24] border border-gray-700'
              )}
              style={{ 
                overflow: 'visible',
                borderRadius: '0.5rem'
              }}
              onClick={(e) => e.stopPropagation()}>
              <div className={cn('flex items-center justify-between px-4 py-3 border-b', isLight ? 'border-gray-200' : 'border-gray-700')}>
                <h2 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                  Move Items
                </h2>
              </div>
              <div className="px-4 py-4 space-y-3" style={{ overflow: 'visible' }}>
                <div className="flex items-start gap-3">
                  <div className={cn('flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center', isLight ? 'bg-blue-100' : 'bg-blue-900/30')}>
                    <svg className={cn('w-4 h-4', isLight ? 'text-blue-600' : 'text-blue-400')} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-3-3l3 3-3 3" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className={cn('text-sm font-medium', isLight ? 'text-gray-900' : 'text-gray-100')}>
                      Move {selectedFiles.size + selectedFolders.size} item(s)?
                    </p>
                    <p className={cn('text-xs mt-1', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      {selectedFiles.size > 0 && `${selectedFiles.size} file(s)`}
                      {selectedFiles.size > 0 && selectedFolders.size > 0 && ' and '}
                      {selectedFolders.size > 0 && `${selectedFolders.size} folder(s)`}
                    </p>
                  </div>
                </div>
                <div className={cn('rounded p-3', isLight ? 'bg-gray-100' : 'bg-gray-800/50')}>
                  <label className={cn('text-xs font-medium block mb-2', isLight ? 'text-gray-900' : 'text-gray-100')}>
                    Destination Folder
                  </label>
                  <FolderSelector
                    isLight={isLight}
                    folders={folders}
                    selectedFolder={bulkMoveDestFolder}
                    onChange={setBulkMoveDestFolder}
                  />
                </div>
                {selectedFolders.size > 0 && (
                  <div className={cn('text-xs p-2 rounded', isLight ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' : 'bg-yellow-900/20 text-yellow-400 border border-yellow-700')}>
                    Note: Moving folders is not yet supported. Only files will be moved.
                  </div>
                )}
              </div>
              <div className={cn('flex items-center justify-end gap-2 px-4 py-3 border-t', isLight ? 'border-gray-200' : 'border-gray-700')}>
                <button
                  onClick={() => {
                    setBulkMoveDialogOpen(false);
                    setBulkMoveDestFolder(null);
                  }}
                  disabled={moving}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    moving ? 'opacity-50 cursor-not-allowed' : '',
                    isLight ? 'bg-gray-200 text-gray-900 hover:bg-gray-300' : 'bg-gray-700 text-gray-100 hover:bg-gray-600'
                  )}>
                  Cancel
                </button>
                <button
                  onClick={confirmBulkMove}
                  disabled={moving || selectedFiles.size === 0}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    moving || selectedFiles.size === 0 ? 'opacity-50 cursor-not-allowed' : '',
                    'bg-blue-600 text-white hover:bg-blue-700'
                  )}>
                  {moving ? 'Moving...' : 'Move Items'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

