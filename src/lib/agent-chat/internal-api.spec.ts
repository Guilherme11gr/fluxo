import { afterEach, describe, expect, it, vi } from 'vitest';
import { InternalAgentApiClient } from './internal-api';

const context = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  role: 'OWNER' as const,
  orgName: 'Fluxo',
  orgSlug: 'fluxo',
  userDisplayName: 'Koike',
  origin: 'https://fluxo.test',
  cookieHeader: 'sb=token',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('agent-chat/internal-api', () => {
  it('throws a readable error when the upstream returns plain text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream failed', { status: 502 }))
    );

    const client = new InternalAgentApiClient(context);

    await expect(client.get('/api/projects')).rejects.toThrow('upstream failed');
  });

  it('rejects successful responses that are not in the expected json envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('{"ok":true}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );

    const client = new InternalAgentApiClient(context);

    await expect(client.get('/api/projects')).rejects.toThrow(
      'Resposta inválida ao chamar GET /api/projects'
    );
  });
});
