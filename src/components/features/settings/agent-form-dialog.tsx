'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useProjects } from '@/lib/query/hooks';
import type { Agent } from '@/lib/query/hooks/use-agents';

const AGENT_TYPES = [
  { value: 'RUNNER', label: 'Runner' },
  { value: 'REVIEWER', label: 'Reviewer' },
  { value: 'CUSTOM', label: 'Custom' },
] as const;

const SUGGESTED_MODELS = [
  'openrouter/anthropic/claude-sonnet-4',
  'openrouter/anthropic/claude-3.5-sonnet',
  'openrouter/openai/gpt-4o',
  'openrouter/openai/gpt-4o-mini',
  'openrouter/google/gemini-2.5-pro',
  'openrouter/google/gemini-2.5-flash',
  'openrouter/qwen/qwen3.6-plus:free',
  'openrouter/deepseek/deepseek-chat',
  'anthropic/claude-sonnet-4',
  'anthropic/claude-3.5-sonnet',
  'openai/gpt-4o',
  'openai/o3',
  'openai/o4-mini',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash',
];

const SUGGESTED_TOOLS = [
  { value: 'opencode', label: 'OpenCode' },
  { value: 'claude', label: 'Claude CLI' },
  { value: 'codex', label: 'Codex CLI' },
];

const EXEC_AGENT_TYPES = [
  { value: 'build', label: 'Build' },
  { value: 'plan', label: 'Plan' },
  { value: 'explore', label: 'Explore' },
];

const EXEC_VARIANTS = [
  { value: '', label: 'Padrão' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
  { value: 'minimal', label: 'Minimal' },
];

interface AgentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: Agent | null;
  onSubmit: (data: {
    name: string;
    type: string;
    tool?: string;
    config?: Record<string, unknown>;
  }) => void;
  isSubmitting?: boolean;
}

export function AgentFormDialog({
  open,
  onOpenChange,
  agent,
  onSubmit,
  isSubmitting = false,
}: AgentFormDialogProps) {
  const isEditing = Boolean(agent);
  const config = agent?.config ?? {};
  const { data: projects } = useProjects();

  const [name, setName] = useState(agent?.name ?? '');
  const [type, setType] = useState(agent?.type ?? 'RUNNER');
  const [tool, setTool] = useState(agent?.tool ?? '');
  const [model, setModel] = useState((config.model as string) ?? '');

  // Execution fields
  const [projectId, setProjectId] = useState((config.project_id as string) ?? '');
  const [agentType, setAgentType] = useState((config.agent_type as string) ?? 'build');
  const [variant, setVariant] = useState((config.variant as string) ?? '');
  const [pickStatus, setPickStatus] = useState((config.pick_status as string) ?? 'TODO');
  const [claimStatus, setClaimStatus] = useState((config.claim_status as string) ?? 'DOING');
  const [doneStatus, setDoneStatus] = useState((config.done_status as string) ?? 'DONE');
  const [timeout, setTimeout_] = useState(String(config.timeout ?? 300));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cfg: Record<string, unknown> = {};
    if (model) cfg.model = model;
    cfg.agent_type = agentType;
    if (variant) cfg.variant = variant;
    if (projectId) cfg.project_id = projectId;
    cfg.pick_status = pickStatus;
    cfg.claim_status = claimStatus;
    cfg.done_status = doneStatus;
    const timeoutNum = parseInt(timeout, 10);
    if (!isNaN(timeoutNum) && timeoutNum > 0) cfg.timeout = timeoutNum;

    onSubmit({
      name: name.trim(),
      type,
      tool: tool || undefined,
      config: Object.keys(cfg).length > 0 ? cfg : undefined,
    });
  };

  const handleClose = () => {
    setName(agent?.name ?? '');
    setType(agent?.type ?? 'RUNNER');
    setTool(agent?.tool ?? '');
    setModel((config.model as string) ?? '');
    setProjectId((config.project_id as string) ?? '');
    setAgentType((config.agent_type as string) ?? 'build');
    setVariant((config.variant as string) ?? '');
    setPickStatus((config.pick_status as string) ?? 'TODO');
    setClaimStatus((config.claim_status as string) ?? 'DOING');
    setDoneStatus((config.done_status as string) ?? 'DONE');
    setTimeout_(String(config.timeout ?? 300));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Agent' : 'Novo Agent'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Atualize as configurações do agent.'
              : 'Configure um novo agent. O runner vai buscar este profile automaticamente via API.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Agent Identity */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Identidade</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="agent-name">Nome</Label>
                <Input
                  id="agent-name"
                  placeholder="ex: dev-agent"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-type">Tipo</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Tool & Model */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Ferramenta & Modelo</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="agent-tool">Ferramenta</Label>
                <Select value={tool} onValueChange={setTool}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUGGESTED_TOOLS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Agente</Label>
                <Select value={agentType} onValueChange={setAgentType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXEC_AGENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

             <div className="space-y-2">
              <Label>Modelo</Label>
              <Input
                list="model-suggestions"
                placeholder="ex: openrouter/anthropic/claude-sonnet-4"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
              <datalist id="model-suggestions">
                {SUGGESTED_MODELS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                Digite qualquer modelo. As sugestões são apenas referência.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Variante</Label>
              <Select value={variant} onValueChange={setVariant}>
                <SelectTrigger>
                  <SelectValue placeholder="Padrão" />
                </SelectTrigger>
                <SelectContent>
                  {EXEC_VARIANTS.map((v) => (
                    <SelectItem key={v.value || 'default'} value={v.value || 'default'}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Execution */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Execução</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Projeto</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os projetos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os projetos</SelectItem>
                    {projects?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Deixe vazio para pegar tarefas de qualquer projeto.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-timeout">Timeout (s)</Label>
                <Input
                  id="agent-timeout"
                  type="number"
                  min={30}
                  max={3600}
                  value={timeout}
                  onChange={(e) => setTimeout_(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-3 grid-cols-3">
              <div className="space-y-2">
                <Label>Pick</Label>
                <Select value={pickStatus} onValueChange={setPickStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODO">TODO</SelectItem>
                    <SelectItem value="BACKLOG">BACKLOG</SelectItem>
                    <SelectItem value="REVIEW">REVIEW</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Claim</Label>
                <Select value={claimStatus} onValueChange={setClaimStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DOING">DOING</SelectItem>
                    <SelectItem value="IN_PROGRESS">IN_PROGRESS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Done</Label>
                <Select value={doneStatus} onValueChange={setDoneStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DONE">DONE</SelectItem>
                    <SelectItem value="REVIEW">REVIEW</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {isEditing ? 'Salvar' : 'Criar Agent'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}