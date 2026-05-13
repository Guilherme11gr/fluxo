'use client';

import { useState, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Check, Copy, KeyRound, AlertTriangle } from 'lucide-react';
import type { Agent } from '@/lib/query/hooks/use-agents';

interface AgentSetupDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: Agent | null;
  projectId: string;
  apiKeyPrefix: string | null;
  hasApiKey: boolean;
}

function generateYamlConfig(agent: Agent, projectId: string): string {
  const config = agent.config ?? {};
  const lines: string[] = [];

  lines.push('runner:');
  lines.push('  api_url: "https://fluxo.agenda-aqui.com/api/agent"');
  lines.push('  api_key_env: "AGENT_API_KEY"');
  lines.push('  poll_interval_sec: 30');
  lines.push('  heartbeat_interval_sec: 60');
  lines.push('');
  lines.push('agents:');
  lines.push('  - name: "' + agent.name + '"');

  if (agent.tool) lines.push('    tool: "' + agent.tool + '"');
  if (config.model) lines.push('    model: "' + config.model + '"');
  if (config.agent_type) lines.push('    agent_type: "' + config.agent_type + '"');
  if (config.variant) lines.push('    variant: "' + config.variant + '"');

  lines.push('    project_id: "' + projectId + '"');
  lines.push('    pick_status: "TODO"');
  lines.push('    claim_status: "DOING"');
  lines.push('    done_status: "DONE"');

  if (agent.workdir) lines.push('    workdir: "' + agent.workdir + '"');
  if (config.timeout) lines.push('    timeout: ' + config.timeout);
  if (config.next_assignee_id) lines.push('    next_assignee_id: "' + config.next_assignee_id + '"');
  if (config.context) lines.push('    context: "' + config.context + '"');

  return lines.join('\n');
}

function generateEnvCommand(): string {
  return 'export AGENT_API_KEY="agk_..."  # Cole sua chave aqui';
}

function generateRunCommand(): string {
  return '# Instale o runner\n' +
    'go install github.com/Guilherme11gr/fluxo/runner-go@latest\n\n' +
    '# Ou baixe o binário direto\n' +
    '# https://github.com/Guilherme11gr/fluxo/releases\n\n' +
    '# Configure e execute\n' +
    'fluxo-runner poll';
}

export function AgentSetupDrawer({
  open,
  onOpenChange,
  agent,
  projectId,
  apiKeyPrefix,
  hasApiKey,
}: AgentSetupDrawerProps) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copyToClipboard = useCallback((text: string, section: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Copiado!');
      setCopiedSection(section);
      setTimeout(() => setCopiedSection(null), 2000);
    });
  }, []);

  if (!agent) return null;

  const yamlConfig = generateYamlConfig(agent, projectId);
  const envCmd = generateEnvCommand();
  const runCmd = generateRunCommand();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2">
            Configurar {agent.name}
          </SheetTitle>
          <SheetDescription>
            Siga os passos abaixo para conectar o runner a este agent.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          {/* Step 1: API Key */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                1
              </span>
              <h3 className="font-medium">Chave de API</h3>
            </div>

            {hasApiKey ? (
              <div className="rounded-lg border p-3 bg-muted/50">
                <p className="text-sm text-muted-foreground mb-1">Chave ativa</p>
                <p className="font-mono text-sm">agk_••••{apiKeyPrefix}</p>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Chave de API necessária</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Gere uma chave em Configurações &gt; Agente antes de continuar.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => window.location.href = '/settings?tab=agente'}
                >
                  <KeyRound className="w-3.5 h-3.5 mr-1.5" />
                  Ir para Configurações
                </Button>
              </div>
            )}
          </div>

          {/* Step 2: Environment Variables */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                2
              </span>
              <h3 className="font-medium">Variáveis de ambiente</h3>
            </div>
            <div className="relative">
              <pre className="rounded-lg border bg-muted/50 p-3 text-xs font-mono overflow-x-auto whitespace-pre">
                {envCmd}
              </pre>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2"
                onClick={() => copyToClipboard(envCmd, 'env')}
              >
                {copiedSection === 'env' ? (
                  <Check className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          </div>

          {/* Step 3: config.yaml */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                3
              </span>
              <h3 className="font-medium">Arquivo config.yaml</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Salve como <code className="bg-muted px-1 py-0.5 rounded">config.yaml</code> no mesmo diretório do runner.
            </p>
            <div className="relative">
              <pre className="rounded-lg border bg-muted/50 p-3 text-xs font-mono overflow-x-auto whitespace-pre max-h-64 overflow-y-auto">
                {yamlConfig}
              </pre>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2"
                onClick={() => copyToClipboard(yamlConfig, 'yaml')}
              >
                {copiedSection === 'yaml' ? (
                  <Check className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          </div>

          {/* Step 4: Run */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                4
              </span>
              <h3 className="font-medium">Executar</h3>
            </div>
            <div className="relative">
              <pre className="rounded-lg border bg-muted/50 p-3 text-xs font-mono overflow-x-auto whitespace-pre">
                {runCmd}
              </pre>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2"
                onClick={() => copyToClipboard('fluxo-runner poll', 'run')}
              >
                {copiedSection === 'run' ? (
                  <Check className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          </div>

          {/* Project ID info */}
          <div className="rounded-lg border p-3 text-xs text-muted-foreground">
            <p><strong>Project ID:</strong> <code className="bg-muted px-1 py-0.5 rounded">{projectId}</code></p>
            <p className="mt-1">
              O runner vai buscar tarefas no status <code className="bg-muted px-1 py-0.5 rounded">TODO</code> e mover para
              <code className="bg-muted px-1 py-0.5 rounded"> DOING</code> automaticamente.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}