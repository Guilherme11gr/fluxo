'use client';

import { useEffect, useState } from 'react';
import { Bot, FolderOpen, Loader2, Plus, Server, Terminal, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AgentFormDialog } from '@/components/features/settings/agent-form-dialog';
import { AgentSetupDrawer } from '@/components/features/settings/agent-setup-drawer';
import { useAgents, useCreateAgent, useUpdateAgent } from '@/lib/query/hooks';
import { useProject } from '@/lib/query';
import type { Agent } from '@/lib/query/hooks/use-agents';
import { formatRelativeDate } from '@/shared/utils/date-utils';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ONLINE: { label: 'Online', variant: 'default' },
  BUSY: { label: 'Ocupado', variant: 'secondary' },
  OFFLINE: { label: 'Offline', variant: 'outline' },
};

const roleIcons: Record<string, string> = {
  builder: '🔨',
  reviewer: '🔍',
  qa: '🧪',
  ops: '⚙️',
};

function WorkflowBadge({ from, to, done }: { from: string; to: string; done: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium">{from}</code>
      <span className="text-[10px]">→</span>
      <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium">{to}</code>
      <span className="text-[10px]">→</span>
      <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium">{done}</code>
    </span>
  );
}

export function ProjectAgentsPanel({ projectId }: { projectId: string }) {
  const { data: project } = useProject(projectId);
  const { data: agents, isLoading } = useAgents(projectId);
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();

  const [formOpen, setFormOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [setupAgent, setSetupAgent] = useState<Agent | null>(null);
  const [apiKeyState, setApiKeyState] = useState<{ hasKey: boolean; keyPrefix: string | null }>({
    hasKey: false,
    keyPrefix: null,
  });

  useEffect(() => {
    void fetch('/api/settings/agent-key')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!json) return;
        setApiKeyState({
          hasKey: json.data?.hasKey ?? false,
          keyPrefix: json.data?.keyPrefix ?? null,
        });
      })
      .catch(() => {});
  }, []);

  const handleCreate = async (data: { name: string; type: string; tool?: string; projectId?: string | null; config?: Record<string, unknown> }) => {
    await createAgent.mutateAsync({ ...data, projectId, type: data.type as 'RUNNER' | 'REVIEWER' | 'CUSTOM' });
    setFormOpen(false);
  };

  const handleUpdate = async (data: { name: string; type: string; tool?: string; projectId?: string | null; config?: Record<string, unknown> }) => {
    if (!editingAgent) return;
    await updateAgent.mutateAsync({
      id: editingAgent.id,
      data: { ...data, projectId, type: data.type as 'RUNNER' | 'REVIEWER' | 'CUSTOM' },
    });
    setEditingAgent(null);
    setFormOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Agentes</h2>
          <p className="text-sm text-muted-foreground">
            Agents vinculados a {project?.name ?? 'este projeto'}.
          </p>
        </div>
        <Button onClick={() => { setEditingAgent(null); setFormOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Agent
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Carregando agents...
        </div>
      ) : !agents?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-muted/50">
              <Bot className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold">Nenhum agent neste projeto</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Crie um agent dedicado para esse projeto e o runner vai limitar os claims a ele.
            </p>
            <Button className="mt-4" onClick={() => { setEditingAgent(null); setFormOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Criar primeiro agent
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {agents.map((agent) => {
            const status = statusConfig[agent.status] ?? statusConfig.OFFLINE;
            const config = agent.config ?? {};
            const role = (config.role as string) || 'builder';
            const pickStatus = (config.pick_status as string) || 'TODO';
            const claimStatus = (config.claim_status as string) || 'DOING';
            const doneStatus = (config.done_status as string) || 'DONE';
            const model = config.model ? String(config.model) : null;

            return (
              <Card key={agent.id} className="transition-colors hover:border-primary/30">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Server className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold">{agent.name}</h3>
                          <Badge variant={status.variant} className="h-5 px-1.5 text-[10px]">
                            {status.label}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {agent.tool && <span>{agent.tool}</span>}
                          {model && (
                            <>
                              <span className="text-muted-foreground/50">·</span>
                              <span className="font-mono text-[11px]">{model.split('/').pop()}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSetupAgent(agent)}>
                        <Terminal className="mr-1 h-3.5 w-3.5" />
                        Setup
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditingAgent(agent); setFormOpen(true); }}>
                        Editar
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t pt-3 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <FolderOpen className="h-3 w-3 shrink-0" />
                      <span className="text-foreground/80">{project?.name ?? 'Projeto atual'}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <span className="text-sm">{roleIcons[role] || '🤖'}</span>
                      <span className="capitalize text-foreground/80">{role}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Workflow className="h-3 w-3 shrink-0" />
                      <WorkflowBadge from={pickStatus} to={claimStatus} done={doneStatus} />
                    </span>
                    {agent.lastHeartbeat && (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        {formatRelativeDate(agent.lastHeartbeat)}
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
        key={editingAgent?.id ?? 'project-new'}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditingAgent(null);
          }
        }}
        agent={editingAgent}
        projectId={projectId}
        embedded
        onSubmit={editingAgent ? handleUpdate : handleCreate}
        isSubmitting={createAgent.isPending || updateAgent.isPending}
      />

      <AgentSetupDrawer
        open={!!setupAgent}
        onOpenChange={(open) => {
          if (!open) {
            setSetupAgent(null);
          }
        }}
        agent={setupAgent}
        apiKeyPrefix={apiKeyState.keyPrefix}
        hasApiKey={apiKeyState.hasKey}
      />
    </div>
  );
}
