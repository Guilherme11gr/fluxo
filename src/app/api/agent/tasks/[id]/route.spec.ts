import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockExtractAgentAuth,
  mockFindTaskById,
  mockFindTaskByIdWithRelations,
  mockAssignTags,
  mockAuditLog,
  mockFindAgentById,
  mockFindExecutionById,
  mockUpdateTask,
} = vi.hoisted(() => ({
  mockExtractAgentAuth: vi.fn(),
  mockFindTaskById: vi.fn(),
  mockFindTaskByIdWithRelations: vi.fn(),
  mockAssignTags: vi.fn(),
  mockAuditLog: vi.fn(),
  mockFindAgentById: vi.fn(),
  mockFindExecutionById: vi.fn(),
  mockUpdateTask: vi.fn(),
}));

vi.mock('@/shared/http/agent-auth', () => ({
  extractAgentAuth: mockExtractAgentAuth,
}));

vi.mock('@/infra/adapters/prisma', () => ({
  agentExecutionRepository: {
    findById: mockFindExecutionById,
  },
  taskRepository: {
    findById: mockFindTaskById,
    findByIdWithRelations: mockFindTaskByIdWithRelations,
  },
  taskTagRepository: {
    assignToTask: mockAssignTags,
  },
  auditLogRepository: {
    log: mockAuditLog,
  },
  agentRepository: {
    findById: mockFindAgentById,
  },
}));

vi.mock('@/domain/use-cases/tasks/update-task', () => ({
  updateTask: mockUpdateTask,
}));

import { PATCH } from './route';

const taskId = '00000000-0000-4000-8000-000000000001';
const orgId = '00000000-0000-4000-8000-000000000010';
const userId = '00000000-0000-4000-8000-000000000020';
const execId = '00000000-0000-4000-8000-000000000030';

describe('PATCH /api/agent/tasks/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockExtractAgentAuth.mockResolvedValue({
      orgId,
      userId,
      agentName: 'runner',
      keyPrefix: 'agk_xxx',
      authMethod: 'tenant_api_key',
      keyId: 'key-1',
    });
    mockFindTaskById.mockResolvedValue({
      id: taskId,
      orgId,
      status: 'DOING',
      currentExecutionId: execId,
    });
    mockFindTaskByIdWithRelations.mockResolvedValue({
      id: taskId,
      orgId,
      status: 'REVIEW',
      currentExecutionId: execId,
    });
    mockFindExecutionById.mockResolvedValue({
      id: execId,
      orgId,
      taskId,
      status: 'RUNNING',
    });
    mockUpdateTask.mockResolvedValue({
      id: taskId,
      orgId,
      status: 'REVIEW',
    });
    mockAssignTags.mockResolvedValue(undefined);
    mockAuditLog.mockResolvedValue(undefined);
  });

  it('updates an owned task when expectedExecutionId matches the active execution', async () => {
    const response = await PATCH(
      new NextRequest(`http://localhost/api/agent/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedExecutionId: execId,
          status: 'REVIEW',
          _metadata: {
            changeReason: 'builder handoff',
          },
        }),
      }),
      { params: Promise.resolve({ id: taskId }) }
    );

    expect(response.status).toBe(200);
    expect(mockFindExecutionById).toHaveBeenCalledWith(execId);
    expect(mockUpdateTask).toHaveBeenCalledWith(
      taskId,
      orgId,
      userId,
      { status: 'REVIEW' },
      expect.any(Object),
      expect.objectContaining({
        source: 'agent',
        metadata: {
          changeReason: 'builder handoff',
        },
      })
    );
  });

  it('rejects an owned task update without expectedExecutionId', async () => {
    const response = await PATCH(
      new NextRequest(`http://localhost/api/agent/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'REVIEW',
        }),
      }),
      { params: Promise.resolve({ id: taskId }) }
    );

    expect(response.status).toBe(409);
    expect(mockFindExecutionById).not.toHaveBeenCalled();
    expect(mockUpdateTask).not.toHaveBeenCalled();
    expect(mockAssignTags).not.toHaveBeenCalled();
  });

  it('rejects an owned task update from a different execution', async () => {
    const response = await PATCH(
      new NextRequest(`http://localhost/api/agent/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedExecutionId: '00000000-0000-4000-8000-000000000099',
          status: 'REVIEW',
        }),
      }),
      { params: Promise.resolve({ id: taskId }) }
    );

    expect(response.status).toBe(409);
    expect(mockFindExecutionById).not.toHaveBeenCalled();
    expect(mockUpdateTask).not.toHaveBeenCalled();
  });

  it('rejects an expected execution that is already terminal', async () => {
    mockFindExecutionById.mockResolvedValueOnce({
      id: execId,
      orgId,
      taskId,
      status: 'SUCCESS',
    });

    const response = await PATCH(
      new NextRequest(`http://localhost/api/agent/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedExecutionId: execId,
          status: 'REVIEW',
        }),
      }),
      { params: Promise.resolve({ id: taskId }) }
    );

    expect(response.status).toBe(409);
    expect(mockUpdateTask).not.toHaveBeenCalled();
  });
});
