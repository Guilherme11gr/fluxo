import { QueryClient, type InvalidateQueryFilters } from '@tanstack/react-query';
import { queryKeys } from './query-keys';

/**
 * ============================================================================
 * CACHE INVALIDATION HELPERS
 * ============================================================================
 * 
 * REGRA DE OURO: Sempre use `smartInvalidate()` para invalidar queries.
 * 
 * Comportamento:
 * - Queries ATIVAS (montadas na UI) → refetch IMEDIATO
 * - Queries INATIVAS → marcadas como STALE (refetch quando montadas)
 * 
 * REAL-TIME AWARE:
 * - Se real-time estiver CONECTADO, PULA invalidação (o próprio RT cuida)
 * - Se real-time estiver DESCONECTADO, invalida normalmente (fallback)
 * 
 * IMPORTANTE: Todos os helpers que invalidam entidades específicas
 * precisam receber orgId para garantir isolamento de cache multi-org.
 * 
 * @see docs/guides/cache-invalidation-patterns.md
 * @see docs/planning/realtime/IMPLEMENTATION-PROGRESS.md
 */

/**
 * Check if real-time is active and skip invalidation if so.
 * This prevents duplicate refetches when real-time is already handling updates.
 * 
 * @param isRealtimeActive - Whether real-time connection is active
 * @param shouldInvalidate - Whether to perform invalidation
 * @returns true if invalidation should be performed
 */
function shouldPerformInvalidation(isRealtimeActive?: boolean): boolean {
  // If real-time is undefined (not initialized), always invalidate
  if (isRealtimeActive === undefined) {
    return true;
  }
  
  // If real-time is connected, skip invalidation (RT will handle it)
  if (isRealtimeActive) {
    console.log('[Cache] Skipping invalidation - real-time is active');
    return false;
  }
  
  // Real-time is disconnected, perform invalidation (fallback)
  console.log('[Cache] Performing invalidation - real-time is disconnected');
  return true;
}

/**
 * Invalidação inteligente de queries.
 * 
 * - Queries ativas: refetch imediato
 * - Queries inativas: marcadas stale (refetch ao montar)
 * 
 * @example
 * smartInvalidate(queryClient, queryKeys.tasks.lists(orgId));
 * smartInvalidate(queryClient, queryKeys.dashboard.all(orgId));
 */
export function smartInvalidate(
  queryClient: QueryClient, 
  queryKey: InvalidateQueryFilters['queryKey']
) {
  queryClient.invalidateQueries({ 
    queryKey,
    refetchType: 'active' // Só refetch queries montadas na UI
  });
}

/**
 * Invalidação IMEDIATA para operações críticas (CREATE/DELETE/MOVE).
 * 
 * Diferença do smartInvalidate:
 * - smartInvalidate: marca como stale, refetch se query ativa
 * - smartInvalidateImmediate: FORÇA refetch E remove cache antigo
 * 
 * Use APENAS em:
 * - CREATE (tasks, features, epics, projects, comments)
 * - DELETE (mesmo motivo)
 * - MOVE/STATUS CHANGE (drag-drop)
 * 
 * NÃO use em:
 * - UPDATE simples (smartInvalidate basta)
 * - READ operations (nunca)
 * 
 * @example
 * // Após criar task
 * smartInvalidateImmediate(queryClient, queryKeys.tasks.lists(orgId));
 * 
 * @see docs/architecture/CACHE-STANDARDIZATION-PLAN.md
 */
export function smartInvalidateImmediate(
  queryClient: QueryClient,
  queryKey: InvalidateQueryFilters['queryKey']
) {
  // 1. Invalida com refetch forçado para queries ativas
  queryClient.invalidateQueries({ 
    queryKey,
    refetchType: 'active'
  });
  
  // 2. Remove cache antigo para garantir dados frescos no próximo mount
  // Isso evita que dados stale apareçam brevemente antes do refetch
  queryClient.removeQueries({ 
    queryKey, 
    exact: false 
  });
}

/**
 * Invalidação múltipla de queries relacionadas.
 * Útil para mutações que afetam várias entidades.
 * 
 * @example
 * smartInvalidateMany(queryClient, [
 *   queryKeys.tasks.lists(orgId),
 *   queryKeys.features.detail(orgId, featureId),
 *   queryKeys.dashboard.all(orgId)
 * ]);
 */
export function smartInvalidateMany(
  queryClient: QueryClient,
  keys: InvalidateQueryFilters['queryKey'][]
) {
  keys.forEach(queryKey => smartInvalidate(queryClient, queryKey));
}

/**
 * Invalidate all dashboard-related queries for an org.
 * Use this when an entity change might affect the dashboard (tasks, projects, comments).
 * 
 * ✅ FIX JKILL-214: Invalidate ALL variants of myTasks (with/without includeDone, teamView)
 * 
 * @param queryClient - React Query client
 * @param orgId - Organization ID for cache isolation
 */
export function invalidateDashboardQueries(queryClient: QueryClient, orgId: string) {
  // Invalidate ALL myTasks variants (4 combinations: 2×2 boolean matrix)
  const myTasksKeys = [
    queryKeys.dashboard.myTasks(orgId, false, false), // default
    queryKeys.dashboard.myTasks(orgId, true, false),  // includeDone
    queryKeys.dashboard.myTasks(orgId, false, true),  // teamView
    queryKeys.dashboard.myTasks(orgId, true, true),   // both
  ];
  
  smartInvalidateMany(queryClient, [
    ...myTasksKeys,
    queryKeys.dashboard.activity(orgId),
    queryKeys.dashboard.activeProjects(orgId),
  ]);
}

/**
 * Invalidate all task-related queries for an org.
 * Use after task mutations to ensure all views are updated.
 * 
 * @param queryClient - React Query client
 * @param orgId - Organization ID for cache isolation
 * @param featureId - Optional feature ID to also invalidate its detail
 */
export function invalidateTaskQueries(
  queryClient: QueryClient, 
  orgId: string,
  featureId?: string
) {
  const keys: InvalidateQueryFilters['queryKey'][] = [
    queryKeys.tasks.lists(orgId),
  ];
  
  if (featureId) {
    keys.push(queryKeys.features.detail(orgId, featureId));
  }
  
  smartInvalidateMany(queryClient, keys);
  invalidateDashboardQueries(queryClient, orgId);
}

/**
 * Invalidate all epic-related queries for an org.
 * 
 * @param queryClient - React Query client
 * @param orgId - Organization ID for cache isolation
 * @param projectId - Optional project ID to also invalidate its detail
 */
export function invalidateEpicQueries(
  queryClient: QueryClient, 
  orgId: string,
  projectId?: string
) {
  const keys: InvalidateQueryFilters['queryKey'][] = [
    queryKeys.epics.lists(orgId),
    queryKeys.epics.allList(orgId),
  ];
  
  if (projectId) {
    keys.push(queryKeys.projects.detail(orgId, projectId));
  }
  
  smartInvalidateMany(queryClient, keys);
}

/**
 * Invalidate all feature-related queries for an org.
 * 
 * @param queryClient - React Query client
 * @param orgId - Organization ID for cache isolation
 * @param epicId - Optional epic ID to also invalidate its detail
 */
export function invalidateFeatureQueries(
  queryClient: QueryClient, 
  orgId: string,
  epicId?: string
) {
  const keys: InvalidateQueryFilters['queryKey'][] = [
    queryKeys.features.lists(orgId),
    queryKeys.features.allList(orgId),
  ];
  
  if (epicId) {
    keys.push(queryKeys.epics.detail(orgId, epicId));
  }
  
  smartInvalidateMany(queryClient, keys);
}
