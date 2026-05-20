import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateAgentApiKey } from './agent-api-key';

const {
  mockHeaders,
  mockFindByKeyHash,
  mockTouchUsage,
} = vi.hoisted(() => ({
  mockHeaders: vi.fn(),
  mockFindByKeyHash: vi.fn(),
  mockTouchUsage: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: mockHeaders,
}));

vi.mock('@/infra/adapters/prisma', () => ({
  agentApiKeyRepository: {
    findByKeyHash: mockFindByKeyHash,
    touchUsage: mockTouchUsage,
  },
}));

import { AgentAuthError, extractAgentAuth } from './agent-auth';

describe('extractAgentAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTouchUsage.mockResolvedValue(undefined);
  });

  it('returns tenant-scoped auth context for a valid key', async () => {
    const generated = generateAgentApiKey();

    mockHeaders.mockResolvedValue({
      get(name: string) {
        if (name === 'authorization') {
          return `Bearer ${generated.token}`;
        }

        if (name === 'x-agent-name') {
          return 'Claude Desktop';
        }

        return null;
      },
    });

    mockFindByKeyHash.mockResolvedValue({
      id: 'key-1',
      orgId: 'org-1',
      keyHash: generated.keyHash,
      keyPrefix: generated.keyPrefix,
      createdBy: 'user-1',
      createdAt: new Date(),
      rotatedAt: null,
      lastUsedAt: null,
      lastUsedAgentName: null,
    });

    const result = await extractAgentAuth();

    expect(result).toEqual({
      keyId: 'key-1',
      orgId: 'org-1',
      userId: 'user-1',
      agentName: 'Claude Desktop',
      keyPrefix: generated.keyPrefix,
      authMethod: 'tenant_api_key',
    });
    expect(mockTouchUsage).toHaveBeenCalledWith('key-1', 'Claude Desktop');
  });

  it('uses the default agent name when the header is absent', async () => {
    const generated = generateAgentApiKey();

    mockHeaders.mockResolvedValue({
      get(name: string) {
        if (name === 'authorization') {
          return `Bearer ${generated.token}`;
        }

        return null;
      },
    });

    mockFindByKeyHash.mockResolvedValue({
      id: 'key-1',
      orgId: 'org-1',
      keyHash: generated.keyHash,
      keyPrefix: generated.keyPrefix,
      createdBy: 'user-1',
      createdAt: new Date(),
      rotatedAt: null,
      lastUsedAt: null,
      lastUsedAgentName: null,
    });

    const result = await extractAgentAuth();

    expect(result.agentName).toBe('External Agent');
    expect(mockTouchUsage).toHaveBeenCalledWith('key-1', 'External Agent');
  });

  it('rejects invalid keys', async () => {
    const generated = generateAgentApiKey();

    mockHeaders.mockResolvedValue({
      get(name: string) {
        if (name === 'authorization') {
          return `Bearer ${generated.token}`;
        }

        return null;
      },
    });

    mockFindByKeyHash.mockResolvedValue(null);

    await expect(extractAgentAuth()).rejects.toBeInstanceOf(AgentAuthError);
  });
});
