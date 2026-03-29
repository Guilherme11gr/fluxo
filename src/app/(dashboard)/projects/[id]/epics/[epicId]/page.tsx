"use client";

import { useState, useCallback, use, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Plus, Box, Loader2, MoreVertical, MoreHorizontal, Pencil, Trash2, Sparkles, Bug } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { TagSelector } from "@/components/features/tags";
import { DocContextSelector } from "@/components/features/shared";
import { useEpic, useFeaturesByEpic, useCreateFeature, useUpdateFeature, useDeleteFeature, useImproveFeatureDescription } from "@/lib/query";
import { PageHeaderSkeleton, CardsSkeleton, TableSkeleton } from '@/components/layout/page-skeleton';
import { toast } from "sonner";
import type { FeatureHealth } from "@/shared/types/project.types";
import type { TagInfo } from "@/shared/types/tag.types";
import {
  API_ROUTES,
  AI_REFINE_TIMEOUT_MS,
  AI_COOLDOWN_MS
} from "@/config/ai.config";

interface Feature {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  _count?: { tasks: number };
  tasks?: Array<{ status: string; type: string }>;
  // Health check fields
  health?: FeatureHealth;
  healthReason?: string | null;
  healthUpdatedAt?: string | Date | null;
}

import { EpicAISummaryCard } from "@/components/features/epics/epic-ai-summary-card";
import { EpicRiskBadge } from "@/components/features/epics";
import { FeatureHealthBadge } from "@/components/features/features";
import { FeaturesTableView } from "@/components/features/features-table-view";
import { ChevronDown, ChevronRight, LayoutList, LayoutGrid } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";



