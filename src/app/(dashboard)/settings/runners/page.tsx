'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Loader2, Plus, MoreVertical, Pencil, Trash2, Bot, Server, Terminal, Clock, Workflow, FolderOpen } from 'lucide-react';
import { useAgents, useCreateAgent, useUpdateAgent, useDeleteAgent } from '@/lib/query/hooks';
import { useProjects } from '@/lib/query/hooks';
import { AgentFormDialog } from '@/components/features/settings/agent-form-dialog';
import { AgentSetupDrawer } from '@/components/features/settings/agent-setup-drawer';
import { formatRelativeDate } from '@/shared/utils/date-utils';
import type { Agent } from '@/lib/query/hooks/use-agents';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ONLINE: { label: 'Online', variant: 'default' },
  BUSY: { label: 'Ocupado', variant: 'secondary' },
  OFFLINE: { label: 'Offline', variant: 'outline' },
};

const typeLabels: Record<string, string> = {
  RUNNER: 'Runner',
  REVIEWER: 'Reviewer',
  CUSTOM: 'Custom',
};

const roleIcons: Record<string, string> = {
  builder: '🔨',
  reviewer: '🔍',
  qa: '🧪',
  ops: '⚙️',
};

function WorkflowBadge({ from, to }: { from: string; to: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium">{from}</code>
      <span className="text-[10px]">→</span>
      <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium">{to}</code>
    </span>
  );
}

export default function RunnersPage() {
  const { data: agents, isLoading } = useAgents();
  const { data: projects } = useProjects();
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();
  const deleteAgent = useDeleteAgent();

  const projectMap = useMemo(() => {
    const map = new Map<string, string>();
    projects?.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [projects]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const [setupAgent, setSetupAgent] = useState<Agent | null>(null);

  const [apiKeyState, setApiKeyState] = useState<{ hasKey: boolean; keyPrefix: string | null }>({
    hasKey: false,
    keyPrefix: null,
  });

  useEffect(() => {
    async function fetchKeyState() {
      try {
        const res = await fetch('/api/settings/agent-key');
        if (res.ok) {
          const json = await res.json();
          setApiKeyState({
            hasKey: json.data?.hasKey ?? false,
            keyPrefix: json.data?.keyPrefix ?? null,
          });
        }
      } catch {}
    }
    fetchKeyState();
  }, []);

  const handleCreate = useCallback(
    async (data: { name: string; type: string; tool?: string; projectId?: string | null; config?: Record<string, unknown> }) => {
      await createAgent.mutateAsync({ ...data, type: data.type as 'RUNNER' | 'REVIEWER' | 'CUSTOM' });
      setFormOpen(false);
    },
    [createAgent]
  );

  const handleUpdate = useCallback(
    async (data: { name: string; type: string; tool?: string; projectId?: string | null; config?: Record<string, unknown> }) => {
      if (!editingAgent) return;
      await updateAgent.mutateAsync({
        id: editingAgent.id,
        data: { ...data, type: data.type as 'RUNNER' | 'REVIEWER' | 'CUSTOM' },
      });
      setEditingAgent(null);
    },
    [updateAgent, editingAgent]
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteAgent.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  }, [deleteAgent, deleteTarget]);

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configure os agents que o runner usa para executar tarefas</p>
        </div>
        <Button onClick={() => { setEditingAgent(null); setFormOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Agent
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Carregando agents...
        </div>
      ) : !agents?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-14 h-14 rounded-xl bg-muted/50 flex items-center justify-center mb-4">
              <Bot className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold">Nenhum agent cadastrado</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Crie um agent para que o runner execute tarefas automaticamente no seu workspace.
            </p>
            <Button className="mt-4" onClick={() => { setEditingAgent(null); setFormOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Criar primeiro agent
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {agents.map((agent) => {
            const status = statusConfig[agent.status] ?? statusConfig.OFFLINE;
            const config = agent.config ?? {};
            const projectId = (config.project_id as string) || null;
            const projectName = projectId === 'all' ? 'Todos' : (projectId ? projectMap.get(projectId) : null);
            const role = (config.role as string) || 'builder';
            const pickStatus = (config.pick_status as string) || 'TODO';
            const claimStatus = (config.claim_status as string) || 'DOING';
            const doneStatus = (config.done_status as string) || 'DONE';
            const model = config.model ? String(config.model) : null;
            const variant = config.variant ? String(config.variant) : null;

            return (
              <Card key={agent.id} className="hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Server className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm truncate">{agent.name}</h3>
                          <Badge variant={status.variant} className="text-[10px] h-5 px-1.5">
                            {status.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-muted-foreground">
                          <span>{typeLabels[agent.type] ?? agent.type}</span>
                          {agent.tool && (
                            <>
                              <span className="text-muted-foreground/50">·</span>
                              <span>{agent.tool}</span>
                            </>
                          )}
                          {model && (
                            <>
                              <span className="text-muted-foreground/50">·</span>
                              <span className="font-mono text-[11px]">{model.split('/').pop()}</span>
                            </>
                          )}
                          {variant && variant !== 'default' && (
                            <>
                              <span className="text-muted-foreground/50">·</span>
                              <span className="capitalize">{variant}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setSetupAgent(agent)}
                      >
                        <Terminal className="w-3.5 h-3.5 mr-1" />
                        Setup
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreVertical className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditingAgent(agent); setFormOpen(true); }}>
                            <Pencil className="w-3.5 h-3.5 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(agent)}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Metadata row */}
                  <div className="mt-3 pt-3 border-t flex flex-wrap gap-x-4 gap-y-2 text-xs">
                    {projectName && (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <FolderOpen className="w-3 h-3 shrink-0" />
                        <span className="text-foreground/80">{projectName}</span>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <span className="text-sm">{roleIcons[role] || '🤖'}</span>
                      <span className="capitalize text-foreground/80">{role}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Workflow className="w-3 h-3 shrink-0" />
                      <WorkflowBadge from={pickStatus} to={claimStatus} />
                      <span className="text-muted-foreground/50">→</span>
                      <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium">{doneStatus}</code>
                    </span>
                    {agent.lastHeartbeat && (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>{formatRelativeDate(agent.lastHeartbeat)}</span>
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AgentFormDialog
        key={editingAgent?.id ?? 'new'}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingAgent(null);
        }}
        agent={editingAgent}
        onSubmit={editingAgent ? handleUpdate : handleCreate}
        isSubmitting={createAgent.isPending || updateAgent.isPending}
      />

      <AgentSetupDrawer
        open={!!setupAgent}
        onOpenChange={(open) => { if (!open) setSetupAgent(null); }}
        agent={setupAgent}
        apiKeyPrefix={apiKeyState.keyPrefix}
        hasApiKey={apiKeyState.hasKey}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agent?</AlertDialogTitle>
            <AlertDialogDescription>
              O agent <strong>{deleteTarget?.name}</strong> será removido permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteAgent.isPending}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              {deleteAgent.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
