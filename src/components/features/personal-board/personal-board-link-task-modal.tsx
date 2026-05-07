'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Link as LinkIcon, Unlink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/features/tasks/status-badge';
import type { TaskWithReadableId, TaskStatus } from '@/shared/types';

interface LinkedTaskInfo {
  id: string;
  readableId: string;
  title: string;
  status: TaskStatus;
}

interface PersonalBoardLinkTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentLinkedTaskId?: string | null;
  onLink: (taskId: string) => Promise<void>;
  onUnlink: () => Promise<void>;
}

export function PersonalBoardLinkTaskModal({
  open,
  onOpenChange,
  currentLinkedTaskId,
  onLink,
  onUnlink,
}: PersonalBoardLinkTaskModalProps) {
  const [search, setSearch] = useState('');
  const [tasks, setTasks] = useState<LinkedTaskInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Fetch tasks based on search
  const fetchTasks = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('search', query.trim());
      params.set('pageSize', '20');

      const res = await fetch(`/api/tasks?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch tasks');
      const json = await res.json();
      const items = json.data?.items || json.items || [];
      setTasks(items.map((t: TaskWithReadableId) => ({
        id: t.id,
        readableId: t.readableId,
        title: t.title,
        status: t.status,
      })));
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      if (open) fetchTasks(search);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [search, open, fetchTasks]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedTaskId(null);
      fetchTasks('');
    }
  }, [open, fetchTasks]);

  const handleLink = async () => {
    if (!selectedTaskId || linking) return;
    setLinking(true);
    try {
      await onLink(selectedTaskId);
      onOpenChange(false);
    } catch {
      // Error handled by caller
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async () => {
    setLinking(true);
    try {
      await onUnlink();
      onOpenChange(false);
    } catch {
      // Error handled by caller
    } finally {
      setLinking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="h-4 w-4" />
            Vincular a uma Task
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tasks por título..."
              className="pl-9"
              autoFocus
            />
          </div>

          {/* Task list */}
          <div className="max-h-[300px] overflow-y-auto space-y-1 border rounded-md">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : tasks.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                {search ? 'Nenhuma task encontrada' : 'Nenhuma task disponível'}
              </div>
            ) : (
              tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => setSelectedTaskId(task.id === selectedTaskId ? null : task.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 text-sm text-left hover:bg-accent transition-colors',
                    selectedTaskId === task.id && 'bg-accent'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {task.readableId}
                      </span>
                      <StatusBadge status={task.status} size="sm" />
                    </div>
                    <p className="truncate mt-0.5">{task.title}</p>
                  </div>
                  {selectedTaskId === task.id && (
                    <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Currently linked */}
          {currentLinkedTaskId && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Atualmente vinculado</span>
              <Badge variant="outline" className="font-mono text-xs">
                {currentLinkedTaskId.slice(0, 8)}...
              </Badge>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row justify-between">
          <div>
            {currentLinkedTaskId && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleUnlink}
                disabled={linking}
              >
                {linking ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Unlink className="h-3.5 w-3.5 mr-1.5" />}
                Desvincular
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={linking}>
              Cancelar
            </Button>
            <Button
              onClick={handleLink}
              disabled={!selectedTaskId || linking}
            >
              {linking ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <LinkIcon className="h-4 w-4 mr-1.5" />}
              Vincular
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
