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

const optionalNonEmptyStringSchema = z.string().trim().min(1).optional();

function parseStringArrayLike(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item).trim())
          .filter(Boolean);
      }
    } catch {
      return undefined;
    }
  }

  return trimmed
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBooleanLike(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLocaleLowerCase('pt-BR');
  if (['true', '1', 'yes', 'sim'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'nao', 'não'].includes(normalized)) {
    return false;
  }

  return undefined;
}

const stringArrayLikeSchema = z.preprocess(
  (value) => parseStringArrayLike(value),
  z.array(z.string().min(1))
);

const uuidArrayLikeSchema = z.preprocess(
  (value) => parseStringArrayLike(value),
  z.array(z.string().uuid())
);

const taskRefArrayLikeSchema = z.preprocess(
  (value) => {
    const normalized = parseStringArrayLike(value);
    return normalized?.map((id) => ({ id }));
  },
  z.array(z.object({
    id: optionalNonEmptyStringSchema,
    taskId: optionalNonEmptyStringSchema,
    readableId: optionalNonEmptyStringSchema,
  }).refine((item) => Boolean(item.id || item.taskId || item.readableId), {
    message: 'Informe id, taskId ou readableId',
  }))
);

const booleanLikeSchema = z.preprocess(
  (value) => parseBooleanLike(value),
  z.boolean()
);

function compactObject<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

function matchesLooseSearch(value: string | null | undefined, search: string): boolean {
  return (value || '').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'));
}

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value === undefined || value === null || value === '') {
    throw new Error(message);
  }

  return value;
}

function normalizeStringArrayInput(value: unknown, fieldName: string): string[] | undefined {
  const normalized = parseStringArrayLike(value);

  if (value !== undefined && value !== null && normalized === undefined) {
    throw new Error(`${fieldName} deve ser uma lista válida.`);
  }

  return normalized;
}

function normalizeBooleanInput(value: unknown, fieldName: string): boolean | undefined {
  const normalized = parseBooleanLike(value);

  if (value !== undefined && normalized === undefined) {
    throw new Error(`${fieldName} deve ser boolean (true/false).`);
  }

  return normalized;
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
    'Para atualizar features, você pode usar id ou featureTitle. Se o pedido envolver várias features, prefira bulk_update_features.',
    'Quando uma tool aceitar arrays, envie arrays reais. Exemplo: tagNames: ["backend", "blocked"]. Evite strings como "[...]" quando não forem necessárias.',
    'Quando uma tool aceitar booleanos, envie true/false de verdade. Exemplo: blocked: true.',
    'Se mesmo assim você só tiver um valor em texto, prefira ids, taskIds, featureIds ou tagNames separados por vírgula a deixar o campo vazio.',
    'Quando o usuário mencionar pessoas, busque membros com list_users antes de atribuir trabalho.',
    'Quando o usuário mencionar tags, use list_task_tags ou get_task_tags para descobrir o estado atual antes de mudar algo.',
    'Para ações destrutivas ou ambíguas, faça uma pergunta curta antes de executar.',
    'Depois de mutações, cite de forma objetiva o que mudou e quais entidades foram afetadas.',
    '',
    `Tenant atual: ${context.orgName || context.orgSlug || context.tenantId}`,
    `Org slug: ${context.orgSlug || 'n/d'}`,
    `Usuário atual: ${context.userDisplayName || context.userId}`,
    `Role atual: ${context.role}`,
    ...(context.agentRolePrompt
      ? ['', 'Papel/persona definido pela organização:', context.agentRolePrompt]
      : []),
  ].join('\n');
}

const featureLookupSchema = z.object({
  id: z.string().uuid().optional(),
  featureTitle: optionalNonEmptyStringSchema,
  epicId: z.string().uuid().optional(),
  epicTitle: optionalNonEmptyStringSchema,
  projectId: z.string().uuid().optional(),
  projectName: optionalNonEmptyStringSchema,
}).refine((value) => Boolean(value.id || value.featureTitle), {
  message: 'Informe id ou featureTitle',
});

const projectLookupSchema = z.object({
  projectId: z.string().uuid().optional(),
  projectName: optionalNonEmptyStringSchema,
});

