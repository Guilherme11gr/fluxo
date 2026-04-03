'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, X, Target, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { WeeklyGoalSelector } from './weekly-goal-selector';

interface WeeklyGoalFeature {
  id: string;
  title: string;
  status: string;
  health: string;
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
  const startDay = start.getDate();
  const endDay = end.getDate();
  const month = months[start.getMonth()];

  return `${startDay} ${month} - ${endDay} ${months[end.getMonth()]}`;
}

function getStatusBadge(status: string) {
  const statusMap: Record<string, { label: string; className: string }> = {
    TODO: { label: 'A Fazer', className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
    DOING: { label: 'Fazendo', className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
    DONE: { label: 'Feito', className: 'bg-green-500/10 text-green-500 border-green-500/20' },
    BACKLOG: { label: 'Backlog', className: 'bg-muted text-muted-foreground border-border' },
  };

  const config = statusMap[status] || statusMap.BACKLOG;

  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', config.className)}>
      {config.label}
    </span>
  );
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
      if (!res.ok) {
        throw new Error('Failed to delete goal');
      }
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
                  Limite prximo
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
            <div className="space-y-1">
              {goals.map((goal) => {
                const percentage =
                  goal.progress.total > 0
                    ? Math.round((goal.progress.done / goal.progress.total) * 100)
                    : 0;

                return (
                  <div
                    key={goal.id}
                    className="group flex items-start gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <h3 className="text-sm font-medium truncate">
                          {goal.feature.title}
                        </h3>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {getStatusBadge(goal.feature.status)}
                          <button
                            onClick={() => handleDelete(goal.id)}
                            disabled={deletingId === goal.id}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-50"
                            title="Remover meta"
                          >
                            {deletingId === goal.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <X className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-300',
                              percentage === 100
                                ? 'bg-green-500'
                                : percentage > 50
                                  ? 'bg-yellow-500'
                                  : 'bg-blue-500'
                            )}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-10 text-right flex-shrink-0">
                          {percentage}%
                        </span>
                      </div>
                    </div>
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
