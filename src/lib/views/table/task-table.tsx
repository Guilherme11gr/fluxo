'use client';

import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TableSkeleton } from '@/components/features/tasks';
import { TableRow } from './table-row';
import { TABLE_COLUMNS, type SortState } from './types';
import type { TaskWithReadableId } from '@/shared/types';

interface TaskTableProps {
  tasks: TaskWithReadableId[];
  onTaskClick?: (task: TaskWithReadableId) => void;
  isLoading?: boolean;
}

export function TaskTable({ tasks, onTaskClick, isLoading = false }: TaskTableProps) {
  const [sort, setSort] = useState<SortState>({ column: 'createdAt', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Handle column header click
  const handleSort = (column: string) => {
    setSort((prev) => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
    setPage(1); // Reset to first page on sort change
  };

  // Handle page size change
  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setPage(1); // Reset to first page
  };

  // Sort tasks
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aVal = getSortValue(a, sort.column);
      const bVal = getSortValue(b, sort.column);

      if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [tasks, sort]);

  // Paginate sorted tasks
  const paginatedTasks = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return sortedTasks.slice(start, end);
  }, [sortedTasks, page, pageSize]);

  // Pagination info
  const totalPages = Math.ceil(sortedTasks.length / pageSize);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;
  const startItem = sortedTasks.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, sortedTasks.length);

  if (isLoading) {
    return <TableSkeleton rows={10} />;
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[100px_1fr_120px_100px_100px_60px] gap-4 items-center px-4 py-3 bg-muted/30 border-b">
          {TABLE_COLUMNS.map((col) => (
            <button
              key={col.key}
              onClick={() => col.sortable && handleSort(col.key)}
              className={cn(
                'flex items-center gap-1 text-xs font-medium text-muted-foreground',
                'hover:text-foreground transition-colors',
                col.sortable && 'cursor-pointer',
                col.key === 'title' && 'justify-start',
                col.key === 'points' && 'justify-center'
              )}
            >
              {col.label}
              {col.sortable && (
                <SortIcon column={col.key} currentSort={sort} />
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="divide-y divide-border/50">
          {sortedTasks.length === 0 ? (
            <div className="flex items-center justify-center h-48">
              <p className="text-muted-foreground">Nenhuma task encontrada</p>
            </div>
          ) : (
            paginatedTasks.map((task) => (
              <TableRow
                key={task.id}
                task={task}
                onClick={() => onTaskClick?.(task)}
              />
            ))
          )}
        </div>
      </div>

      {/* Pagination Controls */}
      {sortedTasks.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              Mostrando <span className="font-medium text-foreground">{startItem}</span> a{' '}
              <span className="font-medium text-foreground">{endItem}</span> de{' '}
              <span className="font-medium text-foreground">{sortedTasks.length}</span> tasks
            </span>
          </div>

          <div className="flex items-center gap-6">
            {/* Page size selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Linhas por página:</span>
              <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Page navigation */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!hasPrevPage}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={!hasNextPage}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper: Get sortable value from task
function getSortValue(task: TaskWithReadableId, column: string): string | number {
  const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const statusOrder = { BACKLOG: 0, TODO: 1, DOING: 2, REVIEW: 3, QA_READY: 4, DONE: 5 };

  switch (column) {
    case 'readableId':
      return task.readableId;
    case 'title':
      return task.title.toLowerCase();
    case 'status':
      return statusOrder[task.status];
    case 'priority':
      return priorityOrder[task.priority];
    case 'module':
      return (task.modules && task.modules.length > 0) ? task.modules[0] : 'zzz'; // Sort by first module
    case 'points':
      return task.points || 999; // Put empty at end
    default:
      return '';
  }
}

// Sort icon component
function SortIcon({ column, currentSort }: { column: string; currentSort: SortState }) {
  if (currentSort.column !== column) {
    return <ChevronsUpDown className="w-3 h-3 opacity-50" />;
  }
  return currentSort.direction === 'asc' ? (
    <ChevronUp className="w-3 h-3" />
  ) : (
    <ChevronDown className="w-3 h-3" />
  );
}
