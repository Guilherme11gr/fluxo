'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { toast } from 'sonner';
import { Loader2, Plus, MoreVertical, Pencil, Trash2, Copy, Bot, Server } from 'lucide-react';
import { useAgents, useCreateAgent, useUpdateAgent, useDeleteAgent } from '@/lib/query/hooks';
import { AgentFormDialog } from '@/components/features/settings/agent-form-dialog';
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

function generateYamlConfig(agent: Agent): string {
  const config = agent.config ?? {};
  const lines: string[] = [];

  lines.push(`# Config for: ${agent.name}`);
  lines.push(`agents:`);
  lines.push(`  - name: ${agent.name}`);
  lines.push(`    type: ${agent.type.toLowerCase()}`);
  if (agent.tool) lines.push(`    tool: ${agent.tool}`);
  if (config.model) lines.push(`    model: "${config.model}"`);
  if (config.variant) lines.push(`    variant: ${config.variant}`);
  if (agent.workdir) lines.push(`    workdir: "${agent.workdir}"`);
  lines.push('');
  lines.push(`# Environment variables:`);
  lines.push(`# AGENT_API_KEY=agk_xxxxx (your API key)`);
  lines.push(`# Run with: fluxo-runner poll`);

  return lines.join('\n');
}

function generateRunCommand(): string {
  return `fluxo-runner poll`;
}

export default function RunnersPage() {
  const { data: agents, isLoading } = useAgents();
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();
  const deleteAgent = useDeleteAgent();

  const [formOpen, setFormOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);

  const handleCreate = useCallback(
    async (data: { name: string; type: string; tool?: string; config?: Record<string, unknown> }) => {
      await createAgent.mutateAsync({ ...data, type: data.type as 'RUNNER' | 'REVIEWER' | 'CUSTOM' });
      setFormOpen(false);
    },
    [createAgent]
  );

  const handleUpdate = useCallback(
    async (data: { name: string; type: string; tool?: string; config?: Record<string, unknown> }) => {
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

  const handleCopyYaml = useCallback((agent: Agent) => {
    navigator.clipboard.writeText(generateYamlConfig(agent));
    toast.success('Config YAML copiada');
  }, []);

  const handleCopyCommand = useCallback(() => {
    navigator.clipboard.writeText(generateRunCommand());
    toast.success('Comando copiado');
  }, []);

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Runners</h1>
          <p className="text-muted-foreground">Gerencie agents e configurações do runner</p>
        </div>
        <Button onClick={() => { setEditingAgent(null); setFormOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Agent
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Carregando agents...
        </div>
      ) : !agents?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Bot className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhum agent cadastrado</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Crie um agent para configurar o runner que vai executar tarefas automaticamente.
            </p>
            <Button className="mt-4" onClick={() => { setEditingAgent(null); setFormOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Criar Agent
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {agents.map((agent) => {
            const status = statusConfig[agent.status] ?? statusConfig.OFFLINE;
            const config = agent.config ?? {};

            return (
              <Card key={agent.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Server className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{agent.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant={status.variant} className="text-xs">
                            {status.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {typeLabels[agent.type] ?? agent.type}
                          </span>
                          {agent.tool && (
                            <span className="text-xs text-muted-foreground">
                              · {agent.tool}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="shrink-0">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditingAgent(agent); setFormOpen(true); }}>
                          <Pencil className="w-4 h-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleCopyYaml(agent)}>
                          <Copy className="w-4 h-4 mr-2" />
                          Copiar config YAML
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleCopyCommand()}>
                          <Copy className="w-4 h-4 mr-2" />
                          Copiar comando
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteTarget(agent)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid gap-2 sm:grid-cols-3 text-sm">
                    {config.model ? (
                      <div>
                        <p className="text-xs text-muted-foreground">Modelo</p>
                        <p className="font-mono text-xs truncate">{String(config.model)}</p>
                      </div>
                    ) : null}
                    {agent.lastHeartbeat && (
                      <div>
                        <p className="text-xs text-muted-foreground">Último heartbeat</p>
                        <p className="text-xs">{formatRelativeDate(agent.lastHeartbeat)}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Criado em</p>
                      <p className="text-xs">{formatRelativeDate(agent.createdAt)}</p>
                    </div>
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