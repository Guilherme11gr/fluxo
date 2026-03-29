import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { CACHE_TIMES } from '../cache-config';
import { smartInvalidate } from '../helpers';
import { useCurrentOrgId, isOrgIdValid } from './use-org-id';
import { useRealtimeActive } from '@/hooks/use-realtime-status';
import { toast } from 'sonner';

// ============ Types ============

interface Epic {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  projectId: string;
  _count?: { features: number };
  aiSummary?: string | null;
  lastAnalyzedAt?: string | null;
  // Health check fields
  risk?: 'low' | 'medium' | 'high';
  riskReason?: string | null;
  riskUpdatedAt?: string | null;
}

interface CreateEpicInput {
  title: string;
  description?: string;
  status?: 'OPEN' | 'CLOSED';
  projectId: string;
}

interface UpdateEpicInput {
  id: string;
  data: Partial<Omit<CreateEpicInput, 'projectId'>> & {
    status?: 'OPEN' | 'CLOSED';
  };
}


// ============ Fetch Functions ============

async function fetchEpic(id: string): Promise<Epic> {
  const res = await fetch(`/api/epics/${id}`);
  if (!res.ok) throw new Error('Failed to fetch epic');
  const json = await res.json();
  return json.data;
}

async function fetchAllEpics(): Promise<Epic[]> {
  // Single query - no N+1
  const res = await fetch('/api/epics');
  if (!res.ok) throw new Error('Failed to fetch epics');
  const json = await res.json();
  return json.data || [];
}

async function fetchEpics(projectId: string): Promise<Epic[]> {
  const res = await fetch(`/api/projects/${projectId}/epics`);
  if (!res.ok) throw new Error('Failed to fetch epics');
  const json = await res.json();
  return (json.data || []).map((e: Epic) => ({ ...e, projectId }));
}