const epicLookupSchema = z.object({
  id: z.string().uuid().optional(),
  epicTitle: optionalNonEmptyStringSchema,
  projectId: z.string().uuid().optional(),
  projectName: optionalNonEmptyStringSchema,
});

const taskRefSchema = z.object({
  id: optionalNonEmptyStringSchema,
  taskId: optionalNonEmptyStringSchema,
  readableId: optionalNonEmptyStringSchema,
}).refine((value) => Boolean(value.id || value.taskId || value.readableId), {
  message: 'Informe id, taskId ou readableId',
});

const docLookupSchema = z.object({
  id: z.string().uuid().optional(),
  docTitle: optionalNonEmptyStringSchema,
  projectId: z.string().uuid().optional(),
  projectName: optionalNonEmptyStringSchema,
});

const taskTagLookupSchema = z.object({
  projectId: z.string().uuid().optional(),
  projectName: optionalNonEmptyStringSchema,
  tagId: z.string().uuid().optional(),
  tagName: optionalNonEmptyStringSchema,
});

async function resolveProjectIdFromLookup(
  api: InternalAgentApiClient,
  input: z.infer<typeof projectLookupSchema>,
  fieldLabel = 'Projeto'
): Promise<string> {
  if (input.projectId) {
    return input.projectId;
  }

  const projectName = requireValue(input.projectName, `${fieldLabel} ausente. Informe projectId ou projectName.`);
  return api.resolveProjectId(projectName);
}

async function resolveEpicIdFromLookup(
  api: InternalAgentApiClient,
  input: z.infer<typeof epicLookupSchema>,
  fieldLabel = 'Épico'
): Promise<string> {
  if (input.id) {
    return input.id;
  }

  const epicTitle = requireValue(input.epicTitle, `${fieldLabel} ausente. Informe id ou epicTitle.`);
  const projectId = input.projectId || (input.projectName
    ? await api.resolveProjectId(input.projectName)
    : undefined);

  return api.resolveEpicId(epicTitle, projectId);
}

async function resolveFeatureIdFromLookup(
  api: InternalAgentApiClient,
  input: z.infer<typeof featureLookupSchema>
): Promise<string> {
  if (input.id) {
    return input.id;
  }

  const featureTitle = requireValue(input.featureTitle, 'Feature ausente. Informe id ou featureTitle.');
  const epicId = input.epicId || (input.epicTitle
    ? await resolveEpicIdFromLookup(api, {
      id: undefined,
      epicTitle: input.epicTitle,
      projectId: input.projectId,
      projectName: input.projectName,
    })
    : undefined);

  return api.resolveFeatureId(featureTitle, epicId);
}

async function resolveTaskIdFromLookup(
  api: InternalAgentApiClient,
  input: z.infer<typeof taskRefSchema> | { id?: string; taskId?: string; readableId?: string }
): Promise<string> {
  const rawId = input.id || input.taskId || input.readableId;
  return api.resolveTaskId(requireValue(rawId, 'Task ausente. Informe id, taskId ou readableId.'));
}

async function resolveDocIdFromLookup(
  api: InternalAgentApiClient,
  input: z.infer<typeof docLookupSchema>
): Promise<string> {
  if (input.id) {
    return input.id;
  }

  const docTitle = requireValue(input.docTitle, 'Documento ausente. Informe id ou docTitle.');
  const projectId = input.projectId || (input.projectName
    ? await api.resolveProjectId(input.projectName)
    : undefined);

  return api.resolveDocId(docTitle, projectId);
}

