'use client';

import { useState, useMemo, useCallback, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Plus, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ViewToggle,
  TaskFilters,
  TaskDialog,
  type ViewMode,
  type TaskFiltersState,
} from '@/components/features/tasks';
import { TaskDetailModal } from '@/components/features/tasks/task-detail-modal';
import { KanbanBoard } from '@/lib/views/kanban';
import { TaskTable } from '@/lib/views/table';
import { PageHeaderSkeleton } from '@/components/layout/page-skeleton';
import { KanbanBoardSkeleton } from '@/components/features/tasks';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TaskWithReadableId, TaskStatus, TaskPriority } from '@/shared/types';
import {
  useTasks,
  useInfiniteTasks,
  useTasksCount,
  useProjects,
  useModules,
  useMoveTask,
  useDeleteTask,
  useAllFeatures,
} from '@/lib/query';
import { useAllEpics } from '@/lib/query/hooks/use-epics';
import { useUsers, useCurrentUser } from '@/lib/query/hooks/use-users';
import { useDebounce } from '@/hooks/use-debounce';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';

type ApiFilters = Partial<TaskFiltersState> & { excludeStatuses?: string };

function TasksPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { viewer, switchOrg } = useAuth();
  const [view, setView] = useState<ViewMode>('kanban');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskWithReadableId | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskWithReadableId | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [orgSwitchHandled, setOrgSwitchHandled] = useState(false);

  const [taskToDelete, setTaskToDelete] = useState<TaskWithReadableId | null>(null);

  // Handle deep link with org parameter - auto-switch if needed
  useEffect(() => {
    if (orgSwitchHandled || !viewer) return;
    
    const orgSlug = searchParams.get('org');
    if (!orgSlug) {
      setOrgSwitchHandled(true);
      return;
    }

    const targetOrg = viewer.memberships.find(m => m.orgSlug === orgSlug);
    
    if (!targetOrg) {
      toast.error('Você não tem acesso a esta organização', {
        description: `Organização: ${orgSlug}`,
      });
      const params = new URLSearchParams(window.location.search);
      params.delete('org');
      const newUrl = params.toString() ? `/tasks?${params.toString()}` : '/tasks';
      window.history.replaceState(null, '', newUrl);
      setOrgSwitchHandled(true);
      return;
    }

    if (targetOrg.orgId === viewer.currentOrgId) {
      const params = new URLSearchParams(window.location.search);
      params.delete('org');
      const taskId = params.get('task');
      const newUrl = taskId ? `/tasks?task=${taskId}` : '/tasks';
      window.history.replaceState(null, '', newUrl);
      setOrgSwitchHandled(true);
      return;
    }

    toast.info('Trocando para a organização correta...', {
      description: targetOrg.orgName,
    });
    
    const params = new URLSearchParams(window.location.search);
    params.delete('org');
    const taskId = params.get('task');
    const returnUrl = taskId ? `/tasks?task=${taskId}` : '/tasks';
    
    switchOrg(targetOrg.orgId, returnUrl);
  }, [orgSwitchHandled, searchParams, switchOrg, viewer]);

  const [filters, setFilters] = useState<TaskFiltersState>(() => {
    const params = new URLSearchParams(searchParams.toString());

    const statusParam = params.get('status');
    const validStatuses = ['BACKLOG', 'TODO', 'DOING', 'REVIEW', 'QA_READY', 'DONE'];
    const status = statusParam && validStatuses.includes(statusParam) ? statusParam as TaskStatus : 'all';

    const priorityParam = params.get('priority');
    const validPriorities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const priority = priorityParam && validPriorities.includes(priorityParam) ? priorityParam as TaskPriority : 'all';

    return {
      search: params.get('search') || '',
      status,
      priority,
      module: params.get('module') || 'all',
      projectId: params.get('projectId') || 'all',
      epicId: params.get('epicId') || 'all',
      featureId: params.get('featureId') || 'all',
      assigneeId: params.get('assigneeId') || 'all',
      showDone: false,
    };
  });

  const handleFiltersChange = useCallback((newFilters: TaskFiltersState) => {
    setFilters(newFilters);

    const params = new URLSearchParams(searchParams.toString());
    let hasChanges = false;

    const syncParam = (key: string, value: string) => {
      const currentValue = params.get(key);
      if (value && value !== 'all') {
        if (currentValue !== value) {
          params.set(key, value);
          hasChanges = true;
        }
      } else {
        if (currentValue) {
          params.delete(key);
          hasChanges = true;
        }
      }
    };

    syncParam('search', newFilters.search);
    syncParam('status', newFilters.status);
    syncParam('priority', newFilters.priority);
    syncParam('module', newFilters.module);
    syncParam('projectId', newFilters.projectId);
    syncParam('epicId', newFilters.epicId);
    syncParam('featureId', newFilters.featureId);
    syncParam('assigneeId', newFilters.assigneeId);

    if (hasChanges) {
      const newQuery = params.toString();
      const currentSearch = searchParams.get('search') || '';
      if (currentSearch !== newFilters.search) {
        router.replace(newQuery ? `/tasks?${newQuery}` : '/tasks', { scroll: false });
      } else {
        router.push(newQuery ? `/tasks?${newQuery}` : '/tasks', { scroll: false });
      }
    }
  }, [router, searchParams]);

  const lastSyncedUrl = useRef<string>('');

  useEffect(() => {
    const currentUrl = searchParams.toString();

    if (lastSyncedUrl.current === currentUrl) return;
    lastSyncedUrl.current = currentUrl;

    const params = new URLSearchParams(currentUrl);

    const statusParam = params.get('status');
    const validStatuses = ['BACKLOG', 'TODO', 'DOING', 'REVIEW', 'QA_READY', 'DONE'];
    const status = statusParam && validStatuses.includes(statusParam) ? statusParam as TaskStatus : 'all';

    const priorityParam = params.get('priority');
    const validPriorities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const priority = priorityParam && validPriorities.includes(priorityParam) ? priorityParam as TaskPriority : 'all';

    const urlFilters: TaskFiltersState = {
      search: params.get('search') || '',
      status,
      priority,
      module: params.get('module') || 'all',
      projectId: params.get('projectId') || 'all',
      epicId: params.get('epicId') || 'all',
      featureId: params.get('featureId') || 'all',
      assigneeId: params.get('assigneeId') || 'all',
      showDone: false,
    };

    setFilters(urlFilters);
  }, [searchParams]);

  const searchDebounced = useDebounce(filters.search, 300);
  const filtersWithoutSearch = useMemo(() => {
    const { search, ...rest } = filters;
    return rest;
  }, [filters]);
  const filtersDebounced = useDebounce(filtersWithoutSearch, 100);

  const debouncedFilters = useMemo(() => ({
    ...filtersDebounced,
    search: searchDebounced,
  }), [filtersDebounced, searchDebounced]);

  const apiFilters = useMemo<ApiFilters>(() => {
    const { showDone, status, ...rest } = debouncedFilters;
    if (!showDone && status === 'all') {
      return { ...rest, excludeStatuses: 'DONE' };
    }
    return rest;
  }, [debouncedFilters]);

  const { data: currentUser } = useCurrentUser();

  // Kanban view: useTasks with skipCount=true (unchanged behavior)
  const kanbanQuery = useTasks({
    filters: apiFilters,
    currentUserId: currentUser?.id,
  });

  // Table view: cursor-based infinite scroll
  const infiniteQuery = useInfiniteTasks({
    filters: apiFilters,
    currentUserId: currentUser?.id,
  });

  // Accurate count for table view header
  const countQuery = useTasksCount({
    filters: apiFilters,
    currentUserId: currentUser?.id,
  });

  // Select the right query based on view mode
  const isKanban = view === 'kanban';
  const tasksData = isKanban ? kanbanQuery.data : infiniteQuery.data?.pages[0];
  const isLoading = isKanban ? kanbanQuery.isLoading : infiniteQuery.isLoading;
  const isFetching = isKanban ? kanbanQuery.isFetching : infiniteQuery.isFetching;
  const isPlaceholderData = isKanban ? kanbanQuery.isPlaceholderData : infiniteQuery.isPlaceholderData;
  const error = isKanban ? kanbanQuery.error : infiniteQuery.error;
  const refetch = isKanban ? kanbanQuery.refetch : infiniteQuery.refetch;

  // Table-specific infinite scroll state
  const hasNextPage = !isKanban && infiniteQuery.hasNextPage;
  const isFetchingNextPage = !isKanban && infiniteQuery.isFetchingNextPage;
  const fetchNextPage = !isKanban ? infiniteQuery.fetchNextPage : () => {};

  // Infinite scroll sentinel
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isKanban || !loadMoreRef.current || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [isKanban, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const { data: projectsData } = useProjects();
  const { data: epicsData } = useAllEpics();
  const { data: featuresData } = useAllFeatures();
  const { data: modulesData } = useModules();
  const { data: usersData } = useUsers();

  const moveTaskMutation = useMoveTask();
  const deleteTaskMutation = useDeleteTask();

  // Build tasks list: flat map all pages for infinite, or single page for kanban
  const tasks = useMemo(() => {
    if (isKanban) {
      return kanbanQuery.data?.items ?? [];
    }
    return infiniteQuery.data?.pages.flatMap(page => page.items) ?? [];
  }, [isKanban, kanbanQuery.data, infiniteQuery.data]);

  const totalTasks = isKanban
    ? (tasksData?.total === -1 ? tasks.length : (tasksData?.total ?? 0))
    : (countQuery.data ?? 0);

  const projects = projectsData ?? [];
  const epics = epicsData ?? [];
  const features = featuresData ?? [];
  const modules = modulesData ?? [];
  const members = usersData ?? [];

  const handleTaskMove = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    await moveTaskMutation.mutateAsync({ id: taskId, status: newStatus });
  }, [moveTaskMutation]);

  const handleDeleteTaskClick = useCallback((task: TaskWithReadableId) => {
    setTaskToDelete(task);
  }, []);

  const confirmDeleteTask = async () => {
    if (!taskToDelete) return;

    await deleteTaskMutation.mutateAsync(taskToDelete.id);
    setTaskToDelete(null);
    if (selectedTask?.id === taskToDelete.id) {
      setIsDetailModalOpen(false);
    }
  };

  const handleEditTask = useCallback((task: TaskWithReadableId) => {
    setEditingTask(task);
    setIsDialogOpen(true);
  }, []);

  const handleDialogChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingTask(null);
    }
  };

  const handleTaskClick = useCallback((task: TaskWithReadableId) => {
    setSelectedTask(task);
    setIsDetailModalOpen(true);

    const params = new URLSearchParams(searchParams.toString());
    params.set('task', task.id);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState(null, '', newUrl);
  }, [searchParams]);

  const handleDetailModalClose = useCallback((open: boolean) => {
    setIsDetailModalOpen(open);
    if (!open) {
      const params = new URLSearchParams(window.location.search);
      params.delete('task');
      const newUrl = params.toString() ? `/tasks?${params.toString()}` : '/tasks';
      window.history.pushState(null, '', newUrl);
    }
  }, []);

  // Open task from URL query param (Deep Link)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const currentParams = new URLSearchParams(window.location.search);
    const urlHasTask = currentParams.has('task');
    const taskId = searchParams.get('task');

    if (taskId && urlHasTask && tasks.length > 0 && !isDetailModalOpen) {
      const task = tasks.find(t => t.id === taskId);

      if (task) {
        setSelectedTask(task);
        setIsDetailModalOpen(true);
      } else {
        const params = new URLSearchParams(window.location.search);
        params.delete('task');
        const newUrl = params.toString() ? `/tasks?${params.toString()}` : '/tasks';
        window.history.replaceState(null, '', newUrl);
      }
    }
  }, [searchParams, tasks, isDetailModalOpen]);

  const taskToEditForDialog = editingTask ? {
    id: editingTask.id,
    title: editingTask.title,
    description: editingTask.description || "",
    type: editingTask.type,
    priority: editingTask.priority,
    status: editingTask.status,
    points: editingTask.points?.toString(),
    modules: editingTask.modules,
    featureId: editingTask.feature.id,
    assigneeId: editingTask.assigneeId,
    tags: editingTask.tags,
  } : null;

  const defaultValues = useMemo(() => ({
    status: filters.status !== 'all' ? filters.status : undefined,
    priority: filters.priority !== 'all' ? filters.priority : undefined,
    modules: filters.module !== 'all' ? [filters.module] : undefined,
    featureId: filters.featureId !== 'all' ? filters.featureId : undefined,
  }), [filters.status, filters.priority, filters.module, filters.featureId]);

  const isFirstLoad = isLoading && !tasksData;

  if (isFirstLoad) {
    return (
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <div className="space-y-4">
          <div className="flex gap-4 mb-4">
            <div className="h-10 w-64 bg-muted rounded animate-pulse" />
            <div className="h-10 w-32 bg-muted rounded animate-pulse" />
          </div>
          <KanbanBoardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Minhas Tasks
          </h1>
          <p className="text-muted-foreground flex items-center gap-2">
            {countQuery.isLoading && !isKanban ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              `${totalTasks} tasks encontradas`
            )}
            {isFetching && !isLoading && !isKanban && (
              <Loader2 className="w-3 h-3 animate-spin" />
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isLoading || isFetching}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
          <ViewToggle value={view} onChange={setView} />

          <Button className="gap-2" onClick={() => setIsDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nova Task</span>
          </Button>
        </div>
      </div>

      <TaskDialog
        open={isDialogOpen}
        onOpenChange={handleDialogChange}
        projectId={filters.projectId !== 'all' ? filters.projectId : undefined}
        features={features}
        modules={modules}
        defaultValues={defaultValues}
        taskToEdit={taskToEditForDialog}
        onSuccess={() => {
          refetch();
          countQuery.refetch();
        }}
      />

      {/* Filters */}
      <TaskFilters
        filters={filters}
        onChange={handleFiltersChange}
        modules={modules}
        projects={projects}
        epics={epics}
        features={features}
        members={members}
        currentUserId={currentUser?.id}
      />

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/50">
          <p>Erro ao carregar tasks: {error instanceof Error ? error.message : 'Erro desconhecido'}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
            Tentar novamente
          </Button>
        </div>
      )}

      {/* View */}
      {!error && (
        <div className="relative">
          {isFetching && isPlaceholderData && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10">
              <div className="bg-background/95 p-2 rounded-full shadow-md border">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              </div>
            </div>
          )}
          
          <div className={isFetching && isPlaceholderData ? "opacity-50 transition-opacity duration-150" : "transition-opacity duration-150"}>
            {view === 'kanban' ? (
              <KanbanBoard
                tasks={tasks}
                onTaskMove={handleTaskMove}
                onTaskClick={handleTaskClick}
                onEdit={handleEditTask}
                onDelete={handleDeleteTaskClick}
                isLoading={false}
              />
            ) : (
              <>
                <TaskTable
                  tasks={tasks}
                  onTaskClick={handleTaskClick}
                  isLoading={false}
                />
                <div ref={loadMoreRef} className="flex justify-center py-4">
                  {isFetchingNextPage && (
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      <TaskDetailModal
        task={selectedTask}
        open={isDetailModalOpen}
        onOpenChange={handleDetailModalClose}
        onEdit={handleEditTask}
        onDelete={handleDeleteTaskClick}
      />

      {/* Delete Task Confirmation Dialog */}
      <Dialog open={!!taskToDelete} onOpenChange={(open) => !open && setTaskToDelete(null)}>
        <DialogContent className="z-modal">
          <DialogHeader>
            <DialogTitle>Você tem certeza?</DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. Isso excluirá permanentemente a task
              <span className="font-medium text-foreground"> &ldquo;{taskToDelete?.title}&rdquo; </span>
              e todos os dados associados.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setTaskToDelete(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteTask}
            >
              Excluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <div className="space-y-4">
          <div className="flex gap-4 mb-4">
            <div className="h-10 w-64 bg-muted rounded animate-pulse" />
            <div className="h-10 w-32 bg-muted rounded animate-pulse" />
          </div>
          <KanbanBoardSkeleton />
        </div>
      </div>
    }>
      <TasksPageContent />
    </Suspense>
  );
}
