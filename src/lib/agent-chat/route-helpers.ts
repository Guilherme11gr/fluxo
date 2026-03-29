import { handleError } from '@/shared/errors';
import { jsonError } from '@/shared/http/responses';
import { AgentChatProviderConfigError } from './provider';

export const MAX_AGENT_CHAT_SESSION_ID_LENGTH = 120;

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function namespaceAgentChatSessionId(
  sessionId: string,
  tenantId: string,
  userId: string
): string {
  return `fluxo-chat:${tenantId}:${userId}:${sessionId}`;
}

export function normalizeAgentChatSessionId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_AGENT_CHAT_SESSION_ID_LENGTH) {
    return null;
  }

  return normalized;
}

export function resolveAgentChatInternalOrigin(requestOrigin: string): string {
  const explicitOrigin =
    process.env.FLUXO_INTERNAL_API_ORIGIN?.trim() ||
    process.env.INTERNAL_APP_URL?.trim();

  if (explicitOrigin) {
    return stripTrailingSlash(explicitOrigin);
  }

  if (process.env.NODE_ENV === 'production') {
    const port = process.env.PORT?.trim() || '3000';
    return `http://127.0.0.1:${port}`;
  }

  return stripTrailingSlash(requestOrigin);
}

export function createAgentChatErrorResponse(error: unknown) {
  if (error instanceof AgentChatProviderConfigError) {
    return jsonError('CHAT_PROVIDER_NOT_CONFIGURED', error.message, 503);
  }

  if (error instanceof SyntaxError) {
    return jsonError('VALIDATION_ERROR', 'Corpo da requisição inválido', 400);
  }

  const { status, body } = handleError(error);
  return jsonError(
    body.error.code,
    body.error.message,
    status,
    body.error.details as Record<string, unknown> | undefined
  );
}
