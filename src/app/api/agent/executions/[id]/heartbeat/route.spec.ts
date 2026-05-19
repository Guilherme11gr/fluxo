import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockExtractAgentAuth,
  mockFindExecutionById,
  mockHeartbeat,
  mockFindLeaseByProject,
  mockRenewLease,
  mockFindTaskById,
} = vi.hoisted(() => ({
  mockExtractAgentAuth: vi.fn(),
  mockFindExecutionById: vi.fn(),
  mockHeartbeat: vi.fn(),
  mockFindLeaseByProject: vi.fn(),
  mockRenewLease: vi.fn(),
  mockFindTaskById: vi.fn(),
}));

vi.mock('@/shared/http/agent-auth', () => ({
  extractAgentAuth: mockExtractAgentAuth,
}));

vi.mock('@/infra/adapters/prisma', () => ({
  agentExecutionRepository: {
    findById: mockFindExecutionById,
    heartbeat: mockHeartbeat,
  },
  executionLeaseRepository: {
    findByProject: mockFindLeaseByProject,
    renew: mockRenewLease,
  },
  taskRepository: {
    findById: mockFindTaskById,
  },
}));

import { POST } from './route';

describe('POST /api/agent/executions/[id]/heartbeat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExtractAgentAuth.mockResolvedValue({
      orgId: 'org-1',
      userId: 'user-1',
      agentName: 'runner',
      keyPrefix: 'agk_xxx',
      authMethod: 'tenant_api_key',
      keyId: 'key-1',
    });
    mockFindExecutionById.mockResolvedValue({
      id: 'exec-1',
      orgId: 'org-1',
      taskId: 'task-1',
      projectId: 'project-1',
      status: 'RUNNING',
    });
    mockFindTaskById.mockResolvedValue({
      id: 'task-1',
      currentExecutionId: 'exec-1',
    });
    mockHeartbeat.mockResolvedValue({ id: 'exec-1', status: 'RUNNING' });
    mockFindLeaseByProject.mockResolvedValue({ id: 'lease-1', executionId: 'exec-1' });
    mockRenewLease.mockResolvedValue({ id: 'lease-1' });
  });

  it('renews heartbeat and lease when expectedExecutionId matches', async () => {
    const response = await POST(
      new Request('http://localhost/api/agent/executions/exec-1/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedExecutionId: 'exec-1' }),
      }),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mockHeartbeat).toHaveBeenCalledWith('exec-1');
    expect(mockRenewLease).toHaveBeenCalledWith('lease-1', expect.any(Date));
  });

  it('rejects heartbeat from a non-current execution', async () => {
    mockFindTaskById.mockResolvedValueOnce({
      id: 'task-1',
      currentExecutionId: 'exec-other',
    });

    const response = await POST(
      new Request('http://localhost/api/agent/executions/exec-1/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedExecutionId: 'exec-1' }),
      }),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(response.status).toBe(409);
    expect(mockHeartbeat).not.toHaveBeenCalled();
    expect(mockRenewLease).not.toHaveBeenCalled();
  });
});
