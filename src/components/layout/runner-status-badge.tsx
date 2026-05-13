'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bot, Loader2 } from 'lucide-react';

interface RunnerStatus {
  onlineCount: number;
  total: number;
}

export function RunnerStatusBadge({ iconOnly = false }: { iconOnly?: boolean }) {
  const [status, setStatus] = useState<RunnerStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function fetchStatus() {
      try {
        const res = await fetch('/api/agents');
        if (!res.ok) throw new Error('Failed');
        const json = await res.json();
        const agents = json.data || [];
        const onlineCount = agents.filter(
          (a: { status: string }) => a.status === 'ONLINE' || a.status === 'BUSY',
        ).length;
        if (mounted) {
          setStatus({ onlineCount, total: agents.length });
        }
      } catch {
        if (mounted) setStatus(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return iconOnly ? (
      <div className="h-10 w-10 flex items-center justify-center rounded-md bg-muted" title="Verificando runners...">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Runners...
      </span>
    );
  }

  if (!status) {
    return iconOnly ? (
      <div className="h-10 w-10 flex items-center justify-center rounded-md bg-muted" title="Sem conexão com runners">
        <Bot className="h-5 w-5 text-muted-foreground" />
      </div>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Bot className="h-3.5 w-3.5" />
        Indisponível
      </span>
    );
  }

  if (status.total === 0) {
    return iconOnly ? (
      <div className="h-10 w-10 flex items-center justify-center rounded-md bg-muted" title="Nenhum runner configurado">
        <Bot className="h-5 w-5 text-muted-foreground" />
      </div>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Bot className="h-3.5 w-3.5" />
        Sem runners
      </span>
    );
  }

  const isOnline = status.onlineCount > 0;

  if (iconOnly) {
    return (
      <Link href="/settings/runners" className={`relative h-10 w-10 flex items-center justify-center rounded-md transition-colors hover:bg-accent ${isOnline ? 'bg-emerald-500/20' : 'bg-muted'}`} title={isOnline ? `${status.onlineCount} runner(s) ativo(s)` : 'Nenhum runner online'}>
        <Bot className={`h-5 w-5 ${isOnline ? 'text-emerald-500' : 'text-muted-foreground'}`} />
        {isOnline && (
          <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse ring-2 ring-card" />
        )}
      </Link>
    );
  }

  return (
    <Link
      href="/settings/runners"
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md transition-colors hover:bg-accent ${
        isOnline
          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
          : 'bg-muted text-muted-foreground'
      }`}
    >
      <Bot className="h-3.5 w-3.5" />
      {isOnline ? (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {status.onlineCount}/{status.total} ativos
        </>
      ) : (
        `0/${status.total}`
      )}
    </Link>
  );
}