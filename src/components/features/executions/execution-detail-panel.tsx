'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveExecution, useLiveExecutionEvents, useKillExecution } from '@/lib/query/hooks/use-executions';
import { useExecutionTask } from '@/lib/query/hooks/use-execution-task';
import { useAgents } from '@/lib/query/hooks/use-agents';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
  StopCircle,
  FileText,
  ClipboardList,
  FolderOpen,
  GitBranch,
  MonitorSmartphone,
  Eye,
  ExternalLink,
} from 'lucide-react';
import { ExecutionResultPanel } from './execution-result-panel';
import { ExecutionContextCard } from './execution-context-card';
import { ExecutionWatchMode } from './execution-watch-mode';
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function evidenceChecksCount(qaEvidence: Record<string, unknown> | null): number {
  const checksRun = qaEvidence?.checksRun;
  if (Array.isArray(checksRun)) return checksRun.length;
  const checks = qaEvidence?.checks;
  return Array.isArray(checks) ? checks.length : 0;
}

const WORKSPACE_MODE_LABELS: Record<string, string> = {
  no_write: 'Somente leitura',
  branch: 'Branch',
  direct: 'Direto',
};

interface ExecutionDetailPanelProps {
  executionId: string;
  onClose?: () => void;
}

export function ExecutionDetailPanel({ executionId, onClose }: ExecutionDetailPanelProps) {
  const { data: selectedExecution } = useLiveExecution(executionId, true);
  const { events: executionEvents } = useLiveExecutionEvents(executionId, true);
  const { data: agents } = useAgents();
  const killExecutionMutation = useKillExecution();
  const [watchModeOpen, setWatchModeOpen] = useState(false);

  const exec = selectedExecution as ExecutionRecord | undefined;
  const taskId = exec?.taskId ?? null;
  const { data: linkedTask, isLoading: isLoadingTask } = useExecutionTask(taskId, !!taskId);

  const structuredResult = exec?.metadata ? extractStructuredResult(exec.metadata) : null;
  const executionMetadata = (exec?.metadata ?? {}) as Record<string, unknown>;
  const runtimeBinding = asRecord(executionMetadata.runtimeBinding);
  const outputContract = asRecord(executionMetadata.outputContract);
  const evidence = asRecord(executionMetadata.evidence);
  const qaEvidence = asRecord(evidence?.qa);
  const gitEvidence = asRecord(evidence?.git) ?? asRecord(evidence?.artifact);
  const gitLinks = asRecord(gitEvidence?.links);
  const runtimeMetadata = asRecord(runtimeBinding?.metadata);
  const effectiveRole =
    readString(executionMetadata.runRole) ??
    readString(runtimeMetadata?.runRole) ??
    readString(runtimeMetadata?.role);
  const qaPassed = readBoolean(qaEvidence?.passed);
  const hasProtocolEvidence = Boolean(outputContract || qaEvidence || gitEvidence);

  const agentsMap = new Map((agents ?? []).map((a: any) => [a.id, a.name]));

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

  const secondsSinceLastUpdate = lastEventTime
    ? Math.floor((now.getTime() - lastEventTime.getTime()) / 1000)
    : null;
  const isExecutionAlive = exec?.status === 'CLAIMED' || exec?.status === 'RUNNING';
  const showExecutionError = exec?.status !== 'SUCCESS' && Boolean(exec?.errorMessage);
  const hasWorkspace = exec?.workspaceMode || exec?.workspaceRef || exec?.workspacePath;

  if (!exec) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
              <Badge
                variant="secondary"
                className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 animate-pulse"
              >
                Live
              </Badge>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                disabled={killExecutionMutation.isPending}
                onClick={() => {
                  if (confirm('Tem certeza que deseja matar esta execução?')) {
                    killExecutionMutation.mutate(executionId);
                  }
                }}
              >
                <StopCircle className="h-3.5 w-3.5" />
                Matar
              </Button>
            </>
          )}
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs">
        <div>
          <span className="text-muted-foreground">Execution</span>
          <div className="mt-0.5 font-mono break-all">{exec.id}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Owner</span>
          <div className="mt-0.5 font-medium">
            {agentsMap.get(exec.agentId) ?? exec.agentId.slice(0, 8)}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">Status</span>
          <div className="mt-0.5">
            <Badge variant="secondary" className={STATUS_COLORS[exec.status] ?? ''}>
              {STATUS_ICONS[exec.status]}
              <span className="ml-1">{exec.status}</span>
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
        <div>
          <span className="text-muted-foreground">Role</span>
          <div className="mt-0.5 font-medium">{effectiveRole ?? '—'}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Duração</span>
          <div className="mt-0.5 font-medium">{formatDuration(exec.duration)}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Início</span>
          <div className="mt-0.5 font-medium">
            {exec.startedAt ? new Date(exec.startedAt).toLocaleString('pt-BR') : '—'}
          </div>
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

      {hasProtocolEvidence && (
        <>
          <Separator />
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Evidence
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {outputContract && (
                <Badge variant="outline" className="gap-1">
                  result: {readString(outputContract.source) ?? 'unknown'}
                </Badge>
              )}
              {qaEvidence && (
                <Badge
                  variant="outline"
                  className={
                    qaPassed === true
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : qaPassed === false
                        ? 'text-red-600 dark:text-red-400'
                        : ''
                  }
                >
                  QA {qaPassed === true ? 'passou' : qaPassed === false ? 'falhou' : 'pendente'} ·{' '}
                  {evidenceChecksCount(qaEvidence)} checks
                </Badge>
              )}
              {gitEvidence && (
                <Badge
                  variant="outline"
                  className={
                    readBoolean(gitEvidence.policyVerified) === false
                      ? 'text-red-600 dark:text-red-400'
                      : readBoolean(gitEvidence.hasVerifiableDelta) === true
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : ''
                  }
                >
                  Git {readString(gitEvidence.gitPolicy) ?? readString(gitEvidence.mode) ?? 'manual'}
                </Badge>
              )}
              {readString(gitEvidence?.branch) && (
                <Badge variant="outline" className="font-mono">
                  {readString(gitEvidence?.branch)}
                </Badge>
              )}
              {readString(gitLinks?.compare) && (
                <a
                  href={readString(gitLinks?.compare) ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-500 hover:underline"
                >
                  compare
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {readString(gitEvidence?.prUrl) && (
                <a
                  href={readString(gitEvidence?.prUrl) ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-500 hover:underline"
                >
                  PR #{typeof gitEvidence?.prNumber === 'number' ? gitEvidence.prNumber : '?'}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
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
                      <span>
                        {secondsSinceLastUpdate < 60
                          ? `${secondsSinceLastUpdate}s`
                          : `${Math.floor(secondsSinceLastUpdate / 60)}min`}{' '}
                        atrás
                      </span>
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

      <ExecutionWatchMode
        executionId={executionId}
        open={watchModeOpen}
        onOpenChange={setWatchModeOpen}
      />
    </div>
  );
}
