import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockExtractAgentAuth,
  mockProjectFindById,
  mockFindByProject,
  mockFindBySelector,
  mockUpdateBinding,
  mockAuditLog,
} = vi.hoisted(() => ({
  mockExtractAgentAuth: vi.fn(),
  mockProjectFindById: vi.fn(),
  mockFindByProject: vi.fn(),
  mockFindBySelector: vi.fn(),
  mockUpdateBinding: vi.fn(),
  mockAuditLog: vi.fn(),
}));

vi.mock('@/shared/http/agent-auth', () => ({
  extractAgentAuth: mockExtractAgentAuth,
}));

vi.mock('@/infra/adapters/prisma', () => ({
  projectRepository: {
    findById: mockProjectFindById,
  },
  projectRuntimeBindingRepository: {
    findByProject: mockFindByProject,
    findBySelector: mockFindBySelector,
    update: mockUpdateBinding,
  },
  auditLogRepository: {
    log: mockAuditLog,
  },
}));

import { GET, PATCH } from './route';

const projectId = '550e8400-e29b-41d4-a716-446655440000';

const mockAuth = {
  orgId: '660e8400-e29b-41d4-a716-446655440000',
  userId: '770e8400-e29b-41d4-a716-446655440000',
  agentName: 'smoke-runner',
  keyPrefix: '1234',
  authMethod: 'tenant_api_key',
  keyId: '880e8400-e29b-41d4-a716-446655440000',
};

const binding = {
  id: '990e8400-e29b-41d4-a716-446655440000',
  orgId: mockAuth.orgId,
  projectId,
  runnerProfile: 'local',
  hostOs: 'windows',
  repoPath: 'D:/code/fluxo',
  defaultBaseBranch: 'main',
  allowedBranchPrefix: 'agent',
  executionMode: 'branch_per_task',
  gitProvider: 'github',
  prPolicy: 'draft',
  gitPolicy: 'branch_only',
  provisionCommand: null,
  provisionCacheKey: null,
  metadata: {},
  createdAt: new Date('2026-05-20T00:00:00Z'),
  updatedAt: new Date('2026-05-20T00:00:00Z'),
};

describe('/api/agent/projects/[id]/runtime-bindings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExtractAgentAuth.mockResolvedValue(mockAuth);
    mockProjectFindById.mockResolvedValue({ id: projectId });
    mockFindByProject.mockResolvedValue([binding]);
    mockFindBySelector.mockResolvedValue(binding);
    mockUpdateBinding.mockImplementation(async (_id, data) => ({
      ...binding,
      ...data,
      updatedAt: new Date('2026-05-20T00:01:00Z'),
    }));
    mockAuditLog.mockResolvedValue(undefined);
  });

  it('lists runtime bindings for the tenant project', async () => {
    const response = await GET(
      new Request(`http://localhost/api/agent/projects/${projectId}/runtime-bindings`),
      { params: Promise.resolve({ id: projectId }) },
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].gitPolicy).toBe('branch_only');
    expect(mockProjectFindById).toHaveBeenCalledWith(projectId, mockAuth.orgId);
  });

  it('filters runtime bindings by runner profile and host OS', async () => {
    const response = await GET(
      new Request(`http://localhost/api/agent/projects/${projectId}/runtime-bindings?runnerProfile=other&hostOs=windows`),
      { params: Promise.resolve({ id: projectId }) },
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data).toHaveLength(0);
  });

  it('patches an existing runtime binding policy and writes audit metadata', async () => {
    const response = await PATCH(
      new Request(`http://localhost/api/agent/projects/${projectId}/runtime-bindings`, {
        method: 'PATCH',
        body: JSON.stringify({
          runnerProfile: 'local',
          hostOs: 'windows',
          gitPolicy: 'branch_commit_pr',
          prPolicy: 'draft',
          reason: 'prove branch_commit_pr smoke',
        }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.gitPolicy).toBe('branch_commit_pr');
    expect(mockFindBySelector).toHaveBeenCalledWith({
      orgId: mockAuth.orgId,
      projectId,
      runnerProfile: 'local',
      hostOs: 'windows',
    });
    expect(mockUpdateBinding).toHaveBeenCalledWith(binding.id, expect.objectContaining({
      gitPolicy: 'branch_commit_pr',
      prPolicy: 'draft',
    }));
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'project.runtime_binding.updated',
      targetId: binding.id,
      metadata: expect.objectContaining({
        reason: 'prove branch_commit_pr smoke',
        changedFields: expect.arrayContaining(['gitPolicy', 'prPolicy']),
      }),
    }));
  });

  it('rejects a patch without any mutable runtime field', async () => {
    const response = await PATCH(
      new Request(`http://localhost/api/agent/projects/${projectId}/runtime-bindings`, {
        method: 'PATCH',
        body: JSON.stringify({
          runnerProfile: 'local',
          hostOs: 'windows',
          reason: 'no-op',
        }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(mockUpdateBinding).not.toHaveBeenCalled();
  });

  it('returns not found when the binding selector does not exist', async () => {
    mockFindBySelector.mockResolvedValue(null);

    const response = await PATCH(
      new Request(`http://localhost/api/agent/projects/${projectId}/runtime-bindings`, {
        method: 'PATCH',
        body: JSON.stringify({
          runnerProfile: 'local',
          hostOs: 'linux',
          gitPolicy: 'branch_commit_pr',
          reason: 'prove branch_commit_pr smoke',
        }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    );

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error.message).toContain('Runtime binding not found');
  });

  it('returns not found when the project is outside the authenticated tenant', async () => {
    mockProjectFindById.mockResolvedValue(null);

    const response = await GET(
      new Request(`http://localhost/api/agent/projects/${projectId}/runtime-bindings`),
      { params: Promise.resolve({ id: projectId }) },
    );

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error.message).toContain('Project not found');
  });
});
