import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@extension/ui';
import { RichTextEditor } from '../admin/editors/RichTextEditor';
import { CustomMarkdownRenderer } from '../chat/CustomMarkdownRenderer';

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

  const loadNotes = useCallback(async () => {
    try {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
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
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
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
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const url = editingNote
        ? `${baseURL}/api/workspace/notes/${editingNote.id}`
        : `${baseURL}/api/workspace/notes`;

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

  const handleDelete = async (noteId: string, noteTitle: string) => {
    if (!confirm(`Delete note "${noteTitle}"?`)) return;

    try {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/workspace/notes/${noteId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Delete failed');
      }

      await loadNotes();
      // Refresh workspace stats after successful deletion
      onStatsChange?.();
    } catch (error) {
      console.error('[Workspace] Delete error:', error);
      alert('Failed to delete note');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

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
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
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
      <div className={cn('text-center py-8 text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>Loading notes...</div>
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
              'w-full px-3 py-1.5 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
              isLight ? 'bg-white border-gray-300 text-gray-900 placeholder-gray-400' : 'bg-[#151C24] border-gray-600 text-white placeholder-gray-500'
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

        <div className="flex flex-wrap gap-2 justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              'px-4 py-1.5 text-xs rounded font-medium transition-colors',
              saving
                ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
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
              'px-4 py-1.5 text-xs rounded font-medium transition-colors',
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
          'rounded-lg border overflow-hidden',
          isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700'
        )}>
        <div
          className={cn(
            'border-b px-4 py-2 flex items-center justify-between',
            isLight ? 'border-gray-200' : 'border-gray-700'
          )}>
          <h3 className={cn('text-sm font-semibold', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
            Your Notes
          </h3>
          <button
            onClick={handleCreate}
            className={cn(
              'flex items-center gap-1.5 px-1.5 py-1 text-xs font-medium rounded transition-colors',
              isLight
                ? 'text-blue-600 hover:bg-blue-50'
                : 'text-blue-300 hover:bg-blue-900/20'
            )}
            title="Create new note">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            NEW NOTE
          </button>
        </div>
        {notes.length === 0 ? (
          <div className={cn('px-4 py-8 text-center text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
            No notes yet. Create your first note to get started.
          </div>
        ) : (
          <div className="max-h-[600px] w-full overflow-auto">
            <table className={cn('min-w-full w-full border-collapse text-xs')}>
              <thead className={cn('sticky top-0 z-10', isLight ? 'bg-gray-50' : 'bg-[#151C24]')}>
                <tr className={cn('border-b', isLight ? 'border-gray-200' : 'border-gray-700')}>
                  <th className={cn('px-3 py-1.5 text-left text-xs font-semibold w-8', isLight ? 'text-gray-600' : 'text-gray-300')}></th>
                  <th className={cn('px-3 py-1.5 text-left text-xs font-semibold', isLight ? 'text-gray-600' : 'text-gray-300')}>Title</th>
                  <th className={cn('px-3 py-1.5 text-left text-xs font-semibold', isLight ? 'text-gray-600' : 'text-gray-300')}>Updated</th>
                  <th className={cn('px-3 py-1.5 text-right text-xs font-semibold w-20', isLight ? 'text-gray-600' : 'text-gray-300')}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {notes.map(note => {
                  const isExpanded = expandedNoteIds.has(note.id);
                  return (
                    <React.Fragment key={note.id}>
                      <tr
                        className={cn(
                          'transition-colors border-b',
                          isLight ? 'border-gray-100 hover:bg-gray-50' : 'border-gray-700 hover:bg-gray-900/40'
                        )}
                      >
                        <td className="px-3 py-1.5">
                          <button
                            onClick={() => handleToggleExpand(note.id)}
                            className={cn(
                              'p-1 rounded transition-colors',
                              isLight ? 'text-gray-400 hover:text-gray-700' : 'text-gray-500 hover:text-gray-300'
                            )}
                            title={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            <svg
                              className={cn('w-3.5 h-3.5 transition-transform', isExpanded && 'rotate-90')}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </td>
                        <td className={cn('px-3 py-1.5 font-medium', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
                          {note.title}
                        </td>
                        <td className={cn('px-3 py-1.5 whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-400')}>
                          {formatDate(note.updated_at)}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleEdit(note)}
                              className={cn(
                                'p-1 rounded transition-colors',
                                isLight ? 'text-gray-400 hover:text-blue-600' : 'text-gray-500 hover:text-blue-400'
                              )}
                              title="Edit note"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(note.id, note.title)}
                              className={cn(
                                'p-1 rounded transition-colors',
                                isLight ? 'text-gray-400 hover:text-red-600' : 'text-gray-500 hover:text-red-400'
                              )}
                              title="Delete note"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className={cn(isLight ? 'bg-gray-50/50' : 'bg-[#0d1117]')}>
                          <td colSpan={4} className="px-3 py-4">
                            <div className="text-sm">
                              <div className={cn('mb-2 text-xs font-semibold', isLight ? 'text-gray-600' : 'text-gray-400')}>
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
    </div>
  );
};

