import { COPIOLITKIT_CONFIG } from '../../constants';
import { useAuth } from '../../context/AuthContext';
import { ensureFirebase, ensureFirebaseAuth } from '../../utils/firebaseStorage';
import { AdminConfirmDialog } from '../admin/modals/AdminConfirmDialog';
import { cn } from '@extension/ui';
import { ref as fbRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import React, { useState, useEffect, useCallback } from 'react';

interface WorkspaceFile {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_url: string;
  folder: string;
  tags: string[];
  description: string;
  created_at: string;
}

export const FilesPanel: React.FC<{ isLight: boolean; onStatsChange?: () => void }> = ({ isLight, onStatsChange }) => {
  const { user } = useAuth();
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(
    new Set(['uploads', 'chat', 'screenshots', 'generated', 'other']),
  );
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const dragCounterRef = React.useRef(0);

  // Bulk delete state
  const [deleteMode, setDeleteMode] = useState<Record<string, boolean>>({
    uploads: false,
    chat: false,
    screenshots: false,
    generated: false,
    other: false,
  });
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<{ id: string; name: string } | null>(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkDeleteSource, setBulkDeleteSource] = useState<string | null>(null);

  // Rename state
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = React.useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    try {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
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

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const uploadFile = async (file: File) => {
    setUploading(true);

    try {
      // Check if Firebase is configured
      if (!COPIOLITKIT_CONFIG.ENABLE_FIREBASE_UPLOADS || !COPIOLITKIT_CONFIG.FIREBASE?.storageBucket) {
        throw new Error('Firebase Storage not configured');
      }

      // Ensure Firebase authentication
      await ensureFirebaseAuth(COPIOLITKIT_CONFIG.FIREBASE as any);

      // Upload to Firebase Storage
      const storage = ensureFirebase(COPIOLITKIT_CONFIG.FIREBASE as any);
      const userId = user?.id || 'anonymous';
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `workspace/${userId}/uploads/${timestamp}-${safeName}`;
      const storageRef = fbRef(storage as any, storagePath);

      // Upload file
      const uploadTask = uploadBytesResumable(storageRef as any, file);

      await new Promise<string>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          snapshot => {
            // Progress tracking (optional)
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

      // Get the download URL
      const storageUrl = await getDownloadURL(uploadTask.snapshot.ref);

      // Register file with backend
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
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
          folder: 'uploads',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to register file');
      }

      await loadFiles();
      // Refresh workspace stats after successful upload
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
      // Reset file input
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

  const openDeleteDialog = (fileId: string, fileName: string) => {
    setFileToDelete({ id: fileId, name: fileName });
    setDeleteDialogOpen(true);
  };

  const confirmDeleteFile = async () => {
    if (!fileToDelete) return;

    setDeleting(true);
    try {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/workspace/files/${fileToDelete.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Delete failed');
      }

      await loadFiles();
      // Refresh workspace stats after successful deletion
      onStatsChange?.();
      setDeleteDialogOpen(false);
      setFileToDelete(null);
    } catch (error) {
      console.error('[Workspace] Delete error:', error);
      alert('Failed to delete file');
    } finally {
      setDeleting(false);
    }
  };

  const toggleDeleteMode = (source: string) => {
    const isCurrentlyDeleting = deleteMode[source];

    setDeleteMode(prev => {
      const next = { ...prev };
      next[source] = !isCurrentlyDeleting;
      return next;
    });

    // Clear selections when exiting delete mode
    if (isCurrentlyDeleting) {
      const sourceFiles = groupFilesBySource()[source] || [];
      setSelectedFiles(prev => {
        const next = new Set(prev);
        sourceFiles.forEach(file => next.delete(file.id));
        return next;
      });
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

  const toggleSelectAll = (source: string) => {
    const sourceFiles = groupFilesBySource()[source] || [];
    const allSelected = sourceFiles.every(file => selectedFiles.has(file.id));

    setSelectedFiles(prev => {
      const next = new Set(prev);
      sourceFiles.forEach(file => {
        if (allSelected) {
          next.delete(file.id);
        } else {
          next.add(file.id);
        }
      });
      return next;
    });
  };

  const openBulkDeleteDialog = (source: string) => {
    const sourceFiles = groupFilesBySource()[source] || [];
    const selectedInSource = sourceFiles.filter(file => selectedFiles.has(file.id));

    if (selectedInSource.length === 0) return;

    setBulkDeleteSource(source);
    setBulkDeleteDialogOpen(true);
  };

  const confirmBulkDelete = async () => {
    if (!bulkDeleteSource) return;

    const sourceFiles = groupFilesBySource()[bulkDeleteSource] || [];
    const selectedInSource = sourceFiles.filter(file => selectedFiles.has(file.id));

    setDeleting(true);
    try {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/workspace/files/bulk`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileIds: selectedInSource.map(f => f.id),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Bulk delete failed');
      }

      await loadFiles();
      onStatsChange?.();

      // Clear selections and exit delete mode
      setSelectedFiles(new Set());
      setDeleteMode(prev => ({ ...prev, [bulkDeleteSource]: false }));
      setBulkDeleteDialogOpen(false);
      setBulkDeleteSource(null);
    } catch (error) {
      console.error('[Workspace] Bulk delete error:', error);
      alert('Failed to delete files: ' + (error as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const handleStartRename = (file: WorkspaceFile) => {
    setRenamingFileId(file.id);
    setRenameValue(file.file_name);
    // Focus will happen after render via useEffect
  };

  const handleCancelRename = () => {
    setRenamingFileId(null);
    setRenameValue('');
  };

  const handleSaveRename = async (fileId: string) => {
    if (!renameValue.trim() || renameValue === files.find(f => f.id === fileId)?.file_name) {
      handleCancelRename();
      return;
    }

    try {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
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

  // Focus rename input when it appears
  React.useEffect(() => {
    if (renamingFileId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingFileId]);

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

  const getFileSource = (file: WorkspaceFile): string => {
    const folder = file.folder?.toLowerCase() || '';

    if (folder === 'chat-uploads') {
      return 'chat';
    }
    if (folder === 'uploads') {
      return 'uploads';
    }
    if (folder === 'screenshots') {
      return 'screenshots';
    }
    if (folder === 'generated') {
      return 'generated';
    }
    return 'other';
  };

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
    if (
      [
        'js',
        'ts',
        'jsx',
        'tsx',
        'py',
        'java',
        'cpp',
        'c',
        'cs',
        'go',
        'rs',
        'rb',
        'php',
        'html',
        'css',
        'scss',
      ].includes(ext || '')
    ) {
      return 'Code';
    }
    return 'File';
  };

  const getSourceLabel = (source: string): string => {
    const labels: Record<string, string> = {
      uploads: 'Uploads',
      chat: 'Chat Attachments',
      screenshots: 'Screenshots',
      generated: 'AI Generated',
      other: 'Other Files',
    };
    return labels[source] || 'Other Files';
  };

  const toggleType = (type: string) => {
    setExpandedTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  };

  const groupFilesBySource = () => {
    const grouped: Record<string, WorkspaceFile[]> = {
      uploads: [],
      chat: [],
      screenshots: [],
      generated: [],
      other: [],
    };

    files.forEach(file => {
      const source = getFileSource(file);
      grouped[source].push(file);
    });

    return grouped;
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const iconClass = cn('w-4 h-4', isLight ? 'text-gray-400' : 'text-gray-500');

    // Document icons
    if (['pdf'].includes(ext || '')) {
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        </svg>
      );
    }
    if (['doc', 'docx', 'txt', 'md'].includes(ext || '')) {
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      );
    }
    // Image icons
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext || '')) {
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      );
    }
    // Spreadsheet icons
    if (['xls', 'xlsx', 'csv'].includes(ext || '')) {
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      );
    }
    // Default file icon
    return (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      </svg>
    );
  };

  return (
    <div className="space-y-4">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileUpload}
        disabled={uploading}
        accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
      />

      {/* Files List with Accordions and Drag-Drop */}
      <div
        className={cn(
          'relative overflow-hidden rounded-lg border',
          isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-[#151C24]',
        )}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}>
        {/* Drag Overlay */}
        {isDragging && (
          <div
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg"
            style={{
              border: isLight ? '2px dashed rgba(59,130,246,0.5)' : '2px dashed rgba(255,255,255,0.25)',
              background: isLight ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.06)',
            }}>
            <div className="text-center">
              <svg
                className={cn('mx-auto mb-2 h-12 w-12', isLight ? 'text-blue-500/90' : 'text-blue-400/90')}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className={cn('text-sm font-medium', isLight ? 'text-blue-700/90' : 'text-blue-300/90')}>
                Drop file to upload
              </p>
            </div>
          </div>
        )}

        <div
          className={cn(
            'flex items-center justify-between border-b px-4 py-2',
            isLight ? 'border-gray-200' : 'border-gray-700',
          )}>
          <h3 className={cn('text-sm font-semibold', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>All Files</h3>
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            {uploading ? 'UPLOADING...' : 'UPLOAD'}
          </button>
        </div>
        {files.length === 0 ? (
          <div className={cn('px-4 py-8 text-center text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
            No files yet. Upload your first file or attach files in chat.
          </div>
        ) : (
          <div className="max-h-[600px] w-full overflow-x-auto overflow-y-auto">
            <div className="min-w-full">
              {Object.entries(groupFilesBySource()).map(([source, sourceFiles]) => {
                if (sourceFiles.length === 0) return null;

                const isExpanded = expandedTypes.has(source);

                return (
                  <div key={source} className="min-w-full">
                    {/* Accordion Header */}
                    <div
                      className={cn(
                        'flex w-full min-w-full items-center justify-between border-b px-3 py-2 text-xs font-medium',
                        isLight ? 'border-gray-200' : 'border-gray-700',
                      )}>
                      <button
                        onClick={() => toggleType(source)}
                        className={cn(
                          'flex items-center gap-2 transition-colors',
                          isLight ? 'hover:text-gray-900' : 'hover:text-white',
                        )}>
                        <svg
                          className={cn(
                            'h-3.5 w-3.5 flex-shrink-0 transition-transform',
                            isLight ? 'text-gray-400' : 'text-gray-500',
                            isExpanded && 'rotate-90',
                          )}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className={cn('whitespace-nowrap', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
                          {getSourceLabel(source)}
                        </span>
                        <span
                          className={cn(
                            'flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                            isLight ? 'bg-gray-100 text-gray-600' : 'bg-gray-800 text-gray-400',
                          )}>
                          {sourceFiles.length}
                        </span>
                      </button>
                      {isExpanded && (
                        <button
                          onClick={() => toggleDeleteMode(source)}
                          className={cn(
                            'rounded p-1.5 transition-colors',
                            deleteMode[source]
                              ? isLight
                                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                : 'bg-red-900/30 text-red-400 hover:bg-red-900/50'
                              : isLight
                                ? 'text-gray-600 hover:bg-gray-100'
                                : 'text-gray-400 hover:bg-gray-800',
                          )}
                          title={deleteMode[source] ? 'Cancel delete mode' : 'Enter delete mode'}>
                          {deleteMode[source] ? (
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          ) : (
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              strokeWidth={2}>
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Accordion Content - Table */}
                    {isExpanded && (
                      <div className="w-full overflow-x-auto">
                        {deleteMode[source] && (
                          <div
                            className={cn(
                              'flex items-center justify-between border-b px-3 py-2',
                              isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#0d1117]',
                            )}>
                            <div className="flex items-center gap-3">
                              <div
                                className="flex cursor-pointer items-center gap-2"
                                onClick={() => toggleSelectAll(source)}>
                                <div
                                  className={cn(
                                    'flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border transition-opacity',
                                    sourceFiles.every(file => selectedFiles.has(file.id)) && sourceFiles.length > 0
                                      ? 'border-blue-600/60 bg-blue-600/60 opacity-100'
                                      : cn('opacity-100', isLight ? 'border-gray-400' : 'border-gray-500'),
                                  )}>
                                  {sourceFiles.every(file => selectedFiles.has(file.id)) && sourceFiles.length > 0 && (
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
                                <span
                                  className={cn('text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                                  Select All
                                </span>
                              </div>
                              <span className={cn('text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                                {sourceFiles.filter(f => selectedFiles.has(f.id)).length} selected
                              </span>
                            </div>
                            <button
                              onClick={() => openBulkDeleteDialog(source)}
                              disabled={deleting || sourceFiles.filter(f => selectedFiles.has(f.id)).length === 0}
                              className={cn(
                                'rounded px-3 py-1 text-xs font-medium transition-colors',
                                deleting || sourceFiles.filter(f => selectedFiles.has(f.id)).length === 0
                                  ? 'cursor-not-allowed opacity-50'
                                  : '',
                                isLight
                                  ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-700'
                                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200',
                              )}>
                              {deleting ? 'Deleting...' : 'Delete Selected'}
                            </button>
                          </div>
                        )}
                        <table className="w-full border-collapse text-xs" style={{ minWidth: '100%' }}>
                          <thead className={cn('sticky top-0 z-10', isLight ? 'bg-gray-50' : 'bg-[#151C24]')}>
                            <tr className={cn('border-b', isLight ? 'border-gray-200' : 'border-gray-700')}>
                              {deleteMode[source] && (
                                <th className={cn('w-8 px-3 py-1.5', isLight ? 'text-gray-600' : 'text-gray-300')}></th>
                              )}
                              <th
                                className={cn(
                                  'px-3 py-1.5 text-left text-xs font-semibold whitespace-nowrap',
                                  isLight ? 'text-gray-600' : 'text-gray-300',
                                )}>
                                File Name
                              </th>
                              <th
                                className={cn(
                                  'px-3 py-1.5 text-left text-xs font-semibold whitespace-nowrap',
                                  isLight ? 'text-gray-600' : 'text-gray-300',
                                )}>
                                Type
                              </th>
                              <th
                                className={cn(
                                  'px-3 py-1.5 text-right text-xs font-semibold whitespace-nowrap',
                                  isLight ? 'text-gray-600' : 'text-gray-300',
                                )}>
                                Size
                              </th>
                              <th
                                className={cn(
                                  'px-3 py-1.5 text-left text-xs font-semibold whitespace-nowrap',
                                  isLight ? 'text-gray-600' : 'text-gray-300',
                                )}>
                                Created
                              </th>
                              {!deleteMode[source] && (
                                <th
                                  className={cn(
                                    'w-24 px-3 py-1.5 text-right text-xs font-semibold whitespace-nowrap',
                                    isLight ? 'text-gray-600' : 'text-gray-300',
                                  )}>
                                  Actions
                                </th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {sourceFiles.map(file => (
                              <tr
                                key={file.id}
                                className={cn(
                                  'group border-b transition-colors',
                                  isLight ? 'border-gray-100 hover:bg-gray-50' : 'border-gray-700 hover:bg-gray-900/40',
                                )}>
                                {deleteMode[source] && (
                                  <td className="px-3 py-1.5">
                                    <div
                                      className={cn(
                                        'flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border transition-opacity',
                                        selectedFiles.has(file.id)
                                          ? 'border-blue-600/60 bg-blue-600/60 opacity-100'
                                          : cn('opacity-100', isLight ? 'border-gray-400' : 'border-gray-500'),
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
                                <td className={cn('px-3 py-1.5')}>
                                  {renamingFileId === file.id ? (
                                    <div className="flex min-w-0 items-center gap-2">
                                      <div className="flex-shrink-0">{getFileIcon(file.file_name)}</div>
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
                                          isLight
                                            ? 'border-gray-300 bg-white text-gray-900'
                                            : 'border-gray-600 bg-[#1a1f28] text-white',
                                        )}
                                      />
                                    </div>
                                  ) : (
                                    <div className="flex min-w-0 items-center gap-1">
                                      <div className="flex-shrink-0">{getFileIcon(file.file_name)}</div>
                                      <span
                                        className={cn(
                                          'truncate font-medium',
                                          isLight ? 'text-gray-700' : 'text-[#bcc1c7]',
                                        )}
                                        title={file.file_name}>
                                        {file.file_name}
                                      </span>
                                      <button
                                        onClick={() => handleStartRename(file)}
                                        disabled={renamingFileId !== null}
                                        className={cn(
                                          'flex-shrink-0 rounded p-0.5 opacity-0 transition-all group-hover:opacity-100',
                                          renamingFileId !== null
                                            ? 'cursor-not-allowed'
                                            : isLight
                                              ? 'text-gray-400 hover:bg-blue-50 hover:text-blue-600'
                                              : 'text-gray-500 hover:bg-blue-900/20 hover:text-blue-400',
                                        )}
                                        title="Rename file">
                                        <svg
                                          className="h-3 w-3"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                          strokeWidth={2}>
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                          />
                                        </svg>
                                      </button>
                                    </div>
                                  )}
                                </td>
                                <td
                                  className={cn(
                                    'px-3 py-1.5 whitespace-nowrap',
                                    isLight ? 'text-gray-600' : 'text-gray-400',
                                  )}>
                                  <span className={cn('text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                                    {getFileTypeCategory(file.file_name)}
                                  </span>
                                </td>
                                <td
                                  className={cn(
                                    'px-3 py-1.5 text-right whitespace-nowrap',
                                    isLight ? 'text-gray-600' : 'text-gray-400',
                                  )}>
                                  {formatSize(file.file_size)}
                                </td>
                                <td
                                  className={cn(
                                    'px-3 py-1.5 whitespace-nowrap',
                                    isLight ? 'text-gray-600' : 'text-gray-400',
                                  )}>
                                  {formatDate(file.created_at)}
                                </td>
                                {!deleteMode[source] && (
                                  <td className="px-3 py-1.5 text-right">
                                    <div className="flex flex-shrink-0 items-center justify-end gap-1">
                                      <a
                                        href={file.storage_url}
                                        download={file.file_name}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={cn(
                                          'rounded p-1 transition-colors',
                                          isLight
                                            ? 'text-gray-400 hover:text-blue-600'
                                            : 'text-gray-500 hover:text-blue-400',
                                        )}
                                        title="Download file">
                                        <svg
                                          className="h-3.5 w-3.5"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                          strokeWidth={2}>
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                          />
                                        </svg>
                                      </a>
                                      <button
                                        onClick={() => openDeleteDialog(file.id, file.file_name)}
                                        disabled={renamingFileId !== null}
                                        className={cn(
                                          'rounded p-1 transition-colors',
                                          renamingFileId !== null
                                            ? 'cursor-not-allowed opacity-50'
                                            : isLight
                                              ? 'text-gray-400 hover:text-red-600'
                                              : 'text-gray-500 hover:text-red-400',
                                        )}
                                        title="Delete file">
                                        <svg
                                          className="h-3.5 w-3.5"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                          strokeWidth={2}>
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                          />
                                        </svg>
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Single File Delete Confirmation Modal */}
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
            <div
              className={cn(
                'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full',
                isLight ? 'bg-red-100' : 'bg-red-900/30',
              )}>
              <svg
                className={cn('h-3.5 w-3.5', isLight ? 'text-red-600' : 'text-red-400')}
                fill="currentColor"
                viewBox="0 0 24 24">
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

      {/* Bulk Delete Confirmation Modal */}
      <AdminConfirmDialog
        isOpen={bulkDeleteDialogOpen && !!bulkDeleteSource}
        onClose={() => {
          setBulkDeleteDialogOpen(false);
          setBulkDeleteSource(null);
        }}
        onConfirm={confirmBulkDelete}
        title="Delete Multiple Files"
        message={
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full',
                isLight ? 'bg-red-100' : 'bg-red-900/30',
              )}>
              <svg
                className={cn('h-3.5 w-3.5', isLight ? 'text-red-600' : 'text-red-400')}
                fill="currentColor"
                viewBox="0 0 24 24">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className={cn('text-sm font-medium', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
                Delete{' '}
                {bulkDeleteSource &&
                  groupFilesBySource()[bulkDeleteSource]?.filter(f => selectedFiles.has(f.id)).length}{' '}
                file(s)?
              </p>
              <p className={cn('mt-1 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                These files will be permanently deleted from your workspace. This action cannot be undone.
              </p>
            </div>
          </div>
        }
        confirmText="Delete Files"
        variant="danger"
        isLight={isLight}
        isLoading={deleting}
      />
    </div>
  );
};
