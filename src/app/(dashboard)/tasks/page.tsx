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

function TasksPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, switchOrg } = useAuth();
  const [view, setView] = useState<ViewMode>('kanban');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskWithReadableId | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskWithReadableId | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [orgSwitchHandled, setOrgSwitchHandled] = useState(false);

  // Delete Task State
  const [taskToDelete, setTaskToDelete] = useState<TaskWithReadableId | null>(null);

  // Handle deep link with org parameter - auto-switch if needed
  useEffect(() => {
    if (orgSwitchHandled || !profile) return;
    
    const orgSlug = searchParams.get('org');
    if (!orgSlug) {
      setOrgSwitchHandled(true);
      return;
    }

    // Find org by slug
    const targetOrg = profile.memberships.find(m => m.orgSlug === orgSlug);
    
    if (!targetOrg) {
      // User is not a member of this org
      toast.error('Você não tem acesso a esta organização', {
        description: `Organização: ${orgSlug}`,
      });
      // Clean org param from URL
      const params = new URLSearchParams(window.location.search);
      params.delete('org');
      const newUrl = params.toString() ? `/tasks?${params.toString()}` : '/tasks';
      window.history.replaceState(null, '', newUrl);
      setOrgSwitchHandled(true);
      return;
    }

    // If already in the correct org, just clean the param
    if (targetOrg.orgId === profile.currentOrgId) {
      const params = new URLSearchParams(window.location.search);
      params.delete('org');
      const taskId = params.get('task');
      const newUrl = taskId ? `/tasks?task=${taskId}` : '/tasks';
      window.history.replaceState(null, '', newUrl);
      setOrgSwitchHandled(true);
      return;
    }

    // Need to switch org - this will cause a reload
    toast.info('Trocando para a organização correta...', {
      description: targetOrg.orgName,
    });
    
    // Build return URL with task param preserved (but without org param)
    const params = new URLSearchParams(window.location.search);
    params.delete('org');
    const taskId = params.get('task');
    const returnUrl = taskId ? `/tasks?task=${taskId}` : '/tasks';
    
    // Switch will do hard reload, preserving task param
    switchOrg(targetOrg.orgId, returnUrl);
  }, [searchParams, profile, switchOrg, orgSwitchHandled]);

  /* 
    Updated to sync with URL query params. 
    We use a lazy initializer to set the initial state from the URL.
    Sanitization: valores inválidos defaultam para 'all'
  */
  const [filters, setFilters] = useState<TaskFiltersState>(() => {
    const params = new URLSearchParams(searchParams.toString());

    // Sanitize status
    const statusParam = params.get('status');
    const validStatuses = ['BACKLOG', 'TODO', 'DOING', 'REVIEW', 'QA_READY', 'DONE'];
    const status = statusParam && validStatuses.includes(statusParam) ? statusParam as TaskStatus : 'all';

    // Sanitize priority
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
    };
  });

  // Handler to update both state and URL explicitly
  const handleFiltersChange = useCallback((newFilters: TaskFiltersState) => {
    setFilters(newFilters);

    const params = new URLSearchParams(searchParams.toString());
    let hasChanges = false;

    // Helper to sync specific key
    const syncParam = (key: string, value: string) => {
      const currentValue = params.get(key);
      if (value && value !== 'all') {
        if (currentValue !== value) {
          params.set(key, value);
          hasChanges = true;
        }
      } else {
        if (currentValue) {
          /**
           * Special handling for projectId:
           * If we clear projectId (set to 'all'), we must also ensure epicId and featureId are cleared/all
           * in the URL if they aren't already handled by the newsFilters.
           * However, TaskFilters component usually resets them in the object it passes.
           * So relying on newFiltersToCheck is sufficient.
           */
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
      // If search string changed, use replace to avoid history spam. Otherwise use push.
      if (currentSearch !== newFilters.search) {
        router.replace(newQuery ? `/tasks?${newQuery}` : '/tasks', { scroll: false });
      } else {
        router.push(newQuery ? `/tasks?${newQuery}` : '/tasks', { scroll: false });
      }
    }
  }, [router, searchParams]);

  // Sync from URL (Browser Back/Forward)
  // We use a ref to track the last synced URL to avoid unnecessary re-renders
  const lastSyncedUrl = useRef<string>('');

  useEffect(() => {
    const currentUrl = searchParams.toString();

    // Skip if URL hasn't changed (avoids cascading renders)
    if (lastSyncedUrl.current === currentUrl) return;
    lastSyncedUrl.current = currentUrl;

    const params = new URLSearchParams(currentUrl);

    // Sanitize status
    const statusParam = params.get('status');
    const validStatuses = ['BACKLOG', 'TODO', 'DOING', 'REVIEW', 'QA_READY', 'DONE'];
    const status = statusParam && validStatuses.includes(statusParam) ? statusParam as TaskStatus : 'all';

    // Sanitize priority
    const priorityParam = params.get('priority');
    const validPriorities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const priority = priorityParam && validPriorities.includes(priorityParam) ? priorityParam as TaskPriority : 'all';

    // Construct what the state SHOULD be based on URL (sanitized)
    const urlFilters: TaskFiltersState = {
      search: params.get('search') || '',
      status,
      priority,
      module: params.get('module') || 'all',
      projectId: params.get('projectId') || 'all',
      epicId: params.get('epicId') || 'all',
      featureId: params.get('featureId') || 'all',
      assigneeId: params.get('assigneeId') || 'all',
    };

    // ⚠️ INTENTIONAL: setState in effect is NECESSARY for browser back/forward sync
    // This is the correct pattern for URL-driven state (not a data fetching effect)
    setFilters(urlFilters);
  }, [searchParams]);

// Smart debounce: 100ms for filters (project, status), 300ms for search text
// Filters like projectId should feel instant, but search needs more delay
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

// Build filters for API
const apiFilters = useMemo(() => debouncedFilters, [debouncedFilters]);

// Get current user first (needed for 'me' filter resolution)
const { data: currentUser } = useCurrentUser();

  // React Query hooks for shared cache
  // IMPORTANT: Filters are sent to server - no client-side filtering!
  const { 
    data: tasksData, 
    isLoading, 
    isFetching, 
    isPlaceholderData,
    error, 
    refetch 
  } = useTasks({
    filters: apiFilters,
    currentUserId: currentUser?.id,
  });
  const { data: projectsData } = useProjects();
  const { data: epicsData } = useAllEpics();
  const { data: featuresData } = useAllFeatures();
  const { data: modulesData } = useModules();
  const { data: usersData } = useUsers();

  // Mutations
  const moveTaskMutation = useMoveTask();
  const deleteTaskMutation = useDeleteTask();

  // Derived data - tasks come pre-filtered from server
  const tasks = useMemo(() => tasksData?.items ?? [], [tasksData]);
  // When skipCount=true, total comes as -1. Show actual items count instead.
  const totalTasks = (tasksData?.total ?? 0) === -1 ? tasks.length : (tasksData?.total ?? 0);
  const projects = projectsData ?? [];
  const epics = epicsData ?? [];
  const features = featuresData ?? [];
  const modules = modulesData ?? [];
  const members = usersData ?? [];

  // Handle task move (Kanban drag-drop) - now uses optimistic updates
  const handleTaskMove = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    await moveTaskMutation.mutateAsync({ id: taskId, status: newStatus });
  }, [moveTaskMutation]);

  // Handle delete task click (opens dialog)
  const handleDeleteTaskClick = useCallback((task: TaskWithReadableId) => {
    setTaskToDelete(task);
  }, []);

  // Confirm delete task implementation
  const confirmDeleteTask = async () => {
    if (!taskToDelete) return;

    await deleteTaskMutation.mutateAsync(taskToDelete.id);
    setTaskToDelete(null);
    // If the deleted task was open in modal, close it
    if (selectedTask?.id === taskToDelete.id) {
      setIsDetailModalOpen(false);
    }
  };

  // Handle edit task - open dialog
  const handleEditTask = useCallback((task: TaskWithReadableId) => {
    setEditingTask(task);
    setIsDialogOpen(true);
  }, []);

  // Handle dialog open change
  const handleDialogChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingTask(null);
    }
  };

  // Handle task click - open detail modal and update URL without full router transition for fluidity
  const handleTaskClick = useCallback((task: TaskWithReadableId) => {
    setSelectedTask(task);
    setIsDetailModalOpen(true);

    // Manually update URL to avoid Next.js router processing lag during animation
    const params = new URLSearchParams(searchParams.toString());
    params.set('task', task.id);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState(null, '', newUrl);
  }, [searchParams]); // removed router dep as we use history API for this specific interaction

  // Handle closing detail modal
  const handleDetailModalClose = useCallback((open: boolean) => {
    setIsDetailModalOpen(open);
    if (!open) {
      // Do not clear selectedTask here to allow the modal to animate out with content
      // setSelectedTask(null); 

      // CRITICAL: Use window.location.search directly to avoid stale searchParams race condition
      const params = new URLSearchParams(window.location.search);
      params.delete('task');
      const newUrl = params.toString() ? `/tasks?${params.toString()}` : '/tasks';
      // Use history API to clean URL without triggering Next.js navigation/re-render
      window.history.pushState(null, '', newUrl);
    }
  }, []); // No deps - uses window.location directly

  // Open task from URL query param (Deep Link)
  useEffect(() => {
    // Verify against real URL because searchParams might be stale due to manual history manipulation
    // This prevents the "Zombie Re-open" bug where closing via pushState causes this effect to re-open
    // because Next.js searchParams hasn't updated yet.
    if (typeof window === 'undefined') return;

    const currentParams = new URLSearchParams(window.location.search);
    const urlHasTask = currentParams.has('task');
    const taskId = searchParams.get('task');

    if (taskId && urlHasTask && tasks.length > 0 && !isDetailModalOpen) {
      // CRITICAL: Search in ALL tasks (not filteredTasks) to support deep links with filters
      // Example: /tasks?task=uuid&assigneeId=me should open even if task is not assigned to me
      const task = tasks.find(t => t.id === taskId);

      if (task) {
        // ⚠️ INTENTIONAL: setState in effect is NECESSARY for deep linking
        // Opening task modal from URL param requires synchronous state update
        setSelectedTask(task);
        setIsDetailModalOpen(true);
      } else {
        // Task ID not found - clean URL to avoid broken state
        const params = new URLSearchParams(window.location.search);
        params.delete('task');
        const newUrl = params.toString() ? `/tasks?${params.toString()}` : '/tasks';
        window.history.replaceState(null, '', newUrl);
      }
    }
  }, [searchParams, tasks, isDetailModalOpen]);

  // Map editingTask to TaskDialog expected format
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

  // JKILL-214: Memoize defaultValues to prevent useEffect reset on every render
  // This ensures deep links and filters work correctly
  const defaultValues = useMemo(() => ({
    status: filters.status !== 'all' ? filters.status : undefined,
    priority: filters.priority !== 'all' ? filters.priority : undefined,
    modules: filters.module !== 'all' ? [filters.module] : undefined,
    featureId: filters.featureId !== 'all' ? filters.featureId : undefined,
  }), [filters.status, filters.priority, filters.module, filters.featureId]);

  // Only show full-page skeleton on FIRST load ever (no data at all)
  // When changing filters, we keep showing previous data (placeholderData)
  const isFirstLoad = isLoading && !tasksData;

  if (isFirstLoad) {
    return (
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <div className="space-y-4">
          {/* Filters Skeleton */}
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
            {totalTasks} tasks encontradas
            {isFetching && !isLoading && (
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
        modules={modules} // This is fallback fallbackModules, kept for comp
        defaultValues={defaultValues}
        taskToEdit={taskToEditForDialog}
        onSuccess={refetch}
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
          {/* Subtle loading indicator - just a spinner, no text */}
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
              <TaskTable
                tasks={tasks}
                onTaskClick={handleTaskClick}
                isLoading={false}
              />
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
