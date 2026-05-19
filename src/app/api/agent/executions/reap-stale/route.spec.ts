import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockExtractAgentAuth,
  mockFindActiveByOrg,
  mockMarkStaleAsTimeout,
  mockDeleteExpired,
  mockRequeueStaleExecution,
} = vi.hoisted(() => ({
  mockExtractAgentAuth: vi.fn(),
  mockFindActiveByOrg: vi.fn(),
  mockMarkStaleAsTimeout: vi.fn(),
  mockDeleteExpired: vi.fn(),
  mockRequeueStaleExecution: vi.fn(),
}));

vi.mock('@/shared/http/agent-auth', () => ({
  extractAgentAuth: mockExtractAgentAuth,
}));

vi.mock('@/infra/adapters/prisma', () => ({
  agentExecutionRepository: {
    findActiveByOrg: mockFindActiveByOrg,
    markStaleAsTimeout: mockMarkStaleAsTimeout,
  },
  executionLeaseRepository: {
    deleteExpired: mockDeleteExpired,
  },
  taskRepository: {
    requeueStaleExecution: mockRequeueStaleExecution,
  },
  auditLogRepository: {},
  agentRepository: {},
}));

import { POST } from './route';

describe('POST /api/agent/executions/reap-stale', () => {
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

    mockFindActiveByOrg.mockResolvedValue([
      {
        id: 'exec-1',
        taskId: 'task-1',
      },
    ]);
    mockMarkStaleAsTimeout.mockResolvedValue(1);
    mockDeleteExpired.mockResolvedValue(1);
    mockRequeueStaleExecution.mockResolvedValue(true);
  });

  it('requeues stale tasks without leaving them blocked', async () => {
    const response = await POST(
      new Request('http://localhost/api/agent/executions/reap-stale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staleAfterMs: 90000 }),
      })
    );

    expect(response.status).toBe(200);
    expect(mockRequeueStaleExecution).toHaveBeenCalledWith(
      'task-1',
      'org-1',
      'exec-1',
    );
  });
});
