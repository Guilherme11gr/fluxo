"use client";

import { useState, useCallback, use, useRef, useEffect, useMemo, useDeferredValue } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { Plus, Loader2, ArrowLeft, Layers, MoreHorizontal, Pencil, Trash2, Lightbulb, PlayCircle, Archive } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { useProject, useEpics } from "@/lib/query";
import { useCreateEpic, useUpdateEpic, useDeleteEpic } from "@/lib/query/hooks/use-epics";
import { ProjectDocsList, ProjectNotesList } from "@/components/features/projects";
import { FileText } from "lucide-react";
import { PageHeaderSkeleton, CardsSkeleton } from '@/components/layout/page-skeleton';
import { useTabQuery } from "@/hooks/use-tab-query";
import { toast } from "sonner";
import { ViewToggle, type ViewMode } from "@/components/features/tasks";
import {
  EpicsTableView,
  EpicRiskBadge,
  filterProjectEpics,
  splitProjectEpicsByStatus,
  type ProjectEpicListItem,
} from "@/components/features/epics";
import { 
  API_ROUTES, 
  AI_REFINE_TIMEOUT_MS, 
  AI_GENERATE_TIMEOUT_MS,
  AI_COOLDOWN_MS 
} from "@/config/ai.config";

type Epic = ProjectEpicListItem;



