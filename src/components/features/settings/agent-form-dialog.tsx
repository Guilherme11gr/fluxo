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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  const [name, setName] = useState(agent?.name ?? '');
  const [type, setType] = useState(agent?.type ?? 'RUNNER');
  const [tool, setTool] = useState(agent?.tool ?? '');
  const [model, setModel] = useState((agent?.config?.model as string) ?? '');
  const [modelOpen, setModelOpen] = useState(false);

  const filteredModels = SUGGESTED_MODELS.filter((m) =>
    m.toLowerCase().includes(model.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const config: Record<string, unknown> = { ...agent?.config };
    if (model) config.model = model;
    else delete config.model;

    onSubmit({
      name: name.trim(),
      type,
      tool: tool || undefined,
      config: Object.keys(config).length > 0 ? config : undefined,
    });
  };

  const handleClose = () => {
    setName(agent?.name ?? '');
    setType(agent?.type ?? 'RUNNER');
    setTool(agent?.tool ?? '');
    setModel((agent?.config?.model as string) ?? '');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Agent' : 'Novo Agent'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Atualize as configurações do agent.'
              : 'Configure um novo agent para executar tarefas automaticamente.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agent-name">Nome</Label>
            <Input
              id="agent-name"
              placeholder="ex: dev-agent, review-agent"
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

          <div className="space-y-2">
            <Label htmlFor="agent-tool">Ferramenta</Label>
            <Select value={tool} onValueChange={setTool}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar ferramenta" />
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
            <Label>Modelo</Label>
            <Popover open={modelOpen} onOpenChange={setModelOpen}>
              <PopoverTrigger asChild>
                <div className="relative">
                  <Input
                    placeholder="ex: openrouter/anthropic/claude-sonnet-4"
                    value={model}
                    onChange={(e) => {
                      setModel(e.target.value);
                      setModelOpen(true);
                    }}
                    onFocus={() => setModelOpen(true)}
                    className="pr-8"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setModelOpen(!modelOpen)}
                  >
                    <ChevronsUpDown className="h-4 w-4" />
                  </button>
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <ScrollArea className="max-h-60">
                  <div className="p-1">
                    {filteredModels.length === 0 ? (
                      <p className="px-2 py-1.5 text-sm text-muted-foreground">
                        Nenhum modelo encontrado
                      </p>
                    ) : (
                      filteredModels.map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={cn(
                            'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent',
                            model === m && 'bg-accent'
                          )}
                          onClick={() => {
                            setModel(m);
                            setModelOpen(false);
                          }}
                        >
                          <Check className={cn('h-4 w-4', model === m ? 'opacity-100' : 'opacity-0')} />
                          <span className="font-mono text-xs">{m}</span>
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              Digite qualquer modelo. As sugestões são apenas referência.
            </p>
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