'use client';

import { useEffect, useMemo, useState } from 'react';
import { useExecutionEvents, useExecutions, useLiveExecution } from '@/lib/query/hooks/use-executions';
import { useAgents } from '@/lib/query/hooks/use-agents';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Clock, CheckCircle2, XCircle, AlertTriangle, Play, X } from 'lucide-react';

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

type ExecutionRecord = {
  id: string;
  agentId?: string;
  tool?: string | null;
  model?: string | null;
  output?: string | null;
  resultSummary?: string | null;
  errorMessage?: string | null;
  startedAt?: string;
  duration?: number | null;
  exitCode?: number | null;
  status: string;
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
  const effectiveFilter = statusFilter && statusFilter !== 'ALL' ? { status: statusFilter } : undefined;
  const { data, isLoading } = useExecutions(effectiveFilter);
  const { data: agents } = useAgents();
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const { data: selectedExecution } = useLiveExecution(selectedExecutionId ?? '', !!selectedExecutionId);
  const { data: executionEvents } = useExecutionEvents(selectedExecutionId ?? '', undefined, !!selectedExecutionId);

  const agentsMap = new Map((agents ?? []).map((a: any) => [a.id, a.name]));
  const liveOutput = useMemo(() => {
    const eventLines = (executionEvents?.items ?? [])
      .map((event: any) => String(event.content ?? ''))
      .filter(Boolean);
    if (eventLines.length > 0) {
      return eventLines.join('\n');
    }
    return String(selectedExecution?.output ?? '');
  }, [executionEvents?.items, selectedExecution?.output]);
  const showExecutionError =
    selectedExecution?.status !== 'SUCCESS' && Boolean((selectedExecution as ExecutionRecord | undefined)?.errorMessage);

  useEffect(() => {
    if (!selectedExecutionId || !data?.items?.length) return;
    if (!data.items.some((exec: any) => exec.id === selectedExecutionId)) {
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
              {data.items.map((exec: any) => (
                <tr
                  key={exec.id}
                  className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => setSelectedExecutionId(selectedExecutionId === exec.id ? null : exec.id)}
                >
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className={STATUS_COLORS[exec.status] ?? ''}>
                      {STATUS_ICONS[exec.status]}
                      <span className="ml-1">{exec.status}</span>
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {agentsMap.get(exec.agentId) ?? exec.agentId?.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {exec.tool ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDuration(exec.duration)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatTimeAgo(new Date(exec.startedAt))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Execution detail panel */}
      {selectedExecution && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Detalhes da Execução</h3>
            <div className="flex items-center gap-2">
              {(String((selectedExecution as ExecutionRecord).status) === 'CLAIMED' || String((selectedExecution as ExecutionRecord).status) === 'RUNNING') && (
                <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 animate-pulse">
                  Live
                </Badge>
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
                <Badge variant="secondary" className={STATUS_COLORS[String((selectedExecution as ExecutionRecord).status)] ?? ''}>
                  {String((selectedExecution as ExecutionRecord).status)}
                </Badge>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Tool</span>
              <div className="mt-0.5 font-medium">{(selectedExecution as ExecutionRecord).tool ?? '—'}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Model</span>
              <div className="mt-0.5 font-medium">{(selectedExecution as ExecutionRecord).model ?? '—'}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Exit Code</span>
              <div className="mt-0.5 font-mono">{(selectedExecution as ExecutionRecord).exitCode ?? '—'}</div>
            </div>
          </div>
          {showExecutionError && (
            <div>
              <span className="text-xs text-muted-foreground">Error</span>
              <pre className="mt-1 text-xs bg-destructive/10 text-destructive rounded p-3 overflow-x-auto max-h-48">
                {(selectedExecution as ExecutionRecord).errorMessage}
              </pre>
            </div>
          )}
          {(selectedExecution as ExecutionRecord).resultSummary && (
            <div>
              <span className="text-xs text-muted-foreground">Result Summary</span>
              <pre className="mt-1 text-xs bg-muted rounded p-3 overflow-x-auto max-h-48">
                {(selectedExecution as ExecutionRecord).resultSummary}
              </pre>
            </div>
          )}
          {liveOutput && (
            <div>
              <span className="text-xs text-muted-foreground">Full Output</span>
              <pre className="mt-1 text-xs bg-muted rounded p-3 overflow-x-auto max-h-96 whitespace-pre-wrap">
                {liveOutput}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
