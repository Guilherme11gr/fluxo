'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, UserCircle, Circle, Pencil } from 'lucide-react';

const MAX_CUSTOM_PROMPT_CHARS = 2000;

interface AvailableRole {
  id: string;
  name: string;
  description: string | null;
}

interface MyAgentRoleData {
  roleId: string | null;
  role: { id: string; name: string; prompt: string } | null;
  customPrompt: string | null;
  availableRoles: AvailableRole[];
}

type SelectedOption = 'none' | 'role' | 'custom';

export function MyAgentRoleCard() {
  const [data, setData] = useState<MyAgentRoleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedOption, setSelectedOption] = useState<SelectedOption>('none');
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [customPromptDraft, setCustomPromptDraft] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  const fetchMyRole = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/settings/my-agent-role', {
        cache: 'no-store',
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message || 'Erro ao carregar seu papel');
      }

      const result = payload.data as MyAgentRoleData;
      setData(result);

      // Determine initial selection state
      if (result.customPrompt) {
        setSelectedOption('custom');
        setCustomPromptDraft(result.customPrompt);
      } else if (result.roleId) {
        setSelectedOption('role');
        setSelectedRoleId(result.roleId);
      } else {
        setSelectedOption('none');
      }
      setHasChanges(false);
    } catch (error) {
      toast.error('Erro ao carregar seu papel', {
        description: error instanceof Error ? error.message : 'Erro inesperado',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMyRole();
  }, [fetchMyRole]);

  const detectChanges = useCallback(
    (option: SelectedOption, roleId: string | null, prompt: string) => {
      if (!data) return false;
      if (data.customPrompt) {
        return !(option === 'custom' && prompt.trim() === data.customPrompt);
      }
      if (data.roleId) {
        return !(option === 'role' && roleId === data.roleId);
      }
      return option !== 'none';
    },
    [data],
  );

  const handleSelectOption = useCallback(
    (option: SelectedOption) => {
      if (option === 'none') {
        setSelectedOption('none');
        setSelectedRoleId(null);
      } else if (option === 'role') {
        setSelectedOption('role');
        setCustomPromptDraft('');
      } else if (option === 'custom') {
        setSelectedOption('custom');
        setSelectedRoleId(null);
        if (!customPromptDraft) {
          setCustomPromptDraft(data?.customPrompt || '');
        }
      }
      setHasChanges(detectChanges(option, option === 'role' ? selectedRoleId : null, option === 'custom' ? customPromptDraft : ''));
    },
    [customPromptDraft, data?.customPrompt, detectChanges, selectedRoleId],
  );

  const handleSelectRole = useCallback(
    (roleId: string) => {
      setSelectedRoleId(roleId);
      setHasChanges(detectChanges('role', roleId, ''));
    },
    [detectChanges],
  );

  const handleCustomPromptChange = useCallback(
    (value: string) => {
      setCustomPromptDraft(value);
      if (selectedOption !== 'custom' && value.trim()) {
        setSelectedOption('custom');
      }
      setHasChanges(detectChanges('custom', null, value));
    },
    [selectedOption, detectChanges],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};

      if (selectedOption === 'none') {
        body.roleId = null;
      } else if (selectedOption === 'role' && selectedRoleId) {
        body.roleId = selectedRoleId;
      } else if (selectedOption === 'custom') {
        body.customPrompt = customPromptDraft.trim() || null;
      }

      const response = await fetch('/api/settings/my-agent-role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message || 'Erro ao salvar');
      }

      toast.success('Papel atualizado com sucesso');
      void fetchMyRole();
    } catch (error) {
      toast.error('Erro ao salvar seu papel', {
        description: error instanceof Error ? error.message : 'Erro inesperado',
      });
    } finally {
      setSaving(false);
    }
  }, [selectedOption, selectedRoleId, customPromptDraft, fetchMyRole]);

  const currentLabel = (() => {
    if (selectedOption === 'none') return 'Padrão do sistema';
    if (selectedOption === 'role') {
      const found = data?.availableRoles.find((r) => r.id === selectedRoleId);
      return found?.name || 'Role da organização';
    }
    return customPromptDraft.trim() ? 'Prompt personalizado' : 'Prompt personalizado';
  })();

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <UserCircle className="h-5 w-5" />
            Meu Papel no Chat
          </CardTitle>
          <CardDescription>
            Escolha como o assistente de IA deve se comportar com você.
          </CardDescription>
        </div>
        {!loading && (
          <span className="text-sm text-muted-foreground">
            Atual: {currentLabel}
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando...
          </div>
        ) : (
          <>
            {/* Option 1: System default */}
            <button
              type="button"
              onClick={() => handleSelectOption('none')}
              className={`w-full rounded-lg border p-4 text-left transition-colors ${
                selectedOption === 'none'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-accent/30'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {selectedOption === 'none' ? (
                    <Circle className="h-4 w-4 fill-primary text-primary" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="space-y-0.5">
                  <p className="font-medium">Padrão do sistema</p>
                  <p className="text-sm text-muted-foreground">
                    Usar apenas o prompt base do assistente
                  </p>
                </div>
              </div>
            </button>

            {/* Option 2: Org role */}
            {data && data.availableRoles.length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleSelectOption('role')}
                  className={`w-full rounded-lg border p-4 text-left transition-colors ${
                    selectedOption === 'role'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-accent/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {selectedOption === 'role' ? (
                        <Circle className="h-4 w-4 fill-primary text-primary" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="space-y-0.5">
                      <p className="font-medium">Role da organização</p>
                      <p className="text-sm text-muted-foreground">
                        Selecione uma role definida pelo proprietário
                      </p>
                    </div>
                  </div>
                </button>

                {selectedOption === 'role' && (
                  <div className="ml-9 space-y-1.5">
                    {data.availableRoles.map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => handleSelectRole(role.id)}
                        className={`w-full rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                          selectedRoleId === role.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-accent/30'
                        }`}
                      >
                        <p className="font-medium">{role.name}</p>
                        {role.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {role.description}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Option 3: Custom prompt */}
            <button
              type="button"
              onClick={() => handleSelectOption('custom')}
              className={`w-full rounded-lg border p-4 text-left transition-colors ${
                selectedOption === 'custom'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-accent/30'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {selectedOption === 'custom' ? (
                    <Circle className="h-4 w-4 fill-primary text-primary" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="space-y-0.5">
                  <p className="font-medium flex items-center gap-2">
                    Prompt personalizado
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Escreva seu próprio prompt para personalizar o comportamento da IA
                  </p>
                </div>
              </div>
            </button>

            {selectedOption === 'custom' && (
              <div className="ml-9 space-y-2">
                <Textarea
                  value={customPromptDraft}
                  onChange={(e) => handleCustomPromptChange(e.target.value)}
                  placeholder="Ex: Sou uma QA junior, recém-chegada à equipe. Responda de forma simples e didática, sempre explicando os conceitos técnicos."
                  rows={4}
                  maxLength={MAX_CUSTOM_PROMPT_CHARS}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground text-right">
                  {customPromptDraft.length}/{MAX_CUSTOM_PROMPT_CHARS}
                </p>
              </div>
            )}

            {/* Save button */}
            <div className="flex justify-end border-t pt-4 mt-2">
              <Button
                onClick={() => void handleSave()}
                disabled={saving || !hasChanges}
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Salvar
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
