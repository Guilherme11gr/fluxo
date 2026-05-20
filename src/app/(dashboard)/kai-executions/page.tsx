'use client';

import { useState, useMemo } from 'react';
import { useExecutions } from '@/lib/query/hooks/use-executions';
import { useAgents } from '@/lib/query/hooks/use-agents';
import { useProjects } from '@/lib/query/hooks/use-projects';
import { useTasks } from '@/lib/query/hooks/use-tasks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  X,
  FolderKanban,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { ExecutionDetailPanel } from '@/components/features/executions/execution-detail-panel';

const STATUS_COLORS: Record<string, string> = {
  CLAIMED: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  RUNNING: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 animate-pulse',
  SUCCESS: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  FAILED: 'bg-red-500/15 text-red-600 dark:text-red-400',
  TIMEOUT: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  CANCELLED: 'bg-gray-500/15 text-gray-600 dark:text-gray-400',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  CLAIMED: <Clock className="h-3.5 w-3.5" />,
  RUNNING: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
  SUCCESS: <CheckCircle2 className="h-3.5 w-3.5" />,
  FAILED: <XCircle className="h-3.5 w-3.5" />,
  TIMEOUT: <AlertTriangle className="h-3.5 w-3.5" />,
  CANCELLED: <X className="h-3.5 w-3.5" />,
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

export default function ExecutionsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [projectFilter, setProjectFilter] = useState<string>('');
  const [taskFilter, setTaskFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);

  const { data: projects } = useProjects();
  const projectsMap = new Map((projects ?? []).map((p) => [p.id, p]));

  const apiFilters: Record<string, string> = {};
  if (statusFilter && statusFilter !== 'ALL') apiFilters.status = statusFilter;
  if (projectFilter && projectFilter !== '__all__') apiFilters.projectId = projectFilter;
  if (taskFilter && taskFilter !== '__all__') apiFilters.taskId = taskFilter;

  const { data, isLoading } = useExecutions({
    filters: Object.keys(apiFilters).length > 0 ? apiFilters : undefined,
    page,
    limit: pageSize,
  });

  const { data: agents } = useAgents();
  const agentsMap = new Map((agents ?? []).map((a: any) => [a.id, a.name]));

  const { data: tasksData } = useTasks({ filters: {} });
  const tasksMap = useMemo(() => {
    const map = new Map<string, { title: string; readableId?: string; projectId?: string }>();
    for (const t of tasksData?.items ?? []) {
      map.set(t.id, {
        title: t.title,
        readableId: t.readableId,
        projectId: t.feature?.epic?.project?.id ?? t.projectId,
      });
    }
    return map;
  }, [tasksData?.items]);

  const taskIdsInList = useMemo(() => {
    const items = data?.items;
    if (!items?.length) return [] as string[];
    return Array.from(new Set(items.map((e: any) => e.taskId).filter(Boolean)));
  }, [data?.items]);

  const taskOptions = useMemo(() => {
    return taskIdsInList.map((tid) => {
      const info = tasksMap.get(tid);
      return {
        id: tid,
        label: info?.readableId ? `${info.readableId} - ${info.title}` : tid.slice(0, 8),
        projectId: info?.projectId,
      };
    });
  }, [taskIdsInList, tasksMap]);

  const filteredTaskOptions = projectFilter
    ? taskOptions.filter((t) => t.projectId === projectFilter)
    : taskOptions;

  const handleProjectChange = (value: string) => {
    setProjectFilter(value);
    setTaskFilter('');
    setPage(1);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleTaskChange = (value: string) => {
    setTaskFilter(value);
    setPage(1);
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Execuções</h1>
          <p className="text-sm text-muted-foreground">Histórico de execuções dos agentes</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={projectFilter} onValueChange={handleProjectChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Projeto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os projetos</SelectItem>
              {(projects ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={taskFilter} onValueChange={handleTaskChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Task" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as tasks</SelectItem>
              {filteredTaskOptions.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os status</SelectItem>
              <SelectItem value="CLAIMED">Claimed</SelectItem>
              <SelectItem value="RUNNING">Running</SelectItem>
              <SelectItem value="SUCCESS">Success</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="TIMEOUT">Timeout</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data?.items?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <Play className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Nenhuma execução encontrada</p>
          <p className="text-xs mt-1">As execuções aparecem quando o runner processa tasks</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Agent</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Projeto</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Task</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tool</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Duração</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Início</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((execItem: any) => {
                const project = projectsMap.get(execItem.projectId);
                const taskInfo = tasksMap.get(execItem.taskId);
                return (
                  <tr
                    key={execItem.id}
                    className={`border-b border-border hover:bg-muted/30 cursor-pointer transition-colors ${selectedExecutionId === execItem.id ? 'bg-muted/40' : ''}`}
                    onClick={() => setSelectedExecutionId(selectedExecutionId === execItem.id ? null : execItem.id)}
                  >
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className={STATUS_COLORS[execItem.status] ?? ''}>
                        {STATUS_ICONS[execItem.status]}
                        <span className="ml-1">{execItem.status}</span>
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {agentsMap.get(execItem.agentId) ?? execItem.agentId?.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3">
                      {project ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <FolderKanban className="h-3 w-3 text-muted-foreground" />
                          {project.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {taskInfo ? (
                        <span className="text-xs">
                          {taskInfo.readableId && (
                            <span className="font-mono text-muted-foreground mr-1">{taskInfo.readableId}</span>
                          )}
                          <span className="truncate max-w-[160px] inline-block">{taskInfo.title}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs font-mono">{execItem.taskId?.slice(0, 8)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {execItem.tool ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDuration(execItem.duration)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatTimeAgo(new Date(execItem.startedAt))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              Mostrando{' '}
              <span className="font-medium text-foreground">{(page - 1) * pageSize + 1}</span>{' '}
              a{' '}
              <span className="font-medium text-foreground">{Math.min(page * pageSize, data.total)}</span>{' '}
              de{' '}
              <span className="font-medium text-foreground">{data.total}</span> execuções
            </span>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Linhas por página:</span>
              <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Página {page} de {Math.ceil(data.total / pageSize)}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage((p) => Math.min(Math.ceil(data.total / pageSize), p + 1))}
                  disabled={page >= Math.ceil(data.total / pageSize)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedExecutionId && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <ExecutionDetailPanel
            executionId={selectedExecutionId}
            onClose={() => setSelectedExecutionId(null)}
          />
        </div>
      )}
    </div>
  );
}
