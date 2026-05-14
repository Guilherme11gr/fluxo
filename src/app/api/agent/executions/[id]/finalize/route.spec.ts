import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockExtractAgentAuth,
  mockFindExecutionById,
  mockFindAgentById,
  mockUpdateStatus,
  mockFindTaskById,
  mockUpdateTaskRecord,
  mockDeleteLease,
  mockFindCommentsByTaskId,
  mockCreateComment,
  mockUpdateTask,
} = vi.hoisted(() => ({
  mockExtractAgentAuth: vi.fn(),
  mockFindExecutionById: vi.fn(),
  mockFindAgentById: vi.fn(),
  mockUpdateStatus: vi.fn(),
  mockFindTaskById: vi.fn(),
  mockUpdateTaskRecord: vi.fn(),
  mockDeleteLease: vi.fn(),
  mockFindCommentsByTaskId: vi.fn(),
  mockCreateComment: vi.fn(),
  mockUpdateTask: vi.fn(),
}));

vi.mock('@/shared/http/agent-auth', () => ({
  extractAgentAuth: mockExtractAgentAuth,
}));

vi.mock('@/infra/adapters/prisma', () => ({
  agentExecutionRepository: {
    findById: mockFindExecutionById,
    updateStatus: mockUpdateStatus,
  },
  agentRepository: {
    findById: mockFindAgentById,
  },
  auditLogRepository: {},
  commentRepository: {
    findByTaskId: mockFindCommentsByTaskId,
    create: mockCreateComment,
  },
  executionLeaseRepository: {
    deleteByExecutionId: mockDeleteLease,
  },
  taskRepository: {
    findById: mockFindTaskById,
    update: mockUpdateTaskRecord,
  },
}));

vi.mock('@/domain/use-cases/tasks/update-task', () => ({
  updateTask: mockUpdateTask,
}));

import { POST } from './route';

describe('POST /api/agent/executions/[id]/finalize', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockExtractAgentAuth.mockResolvedValue({
      orgId: 'org-1',
      userId: 'user-1',
      agentName: 'builder',
      keyPrefix: 'agk_xxx',
      authMethod: 'tenant_api_key',
      keyId: 'key-1',
    });

    mockFindExecutionById.mockResolvedValue({
      id: 'exec-1',
      orgId: 'org-1',
      agentId: 'agent-1',
      taskId: 'task-1',
      status: 'RUNNING',
      metadata: {
        tool: 'opencode',
      },
    });

    mockFindAgentById.mockResolvedValue({
      id: 'agent-1',
      orgId: 'org-1',
    });

    mockFindTaskById.mockResolvedValue({
      id: 'task-1',
      status: 'DOING',
      blocked: false,
      blockReason: null,
      assigneeAgentId: 'agent-1',
    });

    mockFindCommentsByTaskId.mockResolvedValue([]);
    mockUpdateStatus.mockResolvedValue({ id: 'exec-1', status: 'SUCCESS' });
    mockUpdateTaskRecord.mockResolvedValue({ id: 'task-1' });
  });

  it('stores structured result under metadata.result and preserves existing metadata', async () => {
    const response = await POST(
      new Request('http://localhost/api/agent/executions/exec-1/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'SUCCESS',
          resultSummary: 'Done',
          result: {
            schemaVersion: 'v1',
            status: 'success',
            summary: 'Implemented successfully.',
          },
          metadata: {
            model: 'glm-5.1',
          },
        }),
      }),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      'exec-1',
      expect.objectContaining({
        status: 'SUCCESS',
        resultSummary: 'Done',
        metadata: {
          tool: 'opencode',
          model: 'glm-5.1',
          result: {
            schemaVersion: 'v1',
            status: 'success',
            summary: 'Implemented successfully.',
          },
        },
      })
    );
    expect(mockDeleteLease).toHaveBeenCalledWith('exec-1');
  });

  it('updates task PR fields from metadata git payload when result.git is absent', async () => {
    const response = await POST(
      new Request('http://localhost/api/agent/executions/exec-1/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'SUCCESS',
          metadata: {
            git: {
              prUrl: 'https://github.com/fluxo-app/fluxo/pull/42',
              prNumber: 42,
            },
          },
        }),
      }),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mockUpdateTaskRecord).toHaveBeenCalledWith('task-1', 'org-1', {
      githubPrUrl: 'https://github.com/fluxo-app/fluxo/pull/42',
      githubPrNumber: 42,
      githubPrStatus: 'open',
    });
  });
});
