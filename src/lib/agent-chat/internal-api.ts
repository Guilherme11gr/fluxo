import { ORG_ID_HEADER } from '@/shared/http/auth.helpers';

export const AGENT_CHAT_HEADER_NAMES = {
  tenantId: 'x-fluxo-agent-tenant-id',
  userId: 'x-fluxo-agent-user-id',
  role: 'x-fluxo-agent-role',
  orgName: 'x-fluxo-agent-org-name',
  orgSlug: 'x-fluxo-agent-org-slug',
  userDisplayName: 'x-fluxo-agent-user-display-name',
  origin: 'x-fluxo-agent-origin',
  agentRolePrompt: 'x-fluxo-agent-role-prompt',
} as const;

export interface AgentChatContext {
  tenantId: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  orgName: string;
  orgSlug: string;
  userDisplayName: string;
  origin: string;
  cookieHeader: string | null;
  agentRolePrompt: string;
}

type QueryValue = string | number | boolean | Array<string | number | boolean> | null | undefined;

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
}

interface ApiSuccessPayload<T> {
  data: T;
}

function normalizeLookup(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR');
}

function findUniqueByLabel<T extends { id: string }>(
  items: T[],
  query: string,
  getLabel: (item: T) => string | null | undefined,
  entityLabel: string
): T {
  const normalizedQuery = normalizeLookup(query);

  const exactMatches = items.filter((item) => {
    const label = getLabel(item);
    return label ? normalizeLookup(label) === normalizedQuery : false;
  });

  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  if (exactMatches.length > 1) {
    throw new Error(
      `Encontrei ${exactMatches.length} ${entityLabel}s com o nome "${query}". Informe o id para evitar ambiguidade.`
    );
  }

  const partialMatches = items.filter((item) => {
    const label = getLabel(item);
    return label ? normalizeLookup(label).includes(normalizedQuery) : false;
  });

  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  if (partialMatches.length > 1) {
    throw new Error(
      `Encontrei ${partialMatches.length} ${entityLabel}s parecidos com "${query}". Informe o id para evitar ambiguidade.`
    );
  }

  throw new Error(`Não encontrei ${entityLabel} com o valor "${query}".`);
}

function tryParseJson<T>(rawText: string): T | undefined {
  if (!rawText) {
    return undefined;
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    return undefined;
  }
}

export function encodeAgentChatHeader(value: string | null | undefined): string {
  return encodeURIComponent(value ?? '');
}

function decodeAgentChatHeader(headers: Headers, headerName: string): string {
  const rawValue = headers.get(headerName);
  if (!rawValue) {
    return '';
  }

  return decodeURIComponent(rawValue);
}

