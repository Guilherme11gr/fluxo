import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { smartInvalidate, smartInvalidateImmediate } from '../helpers';
import { queryKeys } from '../query-keys';
import { CACHE_TIMES } from '../cache-config';
import { useCurrentOrgId, isOrgIdValid } from './use-org-id';
import { toast } from 'sonner';

// ============ Types ============

export interface Agent {
  id: string;
  orgId: string;
  name: string;
  type: string;
  status: string;
  tool: string | null;
  workdir: string | null;
  projectId: string | null;
  config: Record<string, unknown>;
  lastHeartbeat: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface CreateAgentInput {
  name: string;
  type?: 'RUNNER' | 'REVIEWER' | 'CUSTOM';
  tool?: string;
  projectId?: string | null;
  workdir?: string;
  config?: Record<string, unknown>;
}

interface UpdateAgentInput {
  id: string;
  data: Partial<CreateAgentInput>;
}

// ============ Fetch Functions ============

async function fetchAgents(projectId?: string | null): Promise<Agent[]> {
  const params = new URLSearchParams();
  if (projectId) {
    params.set('projectId', projectId);
  }
  const query = params.toString();
  const res = await fetch(query ? `/api/agents?${query}` : '/api/agents');
  if (!res.ok) throw new Error('Erro ao carregar agents');
  const json = await res.json();
  return json.data || [];
}

async function fetchAgent(id: string): Promise<Agent> {
  const res = await fetch(`/api/agents/${id}`);
  if (!res.ok) throw new Error('Erro ao carregar agent');
  const json = await res.json();
  return json.data;
}

async function createAgent(data: CreateAgentInput): Promise<Agent> {
  const res = await fetch('/api/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error?.error?.message || 'Erro ao criar agent');
  }
  const json = await res.json();
  return json.data;
}

async function updateAgent({ id, data }: UpdateAgentInput): Promise<Agent> {
  const res = await fetch(`/api/agents/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao atualizar agent');
  const json = await res.json();
  return json.data;
}

async function deleteAgent(id: string): Promise<void> {
  const res = await fetch(`/api/agents/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Erro ao excluir agent');
}

// ============ Hooks ============

export function useAgents(projectId?: string | null) {
  const orgId = useCurrentOrgId();

  return useQuery({
    queryKey: queryKeys.agents.list(orgId, projectId),
    queryFn: () => fetchAgents(projectId),
    enabled: isOrgIdValid(orgId),
    ...CACHE_TIMES.STANDARD,
  });
}

export function useAgent(id: string) {
  const orgId = useCurrentOrgId();

  return useQuery({
    queryKey: queryKeys.agents.detail(orgId, id),
    queryFn: () => fetchAgent(id),
    enabled: Boolean(id) && isOrgIdValid(orgId),
    ...CACHE_TIMES.STANDARD,
  });
}

// ============ Mutations ============

export function useCreateAgent() {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();

  return useMutation({
    mutationFn: createAgent,
    onSuccess: (newAgent) => {
      queryClient.setQueryData<Agent[]>(queryKeys.agents.list(orgId), (old) => {
        if (!old) return [newAgent];
        if (old.some((a) => a.id === newAgent.id)) return old;
        return [...old, newAgent];
      });

      queryClient.setQueryData<Agent[]>(queryKeys.agents.list(orgId, newAgent.projectId), (old) => {
        if (!old) return [newAgent];
        if (old.some((a) => a.id === newAgent.id)) return old;
        return [...old, newAgent];
      });

      smartInvalidateImmediate(queryClient, queryKeys.agents.list(orgId));
      if (newAgent.projectId) {
        smartInvalidateImmediate(queryClient, queryKeys.agents.list(orgId, newAgent.projectId));
      }
      toast.success('Agent criado');
    },
    onError: () => {
      toast.error('Erro ao criar agent');
    },
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();

  return useMutation({
    mutationFn: updateAgent,
    onSuccess: (updatedAgent, variables) => {
      queryClient.setQueryData<Agent>(
        queryKeys.agents.detail(orgId, variables.id),
        updatedAgent,
      );

      queryClient.setQueryData<Agent[]>(queryKeys.agents.list(orgId), (old) => {
        if (!old) return old;
        return old.map((a) => (a.id === variables.id ? { ...a, ...updatedAgent } : a));
      });

      queryClient.setQueryData<Agent[]>(queryKeys.agents.list(orgId, updatedAgent.projectId), (old) => {
        if (!old) return [updatedAgent];
        const existingIndex = old.findIndex((a) => a.id === variables.id);
        if (existingIndex === -1) {
          return [...old, updatedAgent];
        }
        return old.map((a) => (a.id === variables.id ? { ...a, ...updatedAgent } : a));
      });

      smartInvalidate(queryClient, queryKeys.agents.list(orgId));
      if (updatedAgent.projectId) {
        smartInvalidate(queryClient, queryKeys.agents.list(orgId, updatedAgent.projectId));
      }
      smartInvalidate(queryClient, queryKeys.agents.detail(orgId, variables.id));
      toast.success('Agent atualizado');
    },
    onError: () => {
      toast.error('Erro ao atualizar agent');
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();

  return useMutation({
    mutationFn: deleteAgent,
    onMutate: async (agentId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.agents.all(orgId) });
      const previousAgents = queryClient.getQueryData<Agent[]>(queryKeys.agents.list(orgId));

      if (previousAgents) {
        queryClient.setQueryData<Agent[]>(
          queryKeys.agents.list(orgId),
          previousAgents.filter((a) => a.id !== agentId),
        );
      }

      return { previousAgents, agentId };
    },
    onSuccess: (_, deletedId) => {
      queryClient.removeQueries({ queryKey: queryKeys.agents.detail(orgId, deletedId) });
      smartInvalidateImmediate(queryClient, queryKeys.agents.list(orgId));
      toast.success('Agent excluído');
    },
    onError: (_err, _id, context) => {
      if (context?.previousAgents) {
        queryClient.setQueryData(queryKeys.agents.list(orgId), context.previousAgents);
      }
      toast.error('Erro ao excluir agent');
    },
  });
}
