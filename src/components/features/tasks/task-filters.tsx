'use client';

import { useMemo } from 'react';
import { Search, X, FolderOpen, Layers, Box, ChevronRight, User, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { TaskStatus, TaskPriority } from '@/shared/types';

export interface TaskFiltersState {
  search: string;
  status: TaskStatus | 'all';
  priority: TaskPriority | 'all';
  module: string | 'all';
  projectId: string | 'all';
  epicId: string | 'all';
  featureId: string | 'all';
  assigneeId: string | 'all' | 'me';
  showDone: boolean;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface EpicOption {
  id: string;
  title: string;
  projectId: string;
}

interface FeatureOption {
  id: string;
  title: string;
  epicId: string;
}

interface MemberOption {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface TaskFiltersProps {
  filters: TaskFiltersState;
  onChange: (filters: TaskFiltersState) => void;
  modules?: string[];
  projects?: ProjectOption[];
  epics?: EpicOption[];
  features?: FeatureOption[];
  members?: MemberOption[];
  currentUserId?: string;
  className?: string;
}

const STATUS_OPTIONS: { value: TaskStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos Status' },
  { value: 'BACKLOG', label: 'Backlog' },
  { value: 'TODO', label: 'Todo' },
  { value: 'DOING', label: 'Doing' },
  { value: 'REVIEW', label: 'Review' },
  { value: 'QA_READY', label: 'QA Ready' },
  { value: 'DONE', label: 'Done' },
];

const PRIORITY_OPTIONS: { value: TaskPriority | 'all'; label: string }[] = [
  { value: 'all', label: 'Todas Prioridades' },
  { value: 'CRITICAL', label: 'Crítico' },
  { value: 'HIGH', label: 'Alto' },
  { value: 'MEDIUM', label: 'Médio' },
  { value: 'LOW', label: 'Baixo' },
];

export function TaskFilters({
  filters,
  onChange,
  modules = [],
  projects = [],
  epics = [],
  features = [],
  members = [],
  currentUserId,
  className
}: TaskFiltersProps) {
  // Filter epics based on selected project
  const filteredEpics = useMemo(() => {
    if (filters.projectId === 'all') return [];
    return epics.filter(e => e.projectId === filters.projectId);
  }, [epics, filters.projectId]);

  // Filter features based on selected epic or project
  // FIX: Enable feature filter when project is selected (without requiring epic or assignee)
  // This allows users to filter tasks by feature across all epics within a project
  const filteredFeatures = useMemo(() => {
    // If epic is selected, filter features normally (most specific)
    if (filters.epicId !== 'all') {
      return features.filter(f => f.epicId === filters.epicId);
    }
    
    // If project is selected (but no epic), show ALL features from that project
    // This enables filtering by feature without forcing epic selection first
    if (filters.projectId !== 'all') {
      const projectEpicIds = filteredEpics.map(e => e.id);
      return features.filter(f => projectEpicIds.includes(f.epicId));
    }
    
    // Default: no features if no project selected
    return [];
  }, [features, filters.epicId, filters.projectId, filteredEpics]);

  // Check if hierarchy filters are active
  const hasHierarchyFilter = filters.projectId !== 'all' || filters.epicId !== 'all' || filters.featureId !== 'all';

  const hasActiveFilters = useMemo(() => {
    return (
      filters.search !== '' ||
      filters.status !== 'all' ||
      filters.priority !== 'all' ||
      filters.module !== 'all' ||
      filters.assigneeId !== 'all' ||
      hasHierarchyFilter
    );
  }, [filters, hasHierarchyFilter]);

  // Get assignee display name for badge
  const getAssigneeLabel = () => {
    if (filters.assigneeId === 'me') return 'Minhas Tasks';
    if (filters.assigneeId === 'all') return null;
    const member = members.find(m => m.id === filters.assigneeId);
    return member?.displayName || 'Membro';
  };

  const clearFilters = () => {
    onChange({
      search: '',
      status: 'all',
      priority: 'all',
      module: 'all',
      projectId: 'all',
      epicId: 'all',
      featureId: 'all',
      assigneeId: 'all',
      showDone: false,
    });
  };

  const handleProjectChange = (value: string) => {
    // Reset epic and feature when project changes
    onChange({
      ...filters,
      projectId: value,
      epicId: 'all',
      featureId: 'all',
    });
  };

  const handleEpicChange = (value: string) => {
    // Reset feature when epic changes
    onChange({
      ...filters,
      epicId: value,
      featureId: 'all',
    });
  };

  // Determine states
  const isEpicDisabled = filters.projectId === 'all';
  // FIX: Feature is enabled if project is selected (epic selection not required)
  // This allows filtering by feature across all epics within a project
  const isFeatureDisabled = filters.projectId === 'all';

  // Get selected names for breadcrumb
  const selectedProject = projects.find(p => p.id === filters.projectId);
  const selectedEpic = epics.find(e => e.id === filters.epicId);
  const selectedFeature = features.find(f => f.id === filters.featureId);

  return (
    <div className={className}>
      {/* Hierarchy Filters - Visual Cascade */}
      {projects.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-muted/30 border border-border/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wide">
              <FolderOpen className="w-3.5 h-3.5" />
              Filtrar por Hierarquia
            </div>

            {hasHierarchyFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange({ ...filters, projectId: 'all', epicId: 'all', featureId: 'all' })}
                className="h-6 px-2 text-xs hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="w-3 h-3 mr-1" />
                Limpar filtros de hierarquia
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Project */}
            <Select value={filters.projectId} onValueChange={handleProjectChange}>
              <SelectTrigger className={cn(
                "w-full md:w-fit min-w-[200px] max-w-[400px] transition-all",
                filters.projectId !== 'all' && "border-primary/50 bg-primary/5"
              )}>
                <div className="flex items-center gap-2 truncate">
                  <FolderOpen className="w-4 h-4 opacity-50 flex-shrink-0" />
                  <SelectValue placeholder="Selecione o Projeto" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Projetos</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="truncate max-w-[400px] block" title={p.name}>{p.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Arrow indicator */}
            <ChevronRight className={cn(
              "hidden md:block w-4 h-4 transition-colors flex-shrink-0",
              isEpicDisabled ? "text-muted-foreground/30" : "text-primary"
            )} />

            {/* Epic */}
            <Select
              value={filters.epicId}
              onValueChange={handleEpicChange}
              disabled={isEpicDisabled}
            >
              <SelectTrigger className={cn(
                "w-full md:w-fit min-w-[220px] max-w-[500px] transition-all",
                isEpicDisabled && "opacity-50 cursor-not-allowed",
                filters.epicId !== 'all' && "border-primary/50 bg-primary/5"
              )}>
                <div className="flex items-center gap-2 truncate">
                  <Layers className="w-4 h-4 opacity-50 flex-shrink-0" />
                  <SelectValue placeholder={isEpicDisabled ? "Escolha um Projeto" : "Selecione o Epic"} />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Epics</SelectItem>
                {filteredEpics.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    <span className="truncate max-w-[500px] block" title={e.title}>{e.title}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Arrow indicator */}
            <ChevronRight className={cn(
              "hidden md:block w-4 h-4 transition-colors flex-shrink-0",
              isFeatureDisabled ? "text-muted-foreground/30" : "text-primary"
            )} />

            {/* Feature */}
            <Select
              value={filters.featureId}
              onValueChange={(value) => onChange({ ...filters, featureId: value })}
              disabled={isFeatureDisabled}
            >
              <SelectTrigger className={cn(
                "w-full md:w-fit min-w-[220px] max-w-[500px] transition-all",
                isFeatureDisabled && "opacity-50 cursor-not-allowed",
                filters.featureId !== 'all' && "border-primary/50 bg-primary/5"
              )}>
                <div className="flex items-center gap-2 truncate">
                  <Box className="w-4 h-4 opacity-50 flex-shrink-0" />
                  <SelectValue placeholder={
                    isFeatureDisabled 
                      ? (filters.projectId === 'all' ? "Escolha um Projeto" : "Escolha um Epic")
                      : "Selecione a Feature"
                  } />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {filters.assigneeId !== 'all' && filters.epicId === 'all' 
                    ? "Todas Features do Projeto" 
                    : "Todas Features"}
                </SelectItem>
                {filteredFeatures.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    <span className="truncate max-w-[500px] block" title={f.title}>{f.title}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Breadcrumb removed - simplified UX */}
        </div>
      )}

      {/* Standard Filters Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar tasks..."
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            className="pl-9"
          />
        </div>

        {/* Status */}
        <Select
          value={filters.status}
          onValueChange={(value) =>
            onChange({ ...filters, status: value as TaskStatus | 'all' })
          }
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-background text-sm">
          <Checkbox
            id="show-done"
            checked={filters.showDone}
            onCheckedChange={(checked) =>
              onChange({ ...filters, showDone: checked === true })
            }
          />
          <Label
            htmlFor="show-done"
            className="text-sm cursor-pointer select-none whitespace-nowrap"
          >
            Concluidas
          </Label>
        </div>

        {/* Priority */}
        <Select
          value={filters.priority}
          onValueChange={(value) =>
            onChange({ ...filters, priority: value as TaskPriority | 'all' })
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Assignee Filter */}
        {members.length > 0 && (
          <Select
            value={filters.assigneeId}
            onValueChange={(value) =>
              onChange({ ...filters, assigneeId: value as string | 'all' | 'me' })
            }
          >
            <SelectTrigger className={cn(
              "w-[180px]",
              filters.assigneeId === 'me' && "border-primary bg-primary/10 text-primary font-medium"
            )}>
              <div className="flex items-center gap-2">
                {filters.assigneeId === 'me' ? (
                  <User className="w-4 h-4" />
                ) : (
                  <Users className="w-4 h-4 opacity-50" />
                )}
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="me" className="font-medium text-primary">
                Minhas Tasks
              </SelectItem>
              {members.length > 0 && <SelectSeparator />}
              {members.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  <span className="flex items-center gap-2">
                    {member.avatarUrl ? (
                      <img
                        src={member.avatarUrl}
                        alt=""
                        className="w-4 h-4 rounded-full"
                      />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">
                        {(member.displayName || '?')[0].toUpperCase()}
                      </div>
                    )}
                    {member.displayName || 'Sem nome'}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Module (if available) */}
        {modules.length > 0 && (
          <Select
            value={filters.module}
            onValueChange={(value) => onChange({ ...filters, module: value })}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Módulos</SelectItem>
              {modules.map((mod) => (
                <SelectItem key={mod} value={mod}>
                  {mod}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Clear all button */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5">
            <X className="w-3.5 h-3.5" />
            Limpar Tudo
          </Button>
        )}
      </div>

      {/* Active non-hierarchy filters badges */}
      {(filters.search || filters.status !== 'all' || filters.priority !== 'all' || filters.module !== 'all' || filters.assigneeId !== 'all') && (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {filters.search && (
            <Badge variant="outline" className="gap-1">
              Busca: "{filters.search}"
              <button
                onClick={() => onChange({ ...filters, search: '' })}
                className="ml-1 hover:text-destructive"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.status !== 'all' && (
            <Badge variant="outline" className="gap-1">
              Status: {STATUS_OPTIONS.find(o => o.value === filters.status)?.label}
              <button
                onClick={() => onChange({ ...filters, status: 'all' })}
                className="ml-1 hover:text-destructive"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.priority !== 'all' && (
            <Badge variant="outline" className="gap-1">
              Prioridade: {PRIORITY_OPTIONS.find(o => o.value === filters.priority)?.label}
              <button
                onClick={() => onChange({ ...filters, priority: 'all' })}
                className="ml-1 hover:text-destructive"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.module !== 'all' && (
            <Badge variant="outline" className="gap-1">
              Módulo: {filters.module}
              <button
                onClick={() => onChange({ ...filters, module: 'all' })}
                className="ml-1 hover:text-destructive"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.assigneeId !== 'all' && (
            <Badge 
              variant={filters.assigneeId === 'me' ? 'default' : 'outline'} 
              className="gap-1"
            >
              {filters.assigneeId === 'me' ? (
                <><User className="w-3 h-3" /> Minhas Tasks</>
              ) : (
                <>Responsável: {getAssigneeLabel()}</>
              )}
              <button
                onClick={() => onChange({ ...filters, assigneeId: 'all' })}
                className="ml-1 hover:text-destructive"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
