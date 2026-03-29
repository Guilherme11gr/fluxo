"use client";

import { useState, useCallback, use, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Loader2, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckSquare } from "lucide-react";

import { TaskDialog, TaskDetailModal, SuggestTasksModal } from "@/components/features/tasks";
import { KanbanBoard } from "@/lib/views/kanban";
import { KanbanBoardSkeleton } from "@/components/features/tasks/task-skeleton";
import { PageHeaderSkeleton } from '@/components/layout/page-skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExpandableMarkdown } from "@/components/ui/expandable-markdown";

import type { TaskWithReadableId, TaskStatus } from "@/shared/types";
import { useFeature, useTasks, useProject, useMoveTask, useDeleteTask, useModules } from "@/lib/query";
import { FeatureHealthBadge } from "@/components/features/features";
import { FeatureAISummaryCard } from "@/components/features/feature-ai-summary-card";

export default function FeatureDetailPage({
  params,
}: {
  params: Promise<{ id: string; epicId: string; featureId: string }>;
}) {
  const resolvedParams = use(params);

  // React Query hooks
  const { data: feature, isLoading: featureLoading } = useFeature(resolvedParams.featureId);
  const { data: tasksData, isLoading: tasksLoading, refetch: refetchTasks, isFetching } = useTasks({
    filters: { featureId: resolvedParams.featureId }
  });
  const { data: modules = [] } = useModules();

  // Mutations
  const moveTaskMutation = useMoveTask();
  const deleteTaskMutation = useDeleteTask();

  const loading = featureLoading || tasksLoading;
  const tasks = (tasksData?.items ?? []) as TaskWithReadableId[];

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Dialog States
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskWithReadableId | null>(null);

  // Detail Modal State (sidebar)
  const [selectedTask, setSelectedTask] = useState<TaskWithReadableId | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<TaskWithReadableId | null>(null);
  const [isSuggestModalOpen, setIsSuggestModalOpen] = useState(false);

  // Deep Linking Effect
  useEffect(() => {
    const taskIdFromUrl = searchParams.get('task');
    if (taskIdFromUrl && tasks.length > 0) {
      const task = tasks.find(t => t.id === taskIdFromUrl);
      if (task) {
        setSelectedTask(task);
        setIsDetailModalOpen(true);
      }
    } else if (!taskIdFromUrl && isDetailModalOpen) {
      // If URL param removed (e.g. browser back), close modal
      setIsDetailModalOpen(false);
      setSelectedTask(null);
    }
  }, [searchParams, tasks, isDetailModalOpen]);


  const handleTaskMove = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    await moveTaskMutation.mutateAsync({ id: taskId, status: newStatus });
  }, [moveTaskMutation]);

  const handleDeleteTaskClick = useCallback((task: TaskWithReadableId) => {
    setTaskToDelete(task);
  }, []);

  const confirmDeleteTask = async () => {
    if (!taskToDelete) return;
    try {
      await deleteTaskMutation.mutateAsync(taskToDelete.id);
      setTaskToDelete(null);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleEditTask = useCallback((task: TaskWithReadableId) => {
    setEditingTask(task);
    setIsTaskDialogOpen(true);
    // Close detail modal if open
    setIsDetailModalOpen(false);
  }, []);

  const handleTaskClick = useCallback((task: TaskWithReadableId) => {
    // Update URL without reload
    const params = new URLSearchParams(searchParams);
    params.set('task', task.id);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
    // State update happens via useEffect or we can do optimistic
    setSelectedTask(task);
    setIsDetailModalOpen(true);
  }, [pathname, router, searchParams]);

  const handleDetailModalClose = useCallback((open: boolean) => {
    if (!open) {
      const params = new URLSearchParams(searchParams);
      params.delete('task');
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
      setSelectedTask(null);
    }
    setIsDetailModalOpen(open);
  }, [pathname, router, searchParams]);

  const handleDialogChange = (open: boolean) => {
    setIsTaskDialogOpen(open);
    if (!open) setEditingTask(null);
  };

  const dialogFeatures = useMemo(() => {
    return feature ? [{ id: feature.id, title: feature.title }] : [];
  }, [feature]);

  const taskToEditForDialog = editingTask ? {
    id: editingTask.id,
    title: editingTask.title,
    description: editingTask.description || "",
    type: editingTask.type,
    priority: editingTask.priority,
    status: editingTask.status,
    points: editingTask.points?.toString(),
    modules: editingTask.modules,
    featureId: editingTask.feature?.id || feature?.id || "",
    assigneeId: editingTask.assigneeId,
    tags: editingTask.tags,
  } : null;

  // Only show skeleton on initial load (no cached data yet)
  // During refetch, keep UI mounted to preserve modal state
  if (loading && !feature && tasks.length === 0) {
    return (
      <div className="space-y-6">
        <div className="mb-6 md:mb-8">
          <PageHeaderSkeleton withAction={false} />
        </div>
        <KanbanBoardSkeleton />
      </div>
    );
  }

  if (!feature) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <h2 className="text-2xl font-bold mb-2">Feature não encontrada</h2>
        <Link href={`/projects/${resolvedParams.id}`}>
          <Button variant="outline">Voltar para o Projeto</Button>
        </Link>
      </div>
    );
  }

  // Inject feature into tasks if missing (for KanbanBoard display)
  const tasksForKanban = tasks.map(t => ({
    ...t,
    feature: t.feature || feature
  }));

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          href={`/projects/${resolvedParams.id}/epics/${resolvedParams.epicId}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Voltar para {feature.epic?.title}
        </Link>

        <div className="flex flex-col md:flex-row justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
              <span>{feature.epic?.project?.key}</span>
              <span>→</span>
              <span>{feature.epic?.title}</span>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="outline">FEATURE</Badge>
              <Badge variant="secondary">{feature.status}</Badge>
              {feature.health && (
                <FeatureHealthBadge
                  health={feature.health}
                  healthReason={feature.healthReason}
                  healthUpdatedAt={feature.healthUpdatedAt}
                />
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
              {feature.title}
            </h1>
            {feature.description && (
              <ExpandableMarkdown
                value={feature.description}
                className="text-muted-foreground max-w-2xl"
              />
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetchTasks()}
              disabled={loading || isFetching}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsSuggestModalOpen(true)}
              className="gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Sugerir Tasks
            </Button>
            <Button onClick={() => setIsTaskDialogOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Nova Task
            </Button>
          </div>
        </div>
      </div>

      {/* AI Summary Card */}
      <FeatureAISummaryCard featureId={feature.id} />

      {/* Kanban Board */}
      {
        tasks.length === 0 ? (
          <EmptyState
            icon={CheckSquare}
            title="Nenhuma task ainda"
            description="Crie tasks para detalhar o trabalho necessário nesta feature."
            action={
              <Button onClick={() => setIsTaskDialogOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Criar Primeira Task
              </Button>
            }
          />
        ) : (
          <div className="animate-in fade-in-50 duration-200">
            <KanbanBoard
              tasks={tasksForKanban}
              onTaskMove={handleTaskMove}
              onTaskClick={handleTaskClick}
              onEdit={handleEditTask}
              onDelete={handleDeleteTaskClick}
              isLoading={loading}
            />
          </div>
        )
      }

      {/* Universal Task Dialog */}
      <TaskDialog
        open={isTaskDialogOpen}
        onOpenChange={handleDialogChange}
        projectId={resolvedParams.id}
        features={dialogFeatures}
        defaultFeatureId={feature.id}
        modules={modules}
        taskToEdit={taskToEditForDialog}
        onSuccess={refetchTasks}
      />

      {/* Task Detail Modal (Sidebar) */}
      <TaskDetailModal
        task={selectedTask}
        open={isDetailModalOpen}
        onOpenChange={handleDetailModalClose}
        onEdit={handleEditTask}
        onDelete={handleDeleteTaskClick}
      />

      {/* Suggest Tasks Modal */}
      <SuggestTasksModal
        open={isSuggestModalOpen}
        onOpenChange={setIsSuggestModalOpen}
        featureId={feature.id}
        featureTitle={feature.title}
        projectId={resolvedParams.id}
        onSuccess={refetchTasks}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!taskToDelete} onOpenChange={(open) => !open && setTaskToDelete(null)}>
        <DialogContent className="z-modal">
          <DialogHeader>
            <DialogTitle>Excluir Task?</DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. A task <strong>"{taskToDelete?.title}"</strong> será permanentemente excluída.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setTaskToDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDeleteTask}>Excluir</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div >
  );
}
