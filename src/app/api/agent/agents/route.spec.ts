import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockExtractAgentAuth,
  mockFindByName,
  mockCreate,
  mockUpdate,
  mockFindByOrgId,
} = vi.hoisted(() => ({
  mockExtractAgentAuth: vi.fn(),
  mockFindByName: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockFindByOrgId: vi.fn(),
}));

vi.mock('@/shared/http/agent-auth', () => ({
  extractAgentAuth: mockExtractAgentAuth,
}));

vi.mock('@/infra/adapters/prisma', () => ({
  agentRepository: {
    findByName: mockFindByName,
    create: mockCreate,
    update: mockUpdate,
    findByOrgId: mockFindByOrgId,
  },
}));

import { GET, POST } from './route';

describe('POST /api/agent/agents', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockExtractAgentAuth.mockResolvedValue({
      orgId: 'org-1',
      userId: 'user-1',
    });
  });

  it('updates top-level fields when re-registering an existing agent', async () => {
    mockFindByName.mockResolvedValue({
      id: 'agent-1',
      orgId: 'org-1',
      name: 'fluxo-runner-go',
      type: 'RUNNER',
      tool: 'opencode',
      workdir: null,
      projectId: null,
      config: {
        available_models: ['old-model'],
        pick_status: 'TODO',
      },
    });

    mockUpdate.mockResolvedValue({
      id: 'agent-1',
      orgId: 'org-1',
      name: 'fluxo-runner-go',
      type: 'RUNNER',
      status: 'ONLINE',
      tool: 'opencode',
      workdir: 'D:\\Users\\Guilherme\\Documents\\development\\jt-kill',
      projectId: '11111111-1111-4111-8111-111111111111',
      config: {
        available_models: ['old-model'],
        pick_status: 'TODO',
        model: 'ollama-cloud/glm-5.1',
      },
    });

    const response = await POST(
      new Request('http://localhost/api/agent/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'fluxo-runner-go',
          type: 'RUNNER',
          tool: 'opencode',
          workdir: 'D:\\Users\\Guilherme\\Documents\\development\\jt-kill',
          projectId: '11111111-1111-4111-8111-111111111111',
          config: {
            model: 'ollama-cloud/glm-5.1',
          },
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith('agent-1', {
      type: 'RUNNER',
      tool: 'opencode',
      workdir: 'D:\\Users\\Guilherme\\Documents\\development\\jt-kill',
      projectId: '11111111-1111-4111-8111-111111111111',
      status: 'ONLINE',
      config: {
        available_models: ['old-model'],
        pick_status: 'TODO',
        model: 'ollama-cloud/glm-5.1',
      },
    });
  });

  it('filters GET by projectId when provided', async () => {
    mockFindByOrgId.mockResolvedValue([]);

    const response = await GET(new Request('http://localhost/api/agent/agents?projectId=11111111-1111-4111-8111-111111111111'));

    expect(response.status).toBe(200);
    expect(mockFindByOrgId).toHaveBeenCalledWith('org-1', '11111111-1111-4111-8111-111111111111');
  });
});
