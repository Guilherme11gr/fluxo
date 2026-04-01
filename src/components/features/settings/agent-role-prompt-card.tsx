'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MessageSquare, Save, X } from 'lucide-react';

const MAX_CHARS = 2000;

export function AgentRolePromptCard() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchPrompt = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/settings/agent-role-prompt', {
        cache: 'no-store',
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message || 'Erro ao carregar prompt');
      }

      setPrompt(payload.data?.prompt || '');
    } catch (error) {
      toast.error('Erro ao carregar prompt do agente', {
        description: error instanceof Error ? error.message : 'Erro inesperado',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPrompt();
  }, [fetchPrompt]);

  const handleSave = useCallback(async () => {
    if (prompt.trim().length > MAX_CHARS) {
      toast.error('O prompt deve ter no máximo 2000 caracteres.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/settings/agent-role-prompt', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message || 'Erro ao salvar prompt');
      }

      setPrompt(payload.data?.prompt || '');
      toast.success('Prompt do agente salvo com sucesso');
    } catch (error) {
      toast.error('Erro ao salvar prompt do agente', {
        description: error instanceof Error ? error.message : 'Erro inesperado',
      });
    } finally {
      setSaving(false);
    }
  }, [prompt]);

  const handleClear = useCallback(async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings/agent-role-prompt', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: '' }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message || 'Erro ao limpar prompt');
      }

      setPrompt('');
      toast.success('Prompt do agente removido com sucesso');
    } catch (error) {
      toast.error('Erro ao limpar prompt do agente', {
        description: error instanceof Error ? error.message : 'Erro inesperado',
      });
    } finally {
      setSaving(false);
    }
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Prompt do Agente
        </CardTitle>
        <CardDescription>
          Defina o papel e comportamento do assistente de IA para toda a organização.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando prompt do agente...
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ex: Sou uma QA junior, começando na empresa. Responda de forma simples e didática."
                rows={4}
                maxLength={MAX_CHARS}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground text-right">
                {prompt.length}/{MAX_CHARS}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void handleSave()} disabled={saving || prompt.trim().length === 0}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar prompt
              </Button>
              <Button variant="outline" onClick={() => void handleClear()} disabled={saving || prompt.trim().length === 0}>
                <X className="mr-2 h-4 w-4" />
                Limpar prompt
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
