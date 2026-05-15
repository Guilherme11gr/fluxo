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
import { Check, Copy, KeyRound, AlertTriangle, Terminal } from 'lucide-react';
import type { Agent } from '@/lib/query/hooks/use-agents';

interface AgentSetupDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: Agent | null;
  apiKeyPrefix: string | null;
  hasApiKey: boolean;
}

export function AgentSetupDrawer({
  open,
  onOpenChange,
  agent,
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

  const config = agent.config ?? {};
  const modelInfo = config.model ? ` model=${String(config.model)}` : '';
  const projectIdInfo = config.project_id ? ` project=${String(config.project_id).slice(0, 8)}...` : '';
  const currentOrigin = typeof window === 'undefined' ? 'http://localhost:3005' : window.location.origin;
  const exampleApiUrl = `${currentOrigin}/api/agent`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2">
            <Terminal className="w-5 h-5" />
            Configurar {agent.name}
          </SheetTitle>
          <SheetDescription>
            O runner busca este agent automaticamente via API. Sem YAML manual.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          {/* Agent info */}
          <div className="rounded-lg border p-4 bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium">{agent.name}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">{agent.tool || 'no tool'}</span>
              {modelInfo && (
                <>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs font-mono text-muted-foreground">{String(config.model)}</span>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Este agent está cadastrado na API. O FluXo Runner vai buscá-lo automaticamente no startup.
            </p>
          </div>

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

          {/* Step 2: Run command */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                2
              </span>
              <h3 className="font-medium">Executar o runner</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              O runner busca os agents automaticamente. Sem YAML de agents para copiar.
            </p>

            <div className="relative">
              <pre className="rounded-lg border bg-muted/50 p-3 text-xs font-mono overflow-x-auto whitespace-pre">
                fluxo-runner run --api-key agk_sua_chave_aqui
              </pre>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2"
                onClick={() => copyToClipboard('fluxo-runner run --api-key agk_sua_chave_aqui', 'cli')}
              >
                {copiedSection === 'cli' ? (
                  <Check className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Ou com variável de ambiente:
            </p>
            <div className="relative">
              <pre className="rounded-lg border bg-muted/50 p-3 text-xs font-mono overflow-x-auto whitespace-pre">
{`export AGENT_API_KEY="agk_sua_chave_aqui"
fluxo-runner run`}
              </pre>
            </div>
          </div>

          {/* Step 3: Optional config.yaml */}
          <details className="group">
            <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              Config YAML (opcional)
            </summary>
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Para customizar a URL da API ou intervalo de polling. Agents vêm da API automaticamente.
              </p>
              <div className="relative">
                <pre className="rounded-lg border bg-muted/50 p-3 text-xs font-mono overflow-x-auto whitespace-pre">
{`runner:
  api_url: "${exampleApiUrl}"
  api_key_env: "AGENT_API_KEY"
  poll_interval_sec: 30
  sync_interval_sec: 120

# No agents section needed!
# They come from the API automatically.`}
                </pre>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2"
                  onClick={() => copyToClipboard(`runner:\n  api_url: "${exampleApiUrl}"\n  api_key_env: "AGENT_API_KEY"\n  poll_interval_sec: 30\n  sync_interval_sec: 120\n`, 'yaml')}
                >
                  {copiedSection === 'yaml' ? (
                    <Check className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </Button>
              </div>
            </div>
          </details>

          {/* Agent config hint */}
          <div className="rounded-lg border p-3 text-xs text-muted-foreground">
            <p><strong>{agent.name}</strong> está configurado com{projectIdInfo},{modelInfo}.</p>
            <p className="mt-1">
              O runner vai buscar tarefas no status <code className="bg-muted px-1 py-0.5 rounded">{String(config.pick_status ?? 'TODO')}</code> e mover para
              <code className="bg-muted px-1 py-0.5 rounded"> {String(config.claim_status ?? 'DOING')}</code>.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
