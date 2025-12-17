import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@extension/ui';
import { ref as fbRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../context/AuthContext';
import { ensureFirebase, ensureFirebaseAuth } from '../../utils/firebaseStorage';
import { COPIOLITKIT_CONFIG } from '../../constants';

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
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(['uploads', 'chat', 'screenshots', 'generated', 'other']));
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const dragCounterRef = React.useRef(0);

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
          (snapshot) => {
            // Progress tracking (optional)
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log('[Workspace] Upload progress:', progress);
          },
          (error) => {
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
          }
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

  const handleDelete = async (fileId: string, fileName: string) => {
    if (!confirm(`Delete "${fileName}"?`)) return;

    try {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/workspace/files/${fileId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Delete failed');
      }

      await loadFiles();
      // Refresh workspace stats after successful deletion
      onStatsChange?.();
    } catch (error) {
      console.error('[Workspace] Delete error:', error);
      alert('Failed to delete file');
    }
  };

  const formatSize = (bytes: number) => {
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className={cn('text-center py-8 text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>Loading files...</div>
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
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'go', 'rs', 'rb', 'php', 'html', 'css', 'scss'].includes(ext || '')) {
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
          'rounded-lg border overflow-hidden relative',
          isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700'
        )}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag Overlay */}
        {isDragging && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center rounded-lg pointer-events-none"
            style={{
              border: isLight ? '2px dashed rgba(59,130,246,0.5)' : '2px dashed rgba(255,255,255,0.25)',
              background: isLight ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.06)',
            }}
          >
            <div className="text-center">
              <svg className={cn('w-12 h-12 mx-auto mb-2', isLight ? 'text-blue-500/90' : 'text-blue-400/90')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className={cn('text-sm font-medium', isLight ? 'text-blue-700/90' : 'text-blue-300/90')}>
                Drop file to upload
              </p>
            </div>
          </div>
        )}

        <div
          className={cn(
            'border-b px-4 py-2 flex items-center justify-between',
            isLight ? 'border-gray-200' : 'border-gray-700'
          )}>
          <h3 className={cn('text-sm font-semibold', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
            All Files
          </h3>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={cn(
              'flex items-center gap-1.5 px-1.5 py-1 text-xs font-medium rounded transition-colors',
              uploading
                ? 'opacity-50 cursor-not-allowed'
                : isLight
                  ? 'text-blue-600 hover:bg-blue-50'
                  : 'text-blue-300 hover:bg-blue-900/20'
            )}
            title="Upload file">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            {uploading ? 'UPLOADING...' : 'UPLOAD'}
          </button>
        </div>
        {files.length === 0 ? (
          <div className={cn('px-4 py-8 text-center text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
            No files yet. Upload your first file or attach files in chat.
          </div>
        ) : (
          <div className="w-full overflow-x-auto overflow-y-auto max-h-[600px]">
            <div className="min-w-full">
              {Object.entries(groupFilesBySource()).map(([source, sourceFiles]) => {
                if (sourceFiles.length === 0) return null;
                
                const isExpanded = expandedTypes.has(source);
                
                return (
                  <div key={source} className="min-w-full">
                    {/* Accordion Header */}
                    <button
                      onClick={() => toggleType(source)}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 text-xs font-medium transition-colors border-b min-w-full',
                        isLight
                          ? 'hover:bg-gray-50 border-gray-200'
                          : 'hover:bg-gray-900/40 border-gray-700'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <svg
                          className={cn(
                            'w-3.5 h-3.5 transition-transform flex-shrink-0',
                            isLight ? 'text-gray-400' : 'text-gray-500',
                            isExpanded && 'rotate-90'
                          )}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className={cn('whitespace-nowrap', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
                          {getSourceLabel(source)}
                        </span>
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0',
                            isLight ? 'bg-gray-100 text-gray-600' : 'bg-gray-800 text-gray-400'
                          )}
                        >
                          {sourceFiles.length}
                        </span>
                      </div>
                    </button>

                    {/* Accordion Content - Table */}
                    {isExpanded && (
                      <div className="w-full overflow-x-auto">
                        <table className="w-full border-collapse text-xs" style={{ minWidth: '100%' }}>
                          <thead className={cn('sticky top-0 z-10', isLight ? 'bg-gray-50' : 'bg-[#151C24]')}>
                            <tr className={cn('border-b', isLight ? 'border-gray-200' : 'border-gray-700')}>
                              <th className={cn('px-3 py-1.5 text-left text-xs font-semibold whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-300')}>File Name</th>
                              <th className={cn('px-3 py-1.5 text-left text-xs font-semibold whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-300')}>Type</th>
                              <th className={cn('px-3 py-1.5 text-right text-xs font-semibold whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-300')}>Size</th>
                              <th className={cn('px-3 py-1.5 text-left text-xs font-semibold whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-300')}>Created</th>
                              <th className={cn('px-3 py-1.5 text-right text-xs font-semibold whitespace-nowrap w-24', isLight ? 'text-gray-600' : 'text-gray-300')}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sourceFiles.map(file => (
                              <tr
                                key={file.id}
                                className={cn(
                                  'transition-colors border-b',
                                  isLight ? 'border-gray-100 hover:bg-gray-50' : 'border-gray-700 hover:bg-gray-900/40'
                                )}
                              >
                                <td className={cn('px-3 py-1.5')}>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="flex-shrink-0">{getFileIcon(file.file_name)}</div>
                                    <span className={cn('font-medium truncate', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')} title={file.file_name}>
                                      {file.file_name}
                                    </span>
                                  </div>
                                </td>
                                <td className={cn('px-3 py-1.5 whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-400')}>
                                  <span className={cn('text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                                    {getFileTypeCategory(file.file_name)}
                                  </span>
                                </td>
                                <td className={cn('px-3 py-1.5 text-right whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-400')}>
                                  {formatSize(file.file_size)}
                                </td>
                                <td className={cn('px-3 py-1.5 whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-400')}>
                                  {formatDate(file.created_at)}
                                </td>
                                <td className="px-3 py-1.5 text-right">
                                  <div className="flex items-center justify-end gap-1 flex-shrink-0">
                                <a
                                  href={file.storage_url}
                                  download={file.file_name}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={cn(
                                    'p-1 rounded transition-colors',
                                    isLight ? 'text-gray-400 hover:text-blue-600' : 'text-gray-500 hover:text-blue-400'
                                  )}
                                  title="Download file">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                </a>
                                <button
                                  onClick={() => handleDelete(file.id, file.file_name)}
                                  className={cn(
                                    'p-1 rounded transition-colors',
                                    isLight ? 'text-gray-400 hover:text-red-600' : 'text-gray-500 hover:text-red-400'
                                  )}
                                  title="Delete file">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                    </button>
                                  </div>
                                </td>
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
    </div>
  );
};

