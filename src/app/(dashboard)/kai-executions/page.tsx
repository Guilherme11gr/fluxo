'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useExecutions, useLiveExecution, useKillExecution, useLiveExecutionEvents } from '@/lib/query/hooks/use-executions';
import { useExecutionTask } from '@/lib/query/hooks/use-execution-task';
import { useAgents } from '@/lib/query/hooks/use-agents';
import { useProjects } from '@/lib/query/hooks/use-projects';
import { useTasks } from '@/lib/query/hooks/use-tasks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  X,
  StopCircle,
  FileText,
  ClipboardList,
  FolderOpen,
  GitBranch,
  MonitorSmartphone,
  Eye,
  FolderKanban,
} from 'lucide-react';
import { ExecutionResultPanel } from '@/components/features/executions/execution-result-panel';
import { ExecutionContextCard } from '@/components/features/executions/execution-context-card';
import { ExecutionWatchMode } from '@/components/features/executions/execution-watch-mode';
import type { ExecutionRecord } from '@/shared/types';
import { extractStructuredResult } from '@/shared/types';

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

const WORKSPACE_MODE_LABELS: Record<string, string> = {
  no_write: 'Somente leitura',
  branch: 'Branch',
  direct: 'Direto',
};

export default function ExecutionsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [projectFilter, setProjectFilter] = useState<string>('');
  const [taskFilter, setTaskFilter] = useState<string>('');
  const { data: projects } = useProjects();
  const projectsMap = new Map((projects ?? []).map((p) => [p.id, p]));

  const apiFilters: Record<string, string> = {};
  if (statusFilter && statusFilter !== 'ALL') apiFilters.status = statusFilter;
  if (projectFilter && projectFilter !== '__all__') apiFilters.projectId = projectFilter;
  if (taskFilter && taskFilter !== '__all__') apiFilters.taskId = taskFilter;

  const { data, isLoading } = useExecutions(Object.keys(apiFilters).length > 0 ? apiFilters : undefined);
  const { data: agents } = useAgents();
  const killExecutionMutation = useKillExecution();
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [watchModeOpen, setWatchModeOpen] = useState(false);
  const { data: selectedExecution } = useLiveExecution(selectedExecutionId ?? '', !!selectedExecutionId);
  const { events: executionEvents } = useLiveExecutionEvents(selectedExecutionId ?? '', !!selectedExecutionId);

  const exec = selectedExecution as ExecutionRecord | undefined;
  const taskId = exec?.taskId ?? null;
  const { data: linkedTask, isLoading: isLoadingTask } = useExecutionTask(taskId, !!taskId);

  const structuredResult = exec?.metadata ? extractStructuredResult(exec.metadata) : null;

  const agentsMap = new Map((agents ?? []).map((a: any) => [a.id, a.name]));

  const taskIdsInList = useMemo(() => {
    const items = data?.items;
    if (!items?.length) return [] as string[];
    return Array.from(new Set(items.map((e: any) => e.taskId).filter(Boolean)));
  }, [data?.items]);

  const { data: tasksData } = useTasks({ filters: {} });
  const tasksMap = useMemo(() => {
    const map = new Map<string, { title: string; readableId?: string; projectId?: string }>();
    for (const t of tasksData?.items ?? []) {
      map.set(t.id, { title: t.title, readableId: t.readableId, projectId: t.feature?.epic?.project?.id ?? t.projectId });
    }
    return map;
  }, [tasksData?.items]);

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
  const liveOutput = useMemo(() => {
    const eventLines = (executionEvents ?? [])
      .map((event: any) => String(event.content ?? ''))
      .filter(Boolean);
    if (eventLines.length > 0) {
      return eventLines.join('\n');
    }
    return String(exec?.output ?? '');
  }, [executionEvents, exec?.output]);

  const outputRef = useRef<HTMLPreElement>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const [now, setNow] = useState(new Date());

  const lastEventTime = useMemo(() => {
    if (!executionEvents?.length) return null;
    const last = executionEvents[executionEvents.length - 1];
    return new Date(last.createdAt);
  }, [executionEvents]);

  useEffect(() => {
    if (autoFollow && outputRef.current && executionEvents?.length) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [liveOutput, autoFollow, executionEvents?.length]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleOutputScroll = (e: React.UIEvent<HTMLPreElement>) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoFollow(atBottom);
  };

  const handleWatchModeChange = (open: boolean) => {
    setWatchModeOpen(open);
  };

  const handleProjectChange = (value: string) => {
    setProjectFilter(value);
    setTaskFilter('');
  };

  const secondsSinceLastUpdate = lastEventTime ? Math.floor((now.getTime() - lastEventTime.getTime()) / 1000) : null;
  const isExecutionAlive = exec?.status === 'CLAIMED' || exec?.status === 'RUNNING';
  const showExecutionError =
    exec?.status !== 'SUCCESS' && Boolean(exec?.errorMessage);
  const hasWorkspace = exec?.workspaceMode || exec?.workspaceRef || exec?.workspacePath;

  useEffect(() => {
    if (!selectedExecutionId || !data?.items?.length) return;
    if (!data.items.some((e: any) => e.id === selectedExecutionId)) {
      setSelectedExecutionId(null);
    }
  }, [data?.items, selectedExecutionId]);

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
          <Select value={taskFilter} onValueChange={setTaskFilter}>
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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
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

      {exec && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Detalhes da Execução</h3>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => setWatchModeOpen(true)}
              >
                <Eye className="h-3.5 w-3.5" />
                Assistir ao vivo
              </Button>
              {(exec.status === 'CLAIMED' || exec.status === 'RUNNING') && (
                <>
                  <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 animate-pulse">
                    Live
                  </Badge>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    disabled={killExecutionMutation.isPending}
                    onClick={() => {
                      if (selectedExecutionId && confirm('Tem certeza que deseja matar esta execução?')) {
                        killExecutionMutation.mutate(selectedExecutionId);
                      }
                    }}
                  >
                    <StopCircle className="h-3.5 w-3.5" />
                    Matar
                  </Button>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSelectedExecutionId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Status</span>
              <div className="mt-0.5">
                <Badge variant="secondary" className={STATUS_COLORS[exec.status] ?? ''}>
                  {exec.status}
                </Badge>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Tool</span>
              <div className="mt-0.5 font-medium">{exec.tool ?? '—'}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Model</span>
              <div className="mt-0.5 font-medium">{exec.model ?? '—'}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Exit Code</span>
              <div className="mt-0.5 font-mono">{exec.exitCode ?? '—'}</div>
            </div>
          </div>

          {showExecutionError && (
            <div>
              <span className="text-xs text-muted-foreground">Error</span>
              <pre className="mt-1 text-xs bg-destructive/10 text-destructive rounded p-3 overflow-x-auto max-h-48">
                {exec.errorMessage}
              </pre>
            </div>
          )}

          {hasWorkspace && (
            <>
              <Separator />
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  <MonitorSmartphone className="h-3.5 w-3.5" />
                  Workspace
                </div>
                <div className="space-y-1 text-xs">
                  {exec.workspaceMode && (
                    <div className="flex items-center gap-1.5">
                      <FolderOpen className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Modo:</span>
                      <Badge variant="outline" className="text-xs">
                        {WORKSPACE_MODE_LABELS[exec.workspaceMode] ?? exec.workspaceMode}
                      </Badge>
                    </div>
                  )}
                  {exec.workspaceRef && (
                    <div className="flex items-center gap-1.5">
                      <GitBranch className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Ref:</span>
                      <span className="font-mono">{exec.workspaceRef}</span>
                    </div>
                  )}
                  {exec.workspacePath && (
                    <div className="pl-4 text-muted-foreground font-mono break-all">
                      {exec.workspacePath}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {taskId && (
            <>
              <Separator />
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Task vinculada
                </div>
                <ExecutionContextCard taskId={taskId} task={linkedTask} isLoading={isLoadingTask} />
              </div>
            </>
          )}

          {structuredResult ? (
            <>
              <Separator />
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  <FileText className="h-3.5 w-3.5" />
                  Resultado estruturado
                </div>
                <ExecutionResultPanel result={structuredResult} />
              </div>
            </>
          ) : exec.resultSummary ? (
            <>
              <Separator />
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  <FileText className="h-3.5 w-3.5" />
                  Resumo
                </div>
                <div className="text-sm text-foreground bg-muted/50 rounded-md p-3 border border-border/50">
                  {exec.resultSummary}
                </div>
              </div>
            </>
          ) : null}

          {liveOutput && (
            <>
              <Separator />
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <FileText className="h-3.5 w-3.5" />
                    Output
                  </div>
                  <div className="flex items-center gap-2">
                    {isExecutionAlive && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {secondsSinceLastUpdate !== null && secondsSinceLastUpdate < 15 && (
                          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        )}
                        {secondsSinceLastUpdate !== null && (
                          <span>{secondsSinceLastUpdate < 60 ? `${secondsSinceLastUpdate}s` : `${Math.floor(secondsSinceLastUpdate / 60)}min`} atrás</span>
                        )}
                      </div>
                    )}
                    {autoFollow && isExecutionAlive && (
                      <span className="text-[10px] text-muted-foreground">auto-follow</span>
                    )}
                    {!autoFollow && isExecutionAlive && (
                      <button
                        className="text-[10px] text-blue-500 hover:text-blue-400 transition-colors"
                        onClick={() => {
                          setAutoFollow(true);
                          if (outputRef.current) {
                            outputRef.current.scrollTop = outputRef.current.scrollHeight;
                          }
                        }}
                      >
                        ir para o final
                      </button>
                    )}
                  </div>
                </div>
                <pre
                  ref={outputRef}
                  onScroll={handleOutputScroll}
                  className="mt-1 text-xs bg-muted rounded p-3 overflow-x-auto max-h-96 whitespace-pre-wrap"
                >
                  {liveOutput}
                </pre>
              </div>
            </>
          )}
        </div>
      )}

      {selectedExecutionId && (
        <ExecutionWatchMode
          executionId={selectedExecutionId}
          open={watchModeOpen}
          onOpenChange={handleWatchModeChange}
        />
      )}
    </div>
  );
}