import { defineTool } from '@guilherme/agent-sdk/core';
import { z } from 'zod';
import { AgentChatContext, InternalAgentApiClient } from './internal-api';

const taskStatusSchema = z.enum(['BACKLOG', 'TODO', 'DOING', 'REVIEW', 'QA_READY', 'DONE']);
const taskPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const taskTypeSchema = z.enum(['TASK', 'BUG']);
const featureStatusSchema = z.enum(['BACKLOG', 'TODO', 'DOING', 'DONE']);
const epicStatusSchema = z.enum(['OPEN', 'CLOSED']);
const membershipRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER']);
const taskTagColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

function compactObject<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

function matchesLooseSearch(value: string | null | undefined, search: string): boolean {
  return (value || '').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'));
}

async function getFeatureProjectId(api: InternalAgentApiClient, featureId: string): Promise<string> {
  const feature = await api.get<{
    epic: {
      project: {
        id: string;
      };
    };
  }>(`/api/features/${featureId}`);

  return feature.epic.project.id;
}

function buildEpicStats(
  features: Array<{
    id: string;
    status: string;
    tasks: Array<{ status: string; priority: string; blocked?: boolean }>;
  }>
) {
  return features.reduce(
    (acc, feature) => {
      acc.totalFeatures += 1;
      acc.featuresByStatus[feature.status] = (acc.featuresByStatus[feature.status] || 0) + 1;

      for (const task of feature.tasks) {
        acc.totalTasks += 1;
        acc.tasksByStatus[task.status] = (acc.tasksByStatus[task.status] || 0) + 1;
        acc.tasksByPriority[task.priority] = (acc.tasksByPriority[task.priority] || 0) + 1;

        if (task.blocked) {
          acc.blockedTasks += 1;
        }
      }

      return acc;
    },
    {
      totalFeatures: 0,
      totalTasks: 0,
      blockedTasks: 0,
      featuresByStatus: {} as Record<string, number>,
      tasksByStatus: {} as Record<string, number>,
      tasksByPriority: {} as Record<string, number>,
    }
  );
}

export function buildAgentChatSystemPrompt(context: AgentChatContext): string {
  return [
    'Você é o agente conversacional do Fluxo.',
    'Converse naturalmente em pt-BR, entenda a intenção do usuário e escolha as tools quando elas realmente ajudarem.',
    'Nada de fluxos pré-definidos: investigue o estado atual, tome ações seguras e explique o que fez.',
    'As tools já estão limitadas ao tenant atual. Nunca invente IDs, estados ou resultados que você não consultou.',
    'Quando o usuário não souber IDs, descubra antes usando as tools de listagem e resolução.',
    'Quando o usuário mencionar pessoas, busque membros com list_users antes de atribuir trabalho.',
    'Quando o usuário mencionar tags, use list_task_tags ou get_task_tags para descobrir o estado atual antes de mudar algo.',
    'Para ações destrutivas ou ambíguas, faça uma pergunta curta antes de executar.',
    'Depois de mutações, cite de forma objetiva o que mudou e quais entidades foram afetadas.',
    '',
    `Tenant atual: ${context.orgName || context.orgSlug || context.tenantId}`,
    `Org slug: ${context.orgSlug || 'n/d'}`,
    `Usuário atual: ${context.userDisplayName || context.userId}`,
    `Role atual: ${context.role}`,
  ].join('\n');
}

