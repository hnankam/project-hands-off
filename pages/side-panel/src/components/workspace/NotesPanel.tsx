import { RichTextEditor } from '../admin/editors/RichTextEditor';
import { AdminConfirmDialog } from '../admin/modals/AdminConfirmDialog';
import { CustomMarkdownRenderer } from '../chat/CustomMarkdownRenderer';
import { cn } from '@extension/ui';
import React, { useState, useEffect, useCallback } from 'react';

interface WorkspaceNote {
  id: string;
  title: string;
  preview?: string;
  content?: string;
  folder: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export const NotesPanel: React.FC<{ isLight: boolean; onStatsChange?: () => void }> = ({ isLight, onStatsChange }) => {
  const [notes, setNotes] = useState<WorkspaceNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingNote, setEditingNote] = useState<WorkspaceNote | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedNoteIds, setExpandedNoteIds] = useState<Set<string>>(new Set());
  const [noteContents, setNoteContents] = useState<Record<string, string>>({});

  // Bulk delete state
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<{ id: string; title: string } | null>(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

  const loadNotes = useCallback(async () => {
    try {
      const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/workspace/notes`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setNotes(data.notes);
      }
    } catch (error) {
      console.error('[Workspace] Failed to load notes:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handleCreate = () => {
    setEditingNote(null);
    setTitle('');
    setContent('');
    setShowEditor(true);
  };

  const handleEdit = async (note: WorkspaceNote) => {
    // Fetch full note content
    try {
      const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/workspace/notes/${note.id}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setEditingNote(data.note);
        setTitle(data.note.title);
        setContent(data.note.content);
        setShowEditor(true);
      }
    } catch (error) {
      console.error('[Workspace] Failed to load note:', error);
      alert('Failed to load note');
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      alert('Title and content are required');
      return;
    }

    setSaving(true);

    try {
      const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';
      const url = editingNote ? `${baseURL}/api/workspace/notes/${editingNote.id}` : `${baseURL}/api/workspace/notes`;

      const response = await fetch(url, {
        method: editingNote ? 'PUT' : 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          content,
          folder: 'root',
          tags: [],
        }),
      });

      if (!response.ok) {
        throw new Error('Save failed');
      }

      await loadNotes();
      // Refresh workspace stats after successful save
      onStatsChange?.();
      setShowEditor(false);
      setTitle('');
      setContent('');
      setEditingNote(null);
    } catch (error) {
      console.error('[Workspace] Save error:', error);
      alert('Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  const openDeleteDialog = (noteId: string, noteTitle: string) => {
    setNoteToDelete({ id: noteId, title: noteTitle });
    setDeleteDialogOpen(true);
  };

  const confirmDeleteNote = async () => {
    if (!noteToDelete) return;

    setDeleting(true);
    try {
      const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/workspace/notes/${noteToDelete.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Delete failed');
      }

      await loadNotes();
      // Refresh workspace stats after successful deletion
      onStatsChange?.();
      setDeleteDialogOpen(false);
      setNoteToDelete(null);
    } catch (error) {
      console.error('[Workspace] Delete error:', error);
      alert('Failed to delete note');
    } finally {
      setDeleting(false);
    }
  };

  const toggleDeleteMode = () => {
    setDeleteMode(prev => !prev);
    // Clear selections when exiting delete mode
    if (deleteMode) {
      setSelectedNotes(new Set());
    }
  };

  const toggleNoteSelection = (noteId: string) => {
    setSelectedNotes(prev => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allSelected = notes.every(note => selectedNotes.has(note.id));

    setSelectedNotes(prev => {
      const next = new Set(prev);
      notes.forEach(note => {
        if (allSelected) {
          next.delete(note.id);
        } else {
          next.add(note.id);
        }
      });
      return next;
    });
  };

  const openBulkDeleteDialog = () => {
    if (selectedNotes.size === 0) return;
    setBulkDeleteDialogOpen(true);
  };

  const confirmBulkDelete = async () => {
    if (selectedNotes.size === 0) return;

    setDeleting(true);
    try {
      const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/workspace/notes/bulk`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          noteIds: Array.from(selectedNotes),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Bulk delete failed');
      }

      await loadNotes();
      onStatsChange?.();

      // Clear selections and exit delete mode
      setSelectedNotes(new Set());
      setDeleteMode(false);
      setBulkDeleteDialogOpen(false);
    } catch (error) {
      console.error('[Workspace] Bulk delete error:', error);
      alert('Failed to delete notes: ' + (error as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const handleToggleExpand = async (noteId: string) => {
    setExpandedNoteIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(noteId)) {
        newSet.delete(noteId);
      } else {
        newSet.add(noteId);
        // Fetch full note content if not already loaded
        if (!noteContents[noteId]) {
          fetchNoteContent(noteId);
        }
      }
      return newSet;
    });
  };

  const fetchNoteContent = async (noteId: string) => {
    try {
      const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/workspace/notes/${noteId}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setNoteContents(prev => ({
          ...prev,
          [noteId]: data.note.content || '',
        }));
      }
    } catch (error) {
      console.error('[Workspace] Failed to load note content:', error);
    }
  };

  if (loading) {
    return (
      <div className={cn('py-8 text-center text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>
        Loading notes...
      </div>
    );
  }

  if (showEditor) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className={cn('text-lg font-semibold', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
            {editingNote ? 'Edit Note' : 'New Note'}
          </h3>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            placeholder="Note title..."
            value={title}
            onChange={e => setTitle(e.target.value)}
            className={cn(
              'w-full rounded border px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500',
              isLight
                ? 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'
                : 'border-gray-600 bg-[#151C24] text-white placeholder-gray-500',
            )}
          />
          <RichTextEditor
            value={content}
            onChange={setContent}
            placeholder="Write your note content..."
            isLight={isLight}
            minHeight="200px"
            maxHeight="500px"
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              'rounded px-4 py-1.5 text-xs font-medium transition-colors',
              saving
                ? 'cursor-not-allowed bg-gray-400 text-gray-200'
                : isLight
                  ? 'bg-blue-500/90 text-white hover:bg-blue-500'
                  : 'bg-blue-600/90 text-white hover:bg-blue-600',
            )}>
            {saving ? 'Saving...' : 'Save Note'}
          </button>
          <button
            onClick={() => {
              setShowEditor(false);
              setTitle('');
              setContent('');
              setEditingNote(null);
            }}
            className={cn(
              'rounded px-4 py-1.5 text-xs font-medium transition-colors',
              isLight ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-gray-700 text-gray-200 hover:bg-gray-600',
            )}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Notes Table */}
      <div
        className={cn(
          'overflow-hidden rounded-lg border',
          isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-[#151C24]',
        )}>
        <div
          className={cn(
            'flex items-center justify-between border-b px-4 py-2',
            isLight ? 'border-gray-200' : 'border-gray-700',
          )}>
          <h3 className={cn('text-sm font-semibold', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>Your Notes</h3>
          <div className="flex items-center gap-2">
            {notes.length > 0 && (
              <button
                onClick={toggleDeleteMode}
                className={cn(
                  'rounded p-1.5 transition-colors',
                  deleteMode
                    ? isLight
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-red-900/30 text-red-400 hover:bg-red-900/50'
                    : isLight
                      ? 'text-gray-600 hover:bg-gray-100'
                      : 'text-gray-400 hover:bg-gray-800',
                )}
                title={deleteMode ? 'Cancel delete mode' : 'Enter delete mode'}>
                {deleteMode ? (
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                )}
              </button>
            )}
            <button
              onClick={handleCreate}
              className={cn(
                'flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-medium transition-colors',
                isLight
                  ? 'border-blue-200 text-blue-600 hover:bg-blue-50'
                  : 'border-blue-800 text-blue-300 hover:bg-blue-900/20',
              )}
              title="Create new note">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              NEW NOTE
            </button>
          </div>
        </div>
        {notes.length === 0 ? (
          <div className={cn('px-4 py-8 text-center text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
            No notes yet. Create your first note to get started.
          </div>
        ) : (
          <div className="max-h-[600px] w-full overflow-auto">
            {deleteMode && (
              <div
                className={cn(
                  'flex items-center justify-between border-b px-3 py-2',
                  isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#0d1117]',
                )}>
                <div className="flex items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={notes.every(note => selectedNotes.has(note.id))}
                      onChange={toggleSelectAll}
                      className="h-3.5 w-3.5 rounded border-gray-300"
                    />
                    <span className={cn('text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                      Select All
                    </span>
                  </label>
                  <span className={cn('text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                    {selectedNotes.size} selected
                  </span>
                </div>
                <button
                  onClick={openBulkDeleteDialog}
                  disabled={deleting || selectedNotes.size === 0}
                  className={cn(
                    'rounded px-3 py-1 text-xs font-medium transition-colors border',
                    deleting || selectedNotes.size === 0 ? 'cursor-not-allowed opacity-50' : '',
                    isLight
                      ? 'text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700'
                      : 'text-red-400 border-red-700/70 hover:bg-red-900/20 hover:text-red-300',
                  )}>
                  {deleting ? 'Deleting...' : 'Delete Selected'}
                </button>
              </div>
            )}
            <table className={cn('w-full min-w-full border-collapse text-xs')}>
              <thead className={cn('sticky top-0 z-10', isLight ? 'bg-gray-50' : 'bg-[#151C24]')}>
                <tr className={cn('border-b', isLight ? 'border-gray-200' : 'border-gray-700')}>
                  {deleteMode && (
                    <th className={cn('w-8 px-3 py-1.5', isLight ? 'text-gray-600' : 'text-gray-300')}></th>
                  )}
                  <th
                    className={cn(
                      'w-8 px-3 py-1.5 text-left text-xs font-semibold',
                      isLight ? 'text-gray-600' : 'text-gray-300',
                    )}></th>
                  <th
                    className={cn(
                      'px-3 py-1.5 text-left text-xs font-semibold',
                      isLight ? 'text-gray-600' : 'text-gray-300',
                    )}>
                    Title
                  </th>
                  <th
                    className={cn(
                      'px-3 py-1.5 text-left text-xs font-semibold',
                      isLight ? 'text-gray-600' : 'text-gray-300',
                    )}>
                    Updated
                  </th>
                  {!deleteMode && (
                    <th
                      className={cn(
                        'w-20 px-3 py-1.5 text-right text-xs font-semibold',
                        isLight ? 'text-gray-600' : 'text-gray-300',
                      )}>
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {notes.map(note => {
                  const isExpanded = expandedNoteIds.has(note.id);
                  return (
                    <React.Fragment key={note.id}>
                      <tr
                        className={cn(
                          'border-b transition-colors',
                          isLight ? 'border-gray-100 hover:bg-gray-50' : 'border-gray-700 hover:bg-gray-900/40',
                        )}>
                        {deleteMode && (
                          <td className="px-3 py-1.5">
                            <div
                              className={cn(
                                'flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded transition-opacity',
                                selectedNotes.has(note.id)
                                  ? 'bg-blue-600/80 opacity-100'
                                  : cn('opacity-100 border', isLight ? 'border-gray-400' : 'border-gray-500'),
                              )}
                              onClick={e => {
                                e.stopPropagation();
                                toggleNoteSelection(note.id);
                              }}>
                              {selectedNotes.has(note.id) && (
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
                          <button
                            onClick={() => handleToggleExpand(note.id)}
                            className={cn(
                              'rounded p-1 transition-colors',
                              isLight ? 'text-gray-400 hover:text-gray-700' : 'text-gray-500 hover:text-gray-300',
                            )}
                            title={isExpanded ? 'Collapse' : 'Expand'}>
                            <svg
                              className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-90')}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </td>
                        <td className={cn('px-3 py-1.5 font-medium', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
                          {note.title}
                        </td>
                        <td
                          className={cn('px-3 py-1.5 whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-400')}>
                          {formatDate(note.updated_at)}
                        </td>
                        {!deleteMode && (
                          <td className="px-3 py-1.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleEdit(note)}
                                className={cn(
                                  'rounded p-1 transition-colors',
                                  isLight ? 'text-gray-400 hover:text-blue-600' : 'text-gray-500 hover:text-blue-400',
                                )}
                                title="Edit note">
                                <svg
                                  className="h-3.5 w-3.5"
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
                              <button
                                onClick={() => openDeleteDialog(note.id, note.title)}
                                className={cn(
                                  'rounded p-1 transition-colors',
                                  isLight ? 'text-gray-400 hover:text-red-600' : 'text-gray-500 hover:text-red-400',
                                )}
                                title="Delete note">
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
                      {isExpanded && (
                        <tr className={cn(isLight ? 'bg-gray-50/50' : 'bg-[#0d1117]')}>
                          <td colSpan={deleteMode ? 5 : 4} className="px-3 py-4">
                            <div className="text-sm">
                              <div
                                className={cn(
                                  'mb-2 text-xs font-semibold',
                                  isLight ? 'text-gray-600' : 'text-gray-400',
                                )}>
                                Note Content
                              </div>
                              <div className={cn(isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
                                <CustomMarkdownRenderer content={noteContents[note.id] || ''} isLight={isLight} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Single Note Delete Confirmation Modal */}
      <AdminConfirmDialog
        isOpen={deleteDialogOpen && !!noteToDelete}
        onClose={() => {
          setDeleteDialogOpen(false);
          setNoteToDelete(null);
        }}
        onConfirm={confirmDeleteNote}
        title="Delete Note"
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
                Delete note "{noteToDelete?.title}"?
              </p>
              <p className={cn('mt-1 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                This note will be permanently deleted from your workspace. This action cannot be undone.
              </p>
            </div>
          </div>
        }
        confirmText="Delete Note"
        variant="danger"
        isLight={isLight}
        isLoading={deleting}
      />

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteDialogOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-[10000] backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setBulkDeleteDialogOpen(false);
              }
            }}
          />

          {/* Modal */}
          <div 
            className="fixed inset-0 z-[10001] flex items-center justify-center p-4 pointer-events-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={cn(
                'w-full max-w-sm rounded-lg shadow-xl pointer-events-auto',
                isLight
                  ? 'bg-gray-50 border border-gray-200'
                  : 'bg-[#151C24] border border-gray-700'
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                className={cn(
                  'flex items-center justify-between px-3 py-2 border-b',
                  isLight ? 'border-gray-200' : 'border-gray-700'
                )}
              >
                <h2
                  className={cn(
                    'text-sm font-semibold',
                    isLight ? 'text-gray-900' : 'text-gray-100'
                  )}
                >
                  Delete Multiple Notes
                </h2>
                <button
                  onClick={() => setBulkDeleteDialogOpen(false)}
                  className={cn(
                    'p-0.5 rounded-md transition-colors',
                    isLight
                      ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  )}
                >
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="px-3 py-4 space-y-3">
                {/* Warning Icon */}
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center',
                      isLight ? 'bg-red-100' : 'bg-red-900/30'
                    )}
                  >
                    <svg
                      className={cn(
                        'w-4 h-4',
                        isLight ? 'text-red-600' : 'text-red-400'
                      )}
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                  </div>

                  <div className="flex-1">
                    <p
                      className={cn(
                        'text-sm font-medium',
                        isLight ? 'text-gray-900' : 'text-gray-100'
                      )}
                    >
                      Delete {selectedNotes.size} note(s)?
                    </p>
                    <p
                      className={cn(
                        'text-xs mt-1',
                        isLight ? 'text-gray-600' : 'text-gray-400'
                      )}
                    >
                      These notes will be permanently deleted from your workspace and cannot be recovered.
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div
                className={cn(
                  'flex items-center justify-end gap-2 px-3 py-2 border-t',
                  isLight ? 'border-gray-200' : 'border-gray-700'
                )}
              >
                <button
                  onClick={() => setBulkDeleteDialogOpen(false)}
                  disabled={deleting}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    deleting ? 'opacity-50 cursor-not-allowed' : '',
                    isLight
                      ? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                      : 'bg-gray-700 text-gray-100 hover:bg-gray-600'
                  )}
                >
                  Cancel
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    confirmBulkDelete();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  disabled={deleting}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    deleting ? 'opacity-50 cursor-not-allowed' : '',
                    'bg-red-600 text-white hover:bg-red-700'
                  )}
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
