import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { CACHE_TIMES, getCacheConfig } from '../cache-config';
import { smartInvalidate, smartInvalidateImmediate } from '../helpers';
import { useCurrentOrgId, isOrgIdValid } from './use-org-id';
import { useRealtimeActive } from '@/hooks/use-realtime-status';
import { useRealtimeBroadcast } from '@/hooks/use-realtime-sync';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';

// ============ Types ============

interface Feature {
  id: string;
  title: string;
  description?: string | null;
  epicId: string;
  status: string;
  epic?: {
    id: string;
    title: string;
    projectId: string;
    project?: {
      id: string;
      name: string;
      key: string;
    };
  };
  _count?: {
    tasks: number;
  };
  tasks?: Array<{
    status: string;
    type: string;
  }>;
  // Health check fields
  health?: 'healthy' | 'warning' | 'critical';
  healthReason?: string | null;
  healthUpdatedAt?: string | null;
}

interface CreateFeatureInput {
  title: string;
  description?: string;
  status?: 'BACKLOG' | 'TODO' | 'DOING' | 'DONE';
  epicId: string;
}

interface UpdateFeatureInput {
  id: string;
  data: Partial<Omit<CreateFeatureInput, 'epicId'>> & {
    status?: 'BACKLOG' | 'TODO' | 'DOING' | 'DONE';
  };
}

// ============ Fetch Functions ============

async function fetchFeature(id: string): Promise<Feature> {
  const res = await fetch(`/api/features/${id}`);
  if (!res.ok) throw new Error('Failed to fetch feature');
  const json = await res.json();
  return json.data;
}

// Export for use in event processor
export { fetchFeature as fetchFeatureById };

async function fetchFeatures(): Promise<Feature[]> {
  const res = await fetch('/api/features');
  if (!res.ok) throw new Error('Failed to fetch features');
  const json = await res.json();
  return json.data || [];
}

async function fetchFeaturesByEpic(epicId: string): Promise<Feature[]> {
  const res = await fetch(`/api/epics/${epicId}/features`);
  if (!res.ok) throw new Error('Failed to fetch features');
  const json = await res.json();
  return json.data || [];
}

async function createFeature(data: CreateFeatureInput): Promise<Feature> {
  const res = await fetch(`/api/epics/${data.epicId}/features`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      title: data.title, 
      description: data.description,
      status: data.status,
    }),
  });
  if (!res.ok) throw new Error('Failed to create feature');
  const json = await res.json();
  return json.data;
}