export function buildAgentChatTools(context: AgentChatContext) {
  const api = new InternalAgentApiClient(context);

  return [
    defineTool({
      name: 'get_workspace_context',
      description: 'Mostra o tenant atual, o usuário autenticado e o papel corrente no workspace.',
      parameters: z.object({}),
      execute: async () => ({
        tenantId: context.tenantId,
        orgName: context.orgName,
        orgSlug: context.orgSlug,
        userId: context.userId,
        userDisplayName: context.userDisplayName,
        role: context.role,
      }),
    }),
    defineTool({
      name: 'list_users',
      description: 'Lista os membros do tenant atual. Use para descobrir responsáveis antes de atribuir tasks.',
      parameters: z.object({
        search: z.string().min(1).optional(),
        role: membershipRoleSchema.optional(),
        limit: z.number().int().min(1).max(50).optional().default(25),
      }),
      execute: async ({ search, role, limit }) => {
        const users = await api.get<Array<Record<string, unknown>>>('/api/users');
        const normalizedSearch = search?.trim().toLocaleLowerCase('pt-BR');

        const filtered = users.filter((user) => {
          const roleMatches = !role || user.role === role;
          if (!roleMatches) {
            return false;
          }

          if (!normalizedSearch) {
            return true;
          }

          return (
            matchesLooseSearch(user.displayName as string | undefined, normalizedSearch) ||
            matchesLooseSearch(user.id as string | undefined, normalizedSearch)
          );
        });

        return filtered.slice(0, limit);
      },
    }),
    defineTool({
      name: 'list_projects',
      description: 'Lista todos os projetos do tenant atual.',
      parameters: z.object({}),
      execute: async () => api.get('/api/projects'),
    }),
    defineTool({
      name: 'list_epics',
      description: 'Lista épicos, opcionalmente filtrando por projeto e status.',
      parameters: z.object({
        projectId: z.string().uuid().optional(),
        status: epicStatusSchema.optional(),
        limit: z.number().int().min(1).max(50).optional().default(25),
      }),
      execute: async ({ projectId, status, limit }) => {
        const epics = projectId
          ? await api.get<Array<Record<string, unknown>>>(`/api/projects/${projectId}/epics`)
          : await api.get<Array<Record<string, unknown>>>('/api/epics');

        const filtered = status
          ? epics.filter((epic) => epic.status === status)
          : epics;

        return filtered.slice(0, limit);
      },
    }),
    defineTool({
      name: 'get_epic',
      description: 'Busca um épico e também devolve suas features atuais.',
      parameters: z.object({
        id: z.string().uuid(),
      }),
      execute: async ({ id }) => {
        const [epic, features] = await Promise.all([
          api.get<Record<string, unknown>>(`/api/epics/${id}`),
          api.get(`/api/epics/${id}/features`),
        ]);

        return { ...epic, features };
      },
    }),
    defineTool({
      name: 'get_epic_full',
      description: 'Traz o contexto completo do épico com features, tasks e estatísticas agregadas.',
      parameters: z.object({
        id: z.string().uuid(),
      }),
      execute: async ({ id }) => {
        const epic = await api.get<Record<string, unknown>>(`/api/epics/${id}`);
        const features = await api.get<Array<Record<string, unknown>>>(`/api/epics/${id}/features`);

        const featuresWithTasks = await Promise.all(
          features.map(async (feature) => {
            const tasks = await api.get<Array<{ status: string; priority: string; blocked?: boolean }>>(
              `/api/features/${feature.id as string}/tasks`
            );

            return {
              ...feature,
              tasks,
            };
          })
        );

        return {
          ...epic,
          features: featuresWithTasks,
          stats: buildEpicStats(
            featuresWithTasks as Array<{
              id: string;
              status: string;
              tasks: Array<{ status: string; priority: string; blocked?: boolean }>;
            }>
          ),
        };
      },
    }),
    defineTool({
      name: 'create_epic',
      description: 'Cria um novo épico dentro de um projeto.',
      parameters: z.object({
        projectId: z.string().uuid(),
        title: z.string().min(3).max(200),
        description: z.string().max(5000).optional(),
        status: epicStatusSchema.optional().default('OPEN'),
      }),
      execute: async ({ projectId, title, description, status }) =>
        api.post(`/api/projects/${projectId}/epics`, {
          title,
          description,
          status,
        }),
    }),
    defineTool({
      name: 'update_epic',
      description: 'Atualiza título, descrição ou status de um épico.',
      parameters: z.object({
        id: z.string().uuid(),
        title: z.string().min(3).max(200).optional(),
        description: z.string().max(5000).nullable().optional(),
        status: epicStatusSchema.optional(),
      }),
      execute: async ({ id, ...changes }) =>
        api.patch(`/api/epics/${id}`, compactObject(changes)),
    }),
    defineTool({
      name: 'delete_epic',
      description: 'Remove um épico. Use só quando tiver certeza.',
      parameters: z.object({
        id: z.string().uuid(),
      }),
      awaitConfirm: true,
      confirmMessage: ({ id }) => `Excluir o épico ${id}? Essa ação remove o épico do fluxo atual.`,
      execute: async ({ id }) => {
        await api.delete(`/api/epics/${id}`);

        return { ok: true, deletedId: id };
      },
    }),
    defineTool({
      name: 'list_features',
      description: 'Lista features do tenant, com filtros opcionais.',
      parameters: z.object({
        epicId: z.string().uuid().optional(),
        status: featureStatusSchema.optional(),
        limit: z.number().int().min(1).max(50).optional().default(25),
      }),
      execute: async ({ epicId, status, limit }) => {
        const features = epicId
          ? await api.get<Array<Record<string, unknown>>>(`/api/epics/${epicId}/features`)
          : await api.get<Array<Record<string, unknown>>>('/api/features');

        const filtered = status
          ? features.filter((feature) => feature.status === status)
          : features;

        return filtered.slice(0, limit);
      },
    }),
    defineTool({
      name: 'get_feature',
      description: 'Busca uma feature e devolve também suas tasks.',
      parameters: z.object({
        id: z.string().uuid(),
      }),
      execute: async ({ id }) => {
        const [feature, tasks] = await Promise.all([
          api.get<Record<string, unknown>>(`/api/features/${id}`),
          api.get(`/api/features/${id}/tasks`),
        ]);

        return {
          ...feature,
          tasks,
        };
      },
    }),
    defineTool({
      name: 'create_feature',
      description: 'Cria uma feature dentro de um épico.',
      parameters: z.object({
        epicId: z.string().uuid(),
        title: z.string().min(3).max(200),
        description: z.string().max(5000).optional(),
        status: featureStatusSchema.optional().default('BACKLOG'),
      }),
      execute: async ({ epicId, title, description, status }) =>
        api.post(`/api/epics/${epicId}/features`, {
          title,
          description,
          status,
        }),
    }),
    defineTool({
      name: 'update_feature',
      description: 'Atualiza uma feature existente.',
      parameters: z.object({
        id: z.string().uuid(),
        title: z.string().min(3).max(200).optional(),
        description: z.string().max(5000).nullable().optional(),
        status: featureStatusSchema.optional(),
      }),
      execute: async ({ id, ...changes }) =>
        api.patch(`/api/features/${id}`, compactObject(changes)),
    }),
    defineTool({
      name: 'delete_feature',
      description: 'Exclui uma feature. Use só quando tiver certeza.',
      parameters: z.object({
        id: z.string().uuid(),
      }),
      awaitConfirm: true,
      confirmMessage: ({ id }) => `Excluir a feature ${id}? As tasks ligadas a ela também podem ser afetadas.`,
      execute: async ({ id }) => {
        await api.delete(`/api/features/${id}`);

        return { ok: true, deletedId: id };
      },
    }),
    defineTool({
      name: 'list_tasks',
      description: 'Lista tasks com filtros úteis como status, projeto, feature, epic, responsável ou busca textual.',
      parameters: z.object({
        featureId: z.string().uuid().optional(),
        epicId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
        assigneeId: z.string().uuid().optional(),
        tagId: z.string().uuid().optional(),
        status: taskStatusSchema.optional(),
        priority: taskPrioritySchema.optional(),
        type: taskTypeSchema.optional(),
        blocked: z.boolean().optional(),
        search: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional().default(25),
      }),
      execute: async ({ limit, ...filters }) =>
        api.get('/api/tasks', {
          ...filters,
          page: 1,
          pageSize: limit,
          sortBy: 'updatedAt',
          sortOrder: 'desc',
        }),
    }),
    defineTool({
      name: 'get_task',
      description: 'Busca uma task por UUID ou readable ID, como JKILL-123.',
      parameters: z.object({
        id: z.string().min(1),
      }),
      execute: async ({ id }) => {
        const taskId = await api.resolveTaskId(id);
        return api.get(`/api/tasks/${taskId}`);
      },
    }),
    defineTool({
      name: 'create_task',
      description: 'Cria uma nova task. Você pode informar featureId ou só projectId para cair no fluxo padrão do projeto.',
      parameters: z.object({
        title: z.string().min(3).max(200),
        projectId: z.string().uuid().optional(),
        featureId: z.string().uuid().optional(),
        description: z.string().max(10000).optional(),
        status: taskStatusSchema.optional().default('BACKLOG'),
        type: taskTypeSchema.optional().default('TASK'),
        priority: taskPrioritySchema.optional().default('MEDIUM'),
        points: z.number().int().nonnegative().optional(),
        modules: z.array(z.string().max(50)).max(10).optional().default([]),
        assigneeId: z.string().uuid().nullable().optional(),
      }).refine((value) => Boolean(value.featureId || value.projectId), {
        message: 'Informe featureId ou projectId',
      }),
      execute: async ({
        title,
        projectId,
        featureId,
        description,
        status,
        type,
        priority,
        points,
        modules,
        assigneeId,
      }) => {
        let resolvedProjectId = projectId;

        if (!resolvedProjectId && featureId) {
          resolvedProjectId = await getFeatureProjectId(api, featureId);
        }

        return api.post('/api/tasks', compactObject({
          title,
          projectId: resolvedProjectId,
          featureId,
          description,
          status,
          type,
          priority,
          points,
          modules,
          assigneeId,
        }));
      },
    }),
    defineTool({
      name: 'update_task',
      description: 'Atualiza status, responsável, descrição, bloqueio ou outros campos de uma task.',
      parameters: z.object({
        id: z.string().min(1),
        title: z.string().min(3).max(200).optional(),
        description: z.string().max(10000).nullable().optional(),
        type: taskTypeSchema.optional(),
        priority: taskPrioritySchema.optional(),
        status: taskStatusSchema.optional(),
        assigneeId: z.string().uuid().nullable().optional(),
        featureId: z.string().uuid().nullable().optional(),
        projectId: z.string().uuid().optional(),
        blocked: z.boolean().optional(),
        blockReason: z.string().trim().min(10).max(500).nullable().optional(),
        points: z.number().int().nonnegative().nullable().optional(),
        modules: z.array(z.string().max(50)).max(10).optional(),
      }),
      execute: async ({ id, ...changes }) => {
        const taskId = await api.resolveTaskId(id);

        return api.patch(`/api/tasks/${taskId}`, compactObject(changes));
      },
    }),
    defineTool({
      name: 'delete_task',
      description: 'Remove uma task de forma permanente.',
      parameters: z.object({
        id: z.string().min(1),
      }),
      awaitConfirm: true,
      confirmMessage: ({ id }) => `Excluir a task ${id}? Essa ação é permanente.`,
      execute: async ({ id }) => {
        const taskId = await api.resolveTaskId(id);
        await api.delete(`/api/tasks/${taskId}`);

        return { ok: true, deletedId: taskId };
      },
    }),
    defineTool({
      name: 'bulk_update_tasks',
      description: 'Atualiza várias tasks de uma vez, útil para mudanças em lote.',
      parameters: z.object({
        ids: z.array(z.string().min(1)).min(1).max(25),
        status: taskStatusSchema.optional(),
        priority: taskPrioritySchema.optional(),
        type: taskTypeSchema.optional(),
        assigneeId: z.string().uuid().nullable().optional(),
        blocked: z.boolean().optional(),
        blockReason: z.string().trim().min(10).max(500).nullable().optional(),
      }),
      execute: async ({ ids, ...changes }) => {
        const resolvedIds = await Promise.all(ids.map((id: string) => api.resolveTaskId(id)));
        const results = await Promise.all(
          resolvedIds.map((taskId) =>
            api.patch(`/api/tasks/${taskId}`, compactObject(changes))
          )
        );

        return {
          count: results.length,
          tasks: results,
        };
      },
    }),
    defineTool({
      name: 'block_tasks',
      description: 'Bloqueia ou desbloqueia várias tasks em lote.',
      parameters: z.object({
        ids: z.array(z.string().min(1)).min(1).max(25),
        blocked: z.boolean(),
        blockReason: z.string().trim().min(10).max(500).nullable().optional(),
      }),
      execute: async ({ ids, blocked, blockReason }) => {
        const resolvedIds = await Promise.all(ids.map((id: string) => api.resolveTaskId(id)));
        const tasks = await Promise.all(
          resolvedIds.map((taskId) =>
            api.patch(`/api/tasks/${taskId}`, compactObject({
              blocked,
              blockReason,
            }))
          )
        );

        return {
          count: tasks.length,
          blocked,
          tasks,
        };
      },
    }),
    defineTool({
      name: 'add_task_comment',
      description: 'Adiciona um comentário em uma task.',
      parameters: z.object({
        taskId: z.string().min(1),
        content: z.string().min(1).max(5000),
      }),
      execute: async ({ taskId, content }) => {
        const resolvedTaskId = await api.resolveTaskId(taskId);

        return api.post(`/api/tasks/${resolvedTaskId}/comments`, { content });
      },
    }),
    defineTool({
      name: 'list_task_comments',
      description: 'Lista os comentários de uma task.',
      parameters: z.object({
        taskId: z.string().min(1),
      }),
      execute: async ({ taskId }) => {
        const resolvedTaskId = await api.resolveTaskId(taskId);

        return api.get(`/api/tasks/${resolvedTaskId}/comments`);
      },
    }),
    defineTool({
      name: 'list_docs',
      description: 'Lista documentos de um projeto.',
      parameters: z.object({
        projectId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).optional().default(25),
      }),
      execute: async ({ projectId, limit }) => {
        const docs = await api.get<Array<Record<string, unknown>>>(`/api/projects/${projectId}/docs`);
        return docs.slice(0, limit);
      },
    }),
    defineTool({
      name: 'get_doc',
      description: 'Busca o conteúdo de um documento.',
      parameters: z.object({
        id: z.string().uuid(),
      }),
      execute: async ({ id }) => api.get(`/api/docs/${id}`),
    }),
    defineTool({
      name: 'create_doc',
      description: 'Cria um documento novo em um projeto.',
      parameters: z.object({
        projectId: z.string().uuid(),
        title: z.string().min(1).max(200),
        content: z.string().max(100000),
        tagIds: z.array(z.string().uuid()).optional().default([]),
      }),
      execute: async ({ projectId, title, content, tagIds }) =>
        api.post(`/api/projects/${projectId}/docs`, {
          title,
          content,
          tagIds,
        }),
    }),
    defineTool({
      name: 'update_doc',
      description: 'Atualiza título, conteúdo ou tags de um documento.',
      parameters: z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        content: z.string().max(100000).optional(),
        tagIds: z.array(z.string().uuid()).optional(),
      }),
      execute: async ({ id, ...changes }) =>
        api.patch(`/api/docs/${id}`, compactObject(changes)),
    }),
    defineTool({
      name: 'delete_doc',
      description: 'Exclui um documento.',
      parameters: z.object({
        id: z.string().uuid(),
      }),
      awaitConfirm: true,
      confirmMessage: ({ id }) => `Excluir o documento ${id}?`,
      execute: async ({ id }) => {
        await api.delete(`/api/docs/${id}`);

        return { ok: true, deletedId: id };
      },
    }),
    defineTool({
      name: 'list_task_tags',
      description: 'Lista as tags de tasks de um projeto. Use antes de filtrar ou atribuir tags.',
      parameters: z.object({
        projectId: z.string().uuid(),
        search: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(50).optional().default(25),
      }),
      execute: async ({ projectId, search, limit }) => {
        const tags = await api.get<Array<Record<string, unknown>>>(`/api/projects/${projectId}/task-tags`);
        const normalizedSearch = search?.trim().toLocaleLowerCase('pt-BR');
        const filtered = normalizedSearch
          ? tags.filter((tag) => matchesLooseSearch(tag.name as string | undefined, normalizedSearch))
          : tags;

        return filtered.slice(0, limit);
      },
    }),
    defineTool({
      name: 'get_task_tag',
      description: 'Busca uma tag de task específica pelo projeto e ID da tag.',
      parameters: z.object({
        projectId: z.string().uuid(),
        tagId: z.string().uuid(),
      }),
      execute: async ({ projectId, tagId }) => api.get(`/api/projects/${projectId}/task-tags/${tagId}`),
    }),
    defineTool({
      name: 'create_task_tag',
      description: 'Cria uma nova tag de task dentro de um projeto.',
      parameters: z.object({
        projectId: z.string().uuid(),
        name: z.string().min(1).max(50),
        color: taskTagColorSchema.optional(),
        description: z.string().max(200).optional(),
      }),
      execute: async ({ projectId, ...payload }) =>
        api.post(`/api/projects/${projectId}/task-tags`, compactObject(payload)),
    }),
    defineTool({
      name: 'update_task_tag',
      description: 'Atualiza nome, cor ou descrição de uma tag de task.',
      parameters: z.object({
        projectId: z.string().uuid(),
        tagId: z.string().uuid(),
        name: z.string().min(1).max(50).optional(),
        color: taskTagColorSchema.optional(),
        description: z.string().max(200).nullable().optional(),
      }),
      execute: async ({ projectId, tagId, ...changes }) =>
        api.put(`/api/projects/${projectId}/task-tags/${tagId}`, compactObject(changes)),
    }),
    defineTool({
      name: 'delete_task_tag',
      description: 'Exclui uma tag de task de um projeto.',
      parameters: z.object({
        projectId: z.string().uuid(),
        tagId: z.string().uuid(),
      }),
      awaitConfirm: true,
      confirmMessage: ({ tagId }) => `Excluir a tag ${tagId}? Isso remove as associações existentes.`,
      execute: async ({ projectId, tagId }) => {
        await api.delete(`/api/projects/${projectId}/task-tags/${tagId}`);

        return { ok: true, deletedId: tagId };
      },
    }),
    defineTool({
      name: 'get_task_tags',
      description: 'Lista as tags atribuídas a uma task específica.',
      parameters: z.object({
        taskId: z.string().min(1),
      }),
      execute: async ({ taskId }) => {
        const resolvedTaskId = await api.resolveTaskId(taskId);
        return api.get(`/api/tasks/${resolvedTaskId}/tags`);
      },
    }),
    defineTool({
      name: 'set_task_tags',
      description: 'Substitui todas as tags de uma task por uma nova lista.',
      parameters: z.object({
        taskId: z.string().min(1),
        tagIds: z.array(z.string().uuid()).max(20),
      }),
      execute: async ({ taskId, tagIds }) => {
        const resolvedTaskId = await api.resolveTaskId(taskId);
        return api.put(`/api/tasks/${resolvedTaskId}/tags`, { tagIds });
      },
    }),
  ];
}