async function createEpic(data: CreateEpicInput): Promise<Epic> {
  const res = await fetch(`/api/projects/${data.projectId}/epics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      title: data.title, 
      description: data.description,
      status: data.status,
    }),
  });
  if (!res.ok) throw new Error('Failed to create epic');
  const json = await res.json();
  return { ...json.data, projectId: data.projectId, _count: { features: 0 } };
}

async function updateEpic({ id, data }: UpdateEpicInput): Promise<Epic> {
  const res = await fetch(`/api/epics/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update epic');
  const json = await res.json();
  return json.data;
}

async function deleteEpic(id: string): Promise<void> {
  const res = await fetch(`/api/epics/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete epic');
}

// ============ Hooks ============

/**
 * Fetch a single epic by ID
 */
export function useEpic(id: string) {
  const orgId = useCurrentOrgId();
  
  return useQuery({
    queryKey: queryKeys.epics.detail(orgId, id),
    queryFn: () => fetchEpic(id),
    enabled: Boolean(id) && isOrgIdValid(orgId),
    ...CACHE_TIMES.STANDARD,
  });
}

/**
 * Fetch epics for a specific project
 */
export function useEpics(projectId: string) {
  const orgId = useCurrentOrgId();
  
  return useQuery({
    queryKey: queryKeys.epics.list(orgId, projectId),
    queryFn: () => fetchEpics(projectId),
    enabled: Boolean(projectId) && isOrgIdValid(orgId),
    ...CACHE_TIMES.STANDARD,
  });
}

/**
 * Fetch all epics across all projects
 */
export function useAllEpics() {
  const orgId = useCurrentOrgId();
  
  return useQuery({
    queryKey: queryKeys.epics.allList(orgId),
    queryFn: fetchAllEpics,
    enabled: isOrgIdValid(orgId),
    ...CACHE_TIMES.STANDARD,
  });
}

// ============ Mutations ============

/**
 * Create a new epic
 * 
 * Strategy: Optimistic update + background refetch
 * We add epic immediately to cache, then refetch to ensure consistency.
 */
export function useCreateEpic() {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();
  const isRealtimeActive = useRealtimeActive();

  return useMutation({
    mutationFn: createEpic,
    onSuccess: (newEpic, variables) => {
      // 1. Optimistic update: add to project-specific list
      queryClient.setQueryData<Epic[]>(queryKeys.epics.list(orgId, variables.projectId), (old) => {
        if (!old) return [newEpic];
        // Avoid duplicates
        if (old.some(e => e.id === newEpic.id)) return old;
        return [...old, newEpic];
      });

      // 2. Optimistic update: add to all-list if cached
      queryClient.setQueryData<Epic[]>(queryKeys.epics.allList(orgId), (old) => {
        if (!old) return undefined; // Don't create if not cached
        if (old.some(e => e.id === newEpic.id)) return old;
        return [...old, newEpic];
      });

      // 3. Only invalidate if real-time is disconnected
      // If RT is active, broadcast will handle invalidation
      if (!isRealtimeActive) {
        smartInvalidate(queryClient, queryKeys.epics.list(orgId, variables.projectId));
        smartInvalidate(queryClient, queryKeys.epics.allList(orgId));

        // 4. Invalidate project detail to update counters (e.g., epic count)
        smartInvalidate(queryClient, queryKeys.projects.detail(orgId, variables.projectId));
      }

      toast.success('Epic criado');
    },
    onError: () => {
      toast.error('Erro ao criar epic');
    },
  });
}

/**
 * Update an epic
 * 
 * Strategy: Optimistic update + targeted refetch
 */
export function useUpdateEpic() {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();
  const isRealtimeActive = useRealtimeActive();

  return useMutation({
    mutationFn: updateEpic,
    onSuccess: (updatedEpic, variables) => {
      // 1. Optimistic update: update specific epic detail in cache
      queryClient.setQueryData<Epic>(queryKeys.epics.detail(orgId, variables.id), updatedEpic);

      // 2. Update in lists (project-specific and all-list)
      const updateInList = (old: Epic[] | undefined) => {
        if (!old) return old;
        return old.map(e => e.id === updatedEpic.id ? { ...e, ...updatedEpic } : e);
      };

      // Update in all cached lists
      queryClient.setQueriesData<Epic[]>({ queryKey: queryKeys.epics.lists(orgId) }, updateInList);
      queryClient.setQueryData<Epic[]>(queryKeys.epics.allList(orgId), updateInList);

      // 3. Only invalidate if real-time is disconnected
      // If RT is active, broadcast will handle invalidation
      if (!isRealtimeActive) {
        smartInvalidate(queryClient, queryKeys.epics.lists(orgId));
        smartInvalidate(queryClient, queryKeys.epics.allList(orgId));

        // 4. Invalidate features of this epic (title change may affect UI)
        smartInvalidate(queryClient, queryKeys.features.list(orgId, updatedEpic.id));

        // 5. Invalidate project detail if epic has projectId
        if (updatedEpic.projectId) {
          smartInvalidate(queryClient, queryKeys.projects.detail(orgId, updatedEpic.projectId));
        }
      }

      toast.success('Epic atualizado');
    },
    onError: () => {
      toast.error('Erro ao atualizar epic');
    },
  });
}

/**
 * Delete an epic
 * 
 * Strategy: Optimistic removal + force refetch
 * We need to know projectId to properly update the list cache.
 */
export function useDeleteEpic() {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();

  return useMutation({
    mutationFn: deleteEpic,
    onMutate: async (epicId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.epics.all(orgId) });

      // Snapshot previous data for potential rollback
      const previousAllEpics = queryClient.getQueryData<Epic[]>(queryKeys.epics.allList(orgId));
      
      // Find the epic to get its projectId before deletion
      const epicToDelete = previousAllEpics?.find(e => e.id === epicId);
      const projectId = epicToDelete?.projectId;

      // Optimistically remove from all-list
      if (previousAllEpics) {
        queryClient.setQueryData<Epic[]>(
          queryKeys.epics.allList(orgId),
          previousAllEpics.filter(e => e.id !== epicId)
        );
      }

      // Optimistically remove from project-specific list
      if (projectId) {
        const previousProjectEpics = queryClient.getQueryData<Epic[]>(queryKeys.epics.list(orgId, projectId));
        if (previousProjectEpics) {
          queryClient.setQueryData<Epic[]>(
            queryKeys.epics.list(orgId, projectId),
            previousProjectEpics.filter(e => e.id !== epicId)
          );
        }
      }

      return { previousAllEpics, projectId, epicId };
    },
    onSuccess: (_, deletedEpicId, context) => {
      // Remove detail and feature queries
      queryClient.removeQueries({ queryKey: queryKeys.epics.detail(orgId, deletedEpicId) });
      queryClient.removeQueries({ queryKey: queryKeys.features.list(orgId, deletedEpicId) });

      // Invalidate all epic lists (smartInvalidate handles active vs inactive)
      smartInvalidate(queryClient, queryKeys.epics.lists(orgId));
      smartInvalidate(queryClient, queryKeys.epics.allList(orgId));

      // Invalidate project detail to update counters
      if (context?.projectId) {
        smartInvalidate(queryClient, queryKeys.projects.detail(orgId, context.projectId));
      }

      toast.success('Epic excluído');
    },
    onError: (_err, _epicId, context) => {
      // Rollback on error
      if (context?.previousAllEpics) {
        queryClient.setQueryData(queryKeys.epics.allList(orgId), context.previousAllEpics);
      }
      toast.error('Erro ao excluir epic');
    },
  });
}
