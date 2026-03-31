'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useProjects, useAllFeatures } from '@/lib/query';
import { AssigneeSelect } from '@/components/features/shared/assignee-select';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/query-keys';
import { smartInvalidateImmediate } from '@/lib/query/helpers';
import { useCurrentOrgId } from '@/lib/query/hooks/use-org-id';

interface QuickTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProjectId?: string;
}

interface QuickTaskInput {
  title: string;
  projectId: string;
  featureId: string;
  type: 'TASK' | 'BUG';
  assignedTo: string | null;
}

async function createQuickTask(data: QuickTaskInput) {
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: data.title,
      projectId: data.projectId,
      featureId: data.featureId || null,
      assigneeId: data.assignedTo,
      description: '',
      type: data.type,
      priority: 'MEDIUM',
      status: 'BACKLOG',
      points: null,
      modules: [],
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error?.message || 'Erro ao criar task');
  }

  return res.json();
}

/**
 * QuickTaskDialog - Modal rápido para criar task
 * 
 * Campos mínimos:
 * - Título (obrigatório)
 * - Projeto (seleção, auto-seleciona feature padrão)
 * - Responsável (opcional)
 * 
 * Objetivo: criar task em menos de 5 segundos.
 */
export function QuickTaskDialog({
  open,
  onOpenChange,
  defaultProjectId,
}: QuickTaskDialogProps) {
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [featureId, setFeatureId] = useState('');
  const [type, setType] = useState<'TASK' | 'BUG'>('TASK');
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [assigneeError, setAssigneeError] = useState(false);

  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();
  const { data: projects, isLoading: isLoadingProjects } = useProjects();
  const { data: allFeatures, isLoading: isLoadingFeatures } = useAllFeatures();

  // Filtrar features do projeto selecionado
  const projectFeatures = useMemo(() => {
    return allFeatures?.filter((f) => {
      // Verificar se feature pertence ao projeto
      return f.epic?.project?.id === projectId;
    }) || [];
  }, [allFeatures, projectId]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setTitle('');
      setProjectId(defaultProjectId || projects?.[0]?.id || '');
      setFeatureId('');
      setType('TASK');
      setAssignedTo(null);
    }
  }, [open, defaultProjectId, projects]);

  // ✅ FIX JKILL-214: Auto-select ONLY when projectFeatures becomes available for the FIRST time
  // Don't reset featureId if user has already made a selection
  useEffect(() => {
    // Only auto-select if:
    // 1. Features are loaded for this project
    // 2. No feature is currently selected (user hasn't picked yet)
    if (projectFeatures.length > 0 && !featureId) {
      // Preferir feature "Sustentação" ou primeira disponível
      const sustentacao = projectFeatures.find((f) =>
        f.title.toLowerCase().includes('sustentação') ||
        f.title.toLowerCase().includes('sustentacao') ||
        f.title.toLowerCase().includes('backlog')
      );
      setFeatureId(sustentacao?.id || projectFeatures[0].id);
    }
    // JKILL-214: Depends on length AND projectId to handle projects with same feature count
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectFeatures.length, projectId]); // Trigger when project changes OR features load

  const mutation = useMutation({
    mutationFn: createQuickTask,
    onSuccess: () => {
      // CREATE operation: use smartInvalidateImmediate for aggressive invalidation
      smartInvalidateImmediate(queryClient, queryKeys.tasks.lists(orgId));
      smartInvalidateImmediate(queryClient, queryKeys.dashboard.all(orgId));

      toast.success('Task criada!', {
        description: title,
      });

      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error('Erro ao criar task', {
        description: error.message,
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Digite um título para a task');
      return;
    }

    if (!projectId) {
      toast.error('Selecione um projeto');
      return;
    }

    // JKILL-215: Validate assignee is required
    if (!assignedTo) {
      setAssigneeError(true);
      toast.error('O campo Responsável é obrigatório');
      return;
    }

    mutation.mutate({
      title: title.trim(),
      projectId,
      featureId,
      type,
      assignedTo,
    });
  };

  const isLoading = isLoadingProjects || isLoadingFeatures;
  const isSaving = mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Nova Task Rápida
          </DialogTitle>
          <DialogDescription>
            Crie uma task em segundos. Você pode editar os detalhes depois.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Título */}
          <div className="space-y-2">
            <Label htmlFor="quick-title">O que precisa ser feito?</Label>
            <Input
              id="quick-title"
              placeholder="Ex: Corrigir bug no login..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              disabled={isSaving}
            />
          </div>

          {/* Projeto */}
          <div className="space-y-2">
            <Label htmlFor="quick-project">Projeto</Label>
            <Select
              value={projectId}
              onValueChange={(value) => {
                setProjectId(value);
                setFeatureId(''); // Reset feature
              }}
              disabled={isLoading || isSaving}
            >
              <SelectTrigger id="quick-project">
                <SelectValue placeholder="Selecione um projeto" />
              </SelectTrigger>
              <SelectContent>
                {projects?.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo */}
          <div className="space-y-2">
            <Label htmlFor="quick-type">Tipo</Label>
            <Select
              value={type}
              onValueChange={(value) => setType(value as 'TASK' | 'BUG')}
              disabled={isLoading || isSaving}
            >
              <SelectTrigger id="quick-type">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TASK">Task</SelectItem>
                <SelectItem value="BUG">Bug</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Responsável */}
          <div className="space-y-2">
            <Label htmlFor="quick-assignee">
              Responsável <span className="text-red-500">*</span>
            </Label>
            <AssigneeSelect
              value={assignedTo}
              onChange={(v) => {
                setAssignedTo(v);
                if (v) setAssigneeError(false);
              }}
              disabled={isSaving}
              placeholder="Selecione um responsável"
            />
            {assigneeError && (
              <p className="text-sm text-red-500">Responsável é obrigatório</p>
            )}
          </div>

          {projectFeatures.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="quick-feature">Feature</Label>
              <Select
                value={featureId}
                onValueChange={setFeatureId}
                disabled={isLoading || isSaving}
              >
                <SelectTrigger id="quick-feature">
                  <SelectValue placeholder="Selecione uma feature" />
                </SelectTrigger>
                <SelectContent>
                  {projectFeatures.map((feature) => (
                    <SelectItem key={feature.id} value={feature.id}>
                      {feature.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {projectFeatures.length === 1 && (
            <div className="space-y-1">
              <Label className="text-sm font-medium">Feature</Label>
              <p className="text-sm text-muted-foreground">
                {projectFeatures[0].title}
              </p>
            </div>
          )}
          {projectFeatures.length === 0 && (
            <div className="space-y-1">
              <Label className="text-sm font-medium">Feature</Label>
              <p className="text-sm text-muted-foreground italic">
                Nenhuma feature encontrada. A task será criada na feature de Sustentação.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || isSaving || !title.trim() || !assignedTo}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                'Criar Task'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