async function resolveTaskTagRef(
  api: InternalAgentApiClient,
  input: z.infer<typeof taskTagLookupSchema>
): Promise<{ projectId: string; tagId: string }> {
  const projectId = await resolveProjectIdFromLookup(api, input, 'Projeto da tag');

  if (input.tagId) {
    return { projectId, tagId: input.tagId };
  }

  const tagName = requireValue(input.tagName, 'Tag ausente. Informe tagId ou tagName.');
  const tagId = await api.resolveTaskTagId(projectId, tagName);

  return { projectId, tagId };
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
        const query: Record<string, string | number> = { limit };
        if (search) query.search = search;
        if (role) query.role = role;

        return api.get<Array<Record<string, unknown>>>('/api/users', query);
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
      parameters: projectLookupSchema.extend({
        status: epicStatusSchema.optional(),
        limit: z.number().int().min(1).max(50).optional().default(25),
      }),
      execute: async ({ projectId, projectName, status, limit }) => {
        const resolvedProjectId = projectId || (projectName
          ? await api.resolveProjectId(projectName)
          : undefined);

        const query: Record<string, string | number> = { limit };
        if (status) query.status = status;
        if (resolvedProjectId) query.projectId = resolvedProjectId;

        const epics = resolvedProjectId
          ? await api.get<Array<Record<string, unknown>>>(`/api/projects/${resolvedProjectId}/epics`)
          : await api.get<Array<Record<string, unknown>>>('/api/epics', query);

        return status
          ? epics.filter((epic) => epic.status === status).slice(0, limit!)
          : epics.slice(0, limit!);
      },
    }),
    defineTool({
      name: 'get_epic',
      description: 'Busca um épico e também devolve suas features atuais.',
      parameters: epicLookupSchema,
      execute: async ({ id, epicTitle, projectId, projectName }) => {
        const epicId = await resolveEpicIdFromLookup(api, { id, epicTitle, projectId, projectName });
        const [epic, features] = await Promise.all([
          api.get<Record<string, unknown>>(`/api/epics/${epicId}`),
          api.get(`/api/epics/${epicId}/features`),
        ]);

        return { ...epic, features };
      },
    }),
    defineTool({
      name: 'get_epic_full',
      description: 'Traz o contexto completo do épico com features, tasks e estatísticas agregadas.',
      parameters: epicLookupSchema,
      execute: async ({ id, epicTitle, projectId, projectName }) => {
        const epicId = await resolveEpicIdFromLookup(api, { id, epicTitle, projectId, projectName });
        // Single endpoint: 2 queries instead of 2+N (no N+1 per feature)
        return api.get<{
          epic: Record<string, unknown>;
          features: Array<{
            id: string;
            status: string;
            tasks: Array<{ status: string; priority: string }>;
          }>;
          stats: Record<string, unknown>;
        }>(`/api/epics/${epicId}/full`);
      },
    }),
    defineTool({
      name: 'create_epic',
      description: 'Cria um novo épico dentro de um projeto.',
      parameters: projectLookupSchema.extend({
        title: z.string().min(3).max(200).optional(),
        description: z.string().max(5000).optional(),
        status: epicStatusSchema.optional().default('OPEN'),
      }),
      execute: async ({ projectId, projectName, title, description, status }) => {
        const resolvedProjectId = await resolveProjectIdFromLookup(api, { projectId, projectName });

        return api.post(`/api/projects/${resolvedProjectId}/epics`, {
          title: requireValue(title, 'Informe o título do épico.'),
          description,
          status,
        });
      },
    }),
    defineTool({
      name: 'update_epic',
      description: 'Atualiza título, descrição ou status de um épico.',
      parameters: epicLookupSchema.extend({
        title: z.string().min(3).max(200).optional(),
        description: z.string().max(5000).nullable().optional(),
        status: epicStatusSchema.optional(),
      }),
      execute: async ({ id, epicTitle, projectId, projectName, ...changes }) => {
        const epicId = await resolveEpicIdFromLookup(api, { id, epicTitle, projectId, projectName });
        return api.patch(`/api/epics/${epicId}`, compactObject(changes));
      },
    }),
    defineTool({
      name: 'delete_epic',
      description: 'Remove um épico. Use só quando tiver certeza.',
      parameters: epicLookupSchema,
      awaitConfirm: true,
      confirmMessage: ({ id, epicTitle }) =>
        `Excluir o épico ${id || epicTitle}? Essa ação remove o épico do fluxo atual.`,
      execute: async ({ id, epicTitle, projectId, projectName }) => {
        const epicId = await resolveEpicIdFromLookup(api, { id, epicTitle, projectId, projectName });
        await api.delete(`/api/epics/${epicId}`);

        return { ok: true, deletedId: epicId };
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
        const query: Record<string, string | number> = { limit };

        const features = epicId
          ? await api.get<Array<Record<string, unknown>>>(`/api/epics/${epicId}/features`)
          : await api.get<Array<Record<string, unknown>>>('/api/features', query);

        return status
          ? features.filter((feature) => feature.status === status).slice(0, limit!)
          : features.slice(0, limit!);
      },
    }),
    defineTool({
      name: 'get_feature',
      description: 'Busca uma feature e devolve também suas tasks.',
      parameters: featureLookupSchema,
      execute: async ({ id, featureTitle, epicId, epicTitle, projectId, projectName }) => {
        const featureId = await resolveFeatureIdFromLookup(api, {
          id,
          featureTitle,
          epicId,
          epicTitle,
          projectId,
          projectName,
        });
        const [feature, tasks] = await Promise.all([
          api.get<Record<string, unknown>>(`/api/features/${featureId}`),
          api.get(`/api/features/${featureId}/tasks`),
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
      parameters: epicLookupSchema.extend({
        title: z.string().min(3).max(200).optional(),
        description: z.string().max(5000).optional(),
        status: featureStatusSchema.optional().default('BACKLOG'),
      }),
      execute: async ({ id, epicTitle, projectId, projectName, title, description, status }) => {
        const epicId = await resolveEpicIdFromLookup(api, { id, epicTitle, projectId, projectName });
        return api.post(`/api/epics/${epicId}/features`, {
          title: requireValue(title, 'Informe o título da feature.'),
          description,
          status,
        });
      },
    }),
    defineTool({
      name: 'update_feature',
      description: 'Atualiza uma feature existente.',
      parameters: featureLookupSchema.extend({
        title: z.string().min(3).max(200).optional(),
        description: z.string().max(5000).nullable().optional(),
        status: featureStatusSchema.optional(),
      }),
      execute: async ({ id, featureTitle, epicId, epicTitle, projectId, projectName, ...changes }) => {
        const featureId = await resolveFeatureIdFromLookup(api, {
          id,
          featureTitle,
          epicId,
          epicTitle,
          projectId,
          projectName,
        });
        return api.patch(`/api/features/${featureId}`, compactObject(changes));
      },
    }),
    defineTool({
      name: 'bulk_update_features',
      description: 'Atualiza várias features de uma vez usando items, featureIds ou títulos. Para listas, prefira arrays reais; também aceito string JSON ou valores separados por vírgula.',
      parameters: z.object({
        items: z.array(featureLookupSchema).min(1).max(25).optional(),
        featureIds: stringArrayLikeSchema.pipe(z.array(z.string().min(1)).min(1).max(25)).optional(),
        title: z.string().min(3).max(200).optional(),
        description: z.string().max(5000).nullable().optional(),
        status: featureStatusSchema.optional(),
      }),
      execute: async ({ items, featureIds, ...changes }) => {
        const normalizedFeatureIds = normalizeStringArrayInput(featureIds, 'featureIds');
        const normalizedItems = items || normalizedFeatureIds?.map((id) => ({ id })) || [];
        if (normalizedItems.length === 0) {
          throw new Error('Informe items ou featureIds para atualizar features em lote.');
        }

        const resolvedIds = await Promise.all(
          normalizedItems.map(async (item) => resolveFeatureIdFromLookup(api, item))
        );

        const features = await Promise.all(
          resolvedIds.map((featureId) => api.patch(`/api/features/${featureId}`, compactObject(changes)))
        );

        return {
          count: features.length,
          features,
        };
      },
    }),
    defineTool({
      name: 'delete_feature',
      description: 'Exclui uma feature. Use só quando tiver certeza.',
      parameters: featureLookupSchema,
      awaitConfirm: true,
      confirmMessage: ({ id, featureTitle }) =>
        `Excluir a feature ${id || featureTitle}? As tasks ligadas a ela também podem ser afetadas.`,
      execute: async ({ id, featureTitle, epicId, epicTitle, projectId, projectName }) => {
        const featureId = await resolveFeatureIdFromLookup(api, {
          id,
          featureTitle,
          epicId,
          epicTitle,
          projectId,
          projectName,
        });
        await api.delete(`/api/features/${featureId}`);

        return { ok: true, deletedId: featureId };
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
        title: z.string().min(3).max(200).optional(),
        projectId: z.string().uuid().optional(),
        projectName: optionalNonEmptyStringSchema,
        featureId: z.string().uuid().optional(),
        featureTitle: optionalNonEmptyStringSchema,
        epicId: z.string().uuid().optional(),
        epicTitle: optionalNonEmptyStringSchema,
        description: z.string().max(10000).optional(),
        status: taskStatusSchema.optional().default('BACKLOG'),
        type: taskTypeSchema.optional().default('TASK'),
        priority: taskPrioritySchema.optional().default('MEDIUM'),
        points: z.number().int().nonnegative().optional(),
        modules: z.array(z.string().max(50)).max(10).optional().default([]),
        assigneeId: z.string().uuid().nullable().optional(),
      }),
      execute: async ({
        title,
        projectId,
        projectName,
        featureId,
        featureTitle,
        epicId,
        epicTitle,
        description,
        status,
        type,
        priority,
        points,
        modules,
        assigneeId,
      }) => {
        let resolvedProjectId = projectId;
        let resolvedFeatureId = featureId;

        if (!resolvedFeatureId && featureTitle) {
          resolvedFeatureId = await resolveFeatureIdFromLookup(api, {
            id: undefined,
            featureTitle,
            epicId,
            epicTitle,
            projectId,
            projectName,
          });
        }

        if (!resolvedProjectId && resolvedFeatureId) {
          resolvedProjectId = await getFeatureProjectId(api, resolvedFeatureId);
        }

        if (!resolvedProjectId && projectName) {
          resolvedProjectId = await api.resolveProjectId(projectName);
        }

        if (!resolvedProjectId) {
          throw new Error('Informe projectId/projectName ou featureId/featureTitle para criar a task.');
        }

        return api.post('/api/tasks', compactObject({
          title: requireValue(title, 'Informe o título da task.'),
          projectId: resolvedProjectId,
          featureId: resolvedFeatureId,
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
      parameters: taskRefSchema.extend({
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
      execute: async ({ id, taskId, readableId, ...changes }) => {
        const resolvedTaskId = await resolveTaskIdFromLookup(api, { id, taskId, readableId });

        return api.patch(`/api/tasks/${resolvedTaskId}`, compactObject(changes));
      },
    }),
    defineTool({
      name: 'delete_task',
      description: 'Remove uma task de forma permanente.',
      parameters: taskRefSchema,
      awaitConfirm: true,
      confirmMessage: ({ id, taskId, readableId }) =>
        `Excluir a task ${id || taskId || readableId}? Essa ação é permanente.`,
      execute: async ({ id, taskId, readableId }) => {
        const resolvedTaskId = await resolveTaskIdFromLookup(api, { id, taskId, readableId });
        await api.delete(`/api/tasks/${resolvedTaskId}`);

        return { ok: true, deletedId: resolvedTaskId };
      },
    }),
    defineTool({
      name: 'bulk_update_tasks',
      description: 'Atualiza várias tasks de uma vez. Aceita ids, taskIds ou items. Arrays podem vir como lista real, JSON string ou string separada por vírgula.',
      parameters: z.object({
        ids: stringArrayLikeSchema.pipe(z.array(z.string().min(1)).min(1).max(25)).optional(),
        taskIds: stringArrayLikeSchema.pipe(z.array(z.string().min(1)).min(1).max(25)).optional(),
        items: z.union([z.array(taskRefSchema).min(1).max(25), taskRefArrayLikeSchema]).optional(),
        status: taskStatusSchema.optional(),
        priority: taskPrioritySchema.optional(),
        type: taskTypeSchema.optional(),
        assigneeId: z.string().uuid().nullable().optional(),
        blocked: booleanLikeSchema.optional(),
        blockReason: z.string().trim().min(10).max(500).nullable().optional(),
      }),
      execute: async ({ ids, taskIds, items, ...changes }) => {
        const normalizedIds = normalizeStringArrayInput(ids, 'ids');
        const normalizedTaskIds = normalizeStringArrayInput(taskIds, 'taskIds');
        const refs = items
          || normalizedIds?.map((id) => ({ id }))
          || normalizedTaskIds?.map((taskId) => ({ taskId }))
          || [];
        if (refs.length === 0) {
          throw new Error('Informe ids, taskIds ou items para atualizar tasks em lote.');
        }

        const resolvedIds = await Promise.all(refs.map((ref) => resolveTaskIdFromLookup(api, ref)));
        const results = await Promise.all(
          resolvedIds.map((taskId) =>
            api.patch(`/api/tasks/${taskId}`, compactObject({
              ...changes,
              blocked: normalizeBooleanInput(changes.blocked, 'blocked'),
            }))
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
      description: 'Bloqueia ou desbloqueia várias tasks em lote. blocked aceita boolean ou string "true"/"false". Arrays podem vir como lista real, JSON string ou string separada por vírgula.',
      parameters: z.object({
        ids: stringArrayLikeSchema.pipe(z.array(z.string().min(1)).min(1).max(25)).optional(),
        taskIds: stringArrayLikeSchema.pipe(z.array(z.string().min(1)).min(1).max(25)).optional(),
        items: z.union([z.array(taskRefSchema).min(1).max(25), taskRefArrayLikeSchema]).optional(),
        blocked: booleanLikeSchema,
        blockReason: z.string().trim().min(10).max(500).nullable().optional(),
      }),
      execute: async ({ ids, taskIds, items, blocked, blockReason }) => {
        const normalizedIds = normalizeStringArrayInput(ids, 'ids');
        const normalizedTaskIds = normalizeStringArrayInput(taskIds, 'taskIds');
        const normalizedBlocked = requireValue(
          normalizeBooleanInput(blocked, 'blocked'),
          'Informe blocked como true ou false.'
        );
        const refs = items
          || normalizedIds?.map((id) => ({ id }))
          || normalizedTaskIds?.map((taskId) => ({ taskId }))
          || [];
        if (refs.length === 0) {
          throw new Error('Informe ids, taskIds ou items para bloquear tasks em lote.');
        }

        const resolvedIds = await Promise.all(refs.map((ref) => resolveTaskIdFromLookup(api, ref)));
        const tasks = await Promise.all(
          resolvedIds.map((taskId) =>
            api.patch(`/api/tasks/${taskId}`, compactObject({
              blocked: normalizedBlocked,
              blockReason,
            }))
          )
        );

        return {
          count: tasks.length,
          blocked: normalizedBlocked,
          tasks,
        };
      },
    }),
    defineTool({
      name: 'add_task_comment',
      description: 'Adiciona um comentário em uma task.',
      parameters: taskRefSchema.extend({
        content: z.string().min(1).max(5000).optional(),
      }),
      execute: async ({ id, taskId, readableId, content }) => {
        const resolvedTaskId = await resolveTaskIdFromLookup(api, { id, taskId, readableId });

        return api.post(`/api/tasks/${resolvedTaskId}/comments`, {
          content: requireValue(content, 'Informe o conteúdo do comentário.'),
        });
      },
    }),
    defineTool({
      name: 'list_task_comments',
      description: 'Lista os comentários de uma task.',
      parameters: taskRefSchema,
      execute: async ({ id, taskId, readableId }) => {
        const resolvedTaskId = await resolveTaskIdFromLookup(api, { id, taskId, readableId });

        return api.get(`/api/tasks/${resolvedTaskId}/comments`);
      },
    }),
    defineTool({
      name: 'list_docs',
      description: 'Lista documentos de um projeto.',
      parameters: projectLookupSchema.extend({
        limit: z.number().int().min(1).max(50).optional().default(25),
      }),
      execute: async ({ projectId, projectName, limit }) => {
        const resolvedProjectId = await resolveProjectIdFromLookup(api, { projectId, projectName });
        const docs = await api.get<Array<Record<string, unknown>>>(`/api/projects/${resolvedProjectId}/docs`);
        return docs.slice(0, limit);
      },
    }),
    defineTool({
      name: 'get_doc',
      description: 'Busca o conteúdo de um documento.',
      parameters: docLookupSchema,
      execute: async ({ id, docTitle, projectId, projectName }) => {
        const docId = await resolveDocIdFromLookup(api, { id, docTitle, projectId, projectName });
        return api.get(`/api/docs/${docId}`);
      },
    }),
    defineTool({
      name: 'create_doc',
      description: 'Cria um documento novo em um projeto.',
      parameters: projectLookupSchema.extend({
        title: z.string().min(1).max(200).optional(),
        content: z.string().max(100000).optional(),
        tagIds: z.array(z.string().uuid()).optional().default([]),
      }),
      execute: async ({ projectId, projectName, title, content, tagIds }) => {
        const resolvedProjectId = await resolveProjectIdFromLookup(api, { projectId, projectName });
        return api.post(`/api/projects/${resolvedProjectId}/docs`, {
          title: requireValue(title, 'Informe o título do documento.'),
          content: requireValue(content, 'Informe o conteúdo do documento.'),
          tagIds,
        });
      },
    }),
    defineTool({
      name: 'update_doc',
      description: 'Atualiza título, conteúdo ou tags de um documento.',
      parameters: docLookupSchema.extend({
        title: z.string().min(1).max(200).optional(),
        content: z.string().max(100000).optional(),
        tagIds: z.array(z.string().uuid()).optional(),
      }),
      execute: async ({ id, docTitle, projectId, projectName, ...changes }) => {
        const docId = await resolveDocIdFromLookup(api, { id, docTitle, projectId, projectName });
        return api.patch(`/api/docs/${docId}`, compactObject(changes));
      },
    }),
    defineTool({
      name: 'delete_doc',
      description: 'Exclui um documento.',
      parameters: docLookupSchema,
      awaitConfirm: true,
      confirmMessage: ({ id, docTitle }) => `Excluir o documento ${id || docTitle}?`,
      execute: async ({ id, docTitle, projectId, projectName }) => {
        const docId = await resolveDocIdFromLookup(api, { id, docTitle, projectId, projectName });
        await api.delete(`/api/docs/${docId}`);

        return { ok: true, deletedId: docId };
      },
    }),
    defineTool({
      name: 'list_task_tags',
      description: 'Lista as tags de tasks de um projeto. Use antes de filtrar ou atribuir tags.',
      parameters: projectLookupSchema.extend({
        search: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(50).optional().default(25),
      }),
      execute: async ({ projectId, projectName, search, limit }) => {
        const resolvedProjectId = await resolveProjectIdFromLookup(api, { projectId, projectName });
        const tags = await api.get<Array<Record<string, unknown>>>(`/api/projects/${resolvedProjectId}/task-tags`);
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
      parameters: taskTagLookupSchema,
      execute: async ({ projectId, projectName, tagId, tagName }) => {
        const resolved = await resolveTaskTagRef(api, { projectId, projectName, tagId, tagName });
        return api.get(`/api/projects/${resolved.projectId}/task-tags/${resolved.tagId}`);
      },
    }),
    defineTool({
      name: 'create_task_tag',
      description: 'Cria uma nova tag de task dentro de um projeto.',
      parameters: projectLookupSchema.extend({
        name: z.string().min(1).max(50).optional(),
        color: taskTagColorSchema.optional(),
        description: z.string().max(200).optional(),
      }),
      execute: async ({ projectId, projectName, name, ...payload }) => {
        const resolvedProjectId = await resolveProjectIdFromLookup(api, { projectId, projectName });
        return api.post(`/api/projects/${resolvedProjectId}/task-tags`, compactObject({
          name: requireValue(name, 'Informe o nome da tag.'),
          ...payload,
        }));
      },
    }),
    defineTool({
      name: 'update_task_tag',
      description: 'Atualiza nome, cor ou descrição de uma tag de task.',
      parameters: taskTagLookupSchema.extend({
        name: z.string().min(1).max(50).optional(),
        color: taskTagColorSchema.optional(),
        description: z.string().max(200).nullable().optional(),
      }),
      execute: async ({ projectId, projectName, tagId, tagName, ...changes }) => {
        const resolved = await resolveTaskTagRef(api, { projectId, projectName, tagId, tagName });
        return api.put(`/api/projects/${resolved.projectId}/task-tags/${resolved.tagId}`, compactObject(changes));
      },
    }),
    defineTool({
      name: 'delete_task_tag',
      description: 'Exclui uma tag de task de um projeto.',
      parameters: taskTagLookupSchema,
      awaitConfirm: true,
      confirmMessage: ({ tagId, tagName }) =>
        `Excluir a tag ${tagId || tagName}? Isso remove as associações existentes.`,
      execute: async ({ projectId, projectName, tagId, tagName }) => {
        const resolved = await resolveTaskTagRef(api, { projectId, projectName, tagId, tagName });
        await api.delete(`/api/projects/${resolved.projectId}/task-tags/${resolved.tagId}`);

        return { ok: true, deletedId: resolved.tagId };
      },
    }),
    defineTool({
      name: 'get_task_tags',
      description: 'Lista as tags atribuídas a uma task específica.',
      parameters: taskRefSchema,
      execute: async ({ id, taskId, readableId }) => {
        const resolvedTaskId = await resolveTaskIdFromLookup(api, { id, taskId, readableId });
        return api.get(`/api/tasks/${resolvedTaskId}/tags`);
      },
    }),
    defineTool({
      name: 'set_task_tags',
      description: 'Substitui todas as tags de uma task por uma nova lista. Aceita tagIds ou tagNames como array real, JSON string ou string separada por vírgula.',
      parameters: taskRefSchema.extend({
        tagIds: uuidArrayLikeSchema.pipe(z.array(z.string().uuid()).max(20)).optional(),
        tagNames: stringArrayLikeSchema.pipe(z.array(z.string().min(1)).max(20)).optional(),
        projectId: z.string().uuid().optional(),
        projectName: optionalNonEmptyStringSchema,
      }),
      execute: async ({ id, taskId, readableId, tagIds, tagNames, projectId, projectName }) => {
        const resolvedTaskId = await resolveTaskIdFromLookup(api, { id, taskId, readableId });
        const normalizedTagIds = normalizeStringArrayInput(tagIds, 'tagIds');
        const normalizedTagNames = normalizeStringArrayInput(tagNames, 'tagNames');

        let resolvedTagIds = normalizedTagIds;
        if ((!resolvedTagIds || resolvedTagIds.length === 0) && normalizedTagNames && normalizedTagNames.length > 0) {
          const resolvedProjectId = projectId
            || (projectName ? await api.resolveProjectId(projectName) : undefined)
            || await api.getTaskProjectId(resolvedTaskId);

          resolvedTagIds = await Promise.all(
            normalizedTagNames.map((tagName) => api.resolveTaskTagId(resolvedProjectId, tagName))
          );
        }

        if (!resolvedTagIds) {
          throw new Error('Informe tagIds ou tagNames para definir as tags da task.');
        }

        return api.put(`/api/tasks/${resolvedTaskId}/tags`, { tagIds: resolvedTagIds });
      },
    }),
    defineTool({
      name: 'list_members',
      description: 'Lista membros da organização atual. Retorna id, nome de exibição e email de cada membro.',
      parameters: z.object({}),
      execute: async () => api.get('/api/users'),
    }),
    defineTool({
      name: 'search_member',
      description: 'Busca membro da organização por nome ou parte do nome. Retorna id, displayName e email. Use para descobrir o ID de um membro antes de filtrar tasks por assigneeId.',
      parameters: z.object({
        name: z.string().min(1).describe('Nome ou parte do nome do membro (case-insensitive).'),
      }),
      execute: async ({ name }) => {
        const members: any[] = await api.get('/api/users');
        const query = name.toLowerCase();
        const results = members.filter(
          (m: any) =>
            (m.displayName || '').toLowerCase().includes(query) ||
            (m.email || '').toLowerCase().includes(query)
        );
        if (results.length === 0) {
          return { members: [], message: `Nenhum membro encontrado para "${name}".` };
        }
        return { members: results };
      },
    }),
    defineTool({
      name: 'my_tasks',
      description: 'Lista tasks atribuídas ao usuário atualmente logado. Equivalente a "quais tasks são minhas?". Retorna apenas tasks ativas (não DONE) por padrão.',
      parameters: z.object({
        includeDone: z.boolean().optional().default(false).describe('Se true, inclui tasks concluídas (DONE).'),
        limit: z.number().int().min(1).max(50).optional().default(25),
      }),
      execute: async ({ includeDone, limit }) =>
        api.get('/api/dashboard/my-tasks', {
          limit: limit ?? 25,
          includeDone: String(includeDone ?? false),
        }),
    }),
  ];
}
