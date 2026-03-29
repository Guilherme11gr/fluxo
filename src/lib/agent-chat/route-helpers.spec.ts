import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedError } from '@/shared/errors';
import { AgentChatProviderConfigError } from './provider';
import {
  MAX_AGENT_CHAT_SESSION_ID_LENGTH,
  createAgentChatErrorResponse,
  namespaceAgentChatSessionId,
  normalizeAgentChatSessionId,
  resolveAgentChatInternalOrigin,
} from './route-helpers';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('agent-chat/route-helpers', () => {
  it('namespaces sessions by tenant and user', () => {
    expect(
      namespaceAgentChatSessionId('dashboard', 'tenant-1', 'user-1')
    ).toBe('fluxo-chat:tenant-1:user-1:dashboard');
  });

  it('normalizes short session ids and rejects empty or oversized values', () => {
    expect(normalizeAgentChatSessionId('  dashboard  ')).toBe('dashboard');
    expect(normalizeAgentChatSessionId('')).toBeNull();
    expect(normalizeAgentChatSessionId(' '.repeat(4))).toBeNull();
    expect(normalizeAgentChatSessionId('a'.repeat(MAX_AGENT_CHAT_SESSION_ID_LENGTH + 1))).toBeNull();
  });

  it('prefers explicit internal origin config when provided', () => {
    vi.stubEnv('FLUXO_INTERNAL_API_ORIGIN', 'https://internal.example.com/');

    expect(resolveAgentChatInternalOrigin('https://public.example.com')).toBe(
      'https://internal.example.com'
    );
  });

  it('falls back to localhost in production when no explicit internal origin exists', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PORT', '4010');

    expect(resolveAgentChatInternalOrigin('https://public.example.com')).toBe(
      'http://127.0.0.1:4010'
    );
  });

  it('maps provider errors to 503', async () => {
    const response = createAgentChatErrorResponse(
      new AgentChatProviderConfigError('Provider ausente')
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'CHAT_PROVIDER_NOT_CONFIGURED',
        message: 'Provider ausente',
      },
    });
  });

  it('preserves domain auth errors', async () => {
    const response = createAgentChatErrorResponse(
      new UnauthorizedError('Sessão inválida ou expirada')
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Sessão inválida ou expirada',
      },
    });
  });
});
