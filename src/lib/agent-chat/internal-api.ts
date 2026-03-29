import { ORG_ID_HEADER } from '@/shared/http/auth.helpers';

export const AGENT_CHAT_HEADER_NAMES = {
  tenantId: 'x-fluxo-agent-tenant-id',
  userId: 'x-fluxo-agent-user-id',
  role: 'x-fluxo-agent-role',
  orgName: 'x-fluxo-agent-org-name',
  orgSlug: 'x-fluxo-agent-org-slug',
  userDisplayName: 'x-fluxo-agent-user-display-name',
  origin: 'x-fluxo-agent-origin',
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
