'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Search, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface Feature {
  id: string;
  title: string;
  status: string;
}

interface WeeklyGoalSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoalAdded: () => void;
  existingGoalIds: string[];
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    TODO: 'A Fazer',
    DOING: 'Fazendo',
    DONE: 'Feito',
    BACKLOG: 'Backlog',
  };
  return labels[status] || status;
}

export function WeeklyGoalSelector({
  open,
  onOpenChange,
  onGoalAdded,
  existingGoalIds,
}: WeeklyGoalSelectorProps) {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchFeatures = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/personal-board');
      if (!res.ok) throw new Error('Failed to fetch features');
      const json = await res.json();
      const columns = json.data?.columns || json.data || json.columns || [];

      const allFeatures: Feature[] = [];
      for (const column of columns) {
        for (const item of column.items || []) {
          allFeatures.push({
            id: item.id,
            title: item.title,
            status: column.title.toUpperCase().replace(/\s+/g, '_') as string,
          });
        }
      }

      setFeatures(allFeatures);
    } catch {
      toast.error('Erro ao carregar features.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && features.length === 0 && !loading) {
      fetchFeatures();
    }
  }, [open, features.length, loading, fetchFeatures]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setSaving(false);
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
          toast.error('Esta feature j uma meta desta semana.');
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

  const filteredFeatures = features.filter((feature) => {
    const matchesSearch = feature.title
      .toLowerCase()
      .includes(search.toLowerCase());
    const isInProgress = feature.status === 'TODO' || feature.status === 'DOING';
    return matchesSearch && isInProgress;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar meta da semana</DialogTitle>
          <DialogDescription>
            Selecione uma feature para acompanhar esta semana.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar feature..."
              className="pl-9"
            />
          </div>

          <div className="max-h-[20rem] overflow-y-auto space-y-1 pr-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredFeatures.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">
                  {search
                    ? 'Nenhuma feature encontrada.'
                    : 'Nenhuma feature disponvel.'}
                </p>
              </div>
            ) : (
              filteredFeatures.map((feature) => {
                const isAlreadyGoal = existingGoalIds.includes(feature.id);

                return (
                  <button
                    key={feature.id}
                    onClick={() => !isAlreadyGoal && handleSelect(feature.id)}
                    disabled={isAlreadyGoal || saving}
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {feature.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {getStatusLabel(feature.status)}
                      </p>
                    </div>
                    {isAlreadyGoal ? (
                      <Badge
                        variant="outline"
                        className="flex-shrink-0 gap-1 border-green-500/30 text-green-600 dark:text-green-400"
                      >
                        <Check className="h-3 w-3" />
                        Na semana
                      </Badge>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-shrink-0 h-7 px-2.5 text-xs"
                        disabled={saving}
                      >
                        Adicionar
                      </Button>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