export default function EpicDetailPage({
  params,
}: {
  params: Promise<{ id: string; epicId: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();

  // React Query hooks
  const { data: epic, isLoading: epicLoading } = useEpic(resolvedParams.epicId);
  const { data: features = [], isLoading: featuresLoading } = useFeaturesByEpic(resolvedParams.epicId);

  // Mutations
  const createFeatureMutation = useCreateFeature();
  const updateFeatureMutation = useUpdateFeature();
  const deleteFeatureMutation = useDeleteFeature();
  const improveDescriptionMutation = useImproveFeatureDescription();

  const loading = epicLoading || featuresLoading;
  const saving = createFeatureMutation.isPending || updateFeatureMutation.isPending;
  const isGeneratingAI = improveDescriptionMutation.isPending;
  const [isRefiningDescription, setIsRefiningDescription] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  // Create Feature State
  const [isFeatureDialogOpen, setIsFeatureDialogOpen] = useState(false);
  const [featureFormData, setFeatureFormData] = useState({
    title: "",
    description: "",
    status: "BACKLOG" as "BACKLOG" | "TODO" | "DOING" | "DONE",
    tags: [] as TagInfo[],
  });
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);

  // Edit Feature State
  const [editingFeature, setEditingFeature] = useState<Feature | null>(null);
  const [isFeatureEditDialogOpen, setIsFeatureEditDialogOpen] = useState(false);

  // Delete Feature State
  const [featureToDelete, setFeatureToDelete] = useState<Feature | null>(null);

  // AI Summary State

  // AI Refs for race condition prevention and cooldown
  const isImprovingRef = useRef(false);
  const isGeneratingRef = useRef(false);
  const lastAICallRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isImprovingRef.current = false;
      isGeneratingRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  // AI handler for IMPROVING description (simple refinement)
  const handleImproveDescription = useCallback(async () => {
    // Prevent concurrent AI operations (fixes race condition)
    if (isImprovingRef.current || isGeneratingRef.current || isGeneratingAI) return;

    // Cooldown check (prevents spam)
    const now = Date.now();
    if (now - lastAICallRef.current < AI_COOLDOWN_MS) {
      toast.error('Aguarde alguns segundos antes de tentar novamente');
      return;
    }

    if (!featureFormData.description?.trim()) {
      toast.error('Adicione uma descrição primeiro');
      return;
    }

    isImprovingRef.current = true;
    lastAICallRef.current = now;
    setIsRefiningDescription(true);

    // Timeout controller to prevent hanging requests
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), AI_REFINE_TIMEOUT_MS);

    try {
      const response = await fetch(API_ROUTES.AI.REFINE_TEXT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: featureFormData.description,
          context: 'descrição de feature',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Erro ao refinar texto');
      }

      const result = await response.json();
      setFeatureFormData(prev => ({ ...prev, description: result.data.refinedText }));

      toast.success('Descrição melhorada', {
        description: `${result.data.originalLength} → ${result.data.refinedLength} caracteres`,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('[AI] Improve error:', error);

      if (error instanceof Error && error.name === 'AbortError') {
        toast.error('Tempo esgotado', {
          description: 'A requisição demorou muito. Tente novamente.',
        });
      } else {
        toast.error('Erro ao melhorar', {
          description: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    } finally {
      isImprovingRef.current = false;
      abortControllerRef.current = null;
      setIsRefiningDescription(false);
    }
  }, [featureFormData.description, isGeneratingAI]);

  // AI handler for GENERATING description (intelligent with context)
  const handleGenerateDescription = useCallback(async () => {
    // Prevent concurrent AI operations (fixes race condition)
    if (isGeneratingRef.current || isImprovingRef.current || isGeneratingAI) return;

    // Cooldown check (prevents spam)
    const now = Date.now();
    if (now - lastAICallRef.current < AI_COOLDOWN_MS) {
      toast.error('Aguarde alguns segundos antes de tentar novamente');
      return;
    }

    if (!featureFormData.title.trim()) {
      toast.error('Preencha o título primeiro');
      return;
    }

    isGeneratingRef.current = true;
    lastAICallRef.current = now;

    try {
      const result = await improveDescriptionMutation.mutateAsync({
        title: featureFormData.title,
        description: featureFormData.description || undefined,
        epicId: resolvedParams.epicId,
        featureId: editingFeature?.id,
        docIds: selectedDocIds.length > 0 ? selectedDocIds : undefined,
      });
      setFeatureFormData(prev => ({ ...prev, description: result.description }));
      toast.success('Descrição gerada com sucesso!');
    } catch {
      // Error handled by hook
    } finally {
      isGeneratingRef.current = false;
    }
  }, [isGeneratingAI, featureFormData.title, featureFormData.description, resolvedParams.epicId, editingFeature?.id, improveDescriptionMutation]);

  const handleCreateFeature = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createFeatureMutation.mutateAsync({
        epicId: resolvedParams.epicId,
        title: featureFormData.title,
        description: featureFormData.description || undefined,
        status: featureFormData.status,
      });
      // TODO: Assign tags to feature after creation when API supports it
      setFeatureFormData({ title: "", description: "", status: "BACKLOG", tags: [] });
      setIsFeatureDialogOpen(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleEditFeatureClick = useCallback((feature: Feature) => {
    setEditingFeature(feature);
    setFeatureFormData({
      title: feature.title,
      description: feature.description || "",
      status: (feature.status as "BACKLOG" | "TODO" | "DOING" | "DONE") || "BACKLOG",
      tags: [], // Tags will be loaded separately if needed
    });
    setIsFeatureEditDialogOpen(true);
  }, []);

  const handleEditFeatureSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFeature) return;

    try {
      await updateFeatureMutation.mutateAsync({
        id: editingFeature.id,
        data: {
          title: featureFormData.title,
          description: featureFormData.description || undefined,
          status: featureFormData.status,
        },
      });
      // TODO: Assign tags to feature when API supports it
      setIsFeatureEditDialogOpen(false);
      setEditingFeature(null);
      setFeatureFormData({ title: "", description: "", status: "BACKLOG", tags: [] });
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleDeleteFeatureClick = useCallback((feature: Feature) => {
    setFeatureToDelete(feature); // Opens dialog
  }, []);

  const confirmDeleteFeature = async () => {
    if (!featureToDelete) return;

    try {
      await deleteFeatureMutation.mutateAsync(featureToDelete.id);
      setFeatureToDelete(null);
    } catch (error) {
      // Error handled by mutation
    }
  };

  // Only show skeleton on initial load (no cached data yet)
  // During refetch, keep UI mounted to preserve modal state
  if (loading && !epic && features.length === 0) {
    return (
      <div className="space-y-6">
        <div className="mb-6 md:mb-8">
          <PageHeaderSkeleton />
        </div>
        <TableSkeleton rows={5} />
      </div>
    );
  }

  if (!epic) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <h2 className="text-2xl font-bold mb-2">Epic não encontrada</h2>
        <p className="text-muted-foreground mb-4">Não foi possível carregar os dados da epic.</p>
        <Link href={`/projects/${resolvedParams.id}`}>
          <Button variant="outline">Voltar para o Projeto</Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mx-auto mb-8">
        <Link
          href={`/projects/${resolvedParams.id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Voltar para Projeto
        </Link>

        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="outline">
                EPIC
              </Badge>
              <Badge variant="secondary">
                {epic.status}
              </Badge>
              {epic.risk && (
                <EpicRiskBadge
                  risk={epic.risk}
                  riskReason={epic.riskReason}
                  riskUpdatedAt={epic.riskUpdatedAt}
                />
              )}
            </div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">
              {epic.title}
            </h1>
            <div className="max-w-2xl">
              <div className={`text-muted-foreground text-sm transition-all duration-200 ${!isDescriptionExpanded ? 'line-clamp-2' : ''} break-words overflow-hidden`}>
                <div className="prose prose-sm dark:prose-invert max-w-none
                            prose-headings:font-semibold prose-headings:text-foreground/90
                            prose-p:leading-relaxed prose-p:text-muted-foreground
                            prose-strong:text-foreground
                            prose-blockquote:border-violet-300 prose-blockquote:bg-violet-50/50 dark:prose-blockquote:bg-violet-900/20 dark:prose-blockquote:border-violet-700 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r-sm prose-blockquote:not-italic prose-blockquote:text-violet-700 dark:prose-blockquote:text-violet-300
                            prose-code:break-all prose-pre:overflow-x-auto prose-pre:max-w-full">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ node, ...props }) => <span className="block font-bold mt-2 first:mt-0" {...props} />,
                      h2: ({ node, ...props }) => <span className="block font-semibold mt-2 first:mt-0" {...props} />,
                      p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                      ul: ({ node, ...props }) => <ul className="ml-4 list-disc mb-2" {...props} />,
                      ol: ({ node, ...props }) => <ol className="ml-4 list-decimal mb-2" {...props} />,
                      li: ({ node, ...props }) => <li className="" {...props} />,
                      a: ({ node, ...props }) => <a className="text-primary underline hover:no-underline break-all" {...props} />,
                      blockquote: ({ node, ...props }) => <blockquote className="border-l-2 border-primary/30 pl-2 italic my-2" {...props} />,
                      code: (props: any) => {
                        const { children, className, node, ...rest } = props
                        const match = /language-(\w+)/.exec(className || '')
                        return !match ? (
                          <code className="bg-muted px-1 py-0.5 rounded font-mono text-xs break-all" {...rest}>
                            {children}
                          </code>
                        ) : (
                          <code className={className} {...rest}>
                            {children}
                          </code>
                        )
                      }
                    }}
                  >
                    {epic.description || "Sem descrição"}
                  </ReactMarkdown>
                </div>
              </div>
              {epic.description && (
                <Button
                  variant="link"
                  size="sm"
                  className="px-0 h-auto mt-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                >
                  {isDescriptionExpanded ? "Ver menos" : "Ver mais"}
                </Button>
              )}
            </div>

            {features.length > 0 && (
              <div className="flex items-center gap-4 mt-6 w-full max-w-md">
                <div className="flex-1">
                  <Progress
                    value={(() => {
                      const totalTasks = features.reduce((acc, f) => acc + (f._count?.tasks || 0), 0);
                      const completedTasks = features.reduce((acc, f) => acc + (f.tasks?.filter(t => t.status === 'DONE').length || 0), 0);
                      return totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                    })()}
                    className="h-2"
                  />
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap min-w-[120px] text-right">
                  {(() => {
                    const totalTasks = features.reduce((acc, f) => acc + (f._count?.tasks || 0), 0);
                    const completedTasks = features.reduce((acc, f) => acc + (f.tasks?.filter(t => t.status === 'DONE').length || 0), 0);
                    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                    return `${progress}% (${completedTasks}/${totalTasks} tasks)`;
                  })()}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">

            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <MoreVertical className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <EpicAISummaryCard
          epicId={epic.id}
          initialSummary={epic.aiSummary}
          lastAnalyzedAt={epic.lastAnalyzedAt}
        />
      </div>

      {/* Features Section */}
      <div className="mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Box className="w-5 h-5 text-primary" />
            Features
            <span className="text-sm font-normal text-muted-foreground ml-2">
              ({features.length})
            </span>
          </h2>

          <Dialog open={isFeatureDialogOpen} onOpenChange={setIsFeatureDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Nova Feature
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Nova Feature</DialogTitle>
                <DialogDescription>
                  Features são entregáveis funcionais dentro da Epic
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateFeature} className="space-y-4">
                <div>
                  <Label htmlFor="feature-title">Título</Label>
                  <Input
                    id="feature-title"
                    value={featureFormData.title}
                    onChange={(e) =>
                      setFeatureFormData({ ...featureFormData, title: e.target.value })
                    }
                    placeholder="Ex: Autenticação via Google"
                    required
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="feature-description">Descrição</Label>
                    <DocContextSelector
                      projectId={resolvedParams.id}
                      selectedDocIds={selectedDocIds}
                      onSelectionChange={setSelectedDocIds}
                      disabled={isGeneratingAI || isRefiningDescription}
                    />
                  </div>
                  <MarkdownEditor
                    id="feature-description"
                    value={featureFormData.description}
                    onChange={(v) =>
                      setFeatureFormData({ ...featureFormData, description: v })
                    }
                    placeholder="Detalhes técnicos da feature...&#10;&#10;## Critérios de Aceite&#10;- [ ] Critério 1"
                    minHeight="250px"
                    onImprove={handleImproveDescription}
                    onGenerate={handleGenerateDescription}
                    isImproving={isRefiningDescription}
                    isGenerating={isGeneratingAI}
                  />
                </div>
                <div>
                  <Label htmlFor="feature-status">Status</Label>
                  <Select
                    value={featureFormData.status}
                    onValueChange={(v) => setFeatureFormData({ ...featureFormData, status: v as "BACKLOG" | "TODO" | "DOING" | "DONE" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BACKLOG">Backlog</SelectItem>
                      <SelectItem value="TODO">A Fazer</SelectItem>
                      <SelectItem value="DOING">Em Progresso</SelectItem>
                      <SelectItem value="DONE">Concluída</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Tags - Multi-select */}
                {resolvedParams.id && (
                  <div>
                    <Label>Tags</Label>
                    <TagSelector
                      projectId={resolvedParams.id}
                      selectedTags={featureFormData.tags}
                      onTagsChange={(tags) => setFeatureFormData({ ...featureFormData, tags })}
                      placeholder="Selecionar tags..."
                    />
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setIsFeatureDialogOpen(false)}
                    disabled={saving}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Criando...
                      </>
                    ) : (
                      "Criar Feature"
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {features.length === 0 ? (
          <EmptyState
            icon={Box}
            title="Nenhuma feature ainda"
            description="Quebre sua Epic em features menores e entregáveis para facilitar o desenvolvimento."
            action={
              <Button
                variant="outline"
                onClick={() => setIsFeatureDialogOpen(true)}
              >
                Criar Primeira Feature
              </Button>
            }
          />
        ) : (
          <div className="space-y-12">
            {/* Active Features */}
            <div>
              <FeaturesTableView
                features={features.filter(f => f.status !== 'DONE')}
                projectId={resolvedParams.id}
                epicId={resolvedParams.epicId}
                onEdit={handleEditFeatureClick}
                onDelete={handleDeleteFeatureClick}
              />
            </div>

            {/* Completed Features */}
            {features.some(f => f.status === 'DONE') && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <h3 className="text-sm font-medium uppercase tracking-wider">Concluídas ({features.filter(f => f.status === 'DONE').length})</h3>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="opacity-75 grayscale-[0.3]">
                  <FeaturesTableView
                    features={features.filter(f => f.status === 'DONE')}
                    projectId={resolvedParams.id}
                    epicId={resolvedParams.epicId}
                    onEdit={handleEditFeatureClick}
                    onDelete={handleDeleteFeatureClick}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Feature Dialog */}
      <Dialog open={isFeatureEditDialogOpen} onOpenChange={setIsFeatureEditDialogOpen}>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Feature</DialogTitle>
            <DialogDescription>
              Edite os detalhes da feature
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditFeatureSubmit} className="space-y-4">
            <div>
              <Label htmlFor="edit-feature-title">Título</Label>
              <Input
                id="edit-feature-title"
                value={featureFormData.title}
                onChange={(e) =>
                  setFeatureFormData({ ...featureFormData, title: e.target.value })
                }
                placeholder="Ex: Autenticação via Google"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="edit-feature-description">Descrição</Label>
                <DocContextSelector
                  projectId={resolvedParams.id}
                  selectedDocIds={selectedDocIds}
                  onSelectionChange={setSelectedDocIds}
                  disabled={isGeneratingAI || isRefiningDescription}
                />
              </div>
              <MarkdownEditor
                id="edit-feature-description"
                value={featureFormData.description}
                onChange={(v) =>
                  setFeatureFormData({ ...featureFormData, description: v })
                }
                placeholder="Detalhes técnicos da feature...&#10;&#10;## Critérios de Aceite&#10;- [ ] Critério 1"
                minHeight="250px"
                onImprove={handleImproveDescription}
                onGenerate={handleGenerateDescription}
                isImproving={isRefiningDescription}
                isGenerating={isGeneratingAI}
              />
            </div>
            <div>
              <Label htmlFor="edit-feature-status">Status</Label>
              <Select
                value={featureFormData.status}
                onValueChange={(v) => setFeatureFormData({ ...featureFormData, status: v as "BACKLOG" | "TODO" | "DOING" | "DONE" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BACKLOG">Backlog</SelectItem>
                  <SelectItem value="TODO">A Fazer</SelectItem>
                  <SelectItem value="DOING">Em Progresso</SelectItem>
                  <SelectItem value="DONE">Concluída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Tags - Multi-select */}
            {resolvedParams.id && (
              <div>
                <Label>Tags</Label>
                <TagSelector
                  projectId={resolvedParams.id}
                  selectedTags={featureFormData.tags}
                  onTagsChange={(tags) => setFeatureFormData({ ...featureFormData, tags })}
                  placeholder="Selecionar tags..."
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsFeatureEditDialogOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar Alterações"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Feature Confirmation Dialog */}
      <Dialog open={!!featureToDelete} onOpenChange={(open) => !open && setFeatureToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Você tem certeza?</DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. Isso excluirá permanentemente a feature
              <span className="font-medium text-foreground"> "{featureToDelete?.title}" </span>
              {(featureToDelete?._count?.tasks || 0) > 0 && (
                <>
                  e suas <span className="font-medium text-foreground">{featureToDelete?._count?.tasks} tasks</span>
                </>
              )}
              .
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setFeatureToDelete(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteFeature}
            >
              Excluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
