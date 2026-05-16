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
  mockIngestExecutionMemory,
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
  mockIngestExecutionMemory: vi.fn(),
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

vi.mock('@/domain/use-cases/memory/ingest-execution-memory', () => ({
  ingestExecutionMemory: mockIngestExecutionMemory,
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
      projectId: 'project-1',
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
    mockIngestExecutionMemory.mockResolvedValue(0);
  });

  it('stores structured result under metadata.result and preserves existing metadata', async () => {
    mockUpdateStatus
      .mockResolvedValueOnce({
        id: 'exec-1',
        status: 'SUCCESS',
        metadata: {
          tool: 'opencode',
          model: 'glm-5.1',
          result: {
            schemaVersion: 'v1',
            status: 'success',
            summary: 'Implemented successfully.',
          },
          memoryIngestion: {
            status: 'pending',
            updatedAt: '2026-05-16T00:00:00.000Z',
          },
        },
      })
      .mockResolvedValueOnce({
        id: 'exec-1',
        status: 'SUCCESS',
        metadata: {
          tool: 'opencode',
          model: 'glm-5.1',
          result: {
            schemaVersion: 'v1',
            status: 'success',
            summary: 'Implemented successfully.',
          },
          memoryIngestion: {
            status: 'completed',
            updatedAt: '2026-05-16T00:00:01.000Z',
          },
        },
      });

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
    const payload = await response.json();
    expect(mockUpdateStatus).toHaveBeenNthCalledWith(
      1,
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
          memoryIngestion: {
            status: 'pending',
            updatedAt: expect.any(String),
          },
        },
      })
    );
    expect(payload.data.metadata.memoryIngestion.status).toBe('completed');
    expect(mockDeleteLease).toHaveBeenCalledWith('exec-1');
    expect(mockIngestExecutionMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        projectId: 'project-1',
        taskId: 'task-1',
        executionId: 'exec-1',
        agentName: 'builder',
        result: {
          schemaVersion: 'v1',
          status: 'success',
          summary: 'Implemented successfully.',
        },
      })
    );
    expect(mockUpdateStatus).toHaveBeenNthCalledWith(
      2,
      'exec-1',
      expect.objectContaining({
        status: 'SUCCESS',
        metadata: {
          memoryIngestion: {
            status: 'completed',
            updatedAt: expect.any(String),
          },
        },
      })
    );
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

  it('retries memory ingestion for already-terminal successful executions when ingestion is not completed', async () => {
    mockFindExecutionById.mockResolvedValueOnce({
      id: 'exec-1',
      orgId: 'org-1',
      agentId: 'agent-1',
      taskId: 'task-1',
      projectId: 'project-1',
      status: 'SUCCESS',
      tool: 'opencode',
      model: 'glm-5.1',
      metadata: {
        memoryIngestion: {
          status: 'failed',
        },
      },
    });
    mockUpdateStatus
      .mockResolvedValueOnce({
        id: 'exec-1',
        status: 'SUCCESS',
        metadata: {
          result: {
            schemaVersion: 'v1',
            status: 'success',
            summary: 'Done',
            memoryCandidates: ['Usar docker compose no deploy.'],
          },
          memoryIngestion: {
            status: 'pending',
            updatedAt: '2026-05-16T00:00:00.000Z',
          },
        },
      })
      .mockResolvedValueOnce({
        id: 'exec-1',
        status: 'SUCCESS',
        metadata: {
          result: {
            schemaVersion: 'v1',
            status: 'success',
            summary: 'Done',
            memoryCandidates: ['Usar docker compose no deploy.'],
          },
          memoryIngestion: {
            status: 'completed',
            updatedAt: '2026-05-16T00:00:01.000Z',
          },
        },
      });

    const response = await POST(
      new Request('http://localhost/api/agent/executions/exec-1/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'SUCCESS',
          result: {
            schemaVersion: 'v1',
            status: 'success',
            summary: 'Done',
            memoryCandidates: ['Usar docker compose no deploy.'],
          },
        }),
      }),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(mockIngestExecutionMemory).toHaveBeenCalledOnce();
    expect(mockUpdateStatus).toHaveBeenNthCalledWith(
      1,
      'exec-1',
      expect.objectContaining({
        status: 'SUCCESS',
        metadata: expect.objectContaining({
          result: {
            schemaVersion: 'v1',
            status: 'success',
            summary: 'Done',
            memoryCandidates: ['Usar docker compose no deploy.'],
          },
          memoryIngestion: {
            status: 'pending',
            updatedAt: expect.any(String),
          },
        }),
      })
    );
    expect(mockUpdateStatus).toHaveBeenNthCalledWith(
      2,
      'exec-1',
      expect.objectContaining({
        status: 'SUCCESS',
        metadata: {
          memoryIngestion: {
            status: 'completed',
            updatedAt: expect.any(String),
          },
        },
      })
    );
    expect(payload.data.metadata.memoryIngestion.status).toBe('completed');
  });

  it('marks memory ingestion as failed in the response when persistence or indexing fails', async () => {
    mockUpdateStatus
      .mockResolvedValueOnce({
        id: 'exec-1',
        status: 'SUCCESS',
        metadata: {
          tool: 'opencode',
          result: {
            schemaVersion: 'v1',
            status: 'success',
            summary: 'Done',
          },
          memoryIngestion: {
            status: 'pending',
            updatedAt: '2026-05-16T00:00:00.000Z',
          },
        },
      })
      .mockResolvedValueOnce({
        id: 'exec-1',
        status: 'SUCCESS',
        metadata: {
          tool: 'opencode',
          result: {
            schemaVersion: 'v1',
            status: 'success',
            summary: 'Done',
          },
          memoryIngestion: {
            status: 'failed',
            updatedAt: '2026-05-16T00:00:01.000Z',
          },
        },
      });
    mockIngestExecutionMemory.mockRejectedValueOnce(new Error('embedding unavailable'));

    const response = await POST(
      new Request('http://localhost/api/agent/executions/exec-1/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'SUCCESS',
          result: {
            schemaVersion: 'v1',
            status: 'success',
            summary: 'Done',
            memoryCandidates: ['Usar docker compose no deploy.'],
          },
        }),
      }),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.metadata.memoryIngestion.status).toBe('failed');
  });

  it('retries memory ingestion from stored metadata.result when the retry payload omits result', async () => {
    mockFindExecutionById.mockResolvedValueOnce({
      id: 'exec-1',
      orgId: 'org-1',
      agentId: 'agent-1',
      taskId: 'task-1',
      projectId: 'project-1',
      status: 'SUCCESS',
      tool: 'opencode',
      model: 'glm-5.1',
      metadata: {
        result: {
          schemaVersion: 'v1',
          status: 'success',
          summary: 'Stored result',
          memoryCandidates: ['Usar docker compose no deploy.'],
        },
        memoryIngestion: {
          status: 'failed',
        },
      },
    });
    mockUpdateStatus
      .mockResolvedValueOnce({
        id: 'exec-1',
        status: 'SUCCESS',
        metadata: {
          result: {
            schemaVersion: 'v1',
            status: 'success',
            summary: 'Stored result',
            memoryCandidates: ['Usar docker compose no deploy.'],
          },
          memoryIngestion: {
            status: 'pending',
            updatedAt: '2026-05-16T00:00:00.000Z',
          },
        },
      })
      .mockResolvedValueOnce({
        id: 'exec-1',
        status: 'SUCCESS',
        metadata: {
          result: {
            schemaVersion: 'v1',
            status: 'success',
            summary: 'Stored result',
            memoryCandidates: ['Usar docker compose no deploy.'],
          },
          memoryIngestion: {
            status: 'completed',
            updatedAt: '2026-05-16T00:00:01.000Z',
          },
        },
      });

    const response = await POST(
      new Request('http://localhost/api/agent/executions/exec-1/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'SUCCESS',
        }),
      }),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mockIngestExecutionMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        result: {
          schemaVersion: 'v1',
          status: 'success',
          summary: 'Stored result',
          memoryCandidates: ['Usar docker compose no deploy.'],
        },
      })
    );
  });

  it('does not ingest memory for already-terminal executions that did not succeed', async () => {
    mockFindExecutionById.mockResolvedValueOnce({
      id: 'exec-1',
      orgId: 'org-1',
      agentId: 'agent-1',
      taskId: 'task-1',
      projectId: 'project-1',
      status: 'FAILED',
      tool: 'opencode',
      model: 'glm-5.1',
      metadata: {
        result: {
          schemaVersion: 'v1',
          status: 'success',
          summary: 'Should not be ingested',
          memoryCandidates: ['Nao persistir esta memoria.'],
        },
      },
    });

    const response = await POST(
      new Request('http://localhost/api/agent/executions/exec-1/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'SUCCESS',
        }),
      }),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mockIngestExecutionMemory).not.toHaveBeenCalled();
    expect(mockUpdateTask).not.toHaveBeenCalled();
  });
});
