'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Brain, Loader2, Pencil, Plus, Star, Trash2 } from 'lucide-react';

const MAX_ROLES = 5;
const MAX_PROMPT_CHARS = 2000;

interface AgentChatRole {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  isDefault: boolean;
  createdAt: string;
}

interface RoleFormData {
  name: string;
  description: string;
  prompt: string;
}

const emptyForm: RoleFormData = {
  name: '',
  description: '',
  prompt: '',
};

export function AgentChatRolesCard() {
  const [roles, setRoles] = useState<AgentChatRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<AgentChatRole | null>(null);
  const [form, setForm] = useState<RoleFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgentChatRole | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/settings/agent-chat-roles', {
        cache: 'no-store',
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message || 'Erro ao carregar roles');
      }

      setRoles(payload.data as AgentChatRole[]);
    } catch (error) {
      toast.error('Erro ao carregar roles do agente', {
        description: error instanceof Error ? error.message : 'Erro inesperado',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRoles();
  }, [fetchRoles]);

  const openCreateDialog = useCallback(() => {
    setEditingRole(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((role: AgentChatRole) => {
    setEditingRole(role);
    setForm({
      name: role.name,
      description: role.description || '',
      prompt: role.prompt,
    });
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      toast.error('O nome da role é obrigatório.');
      return;
    }

    if (!form.prompt.trim()) {
      toast.error('O prompt da role é obrigatório.');
      return;
    }

    if (form.prompt.trim().length > MAX_PROMPT_CHARS) {
      toast.error(`O prompt deve ter no máximo ${MAX_PROMPT_CHARS} caracteres.`);
      return;
    }

    setSubmitting(true);
    try {
      const isEditing = !!editingRole;
      const url = isEditing
        ? `/api/settings/agent-chat-roles/${editingRole.id}`
        : '/api/settings/agent-chat-roles';
      const method = isEditing ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          prompt: form.prompt.trim(),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message || 'Erro ao salvar role');
      }

      setDialogOpen(false);
      toast.success(isEditing ? 'Role atualizada com sucesso' : 'Role criada com sucesso');
      void fetchRoles();
    } catch (error) {
      toast.error('Erro ao salvar role', {
        description: error instanceof Error ? error.message : 'Erro inesperado',
      });
    } finally {
      setSubmitting(false);
    }
  }, [form, editingRole, fetchRoles]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/settings/agent-chat-roles/${deleteTarget.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error?.message || 'Erro ao excluir role');
      }

      setDeleteTarget(null);
      toast.success('Role excluída com sucesso');
      void fetchRoles();
    } catch (error) {
      toast.error('Erro ao excluir role', {
        description: error instanceof Error ? error.message : 'Erro inesperado',
      });
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, fetchRoles]);

  const handleSetDefault = useCallback(async (role: AgentChatRole) => {
    if (role.isDefault) return;

    setSettingDefault(role.id);
    try {
      const response = await fetch(`/api/settings/agent-chat-roles/${role.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message || 'Erro ao definir role padrão');
      }

      toast.success(`"${role.name}" definida como role padrão`);
      void fetchRoles();
    } catch (error) {
      toast.error('Erro ao definir role padrão', {
        description: error instanceof Error ? error.message : 'Erro inesperado',
      });
    } finally {
      setSettingDefault(null);
    }
  }, [fetchRoles]);

  const truncate = (text: string, max: number) =>
    text.length > max ? text.slice(0, max) + '...' : text;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Roles do Agente
            </CardTitle>
            <CardDescription>
              Crie roles personalizadas para o assistente de IA. Cada membro pode escolher sua role.
            </CardDescription>
          </div>
          <Badge variant="secondary">{roles.length}/{MAX_ROLES} roles</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Carregando roles...
            </div>
          ) : roles.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">
              <p>Nenhuma role criada ainda.</p>
              <p className="text-sm">Clique em &quot;Criar Role&quot; para começar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className="group flex items-start justify-between gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/30"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{role.name}</p>
                      {role.isDefault && (
                        <Badge variant="default" className="text-xs">
                          Padrão
                        </Badge>
                      )}
                    </div>
                    {role.description && (
                      <p className="text-sm text-muted-foreground">
                        {truncate(role.description, 80)}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground font-mono leading-relaxed">
                      {truncate(role.prompt, 100)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {!role.isDefault && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Definir como padrão"
                        disabled={settingDefault === role.id}
                        onClick={() => void handleSetDefault(role)}
                      >
                        {settingDefault === role.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Star className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Editar"
                      onClick={() => openEditDialog(role)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      title="Excluir"
                      onClick={() => setDeleteTarget(role)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2">
            <Button
              onClick={openCreateDialog}
              disabled={roles.length >= MAX_ROLES}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              Criar Role
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRole ? 'Editar Role' : 'Criar Role'}
            </DialogTitle>
            <DialogDescription>
              {editingRole
                ? 'Altere os dados da role do agente.'
                : 'Defina o nome, descricao e prompt da nova role.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nome</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: QA Junior"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Descricao (opcional)</label>
              <Input
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Ex: Role para membros da equipe de QA"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Prompt</label>
              <Textarea
                value={form.prompt}
                onChange={(e) => setForm((prev) => ({ ...prev, prompt: e.target.value }))}
                placeholder="Ex: Sou uma QA junior, comecando na empresa. Responda de forma simples e didatica."
                rows={4}
                maxLength={MAX_PROMPT_CHARS}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground text-right">
                {form.prompt.length}/{MAX_PROMPT_CHARS}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSave()} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir role &quot;{deleteTarget?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.isDefault
                ? 'Esta role e a padrao da organizacao. Ao excluir, a primeira role restante sera definida como padrao automaticamente. Membros que usavam esta role voltarao a usar a role padrao.'
                : 'Membros que selecionaram esta role voltarao a usar a role padrao da organizacao. Esta acao nao pode ser desfeita.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
