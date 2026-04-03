'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Loader2, X, Target, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { WeeklyGoalSelector } from './weekly-goal-selector';

interface WeeklyGoalFeature {
  id: string;
  title: string;
  status: string;
  health: string | null;
  healthReason: string | null;
  epic?: {
    id: string;
    title: string;
    project?: {
      id: string;
      name: string;
      key: string;
    };
  } | null;
}

interface WeeklyGoalProgress {
  done: number;
  total: number;
}

interface WeeklyGoal {
  id: string;
  featureId: string;
  weekStart: string;
  feature: WeeklyGoalFeature;
  progress: WeeklyGoalProgress;
}

interface WeeklyGoalsData {
  goals: WeeklyGoal[];
  weekStart: string;
  count: number;
  limitWarning: boolean;
}

function getWeekLabel(weekStart: string): string {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${start.getDate()} ${months[start.getMonth()]} - ${end.getDate()} ${months[end.getMonth()]}`;
}

function getHealthIcon(health: string | null): { dot: string; label: string } {
  switch (health) {
    case 'ON_TRACK':
      return { dot: 'bg-green-500', label: 'No prazo' };
    case 'AT_RISK':
      return { dot: 'bg-yellow-500', label: 'Atencao' };
    case 'OFF_TRACK':
      return { dot: 'bg-red-500', label: 'Atrasado' };
    default:
      return { dot: 'bg-gray-300 dark:bg-gray-600', label: '' };
  }
}

function getStatusLabel(status: string): string {
  if (status === 'TODO') return 'A fazer';
  if (status === 'DOING') return 'Em progresso';
  if (status === 'DONE') return 'Feito';
  return status;
}

function GoalItemSkeleton() {
  return (
    <div className="space-y-2 p-3 rounded-lg">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-2 flex-1 rounded-full" />
        <Skeleton className="h-3 w-8" />
      </div>
    </div>
  );
}

export function WeeklyGoalsWidget() {
  const [data, setData] = useState<WeeklyGoalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());

  const fetchGoals = useCallback(async () => {
    try {
      const res = await fetch('/api/weekly-goals');
      if (!res.ok) throw new Error('Failed to fetch weekly goals');
      const json = await res.json();
      setData(json.data);
    } catch {
      toast.error('Erro ao carregar metas da semana.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const handleDelete = async (goalId: string) => {
    setDeletingId(goalId);
    try {
      const res = await fetch(`/api/weekly-goals/${goalId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete goal');
      toast.success('Meta removida da semana.');
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          goals: prev.goals.filter((g) => g.id !== goalId),
          count: prev.count - 1,
        };
      });
    } catch {
      toast.error('Erro ao remover meta.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleGoalAdded = () => {
    fetchGoals();
  };

  const toggleProject = (projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-32" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          <GoalItemSkeleton />
          <GoalItemSkeleton />
        </CardContent>
      </Card>
    );
  }

  const goals = data?.goals ?? [];
  const weekLabel = data?.weekStart ? getWeekLabel(data.weekStart) : '';

  const goalsByProject = useMemo(() => {
    const map = new Map<string, { name: string; goals: WeeklyGoal[] }>();
    for (const goal of goals) {
      const id = goal.feature.epic?.project?.id || '_no-project';
      const name = goal.feature.epic?.project?.name || 'Sem projeto';
      if (!map.has(id)) map.set(id, { name, goals: [] });
      map.get(id)!.goals.push(goal);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === '_no-project') return 1;
      if (b[0] === '_no-project') return -1;
      return a[1].name.localeCompare(b[1].name);
    });
  }, [goals]);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-base font-semibold">Metas da Semana</h2>
                {weekLabel && (
                  <p className="text-xs text-muted-foreground">{weekLabel}</p>
                )}
              </div>
              {data?.limitWarning && (
                <span className="inline-flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Limite proximo
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setSelectorOpen(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {goals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Target className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                Nenhuma meta esta semana
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectorOpen(true)}
              >
                Planejar minha semana
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {goalsByProject.map(([projectId, project]) => {
                const isCollapsed = collapsedProjects.has(projectId);
                return (
                  <div key={projectId}>
                    {goalsByProject.length > 1 && (
                      <button
                        onClick={() => toggleProject(projectId)}
                        className="w-full flex items-center gap-2 px-1 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
                      >
                        {isCollapsed
                          ? <ChevronRight className="h-3.5 w-3.5" />
                          : <ChevronDown className="h-3.5 w-3.5" />}
                        <span>{project.name}</span>
                        <span className="text-muted-foreground/60 font-normal normal-case">
                          {project.goals.length}
                        </span>
                      </button>
                    )}
                    {!isCollapsed && (
                      <div className="space-y-1">
                        {project.goals.map((goal) => {
                          const pct = goal.progress.total > 0
                            ? Math.round((goal.progress.done / goal.progress.total) * 100)
                            : 0;
                          const health = getHealthIcon(goal.feature.health);
                          return (
                            <div
                              key={goal.id}
                              className="group flex items-start gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors"
                            >
                              <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0 mt-2', health.dot)} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                  <h3 className="text-sm font-medium truncate">{goal.feature.title}</h3>
                                  <button
                                    onClick={() => handleDelete(goal.id)}
                                    disabled={deletingId === goal.id}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-50 flex-shrink-0"
                                    title="Remover meta"
                                  >
                                    {deletingId === goal.id
                                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      : <X className="h-3.5 w-3.5" />}
                                  </button>
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                                  {goal.feature.epic?.project?.name && (
                                    <>
                                      <span className="truncate">{goal.feature.epic.project.name}</span>
                                      {goal.feature.epic?.title && <span className="text-muted-foreground/40">/</span>}
                                    </>
                                  )}
                                  {goal.feature.epic?.title && <span className="truncate">{goal.feature.epic.title}</span>}
                                  <span className="text-muted-foreground/40 mx-0.5">·</span>
                                  <span>{getStatusLabel(goal.feature.status)}</span>
                                  {health.label && (
                                    <>
                                      <span className="text-muted-foreground/40 mx-0.5">·</span>
                                      <span className={cn(
                                        health.dot === 'bg-green-500' && 'text-green-600 dark:text-green-400',
                                        health.dot === 'bg-yellow-500' && 'text-yellow-600 dark:text-yellow-400',
                                        health.dot === 'bg-red-500' && 'text-red-600 dark:text-red-400',
                                      )}>{health.label}</span>
                                    </>
                                  )}
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={cn(
                                        'h-full rounded-full transition-all duration-300',
                                        pct === 100 ? 'bg-green-500' : pct > 50 ? 'bg-yellow-500' : 'bg-blue-500',
                                      )}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-[11px] text-muted-foreground w-12 text-right flex-shrink-0 tabular-nums">
                                    {goal.progress.done}/{goal.progress.total} <span className="text-muted-foreground/60">{pct}%</span>
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <WeeklyGoalSelector
        open={selectorOpen}
        onOpenChange={setSelectorOpen}
        onGoalAdded={handleGoalAdded}
        existingGoalIds={goals.map((g) => g.featureId)}
      />
    </>
  );
}
