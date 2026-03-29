import { handleError } from '@/shared/errors';
import { jsonError } from '@/shared/http/responses';
import { AgentChatProviderConfigError } from './provider';

export const MAX_AGENT_CHAT_SESSION_ID_LENGTH = 120;

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
