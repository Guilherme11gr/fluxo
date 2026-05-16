import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockExtractAgentAuth,
  mockFindRunnerById,
  mockUpdateHeartbeat,
} = vi.hoisted(() => ({
  mockExtractAgentAuth: vi.fn(),
  mockFindRunnerById: vi.fn(),
  mockUpdateHeartbeat: vi.fn(),
}));

vi.mock('@/shared/http/agent-auth', () => ({
  extractAgentAuth: mockExtractAgentAuth,
}));

vi.mock('@/infra/adapters/prisma', () => ({
  runnerInstanceRepository: {
    findById: mockFindRunnerById,
    updateHeartbeat: mockUpdateHeartbeat,
  },
}));

import { POST } from './route';

describe('POST /api/agent/runners/[id]/heartbeat', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockExtractAgentAuth.mockResolvedValue({
      orgId: 'org-1',
    });

    mockFindRunnerById.mockResolvedValue({
      id: 'runner-1',
      orgId: 'org-1',
      capabilities: {
        claim_next: true,
        multi_agent: true,
        runner_profile: 'windows-dev',
      },
      metadata: {
        hostOs: 'windows',
        runnerProfile: 'windows-dev',
      },
    });

    mockUpdateHeartbeat.mockResolvedValue({
      id: 'runner-1',
      status: 'ONLINE',
    });
  });

  it('merges capabilities and metadata instead of replacing them', async () => {
    const response = await POST(
      new Request('http://localhost/api/agent/runners/runner-1/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'ONLINE',
          capabilities: {
            host_os: 'windows',
            available_models: ['glm-5.1'],
          },
          metadata: {
            hostOs: 'windows',
          },
        }),
      }),
      { params: Promise.resolve({ id: 'runner-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mockUpdateHeartbeat).toHaveBeenCalledWith('runner-1', {
      status: 'ONLINE',
      capabilities: {
        claim_next: true,
        multi_agent: true,
        runner_profile: 'windows-dev',
        host_os: 'windows',
        available_models: ['glm-5.1'],
      },
      metadata: {
        hostOs: 'windows',
        runnerProfile: 'windows-dev',
      },
    });
  });
});
