'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  ChevronDown,
  ChevronRight,
  Code,
  Wrench,
  FileText,
  Zap,
  Activity,
} from 'lucide-react';
import { useExecutionStream } from '@/lib/query/hooks/use-execution-stream';
import { useLiveExecution } from '@/lib/query/hooks/use-executions';
import type { ExecutionRecord } from '@/shared/types';

const STATUS_COLORS: Record<string, string> = {
  CLAIMED: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  RUNNING: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 animate-pulse',
  SUCCESS: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  FAILED: 'bg-red-500/15 text-red-600 dark:text-red-400',
  TIMEOUT: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  CANCELLED: 'bg-gray-500/15 text-gray-600 dark:text-gray-400',
};

const KIND_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  step: { icon: <Play className="h-3.5 w-3.5" />, label: 'Step', color: 'text-blue-500' },
  tool_use: { icon: <Wrench className="h-3.5 w-3.5" />, label: 'Tool Use', color: 'text-purple-500' },
  tool_result: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: 'Tool Result', color: 'text-emerald-500' },
  result: { icon: <FileText className="h-3.5 w-3.5" />, label: 'Result', color: 'text-cyan-500' },
  error: { icon: <XCircle className="h-3.5 w-3.5" />, label: 'Error', color: 'text-red-500' },
  output: { icon: <Code className="h-3.5 w-3.5" />, label: 'Output', color: 'text-amber-500' },
  status: { icon: <Activity className="h-3.5 w-3.5" />, label: 'Status', color: 'text-gray-500' },
};

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

interface ExecutionWatchModeProps {
  executionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExecutionWatchMode({ executionId, open, onOpenChange }: ExecutionWatchModeProps) {
  const [compactMode, setCompactMode] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const { events, lastSeq, isConnected, mode, error } = useExecutionStream(executionId, open);
  const { data: executionData } = useLiveExecution(executionId, open);
  const exec = executionData as ExecutionRecord | undefined;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoFollow, setAutoFollow] = useState(true);

  const isAlive = exec?.status === 'CLAIMED' || exec?.status === 'RUNNING';

  useEffect(() => {
    if (autoFollow && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length, autoFollow]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoFollow(atBottom);
  };

  const toggleEvent = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const connectionBadge = useMemo(() => {
    if (mode === 'sse') {
      return (
        <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 gap-1">
          <Zap className="h-3 w-3" />
          SSE ao vivo
        </Badge>
      );
    }
    if (mode === 'polling') {
      return (
        <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 gap-1">
          <Activity className="h-3 w-3" />
          Polling
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="bg-gray-500/15 text-gray-600 gap-1">
        Desconectado
      </Badge>
    );
  }, [mode]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SheetTitle className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Assistir ao vivo
              </SheetTitle>
              {connectionBadge}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setCompactMode(!compactMode)}
              >
                {compactMode ? 'Modo completo' : 'Modo compacto'}
              </Button>
            </div>
          </div>
          {exec && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
              <Badge variant="secondary" className={STATUS_COLORS[exec.status] ?? ''}>
                {exec.status}
              </Badge>
              {exec.tool && <span>Tool: {exec.tool}</span>}
              {exec.model && <span>Model: {exec.model}</span>}
              {exec.duration && <span>Duração: {formatDuration(exec.duration)}</span>}
            </div>
          )}
          <SheetDescription>
            Acompanhe a execução do agente em tempo real
          </SheetDescription>
        </SheetHeader>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-md text-xs text-red-600 dark:text-red-400">
            <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
            Erro de conexão: {error.message}. Usando fallback.
          </div>
        )}

        <ScrollArea className="flex-1" ref={scrollRef} onScroll={handleScroll}>
          <div className="px-6 py-4 space-y-1">
            {events.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mb-3" />
                <p className="text-sm">Aguardando eventos...</p>
                <p className="text-xs mt-1">Os eventos aparecerão conforme o agente trabalha</p>
              </div>
            )}

            {events.map((event, index) => {
              const config = KIND_CONFIG[event.kind] ?? {
                icon: <FileText className="h-3.5 w-3.5" />,
                label: event.kind,
                color: 'text-gray-500',
              };
              const isExpanded = expandedEvents.has(event.id);
              const content = String(event.content ?? '');
              const metadata = event.metadata as Record<string, unknown> | undefined;

              return (
                <div key={event.id} className="group">
                  <div
                    className={`flex items-start gap-3 py-2 px-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors ${
                      compactMode ? '' : 'py-3'
                    }`}
                    onClick={() => !compactMode && toggleEvent(event.id)}
                  >
                    <div className={`flex-shrink-0 mt-0.5 ${config.color}`}>
                      {config.icon}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{config.label}</span>
                        {metadata?.toolName != null && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                            {String(metadata.toolName)}
                          </Badge>
                        )}
                        {metadata?.stepName != null && (
                          <span className="text-[10px] text-muted-foreground">
                            {String(metadata.stepName)}
                          </span>
                        )}
                      </div>

                      {compactMode && content && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {content.slice(0, 120)}
                        </p>
                      )}

                      {!compactMode && content && (
                        <div className="mt-1">
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            {isExpanded ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ChevronRight className="h-3 w-3" />
                            )}
                            <span>{content.length > 200 ? `${content.slice(0, 200)}...` : content}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <span className="text-[10px] text-muted-foreground flex-shrink-0 font-mono">
                      {formatTime(event.createdAt)}
                    </span>
                  </div>

                  {!compactMode && isExpanded && content && (
                    <div className="ml-8 mb-2">
                      <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap max-h-64">
                        {content}
                      </pre>
                      {metadata && Object.keys(metadata).length > 0 && (
                        <div className="mt-2">
                          <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
                            Metadata
                          </span>
                          <pre className="text-[10px] bg-muted/50 rounded p-2 overflow-x-auto mt-1">
                            {JSON.stringify(metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {index < events.length - 1 && <Separator className="opacity-30" />}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="px-6 py-3 border-t bg-background flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            {isAlive && (
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
            <span>{events.length} eventos</span>
            {lastSeq > 0 && <span>seq: {lastSeq}</span>}
          </div>
          {!autoFollow && events.length > 0 && (
            <button
              className="text-blue-500 hover:text-blue-400 transition-colors"
              onClick={() => {
                setAutoFollow(true);
                if (scrollRef.current) {
                  const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
                  if (viewport) viewport.scrollTop = viewport.scrollHeight;
                }
              }}
            >
              Ir para o final
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