export function getAgentChatContextFromHeaders(headers: Headers): AgentChatContext {
  const tenantId = decodeAgentChatHeader(headers, AGENT_CHAT_HEADER_NAMES.tenantId);
  const userId = decodeAgentChatHeader(headers, AGENT_CHAT_HEADER_NAMES.userId);
  const origin = decodeAgentChatHeader(headers, AGENT_CHAT_HEADER_NAMES.origin);

  if (!tenantId || !userId || !origin) {
    throw new Error('Contexto do chat do agent inválido ou ausente');
  }

  const role = decodeAgentChatHeader(headers, AGENT_CHAT_HEADER_NAMES.role) as AgentChatContext['role'];

  return {
    tenantId,
    userId,
    role: role || 'MEMBER',
    orgName: decodeAgentChatHeader(headers, AGENT_CHAT_HEADER_NAMES.orgName),
    orgSlug: decodeAgentChatHeader(headers, AGENT_CHAT_HEADER_NAMES.orgSlug),
    userDisplayName: decodeAgentChatHeader(headers, AGENT_CHAT_HEADER_NAMES.userDisplayName),
    origin,
    cookieHeader: headers.get('cookie'),
    agentRolePrompt: decodeAgentChatHeader(headers, AGENT_CHAT_HEADER_NAMES.agentRolePrompt),
  };
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export class InternalAgentApiClient {
  constructor(private readonly context: AgentChatContext) {}

  async get<T>(path: string, query?: Record<string, QueryValue>): Promise<T> {
    return this.request<T>('GET', path, undefined, query);
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async patch<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  async put<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async delete(path: string): Promise<void> {
    await this.request('DELETE', path);
  }

  async resolveTaskId(idOrReadableId: string): Promise<string> {
    if (isUuid(idOrReadableId)) {
      return idOrReadableId;
    }

    const searchResult = await this.get<{
      items: Array<{ id: string; readableId: string }>;
    }>('/api/tasks', {
      search: idOrReadableId,
      page: 1,
      pageSize: 10,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });

    const match = searchResult.items.find((task) => {
      return task.readableId.toUpperCase() === idOrReadableId.toUpperCase();
    });

    if (!match) {
      throw new Error(`Task "${idOrReadableId}" não encontrada.`);
    }

    return match.id;
  }

  async resolveFeatureId(idOrTitle: string, epicId?: string): Promise<string> {
    if (isUuid(idOrTitle)) {
      return idOrTitle;
    }
    const features = epicId
      ? await this.get<Array<{ id: string; title: string }>>(`/api/epics/${epicId}/features`)
      : await this.get<Array<{ id: string; title: string }>>('/api/features');
    return findUniqueByLabel(features, idOrTitle, (feature) => feature.title, 'feature').id;
  }

  async resolveProjectId(idOrName: string): Promise<string> {
    if (isUuid(idOrName)) {
      return idOrName;
    }

    const projects = await this.get<Array<{ id: string; name: string }>>('/api/projects');
    return findUniqueByLabel(projects, idOrName, (project) => project.name, 'projeto').id;
  }

  async resolveEpicId(idOrTitle: string, projectId?: string): Promise<string> {
    if (isUuid(idOrTitle)) {
      return idOrTitle;
    }

    const epics = projectId
      ? await this.get<Array<{ id: string; title: string }>>(`/api/projects/${projectId}/epics`)
      : await this.get<Array<{ id: string; title: string }>>('/api/epics');

    return findUniqueByLabel(epics, idOrTitle, (epic) => epic.title, 'épico').id;
  }

  async resolveDocId(idOrTitle: string, projectId?: string): Promise<string> {
    if (isUuid(idOrTitle)) {
      return idOrTitle;
    }

    if (projectId) {
      const docs = await this.get<Array<{ id: string; title: string }>>(`/api/projects/${projectId}/docs`);
      return findUniqueByLabel(docs, idOrTitle, (doc) => doc.title, 'documento').id;
    }

    const projects = await this.get<Array<{ id: string }>>('/api/projects');
    const matches: Array<{ id: string; title: string }> = [];

    for (const project of projects) {
      const docs = await this.get<Array<{ id: string; title: string }>>(`/api/projects/${project.id}/docs`);
      matches.push(...docs);
    }

    return findUniqueByLabel(matches, idOrTitle, (doc) => doc.title, 'documento').id;
  }

  async resolveTaskTagId(projectId: string, idOrName: string): Promise<string> {
    if (isUuid(idOrName)) {
      return idOrName;
    }

    const tags = await this.get<Array<{ id: string; name: string }>>(`/api/projects/${projectId}/task-tags`);
    return findUniqueByLabel(tags, idOrName, (tag) => tag.name, 'tag').id;
  }

  async getTaskProjectId(taskId: string): Promise<string> {
    const task = await this.get<{
      projectId?: string;
      project?: { id?: string | null } | null;
      feature?: { epic?: { projectId?: string | null; project?: { id?: string | null } | null } | null } | null;
    }>(`/api/tasks/${taskId}`);

    const resolvedProjectId =
      task.projectId ||
      task.project?.id ||
      task.feature?.epic?.projectId ||
      task.feature?.epic?.project?.id;

    if (!resolvedProjectId) {
      throw new Error(`Não consegui descobrir o projeto da task ${taskId}.`);
    }

    return resolvedProjectId;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    query?: Record<string, QueryValue>
  ): Promise<T> {
    const url = new URL(path, this.context.origin);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') {
          continue;
        }

        if (Array.isArray(value)) {
          for (const item of value) {
            url.searchParams.append(key, String(item));
          }
          continue;
        }

        url.searchParams.set(key, String(value));
      }
    }

    const headers = new Headers({
      Accept: 'application/json',
      [ORG_ID_HEADER]: this.context.tenantId,
    });

    if (this.context.cookieHeader) {
      headers.set('cookie', this.context.cookieHeader);
    }

    if (body) {
      headers.set('Content-Type', 'application/json');
    }

    let response: Response;
    const startTime = Date.now();
    try {
      response = await fetch(url, {
        method,
        headers,
        cache: 'no-store',
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[AgentChat] Internal request network error', {
        method,
        path,
        url: url.toString(),
        tenantId: this.context.tenantId,
        userId: this.context.userId,
        message,
      });

      throw new Error(`Falha de rede ao chamar ${method} ${path}: ${message}`);
    }

    const elapsed = Date.now() - startTime;

    // Log slow requests (> 2s) for monitoring
    if (elapsed > 2000) {
      console.warn(`[AgentChat] Slow internal request: ${method} ${path} took ${elapsed}ms`, {
        tenantId: this.context.tenantId,
        userId: this.context.userId,
      });
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const rawText = await response.text();
    const parsed = tryParseJson<ApiSuccessPayload<T> | ApiErrorPayload>(rawText);

    if (!response.ok) {
      const errorPayload = parsed as ApiErrorPayload | undefined;
      console.error('[AgentChat] Internal request failed', {
        method,
        path,
        url: url.toString(),
        status: response.status,
        statusText: response.statusText,
        tenantId: this.context.tenantId,
        userId: this.context.userId,
        error: errorPayload?.error?.message || rawText,
      });

      throw new Error(
        errorPayload?.error?.message ||
          rawText ||
          `Falha ao chamar ${method} ${path} (${response.status})`
      );
    }

    if (!parsed || !('data' in parsed)) {
      throw new Error(`Resposta inválida ao chamar ${method} ${path}`);
    }

    return (parsed as ApiSuccessPayload<T>).data;
  }
}