async function updateFeature({ id, data }: UpdateFeatureInput): Promise<Feature> {
  const res = await fetch(`/api/features/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update feature');
  const json = await res.json();
  return json.data;
}

async function deleteFeature(id: string): Promise<void> {
  const res = await fetch(`/api/features/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete feature');
}

// ============ Hooks ============

/**
 * Create a new feature
 * 
 * Strategy: Optimistic update + IMMEDIATE refetch (CREATE operation)
 */
export function useCreateFeature() {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();
  const isRealtimeActive = useRealtimeActive();

  return useMutation({
    mutationFn: createFeature,
    onSuccess: (newFeature, variables) => {
      // 1. Optimistic update: add to epic's features list
      queryClient.setQueryData<Feature[]>(queryKeys.features.list(orgId, variables.epicId), (old) => {
        if (!old) return [newFeature];
        // Avoid duplicates
        if (old.some(f => f.id === newFeature.id)) return old;
        return [...old, newFeature];
      });

      // 2. Optimistic update: add to all-list if cached
      queryClient.setQueryData<Feature[]>(queryKeys.features.allList(orgId), (old) => {
        if (!old) return undefined; // Don't create if not cached
        if (old.some(f => f.id === newFeature.id)) return old;
        return [...old, newFeature];
      });

      // 3. Only invalidate if real-time is disconnected
      // If RT is active, broadcast will handle invalidation
      if (!isRealtimeActive) {
        smartInvalidateImmediate(queryClient, queryKeys.features.list(orgId, variables.epicId));
        smartInvalidateImmediate(queryClient, queryKeys.features.allList(orgId));

        // 4. Invalidate epic detail to update counters (e.g., features count)
        smartInvalidate(queryClient, queryKeys.epics.detail(orgId, variables.epicId));
      }

      toast.success('Feature criada');
    },
    onError: () => {
      toast.error('Erro ao criar feature');
    },
  });
}

// ============ Query Hooks ============

/**
 * Fetch a specific feature by ID
 */
export function useFeature(id: string) {
  const orgId = useCurrentOrgId();
  
  return useQuery({
    queryKey: queryKeys.features.detail(orgId, id),
    queryFn: () => fetchFeature(id),
    enabled: isOrgIdValid(orgId) && !!id,
    ...getCacheConfig('STABLE'),
  });
}

/**
 * Fetch all features (for quick task dialog, etc.)
 */
export function useAllFeatures() {
  const orgId = useCurrentOrgId();
  
  return useQuery({
    queryKey: queryKeys.features.allList(orgId),
    queryFn: fetchFeatures,
    enabled: isOrgIdValid(orgId),
    ...getCacheConfig('STANDARD'),
  });
}

/**
 * Fetch features by epic ID
 */
export function useFeaturesByEpic(epicId: string) {
  const orgId = useCurrentOrgId();
  
  return useQuery({
    queryKey: queryKeys.features.list(orgId, epicId),
    queryFn: () => fetchFeaturesByEpic(epicId),
    enabled: isOrgIdValid(orgId) && !!epicId,
    ...getCacheConfig('STANDARD'),
  });
}

// ============ Mutations ============

/**
 * Update a feature
 * 
 * Strategy: Optimistic update + IMMEDIATE refetch (garante UI instantânea)
 */
export function useUpdateFeature() {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();
  const isRealtimeActive = useRealtimeActive();
  const broadcast = useRealtimeBroadcast();
  const { user } = useAuth();
  const actorName = typeof user?.user_metadata?.full_name === 'string'
    ? user.user_metadata.full_name.trim()
    : user?.email?.split('@')[0] || 'Unknown';

  return useMutation({
    mutationFn: updateFeature,
    onSuccess: (updatedFeature, variables) => {
      // 1. Broadcast to other clients (ALWAYS)
      broadcast({
        eventId: crypto.randomUUID(),
        orgId,
        entityType: 'feature',
        entityId: updatedFeature.id,
        projectId: updatedFeature.epic?.project?.id || 'unknown',
        epicId: updatedFeature.epicId,
        eventType: 'updated',
        actorType: 'user',
        actorName,
        actorId: user?.id || 'system',
        timestamp: new Date().toISOString(),
      });

      // 2. Optimistic update: update specific feature in cache
      queryClient.setQueryData<Feature>(queryKeys.features.detail(orgId, variables.id), updatedFeature);

      // 3. Update in lists (optimistic)
      const updateInList = (old: Feature[] | undefined) => {
        if (!old) return old;
        return old.map(f => f.id === updatedFeature.id ? { ...f, ...updatedFeature } : f);
      };

      queryClient.setQueriesData<Feature[]>({ queryKey: queryKeys.features.lists(orgId) }, updateInList);
      queryClient.setQueryData<Feature[]>(queryKeys.features.allList(orgId), updateInList);

      // 4. Only invalidate if real-time is disconnected
      // If RT is active, broadcast will handle invalidation
      if (!isRealtimeActive) {
        smartInvalidateImmediate(queryClient, queryKeys.features.lists(orgId));
        smartInvalidateImmediate(queryClient, queryKeys.features.allList(orgId));

        // 5. Invalidate epic detail (status/title changes may affect UI)
        smartInvalidate(queryClient, queryKeys.epics.detail(orgId, updatedFeature.epicId));

        // 6. Invalidate tasks for this feature (tasks depend on feature.status)
        smartInvalidate(queryClient, queryKeys.tasks.list(orgId, { featureId: variables.id }));
      }

      toast.success('Feature atualizada');
    },
    onError: () => {
      toast.error('Erro ao atualizar feature');
    },
  });
}

/**
 * Delete a feature
 * 
 * Strategy: Optimistic removal + IMMEDIATE refetch (DELETE operation)
 */
export function useDeleteFeature() {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();

  return useMutation({
    mutationFn: deleteFeature,
    onMutate: async (featureId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.features.all(orgId) });

      // Snapshot previous data for potential rollback
      const previousAllFeatures = queryClient.getQueryData<Feature[]>(queryKeys.features.allList(orgId));

      // Try to find the feature in allList first
      let featureToDelete = previousAllFeatures?.find(f => f.id === featureId);
      let epicId = featureToDelete?.epicId;

      // If not found in allList, search in all epic-specific lists
      if (!epicId) {
        const allQueries = queryClient.getQueriesData<Feature[]>({ queryKey: queryKeys.features.lists(orgId) });
        for (const [, features] of allQueries) {
          const found = features?.find(f => f.id === featureId);
          if (found) {
            featureToDelete = found;
            epicId = found.epicId;
            break;
          }
        }
      }

      // Snapshot epic-specific list BEFORE modifying it (for rollback)
      const previousEpicFeatures = epicId 
        ? queryClient.getQueryData<Feature[]>(queryKeys.features.list(orgId, epicId))
        : undefined;

      // Optimistically remove from all-list
      if (previousAllFeatures) {
        queryClient.setQueryData<Feature[]>(
          queryKeys.features.allList(orgId),
          previousAllFeatures.filter(f => f.id !== featureId)
        );
      }

      // Optimistically remove from epic-specific list
      if (epicId && previousEpicFeatures) {
        queryClient.setQueryData<Feature[]>(
          queryKeys.features.list(orgId, epicId),
          previousEpicFeatures.filter(f => f.id !== featureId)
        );
      }

      return { previousAllFeatures, previousEpicFeatures, epicId, featureId };
    },
    onSuccess: (_, deletedFeatureId, context) => {
      // Remove detail and task queries
      queryClient.removeQueries({ queryKey: queryKeys.features.detail(orgId, deletedFeatureId) });
      queryClient.removeQueries({ queryKey: queryKeys.tasks.list(orgId, { featureId: deletedFeatureId }) });

      // IMMEDIATE refetch for DELETE operation (força atualização instantânea)
      smartInvalidateImmediate(queryClient, queryKeys.features.lists(orgId));
      smartInvalidateImmediate(queryClient, queryKeys.features.allList(orgId));

      // Invalidate epic detail to update counters
      if (context?.epicId) {
        smartInvalidate(queryClient, queryKeys.epics.detail(orgId, context.epicId));
      }

      toast.success('Feature excluída');
    },
    onError: (_err, _featureId, context) => {
      // Rollback on error: restore BOTH caches
      if (context?.previousAllFeatures) {
        queryClient.setQueryData(queryKeys.features.allList(orgId), context.previousAllFeatures);
      }
      if (context?.epicId && context?.previousEpicFeatures) {
        queryClient.setQueryData(queryKeys.features.list(orgId, context.epicId), context.previousEpicFeatures);
      }
      toast.error('Erro ao excluir feature');
    },
  });
}
