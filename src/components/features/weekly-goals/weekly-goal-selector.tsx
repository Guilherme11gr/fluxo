'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Search, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Feature {
  id: string;
  title: string;
  status: string;
  epic?: {
    id: string;
    title: string;
    project?: {
      id: string;
      name: string;
      key: string;
    };
  } | null;
  _count?: {
    tasks: number;
  };
}

interface WeeklyGoalSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoalAdded: () => void;
  existingGoalIds: string[];
}

function getStatusLabel(status: string): string {
  if (status === 'TODO') return 'A fazer';
  if (status === 'DOING') return 'Em progresso';
  return status;
}

function getStatusDot(status: string): string {
  if (status === 'TODO') return 'bg-blue-500';
  if (status === 'DOING') return 'bg-yellow-500';
  return 'bg-gray-400';
}

export function WeeklyGoalSelector({
  open,
  onOpenChange,
  onGoalAdded,
  existingGoalIds,
}: WeeklyGoalSelectorProps) {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [projectFilter, setProjectFilter] = useState<string>('ALL');

  const fetchFeatures = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/features?limit=50');
      if (!res.ok) throw new Error('Failed to fetch features');
      const json = await res.json();
      const data: Feature[] = json.data || [];
      const filtered = data.filter(
        (f) => f.status === 'TODO' || f.status === 'DOING'
      );
      setFeatures(filtered);
    } catch {
      toast.error('Erro ao carregar features.');
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }, []);

  useEffect(() => {
    if (open && !fetched && !loading) {
      fetchFeatures();
    }
  }, [open, fetched, loading, fetchFeatures]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setSaving(false);
      setFetched(false);
      setFeatures([]);
      setProjectFilter('ALL');
    }
  }, [open]);

  const handleSelect = async (featureId: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/weekly-goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureId }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => null);
        if (res.status === 409) {
          toast.error('Esta feature ja e uma meta desta semana.');
        } else {
          toast.error(error?.message || 'Erro ao adicionar meta.');
        }
        return;
      }

      toast.success('Meta adicionada com sucesso!');
      onGoalAdded();
      onOpenChange(false);
    } catch {
      toast.error('Erro ao adicionar meta.');
    } finally {
      setSaving(false);
    }
  };

  const filteredFeatures = useMemo(() => {
    return features.filter((f) => {
      const matchesSearch = !search
        ? true
        : f.title.toLowerCase().includes(search.toLowerCase()) ||
          f.epic?.title.toLowerCase().includes(search.toLowerCase()) ||
          f.epic?.project?.name.toLowerCase().includes(search.toLowerCase());
      const matchesProject =
        projectFilter === 'ALL' || f.epic?.project?.id === projectFilter;
      return matchesSearch && matchesProject;
    });
  }, [features, search, projectFilter]);

  const projectList = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of features) {
      const id = f.epic?.project?.id;
      const name = f.epic?.project?.name;
      if (id && name && !map.has(id)) {
        map.set(id, name);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({ id, name }));
  }, [features]);

  const groupedByProject = useMemo(() => {
    const groups: { projectName: string; projectKey: string; features: Feature[] }[] = [];
    const map = new Map<string, { projectName: string; projectKey: string; features: Feature[] }>();

    for (const f of filteredFeatures) {
      const key = f.epic?.project?.id || '_no-project';
      const name = f.epic?.project?.name || 'Sem projeto';
      const pkey = f.epic?.project?.key || '';

      if (!map.has(key)) {
        map.set(key, { projectName: name, projectKey: pkey, features: [] });
      }
      map.get(key)!.features.push(f);
    }

    for (const group of map.values()) {
      group.features.sort((a, b) => {
        const epicA = a.epic?.title || '';
        const epicB = b.epic?.title || '';
        if (epicA !== epicB) return epicA.localeCompare(epicB);
        return a.title.localeCompare(b.title);
      });
      groups.push(group);
    }

    groups.sort((a, b) => {
      if (a.projectName === 'Sem projeto') return 1;
      if (b.projectName === 'Sem projeto') return -1;
      return a.projectName.localeCompare(b.projectName);
    });

    return groups;
  }, [filteredFeatures]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar meta da semana</DialogTitle>
          <DialogDescription>
            Selecione uma feature para acompanhar esta semana.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por feature, epic ou projeto..."
                className="pl-9"
              />
            </div>
            {projectList.length > 1 && (
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="w-[160px] h-10">
                  <SelectValue placeholder="Projeto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  {projectList.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="max-h-[24rem] overflow-y-auto pr-1">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : groupedByProject.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm text-muted-foreground">
                  {search
                    ? 'Nenhuma feature encontrada.'
                    : 'Nenhuma feature disponivel.'}
                </p>
              </div>
            ) : (
              groupedByProject.map((group) => (
                <div key={group.projectKey || '_no-project'} className="mb-4 last:mb-0">
                  <div className="flex items-center gap-2 px-1 pb-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {group.projectName}
                    </p>
                    <span className="text-[10px] text-muted-foreground/60">
                      {group.features.length}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {group.features.map((feature) => {
                      const isAlreadyGoal = existingGoalIds.includes(feature.id);
                      const subtitleParts: string[] = [];
                      if (feature.epic?.title) subtitleParts.push(feature.epic.title);
                      if (feature._count?.tasks != null) {
                        subtitleParts.push(`${feature._count.tasks} ${feature._count.tasks === 1 ? 'task' : 'tasks'}`);
                      }
                      if (feature.status) subtitleParts.push(getStatusLabel(feature.status));

                      return (
                        <button
                          key={feature.id}
                          onClick={() => !isAlreadyGoal && handleSelect(feature.id)}
                          disabled={isAlreadyGoal || saving}
                          className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent group"
                        >
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getStatusDot(feature.status)}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate leading-tight">
                              {feature.title}
                            </p>
                            {subtitleParts.length > 0 && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {subtitleParts.join(' · ')}
                              </p>
                            )}
                          </div>
                          {isAlreadyGoal ? (
                            <span className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400 flex-shrink-0">
                              <Check className="h-3 w-3" />
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                              Adicionar
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
