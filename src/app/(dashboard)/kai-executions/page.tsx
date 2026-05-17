'use client';

import { useEffect, useMemo, useState } from 'react';
import { useExecutionEvents, useExecutions, useLiveExecution, useKillExecution } from '@/lib/query/hooks/use-executions';
import { useExecutionTask } from '@/lib/query/hooks/use-execution-task';
import { useAgents } from '@/lib/query/hooks/use-agents';
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
} from 'lucide-react';
import { ExecutionResultPanel } from '@/components/features/executions/execution-result-panel';
import { ExecutionContextCard } from '@/components/features/executions/execution-context-card';
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
  const effectiveFilter = statusFilter && statusFilter !== 'ALL' ? { status: statusFilter } : undefined;
  const { data, isLoading } = useExecutions(effectiveFilter);
  const { data: agents } = useAgents();
  const killExecutionMutation = useKillExecution();
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const { data: selectedExecution } = useLiveExecution(selectedExecutionId ?? '', !!selectedExecutionId);
  const { data: executionEvents } = useExecutionEvents(selectedExecutionId ?? '', undefined, !!selectedExecutionId);

  const exec = selectedExecution as ExecutionRecord | undefined;
  const taskId = exec?.taskId ?? null;
  const { data: linkedTask, isLoading: isLoadingTask } = useExecutionTask(taskId, !!taskId);

  const structuredResult = exec?.metadata ? extractStructuredResult(exec.metadata) : null;

  const agentsMap = new Map((agents ?? []).map((a: any) => [a.id, a.name]));
  const liveOutput = useMemo(() => {
    const eventLines = (executionEvents?.items ?? [])
      .map((event: any) => String(event.content ?? ''))
      .filter(Boolean);
    if (eventLines.length > 0) {
      return eventLines.join('\n');
    }
    return String(exec?.output ?? '');
  }, [executionEvents?.items, exec?.output]);
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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Todos os status" />
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
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tool</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Duração</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Início</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((execItem: any) => (
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {exec && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Detalhes da Execução</h3>
            <div className="flex items-center gap-2">
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
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  <FileText className="h-3.5 w-3.5" />
                  Output
                </div>
                <pre className="mt-1 text-xs bg-muted rounded p-3 overflow-x-auto max-h-96 whitespace-pre-wrap">
                  {liveOutput}
                </pre>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}