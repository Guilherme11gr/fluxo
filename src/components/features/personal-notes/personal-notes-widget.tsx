'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { StickyNote, Pin, PinOff, Trash2, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

interface PersonalNoteData {
  id: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface NotesResponse {
  notes: PersonalNoteData[];
}

const MAX_CONTENT_LENGTH = 1000;
const AUTO_SAVE_DEBOUNCE_MS = 1000;

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'agora mesmo';
  if (diffMins < 60) return `${diffMins}min atrás`;
  if (diffHours < 24) return `${diffHours}h atrás`;
  if (diffDays < 7) return `${diffDays}d atrás`;

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PersonalNotesWidget() {
  const [notes, setNotes] = useState<PersonalNoteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showNewNote, setShowNewNote] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newIsPinned, setNewIsPinned] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch('/api/personal-notes');
      if (!res.ok) throw new Error('Failed to fetch notes');
      const json = await res.json();
      const notesData = json.data?.notes ?? json.notes ?? [];
      setNotes(Array.isArray(notesData) ? notesData : []);
    } catch {
      toast.error('Erro ao carregar notas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Refetch when Quick Capture (or external) creates a note
  useEffect(() => {
    const handler = () => fetchNotes();
    window.addEventListener('personal-notes:updated', handler);
    return () => window.removeEventListener('personal-notes:updated', handler);
  }, [fetchNotes]);

  useEffect(() => {
    if (showNewNote && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [showNewNote]);

  const handleCreateNote = async () => {
    if (!newContent.trim()) {
      toast.error('Escreva algo na nota.');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/personal-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent.trim(), isPinned: newIsPinned }),
      });

      if (!res.ok) throw new Error('Failed to create note');

      const json = await res.json();
      const createdNote = json.data?.note;
      if (createdNote) setNotes((prev) => [createdNote, ...prev]);
      setNewContent('');
      setNewIsPinned(false);
      setShowNewNote(false);
      toast.success('Nota criada!');
    } catch {
      toast.error('Erro ao criar nota.');
    } finally {
      setCreating(false);
    }
  };

  const handleTogglePin = async (note: PersonalNoteData) => {
    try {
      const res = await fetch(`/api/personal-notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPinned: !note.isPinned }),
      });

      if (!res.ok) throw new Error('Failed to update note');

      const json = await res.json();
      setNotes((prev) =>
        prev
          .map((n) => (n.id === note.id ? (json.data?.note ?? n) : n))
          .sort((a, b) => {
            if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          })
      );
    } catch {
      toast.error('Erro ao atualizar nota.');
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      const res = await fetch(`/api/personal-notes/${noteId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete note');

      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      if (editingId === noteId) {
        setEditingId(null);
      }
      toast.success('Nota removida.');
    } catch {
      toast.error('Erro ao remover nota.');
    }
  };

  const handleStartEdit = (note: PersonalNoteData) => {
    setEditingId(note.id);
    setEditContent(note.content);
  };

  const handleSaveEdit = async (noteId: string) => {
    if (!editContent.trim()) return;

    try {
      const res = await fetch(`/api/personal-notes/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent.trim() }),
      });

      if (!res.ok) throw new Error('Failed to update note');

      const json = await res.json();
      setNotes((prev) => prev.map((n) => (n.id === noteId ? (json.data?.note ?? n) : n)));
      setEditingId(null);
    } catch {
      toast.error('Erro ao salvar nota.');
    }
  };

  const handleAutoSaveEdit = (content: string) => {
    setEditContent(content);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      if (editingId) {
        handleSaveEdit(editingId);
      }
    }, AUTO_SAVE_DEBOUNCE_MS);
  };

  const handleEditBlur = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (editingId) {
      handleSaveEdit(editingId);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-muted animate-pulse" />
            <div className="h-5 w-28 rounded bg-muted animate-pulse" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-16 rounded bg-muted animate-pulse" />
            <div className="h-16 rounded bg-muted animate-pulse" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StickyNote className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-base font-semibold">Notas Rápidas</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setShowNewNote(!showNewNote)}
          >
            <Plus className="h-3.5 w-3.5" />
            Nova nota
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {showNewNote && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40">
            <Textarea
              ref={textareaRef}
              value={newContent}
              onChange={(e) => {
                if (e.target.value.length <= MAX_CONTENT_LENGTH) {
                  setNewContent(e.target.value);
                }
              }}
              placeholder="Escreva sua nota..."
              className="min-h-[80px] resize-none bg-white dark:bg-background text-sm border-amber-200 dark:border-amber-800/40 focus-visible:ring-amber-400"
              maxLength={MAX_CONTENT_LENGTH}
            />
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNewIsPinned(!newIsPinned)}
                  className={cn(
                    'flex items-center gap-1 text-xs transition-colors',
                    newIsPinned
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {newIsPinned ? (
                    <Pin className="h-3.5 w-3.5" />
                  ) : (
                    <PinOff className="h-3.5 w-3.5" />
                  )}
                  {newIsPinned ? 'Fixada' : 'Fixar'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {MAX_CONTENT_LENGTH - newContent.length}
                </span>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleCreateNote}
                  disabled={creating || !newContent.trim()}
                >
                  {creating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    'Salvar'
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {notes.length === 0 && !showNewNote ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <StickyNote className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              Nenhuma nota ainda. Anote algo rápido!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notes.map((note) => (
              <div
                key={note.id}
                className={cn(
                  'group relative p-3 rounded-lg border transition-colors',
                  note.isPinned
                    ? 'bg-amber-50/50 dark:bg-amber-950/10 border-amber-200/60 dark:border-amber-800/30'
                    : 'bg-background hover:bg-accent/30'
                )}
              >
                <div className="flex items-start gap-2">
                  {note.isPinned && (
                    <Pin className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    {editingId === note.id ? (
                      <>
                        <Textarea
                          value={editContent}
                          onChange={(e) => {
                            if (e.target.value.length <= MAX_CONTENT_LENGTH) {
                              handleAutoSaveEdit(e.target.value);
                            }
                          }}
                          onBlur={handleEditBlur}
                          className="min-h-[60px] resize-none text-sm bg-transparent border-0 focus-visible:ring-1 p-0"
                          maxLength={MAX_CONTENT_LENGTH}
                          autoFocus
                        />
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-muted-foreground">
                            {MAX_CONTENT_LENGTH - editContent.length}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            salvando...
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <p
                          className="text-sm whitespace-pre-wrap line-clamp-3 cursor-text"
                          onClick={() => handleStartEdit(note)}
                        >
                          {note.content}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs text-muted-foreground">
                            {formatTimestamp(note.updatedAt)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => handleTogglePin(note)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title={note.isPinned ? 'Desafixar' : 'Fixar'}
                    >
                      {note.isPinned ? (
                        <Pin className="h-3.5 w-3.5 text-amber-500" />
                      ) : (
                        <PinOff className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Remover nota"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
