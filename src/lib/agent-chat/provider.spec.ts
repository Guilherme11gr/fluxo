import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentChatProviderConfigError, getAgentChatProviderConfig } from './provider';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('agent-chat/provider', () => {
  it('prioritizes explicit FLUXO_CHAT_* configuration', () => {
    vi.stubEnv('FLUXO_CHAT_API_KEY', 'fluxo-key');
    vi.stubEnv('FLUXO_CHAT_API_URL', 'https://chat.example.com/v1');
    vi.stubEnv('FLUXO_CHAT_MODEL', 'glm-4.7-flash');
    vi.stubEnv('FLUXO_CHAT_API_HEADERS', '{"X-Test":"1"}');
    vi.stubEnv('ZAI_API_KEY', 'zai-key');

    expect(getAgentChatProviderConfig()).toEqual({
      apiKey: 'fluxo-key',
      baseUrl: 'https://chat.example.com/v1',
      model: 'glm-4.7-flash',
      headers: { 'X-Test': '1' },
    });
  });

  it('falls back to ZAI_* when FLUXO_CHAT_* is not set', () => {
    vi.stubEnv('ZAI_API_KEY', 'zai-key');
    vi.stubEnv('ZAI_API_URL', 'https://api.z.ai/api/paas/v4');
    vi.stubEnv('ZAI_MODEL', 'glm-4.7-flash');

    expect(getAgentChatProviderConfig()).toEqual({
      apiKey: 'zai-key',
      baseUrl: 'https://api.z.ai/api/paas/v4',
      model: 'glm-4.7-flash',
      headers: undefined,
    });
  });

  it('throws a friendly configuration error when no provider key exists', () => {
    expect(() => getAgentChatProviderConfig()).toThrow(AgentChatProviderConfigError);
  });

  it('rejects invalid FLUXO_CHAT_API_HEADERS', () => {
    vi.stubEnv('FLUXO_CHAT_API_KEY', 'fluxo-key');
    vi.stubEnv('FLUXO_CHAT_API_HEADERS', 'not-json');

    expect(() => getAgentChatProviderConfig()).toThrow(AgentChatProviderConfigError);
  });
});
