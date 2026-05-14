import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockExtractAgentAuth,
  mockClaimNextTask,
} = vi.hoisted(() => ({
  mockExtractAgentAuth: vi.fn(),
  mockClaimNextTask: vi.fn(),
}));

vi.mock('@/shared/http/agent-auth', () => ({
  extractAgentAuth: mockExtractAgentAuth,
  AgentAuthError: class AgentAuthError extends Error {
    statusCode = 401;
  },
}));

vi.mock('@/domain/use-cases/tasks/claim-next-task', () => ({
  claimNextTask: mockClaimNextTask,
}));

import { POST } from './route';

describe('POST /api/agent/tasks/claim-next', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockExtractAgentAuth.mockResolvedValue({
      orgId: 'org-1',
      userId: 'user-1',
      agentName: 'builder',
      keyId: 'key-1',
    });

    mockClaimNextTask.mockResolvedValue({
      task: {
        id: 'task-1',
        orgId: 'org-1',
        projectId: 'project-1',
        featureId: 'feature-1',
        localId: 10,
        title: 'Implement runtime binding',
        description: 'desc',
        status: 'DOING',
        type: 'TASK',
        priority: 'HIGH',
        assigneeAgentId: 'agent-1',
        blocked: false,
        createdAt: new Date('2026-05-14T00:00:00Z'),
        updatedAt: new Date('2026-05-14T00:00:00Z'),
      },
      execution: {
        id: 'exec-1',
        orgId: 'org-1',
        taskId: 'task-1',
        projectId: 'project-1',
        agentId: 'agent-1',
        runnerInstanceId: 'runner-1',
        status: 'CLAIMED',
        tool: 'opencode',
        model: 'glm-5.1',
        metadata: {
          runtimeBinding: {
            repoPath: 'D:/code/fluxo',
          },
        },
        startedAt: new Date('2026-05-14T00:00:00Z'),
      },
      lease: {
        id: 'lease-1',
        projectId: 'project-1',
        executionId: 'exec-1',
        expiresAt: new Date('2026-05-14T00:01:00Z'),
      },
      runtimeBinding: {
        id: 'binding-1',
        projectId: 'project-1',
        runnerProfile: 'windows-dev',
        hostOs: 'windows',
        repoPath: 'D:/code/fluxo',
        defaultBaseBranch: 'main',
        allowedBranchPrefix: 'agent/',
        executionMode: 'branch_per_task',
        gitProvider: 'github',
        prPolicy: 'draft',
        gitPolicy: 'branch_commit_pr',
        metadata: {},
      },
    });
  });

  it('returns the claimed task with runtime binding details', async () => {
    const response = await POST(
      new Request('http://localhost/api/agent/tasks/claim-next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: '11111111-1111-4111-8111-111111111111',
          runnerInstanceId: '22222222-2222-4222-8222-222222222222',
          tool: 'opencode',
          model: 'glm-5.1',
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mockClaimNextTask).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        userId: 'user-1',
        agentName: 'builder',
        keyId: 'key-1',
        tool: 'opencode',
        model: 'glm-5.1',
      })
    );

    const json = await response.json();
    expect(json.data.runtimeBinding).toEqual(
      expect.objectContaining({
        id: 'binding-1',
        repoPath: 'D:/code/fluxo',
        executionMode: 'branch_per_task',
        gitPolicy: 'branch_commit_pr',
      })
    );
  });
});