export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);

  // React Query hooks
  const { data: project, isLoading: projectLoading } = useProject(resolvedParams.id);
  const { data: epics = [], isLoading: epicsLoading } = useEpics(resolvedParams.id);


  // Mutations
  const createEpicMutation = useCreateEpic();
  const updateEpicMutation = useUpdateEpic();
  const deleteEpicMutation = useDeleteEpic();

  const loading = projectLoading || epicsLoading;
  const saving = createEpicMutation.isPending || updateEpicMutation.isPending;

  // AI State
  const [isRefiningDescription, setIsRefiningDescription] = useState(false);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);

  // Tab State
  const { activeTab, setActiveTab } = useTabQuery("epics", ["epics", "docs", "ideas"]);
  const [epicsView, setEpicsView] = useState<ViewMode>("table");
  const [epicSearch, setEpicSearch] = useState("");
  const [epicStatusFilter, setEpicStatusFilter] = useState<"all" | "OPEN" | "CLOSED">("all");
  const deferredEpicSearch = useDeferredValue(epicSearch);

  // Create Epic State
  const [isEpicDialogOpen, setIsEpicDialogOpen] = useState(false);
  const [epicFormData, setEpicFormData] = useState({
    title: "",
    description: "",
    status: "OPEN" as "OPEN" | "CLOSED",
  });

  // Edit Epic State
  const [editingEpic, setEditingEpic] = useState<Epic | null>(null);
  const [isEpicEditDialogOpen, setIsEpicEditDialogOpen] = useState(false);

  // Delete Epic State
  const [epicToDelete, setEpicToDelete] = useState<Epic | null>(null);

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
    if (isImprovingRef.current || isGeneratingRef.current) return;

    // Cooldown check (prevents spam)
    const now = Date.now();
    if (now - lastAICallRef.current < AI_COOLDOWN_MS) {
      toast.error('Aguarde alguns segundos antes de tentar novamente');
      return;
    }

    if (!epicFormData.description?.trim()) {
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
          text: epicFormData.description,
          context: 'descrição de epic',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Erro ao refinar texto');
      }

      const result = await response.json();
      setEpicFormData(prev => ({ ...prev, description: result.data.refinedText }));
      
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
  }, [epicFormData.description]);

  // AI handler for GENERATING description (intelligent with context)
  const handleGenerateDescription = useCallback(async () => {
    // Prevent concurrent AI operations (fixes race condition)
    if (isGeneratingRef.current || isImprovingRef.current) return;

    // Cooldown check (prevents spam)
    const now = Date.now();
    if (now - lastAICallRef.current < AI_COOLDOWN_MS) {
      toast.error('Aguarde alguns segundos antes de tentar novamente');
      return;
    }

    if (!epicFormData.title.trim()) {
      toast.error('Adicione um título primeiro');
      return;
    }

    isGeneratingRef.current = true;
    lastAICallRef.current = now;
    setIsGeneratingDescription(true);

    // Timeout controller to prevent hanging requests
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), AI_GENERATE_TIMEOUT_MS);

    try {
      const response = await fetch(API_ROUTES.AI.IMPROVE_EPIC_DESCRIPTION, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: epicFormData.title,
          description: epicFormData.description || undefined,
          projectId: resolvedParams.id,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Erro ao gerar descrição');
      }

      const result = await response.json();
      setEpicFormData(prev => ({ ...prev, description: result.data.description }));
      
      toast.success('Descrição gerada com sucesso!');
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('[AI] Generate error:', error);
      
      if (error instanceof Error && error.name === 'AbortError') {
        toast.error('Tempo esgotado', {
          description: 'A requisição demorou muito. Tente novamente.',
        });
      } else {
        toast.error('Erro ao gerar', {
          description: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    } finally {
      isGeneratingRef.current = false;
      abortControllerRef.current = null;
      setIsGeneratingDescription(false);
    }
  }, [epicFormData.title, epicFormData.description, resolvedParams.id]);

  const handleCreateEpic = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createEpicMutation.mutateAsync({
        projectId: resolvedParams.id,
        title: epicFormData.title,
        description: epicFormData.description || undefined,
        status: epicFormData.status,
      });
      setEpicFormData({ title: "", description: "", status: "OPEN" });
      setIsEpicDialogOpen(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleEditEpicClick = useCallback((epic: Epic) => {
    setEditingEpic(epic);
    setEpicFormData({
      title: epic.title,
      description: epic.description || "",
      status: (epic.status as "OPEN" | "CLOSED") || "OPEN",
    });
    setIsEpicEditDialogOpen(true);
  }, []);

  const handleEditEpicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEpic) return;

    try {
      await updateEpicMutation.mutateAsync({
        id: editingEpic.id,
        data: {
          title: epicFormData.title,
          description: epicFormData.description || undefined,
          status: epicFormData.status,
        },
      });
      setIsEpicEditDialogOpen(false);
      setEditingEpic(null);
      setEpicFormData({ title: "", description: "", status: "OPEN" });
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleDeleteEpicClick = useCallback((epic: Epic) => {
    setEpicToDelete(epic);
  }, []);

  const confirmDeleteEpic = async () => {
    if (!epicToDelete) return;

    try {
      await deleteEpicMutation.mutateAsync(epicToDelete.id);
      setEpicToDelete(null);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const filteredEpics = useMemo(() => {
    return filterProjectEpics(epics, deferredEpicSearch, epicStatusFilter);
  }, [deferredEpicSearch, epicStatusFilter, epics]);

  const { openEpics, closedEpics } = useMemo(
    () => splitProjectEpicsByStatus(filteredEpics),
    [filteredEpics]
  );

  // Only show skeleton on initial load (no cached data yet)
  // During refetch, keep UI mounted to preserve modal state
  if (loading && !project && epics.length === 0) {
    return (
      <div className="space-y-6">
        <div className="mb-6 md:mb-8">
          <PageHeaderSkeleton />
        </div>
        <CardsSkeleton count={3} />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold mb-4">Projeto não encontrado</h2>
        <Link href="/projects">
          <Button variant="outline">Voltar para Projetos</Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 md:mb-8">
        <Link href="/projects">
          <Button variant="ghost" className="gap-2 mb-4 pl-0 hover:pl-2 transition-all">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
        </Link>
        <div className="flex flex-col md:flex-row justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <Badge variant="outline" className="font-mono text-sm md:text-base">
                {project.key}
              </Badge>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{project.name}</h1>
            </div>
            {project.description && (
              <p className="text-muted-foreground text-sm md:text-base">{project.description}</p>
            )}
            {project.modules && project.modules.length > 0 && (
              <div className="flex gap-2 mt-3 flex-wrap">
                {project.modules.map((module: string) => (
                  <Badge key={module} variant="secondary" className="bg-muted">
                    {module}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-border overflow-x-auto">
        <button
          onClick={() => setActiveTab("epics")}
          className={`pb-3 px-2 font-medium transition-colors whitespace-nowrap ${activeTab === "epics"
            ? "text-primary border-b-2 border-primary"
            : "text-muted-foreground hover:text-foreground"
            }`}
        >
          <Layers className="w-4 h-4 inline mr-2" />
          Epics ({epics.length})
        </button>

        <button
          onClick={() => setActiveTab("docs")}
          className={`pb-3 px-2 font-medium transition-colors whitespace-nowrap ${activeTab === "docs"
            ? "text-primary border-b-2 border-primary"
            : "text-muted-foreground hover:text-foreground"
            }`}
        >
          <FileText className="w-4 h-4 inline mr-2" />
          Docs
        </button>

        <button
          onClick={() => setActiveTab("ideas")}
          className={`pb-3 px-2 font-medium transition-colors whitespace-nowrap ${activeTab === "ideas"
            ? "text-primary border-b-2 border-primary"
            : "text-muted-foreground hover:text-foreground"
            }`}
        >
          <Lightbulb className="w-4 h-4 inline mr-2" />
          Ideias
        </button>
      </div>

      {/* Epics Tab */}
      {activeTab === "epics" && (
        <div>
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-xl font-semibold">Epics</h2>
                <p className="text-sm text-muted-foreground">
                  {filteredEpics.length} de {epics.length} epics visíveis
                </p>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <ViewToggle
                  value={epicsView}
                  onChange={setEpicsView}
                  primaryLabel="Grid"
                  secondaryLabel="Table"
                />
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-3">
              <Input
                value={epicSearch}
                onChange={(e) => setEpicSearch(e.target.value)}
                placeholder="Buscar epics por título ou descrição..."
                className="lg:max-w-sm"
              />
              <Select
                value={epicStatusFilter}
                onValueChange={(value) => setEpicStatusFilter(value as "all" | "OPEN" | "CLOSED")}
              >
                <SelectTrigger className="w-full lg:w-[180px]">
                  <SelectValue placeholder="Filtrar status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="OPEN">Abertas</SelectItem>
                  <SelectItem value="CLOSED">Fechadas</SelectItem>
                </SelectContent>
              </Select>

              <div className="lg:ml-auto">
                <Dialog open={isEpicDialogOpen} onOpenChange={setIsEpicDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2 w-full sm:w-auto">
                      <Plus className="w-4 h-4" />
                      Nova Epic
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Criar Nova Epic</DialogTitle>
                      <DialogDescription>
                        Epics agrupam features relacionadas
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateEpic} className="space-y-4">
                      <div>
                        <Label htmlFor="epic-title">Título</Label>
                        <Input
                          id="epic-title"
                          value={epicFormData.title}
                          onChange={(e) =>
                            setEpicFormData({ ...epicFormData, title: e.target.value })
                          }
                          placeholder="Nome da Epic"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="epic-description">Descrição</Label>
                        <MarkdownEditor
                          id="epic-description"
                          value={epicFormData.description}
                          onChange={(v) =>
                            setEpicFormData({ ...epicFormData, description: v })
                          }
                          placeholder="Descrição da epic...&#10;&#10;## Objetivo&#10;Descreva o objetivo geral&#10;&#10;## Escopo&#10;- [ ] Item 1"
                          minHeight="200px"
                          onImprove={handleImproveDescription}
                          onGenerate={handleGenerateDescription}
                          isImproving={isRefiningDescription}
                          isGenerating={isGeneratingDescription}
                        />
                      </div>
                      <div>
                        <Label htmlFor="epic-status">Status</Label>
                        <Select
                          value={epicFormData.status}
                          onValueChange={(v) => setEpicFormData({ ...epicFormData, status: v as "OPEN" | "CLOSED" })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="OPEN">Aberto</SelectItem>
                            <SelectItem value="CLOSED">Fechado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsEpicDialogOpen(false)}
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
                            "Criar Epic"
                          )}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
          {epics.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="Nenhuma epic ainda"
              description="Crie epics para organizar suas features e entregas de valor."
              action={
                <Button onClick={() => setIsEpicDialogOpen(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Criar Primeira Epic
                </Button>
              }
            />
          ) : filteredEpics.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="Nenhuma epic encontrada"
              description="Ajuste a busca ou o filtro para ver outras epics."
            />
          ) : (
            <div className="space-y-10">
              <div className="space-y-4">
                {epicsView === "table" ? (
                  <EpicsTableView
                    epics={openEpics}
                    projectId={resolvedParams.id}
                    onEdit={handleEditEpicClick}
                    onDelete={handleDeleteEpicClick}
                  />
                ) : (
                  <div className="grid gap-4">
                    {openEpics.map((epic) => (
                      <div key={epic.id} className="relative group">
                        <Link href={`/projects/${resolvedParams.id}/epics/${epic.id}`} prefetch={false}>
                          <Card className="cursor-pointer transition-all duration-300 hover:border-primary/50 hover:shadow-sm">
                            <CardHeader className="pb-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-2 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge variant="outline" className="font-mono text-[10px]">
                                      E-{epic.id.slice(0, 4)}
                                    </Badge>
                                    <Badge variant={epic.status === "OPEN" ? "outline-success" : "outline"} className="gap-1">
                                      {epic.status === "OPEN" ? (
                                        <PlayCircle className="h-3 w-3" />
                                      ) : (
                                        <Archive className="h-3 w-3" />
                                      )}
                                      {epic.status === "OPEN" ? "Aberta" : "Fechada"}
                                    </Badge>
                                    {epic.risk ? (
                                      <EpicRiskBadge
                                        risk={epic.risk}
                                        riskReason={epic.riskReason}
                                        riskUpdatedAt={epic.riskUpdatedAt}
                                        showLabel
                                      />
                                    ) : null}
                                  </div>
                                  <CardTitle className="text-lg font-semibold text-card-foreground transition-colors group-hover:text-foreground">
                                    {epic.title}
                                  </CardTitle>
                                  {epic.description ? (
                                    <CardDescription className="line-clamp-2 text-sm text-muted-foreground">
                                      {epic.description}
                                    </CardDescription>
                                  ) : null}
                                </div>
                                <div className="shrink-0 text-right">
                                  <div className="text-lg font-semibold">{epic._count?.features || 0}</div>
                                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                    Features
                                  </div>
                                </div>
                              </div>
                            </CardHeader>
                          </Card>
                        </Link>
                        <div className="absolute top-4 right-4 z-10 opacity-0 transition-opacity group-hover:opacity-100">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 bg-background/80 backdrop-blur-sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => handleEditEpicClick(epic)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => handleDeleteEpicClick(epic)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {closedEpics.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <h3 className="text-sm font-medium uppercase tracking-wider">
                      Fechadas ({closedEpics.length})
                    </h3>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <div className="opacity-75 grayscale-[0.15]">
                    {epicsView === "table" ? (
                      <EpicsTableView
                        epics={closedEpics}
                        projectId={resolvedParams.id}
                        onEdit={handleEditEpicClick}
                        onDelete={handleDeleteEpicClick}
                      />
                    ) : (
                      <div className="grid gap-4">
                        {closedEpics.map((epic) => (
                          <div key={epic.id} className="relative group">
                            <Link href={`/projects/${resolvedParams.id}/epics/${epic.id}`} prefetch={false}>
                              <Card className="cursor-pointer transition-all duration-300 hover:border-primary/40 hover:shadow-sm">
                                <CardHeader className="pb-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-2 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <Badge variant="outline" className="font-mono text-[10px]">
                                          E-{epic.id.slice(0, 4)}
                                        </Badge>
                                        <Badge variant="outline" className="gap-1">
                                          <Archive className="h-3 w-3" />
                                          Fechada
                                        </Badge>
                                      </div>
                                      <CardTitle className="text-lg font-semibold">{epic.title}</CardTitle>
                                      {epic.description ? (
                                        <CardDescription className="line-clamp-2 text-sm text-muted-foreground">
                                          {epic.description}
                                        </CardDescription>
                                      ) : null}
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <div className="text-lg font-semibold">{epic._count?.features || 0}</div>
                                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                        Features
                                      </div>
                                    </div>
                                  </div>
                                </CardHeader>
                              </Card>
                            </Link>
                            <div className="absolute top-4 right-4 z-10 opacity-0 transition-opacity group-hover:opacity-100">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 bg-background/80 backdrop-blur-sm">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onSelect={() => handleEditEpicClick(epic)}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() => handleDeleteEpicClick(epic)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Excluir
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit Epic Dialog */}
      <Dialog open={isEpicEditDialogOpen} onOpenChange={setIsEpicEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Epic</DialogTitle>
            <DialogDescription>
              Edite os detalhes da epic
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditEpicSubmit} className="space-y-4">
            <div>
              <Label htmlFor="edit-epic-title">Título</Label>
              <Input
                id="edit-epic-title"
                value={epicFormData.title}
                onChange={(e) =>
                  setEpicFormData({ ...epicFormData, title: e.target.value })
                }
                placeholder="Nome da Epic"
                required
              />
            </div>
            <div>
              <Label htmlFor="edit-epic-description">Descrição</Label>
              <MarkdownEditor
                id="edit-epic-description"
                value={epicFormData.description}
                onChange={(v) =>
                  setEpicFormData({ ...epicFormData, description: v })
                }
                placeholder="Descrição da epic...&#10;&#10;## Objetivo&#10;Descreva o objetivo geral&#10;&#10;## Escopo&#10;- [ ] Item 1"
                minHeight="200px"
                onImprove={handleImproveDescription}
                onGenerate={handleGenerateDescription}
                isImproving={isRefiningDescription}
                isGenerating={isGeneratingDescription}
              />
            </div>
            <div>
              <Label htmlFor="edit-epic-status">Status</Label>
              <Select
                value={epicFormData.status}
                onValueChange={(v) => setEpicFormData({ ...epicFormData, status: v as "OPEN" | "CLOSED" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">Aberto</SelectItem>
                  <SelectItem value="CLOSED">Fechado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEpicEditDialogOpen(false)}
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

      {/* Delete Epic Confirmation Dialog */}
      <Dialog open={!!epicToDelete} onOpenChange={(open) => !open && setEpicToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Você tem certeza?</DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. Isso excluirá permanentemente a epic
              <span className="font-medium text-foreground"> "{epicToDelete?.title}" </span>
              {(epicToDelete?._count?.features || 0) > 0 && (
                <>
                  e suas <span className="font-medium text-foreground">{epicToDelete?._count?.features} features</span>
                </>
              )}
              .
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setEpicToDelete(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteEpic}
            >
              Excluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* Docs Tab */}
      {activeTab === "docs" && (
        <ProjectDocsList projectId={resolvedParams.id} />
      )}

      {/* Ideas Tab */}
      {activeTab === "ideas" && (
        <ProjectNotesList projectId={resolvedParams.id} />
      )}
    </div>
  );
}
