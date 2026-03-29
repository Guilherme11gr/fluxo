import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateDashboardQueries, smartInvalidate, smartInvalidateImmediate } from '../helpers';
import { queryKeys } from '../query-keys';
import { CACHE_TIMES } from '../cache-config';
import { useCurrentOrgId, isOrgIdValid } from './use-org-id';
import { toast } from 'sonner';

// ============ Types ============

export interface Project {
  id: string;
  name: string;
  key: string;
  description?: string | null;
  modules?: string[];
  _count?: { epics: number; tasks: number };
  // Analytics
  progress?: number;
  activeCount?: number;
  blockedCount?: number;
  recentAssignees?: Array<{
    displayName: string;
    avatarUrl: string | null;
  }>;
}




interface CreateProjectInput {
  name: string;
  key: string;
  description?: string;
  modules?: string[];
}

interface UpdateProjectInput {
  id: string;
  data: Partial<CreateProjectInput>;
}

// ============ Fetch Functions ============

async function fetchProjects(): Promise<Project[]> {
  const res = await fetch('/api/projects');
  if (!res.ok) throw new Error('Failed to fetch projects');
  const json = await res.json();
  return json.data || [];
}

async function fetchProject(id: string): Promise<Project> {
  const res = await fetch(`/api/projects/${id}`);
  if (!res.ok) throw new Error('Failed to fetch project');
  const json = await res.json();
  return json.data;
}



async function createProject(data: CreateProjectInput): Promise<Project> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create project');
  const json = await res.json();
  return json.data;
}

async function updateProject({ id, data }: UpdateProjectInput): Promise<Project> {
  const res = await fetch(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update project');
  const json = await res.json();
  return json.data;
}

async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete project');
}

// ============ Hooks ============

/**
 * Fetch all projects for the current org
 */
export function useProjects() {
  const orgId = useCurrentOrgId();

  return useQuery({
    queryKey: queryKeys.projects.list(orgId),
    queryFn: fetchProjects,
    enabled: isOrgIdValid(orgId),
    ...CACHE_TIMES.STANDARD,
  });
}

/**
 * Fetch a single project by ID
 */
export function useProject(id: string) {
  const orgId = useCurrentOrgId();

  return useQuery({
    queryKey: queryKeys.projects.detail(orgId, id),
    queryFn: () => fetchProject(id),
    enabled: Boolean(id) && isOrgIdValid(orgId),
    ...CACHE_TIMES.STANDARD,
  });
}



/**
 * Extract unique modules from all projects
 */
export function useModules() {
  const { data: projects, ...rest } = useProjects();

  const modules = projects
    ? Array.from(
      new Set(projects.flatMap((p) => p.modules || []))
    ).sort()
    : [];

  return { data: modules, ...rest };
}

/**
 * Get modules for a specific project
 * @param projectId - The project ID to get modules for
 */
export function useModulesByProject(projectId: string | undefined) {
  const { data: projects, ...rest } = useProjects();

  const modules = projects && projectId
    ? projects.find((p) => p.id === projectId)?.modules || []
    : [];

  return { data: modules, ...rest };
}

// ============ Mutations ============

/**
 * Create a new project
 * 
 * Strategy: Optimistic update + force refetch
 */
export function useCreateProject() {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();

  return useMutation({
    mutationFn: createProject,
    onSuccess: (newProject) => {
      // 1. Optimistic update the list
      queryClient.setQueryData<Project[]>(queryKeys.projects.list(orgId), (old) => {
        if (!old) return [newProject];
        // Avoid duplicates
        if (old.some(p => p.id === newProject.id)) return old;
        return [...old, newProject];
      });

      // 2. Invalidate with immediate refetch (CREATE = critical)
      smartInvalidateImmediate(queryClient, queryKeys.projects.list(orgId));

      // 3. Invalidate Dashboard Active Projects (new project might be active soon)
      invalidateDashboardQueries(queryClient, orgId);

      toast.success('Projeto criado');
    },
    onError: () => {
      toast.error('Erro ao criar projeto');
    },
  });
}

/**
 * Update a project
 * 
 * Strategy: Optimistic update + targeted refetch
 */
export function useUpdateProject() {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();

  return useMutation({
    mutationFn: updateProject,
    onSuccess: (updatedProject, variables) => {
      // 1. Optimistic update: update the specific project in cache
      queryClient.setQueryData<Project>(
        queryKeys.projects.detail(orgId, variables.id),
        updatedProject
      );

      // 2. Update in list immediately
      queryClient.setQueryData<Project[]>(queryKeys.projects.list(orgId), (old) => {
        if (!old) return old;
        return old.map((p) => (p.id === variables.id ? { ...p, ...updatedProject } : p));
      });

      // 3. Invalidate for consistency (UPDATE = smartInvalidate is enough)
      smartInvalidate(queryClient, queryKeys.projects.list(orgId));
      smartInvalidate(queryClient, queryKeys.projects.detail(orgId, variables.id));

      // 4. Invalidate Dashboard
      invalidateDashboardQueries(queryClient, orgId);
      toast.success('Projeto atualizado');
    },
    onError: () => {
      toast.error('Erro ao atualizar projeto');
    },
  });
}

/**
 * Delete a project
 * 
 * Strategy: Optimistic removal + force refetch
 */
export function useDeleteProject() {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();

  return useMutation({
    mutationFn: deleteProject,
    onMutate: async (projectId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.projects.all(orgId) });

      // Snapshot previous data for rollback
      const previousProjects = queryClient.getQueryData<Project[]>(queryKeys.projects.list(orgId));

      // Optimistically remove from list
      if (previousProjects) {
        queryClient.setQueryData<Project[]>(
          queryKeys.projects.list(orgId),
          previousProjects.filter(p => p.id !== projectId)
        );
      }

      return { previousProjects, projectId };
    },
    onSuccess: (_, deletedProjectId) => {
      // Remove detail query
      queryClient.removeQueries({ queryKey: queryKeys.projects.detail(orgId, deletedProjectId) });

      // Invalidate with immediate refetch (DELETE = critical)
      smartInvalidateImmediate(queryClient, queryKeys.projects.list(orgId));

      // Invalidate dashboard
      invalidateDashboardQueries(queryClient, orgId);
      toast.success('Projeto excluído');
    },
    onError: (_err, _projectId, context) => {
      // Rollback on error
      if (context?.previousProjects) {
        queryClient.setQueryData(queryKeys.projects.list(orgId), context.previousProjects);
      }
      toast.error('Erro ao excluir projeto');
    },
  });
}

